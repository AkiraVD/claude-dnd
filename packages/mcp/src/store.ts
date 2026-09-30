import {
  RulesError,
  SeededRng,
  randomSeed,
  restoreCreature,
  type CombatState,
  type Creature,
  type CreatureId,
  type GameEvent,
  type Story,
} from '@dnd/engine'
import type { CampaignDb, CampaignRow, CampaignSnapshot, StepRow } from './db.js'

export const DEFAULT_SCENE = 'No scene set yet.'

export interface OpenOptions {
  /** Load this campaign. Defaults to the most recently updated one. */
  campaignId?: number
  /** Name for a campaign created because none existed. */
  name?: string
  /** Seed for a campaign created because none existed. */
  seed?: number
}

/**
 * One campaign's live state, written through to SQLite after every change.
 *
 * Mutators (`put`, `setCombat`, `setScene`) change the hot state; `commit`
 * persists it as a new step together with the events that produced it. Every
 * mutating tool must call `commit`, and `persistence.test.ts` checks that they
 * do by reopening the database and looking.
 */
export class GameStore {
  readonly #db: CampaignDb
  #campaign: CampaignRow
  #rng: SeededRng
  #creatures = new Map<CreatureId, Creature>()
  #combat: CombatState | null = null
  #scene = DEFAULT_SCENE
  #story: Story | null = null

  private constructor(db: CampaignDb, campaign: CampaignRow) {
    this.#db = db
    this.#campaign = campaign
    this.#rng = new SeededRng(campaign.seed)
    this.#hydrate()
  }

  static open(db: CampaignDb, options: OpenOptions = {}): GameStore {
    if (options.campaignId !== undefined) {
      const found = db.findCampaign(options.campaignId)
      if (!found) throw new RulesError(`no campaign with id ${options.campaignId}`)
      return new GameStore(db, found)
    }

    const recent = db.mostRecentCampaign()
    if (recent) return new GameStore(db, recent)

    return new GameStore(
      db,
      db.createCampaign(options.name ?? 'Untitled campaign', options.seed ?? randomSeed()),
    )
  }

  // ── campaign identity ────────────────────────────────────────────────────────

