import { DatabaseSync } from 'node:sqlite'
import type { CombatState, Creature, GameEvent, Story } from '@dnd/engine'

/**
 * How a campaign is stored, and why it is stored this way.
 *
 * State snapshots are the source of truth; events are an append-only journal
 * beside them. The alternative — deriving state purely by replaying events
 * through a reducer — would mean writing the rules a second time, once in the
 * engine and once in the reducer, and the two would drift. Every bug would then
 * be "which one is right?".
 *
 * A campaign's whole state is a few kilobytes of JSON, so snapshotting it after
 * every step is cheap, and it buys undo for nothing: reverting a step is
 * restoring the snapshot before it. The journal stays for recaps, for auditing
 * "how did I get to 3 HP", and for the browser's dice feed in phase 7.
 */
export interface CampaignSnapshot {
  rngState: number
  scene: string
  creatures: Creature[]
  combat: CombatState | null
  /** Absent in campaigns saved before the backbone existed. */
  story?: Story | null
  /** Which scenery set the browser should show. Absent on older saves. */
  backdrop?: string | null
}

export interface CampaignRow {
  id: number
  name: string
  seed: number
  createdAt: string
  updatedAt: string
  steps: number
}

export interface StepRow {
  seq: number
  label: string
  events: GameEvent[]
  createdAt: string
  /** Which run of the engine wrote it. Null for steps written before sessions. */
  session: string | null
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS campaigns (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  seed       INTEGER NOT NULL,
  created_at TEXT    NOT NULL,
  updated_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS steps (
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  label       TEXT    NOT NULL,
  events      TEXT    NOT NULL,
  event_count INTEGER NOT NULL,
  state       TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  session     TEXT,
  PRIMARY KEY (campaign_id, seq)
);

CREATE INDEX IF NOT EXISTS steps_by_campaign ON steps (campaign_id, seq DESC);
`

export class CampaignDb {
  readonly #db: DatabaseSync

  constructor(path: string) {
    this.#db = new DatabaseSync(path)
    this.#db.exec('PRAGMA journal_mode = WAL')
    this.#db.exec('PRAGMA foreign_keys = ON')
    this.#db.exec(SCHEMA)
    this.#migrate()
  }

  /**
   * CREATE TABLE IF NOT EXISTS leaves an existing table alone, so a column
   * added later has to be added by hand. Nullable, so old rows stay valid and
   * read back as "written before sessions existed".
   */
  #migrate(): void {
    const columns = this.#db.prepare('PRAGMA table_info(steps)').all() as Array<{ name: string }>
    if (!columns.some((column) => column.name === 'session')) {
      this.#db.exec('ALTER TABLE steps ADD COLUMN session TEXT')
    }
  }

  close(): void {
    this.#db.close()
  }

  createCampaign(name: string, seed: number): CampaignRow {
    const now = new Date().toISOString()
    const result = this.#db
      .prepare('INSERT INTO campaigns (name, seed, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(name, seed, now, now)
    return {
      id: Number(result.lastInsertRowid),
      name,
      seed,
      createdAt: now,
      updatedAt: now,
      steps: 0,
    }
  }

  listCampaigns(): CampaignRow[] {
    const rows = this.#db
      .prepare(
        `SELECT c.id, c.name, c.seed, c.created_at, c.updated_at,
                (SELECT COUNT(*) FROM steps s WHERE s.campaign_id = c.id) AS steps
           FROM campaigns c
          ORDER BY c.updated_at DESC`,
      )
      .all() as Array<Record<string, unknown>>

    return rows.map((row) => ({
      id: Number(row['id']),
      name: String(row['name']),
      seed: Number(row['seed']),
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
      steps: Number(row['steps']),
    }))
  }

  findCampaign(id: number): CampaignRow | null {
    return this.listCampaigns().find((row) => row.id === id) ?? null
  }

  mostRecentCampaign(): CampaignRow | null {
    return this.listCampaigns()[0] ?? null
  }

  renameCampaign(id: number, name: string): void {
    this.#db.prepare('UPDATE campaigns SET name = ? WHERE id = ?').run(name, id)
  }

  deleteCampaign(id: number): void {
    this.#db.prepare('DELETE FROM steps WHERE campaign_id = ?').run(id)
    this.#db.prepare('DELETE FROM campaigns WHERE id = ?').run(id)
  }

  /** Append one step and return its sequence number. */
  appendStep(
    campaignId: number,
    label: string,
    events: readonly GameEvent[],
    state: CampaignSnapshot,
    session: string | null = null,
  ): number {
    const now = new Date().toISOString()
    const next = this.stepCount(campaignId) + 1
    this.#db
      .prepare(
        `INSERT INTO steps (campaign_id, seq, label, events, event_count, state, created_at, session)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        campaignId,
        next,
        label,
        JSON.stringify(events),
        events.length,
        JSON.stringify(state),
        now,
        session,
      )
    this.#db.prepare('UPDATE campaigns SET updated_at = ? WHERE id = ?').run(now, campaignId)
    return next
  }

  stepCount(campaignId: number): number {
    const row = this.#db
      .prepare('SELECT COALESCE(MAX(seq), 0) AS n FROM steps WHERE campaign_id = ?')
      .get(campaignId) as Record<string, unknown> | undefined
    return row === undefined ? 0 : Number(row['n'])
  }

  /** The snapshot as of the newest step, or null for a campaign with no steps. */
  latestSnapshot(campaignId: number): CampaignSnapshot | null {
    const row = this.#db
      .prepare('SELECT state FROM steps WHERE campaign_id = ? ORDER BY seq DESC LIMIT 1')
      .get(campaignId) as Record<string, unknown> | undefined
    return row === undefined ? null : (JSON.parse(String(row['state'])) as CampaignSnapshot)
  }

  snapshotAt(campaignId: number, seq: number): CampaignSnapshot | null {
    const row = this.#db
      .prepare('SELECT state FROM steps WHERE campaign_id = ? AND seq = ?')
      .get(campaignId, seq) as Record<string, unknown> | undefined
    return row === undefined ? null : (JSON.parse(String(row['state'])) as CampaignSnapshot)
  }

  /** Discard the newest step. Returns the label of what was undone. */
  dropLastStep(campaignId: number): string | null {
    const row = this.#db
      .prepare('SELECT seq, label FROM steps WHERE campaign_id = ? ORDER BY seq DESC LIMIT 1')
      .get(campaignId) as Record<string, unknown> | undefined
    if (row === undefined) return null

    this.#db
      .prepare('DELETE FROM steps WHERE campaign_id = ? AND seq = ?')
      .run(campaignId, Number(row['seq']))
    return String(row['label'])
  }

  /** The session that wrote the newest step, or null if nothing has been written. */
  latestSession(campaignId: number): string | null {
    const row = this.#db
      .prepare('SELECT session FROM steps WHERE campaign_id = ? ORDER BY seq DESC LIMIT 1')
      .get(campaignId) as { session?: unknown } | undefined
    return row?.session == null ? null : String(row.session)
  }

  recentSteps(campaignId: number, limit: number): StepRow[] {
    const rows = this.#db
      .prepare(
        'SELECT seq, label, events, created_at, session FROM steps WHERE campaign_id = ? ORDER BY seq DESC LIMIT ?',
      )
      .all(campaignId, limit) as Array<Record<string, unknown>>

    return rows
      .map((row) => ({
        seq: Number(row['seq']),
        label: String(row['label']),
        events: JSON.parse(String(row['events'])) as GameEvent[],
        createdAt: String(row['created_at']),
        session: row['session'] == null ? null : String(row['session']),
      }))
      .reverse()
  }

  /**
   * The newest `limit` journal entries, oldest first.
   *
   * A step can hold zero events (setting the scene) or several (an attack that
   * lands, drops the target and breaks concentration), so this walks back over
   * steps until it has enough, rather than assuming one event per step.
   */
  recentEvents(campaignId: number, limit: number): GameEvent[] {
    const events: GameEvent[] = []
    let before = this.stepCount(campaignId) + 1
    const batch = Math.max(limit, 20)

    while (events.length < limit && before > 1) {
      const rows = this.#db
        .prepare(
          `SELECT events FROM steps
             WHERE campaign_id = ? AND seq < ?
             ORDER BY seq DESC LIMIT ?`,
        )
        .all(campaignId, before, batch) as Array<Record<string, unknown>>
      if (rows.length === 0) break

      for (const row of rows) {
        events.unshift(...(JSON.parse(String(row['events'])) as GameEvent[]))
      }
      before -= rows.length
    }

    return events.slice(-limit)
  }

  eventCount(campaignId: number): number {
    const row = this.#db
      .prepare('SELECT COALESCE(SUM(event_count), 0) AS n FROM steps WHERE campaign_id = ?')
      .get(campaignId) as Record<string, unknown> | undefined
    return row === undefined ? 0 : Number(row['n'])
  }
}