  get campaign(): CampaignRow {
    return { ...this.#campaign, steps: this.#db.stepCount(this.#campaign.id) }
  }

  get seed(): number {
    return this.#campaign.seed
  }

  listCampaigns(): CampaignRow[] {
    return this.#db.listCampaigns()
  }

  /** Create a campaign and switch to it. */
  startCampaign(name: string, seed?: number): CampaignRow {
    this.#campaign = this.#db.createCampaign(name, seed ?? randomSeed())
    this.#rng = new SeededRng(this.#campaign.seed)
    this.#creatures = new Map()
    this.#combat = null
    this.#scene = DEFAULT_SCENE
    this.#story = null
    return this.campaign
  }

  switchCampaign(id: number): CampaignRow {
    const found = this.#db.findCampaign(id)
    if (!found) {
      const known = this.#db
        .listCampaigns()
        .map((c) => `${c.id} (${c.name})`)
        .join(', ')
      throw new RulesError(
        `no campaign with id ${id}. Known campaigns: ${known === '' ? '(none)' : known}`,
      )
    }
    this.#campaign = found
    this.#hydrate()
    return this.campaign
  }

  renameCampaign(name: string): void {
    this.#db.renameCampaign(this.#campaign.id, name)
    this.#campaign = { ...this.#campaign, name }
  }

  deleteCampaign(id: number): CampaignRow {
    const found = this.#db.findCampaign(id)
    if (!found) throw new RulesError(`no campaign with id ${id}`)
    this.#db.deleteCampaign(id)

    // Deleting the campaign in play leaves nothing loaded, so move to another
    // one, or start fresh if that was the last.
    if (id === this.#campaign.id) {
      const next = this.#db.mostRecentCampaign()
      if (next) {
        this.#campaign = next
        this.#hydrate()
      } else {
        this.startCampaign('Untitled campaign')
      }
    }
    return found
  }

  /** Wipe the board without destroying the journal, as an undoable step. */
  reset(): void {
    this.#creatures = new Map()
    this.#combat = null
    this.#scene = DEFAULT_SCENE
    this.#story = null
    this.#rng = new SeededRng(randomSeed())
    this.commit('reset_campaign')
  }

  /** Revert the newest step. Returns the label of what was undone. */
  undo(): string | null {
    const label = this.#db.dropLastStep(this.#campaign.id)
    if (label === null) return null
    this.#hydrate()
    return label
  }

  // ── persistence ──────────────────────────────────────────────────────────────

  snapshot(): CampaignSnapshot {
    return {
      rngState: this.#rng.state(),
      scene: this.#scene,
      creatures: this.all(),
      combat: this.#combat,
      story: this.#story,
    }
  }

  /** Persist the current state as a new step, with the events that caused it. */
  commit(label: string, events: readonly GameEvent[] = []): void {
    this.#db.appendStep(this.#campaign.id, label, events, this.snapshot())
  }

  #hydrate(): void {
    const snapshot = this.#db.latestSnapshot(this.#campaign.id)
    if (!snapshot) {
      this.#rng = new SeededRng(this.#campaign.seed)
      this.#creatures = new Map()
      this.#combat = null
      this.#scene = DEFAULT_SCENE
      this.#story = null
      return
    }
    this.#rng = SeededRng.fromState(snapshot.rngState)
    this.#scene = snapshot.scene
    this.#combat = snapshot.combat
    this.#story = snapshot.story ?? null
    // Through restoreCreature, because a campaign saved before purses and
    // profiles existed is missing those fields entirely.
    this.#creatures = new Map(
      snapshot.creatures.map((creature) => [creature.id, restoreCreature(creature)]),
    )
  }

  // ── live state ───────────────────────────────────────────────────────────────

  /** One generator per campaign, its position saved with every step. */
  get rng(): SeededRng {
    return this.#rng
  }

  get scene(): string {
    return this.#scene
  }

  setScene(scene: string): void {
    this.#scene = scene
  }

  get story(): Story | null {
    return this.#story
  }

  setStory(story: Story | null): void {
    this.#story = story
  }

  requireStory(): Story {
    if (this.#story === null) {
      throw new RulesError(
        'this campaign has no backbone yet — call set_story before playing, so the ' +
          'story survives a /clear',
      )
    }
    return this.#story
  }

  get combat(): CombatState | null {
    return this.#combat
  }

  setCombat(state: CombatState | null): void {
    this.#combat = state
  }

  requireCombat(): CombatState {
    if (!this.#combat?.active) {
      throw new RulesError('no combat is in progress — call start_combat first')
    }
    return this.#combat
  }

  has(id: CreatureId): boolean {
    return this.#creatures.has(id)
  }

  /** Throws with the list of known ids, so a typo is self-correcting. */
  creature(id: CreatureId): Creature {
    const creature = this.#creatures.get(id)
    if (!creature) {
      const known = this.ids()
      throw new RulesError(
        `no creature with id "${id}". Known ids: ${known.length > 0 ? known.join(', ') : '(none yet)'}`,
      )
    }
    return creature
  }

  add(creature: Creature): void {
    if (this.#creatures.has(creature.id)) {
      throw new RulesError(`a creature with id "${creature.id}" already exists`)
    }
    this.#creatures.set(creature.id, creature)
  }

  put(creature: Creature): void {
    this.#creatures.set(creature.id, creature)
  }

  remove(id: CreatureId): void {
    this.creature(id)
    this.#creatures.delete(id)
  }

  all(): Creature[] {
    return [...this.#creatures.values()]
  }

  ids(): CreatureId[] {
    return [...this.#creatures.keys()]
  }

  // ── journal ──────────────────────────────────────────────────────────────────

  get eventCount(): number {
    return this.#db.eventCount(this.#campaign.id)
  }

  recentEvents(limit: number): GameEvent[] {
    return this.#db.recentEvents(this.#campaign.id, limit)
  }

  recentSteps(limit: number): StepRow[] {
    return this.#db.recentSteps(this.#campaign.id, limit)
  }
}
