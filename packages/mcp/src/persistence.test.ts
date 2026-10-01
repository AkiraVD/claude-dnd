import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CampaignDb } from './db.js'
import { buildServer, type BuildOptions } from './server.js'

/**
 * Phase 4's acceptance criterion: quit mid-combat and come back to it.
 *
 * Every test here uses a real file on disk and reopens it, because the whole
 * point is what survives the process going away.
 */

let dir: string
let dbPath: string
const open: Array<{ db: CampaignDb }> = []

interface Session {
  call: (name: string, args?: Record<string, unknown>) => Promise<{
    isError: boolean
    text: string
    data: Record<string, any> | null
  }>
  close: () => void
}

/** A fresh server process, in effect: new store, same file. */
async function session(options: Omit<BuildOptions, 'dbPath'> = {}): Promise<Session> {
  const built = buildServer({ dbPath, ...options })
  open.push(built)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'persistence-test', version: '0' })
  await Promise.all([client.connect(clientTransport), built.server.connect(serverTransport)])

  return {
    async call(name, args = {}) {
      const result = await client.callTool({ name, arguments: args })
      const content = result.content as Array<{ type: string; text: string }>
      const text = content[0]!.text
      return {
        isError: result.isError === true,
        text,
        data: result.isError === true ? null : (JSON.parse(text) as Record<string, any>),
      }
    },
    close() {
      built.db.close()
    },
  }
}

const BRANN = {
  id: 'brann',
  name: 'Brann',
  kind: 'pc',
  level: 3,
  str: 16,
  dex: 14,
  con: 15,
  int: 10,
  wis: 12,
  cha: 8,
  max_hp: 28,
  ac: 16,
  save_proficiencies: ['str', 'con'],
}

const OGRE = {
  id: 'ogre',
  name: 'Ogre',
  str: 19,
  dex: 8,
  con: 16,
  int: 5,
  wis: 7,
  cha: 7,
  max_hp: 59,
  ac: 11,
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dnd-persist-'))
  dbPath = join(dir, 'campaign.db')
})

afterEach(() => {
  for (const { db } of open) {
    try {
      db.close()
    } catch {
      // already closed by the test
    }
  }
  open.length = 0
  rmSync(dir, { recursive: true, force: true })
})

describe('resuming a campaign', () => {
  it('comes back mid-combat exactly where it left off', async () => {
    const first = await session({ seed: 777, name: 'The Ogre Bridge' })

    await first.call('add_creature', BRANN)
    await first.call('add_creature', OGRE)
    await first.call('set_scene', { scene: 'A rope bridge over a gorge, an ogre at the far end.' })
    await first.call('start_combat', { ids: ['brann', 'ogre'] })
    await first.call('apply_damage', { id: 'brann', amount: 11, damage_type: 'bludgeoning' })
    await first.call('apply_condition', { id: 'brann', condition: 'frightened' })
    await first.call('next_turn')

    const before = await first.call('get_combat_state')
    const sheetBefore = await first.call('get_character_sheet', { id: 'brann' })
    first.close()

    // A new process, pointed at the same file, with nothing passed in.
    const second = await session()

    const after = await second.call('get_combat_state')
    expect(after.data!.active).toBe(true)
    expect(after.data!.round).toBe(before.data!.round)
    expect(after.data!.turn).toBe(before.data!.turn)
    expect(after.data!.order).toEqual(before.data!.order)

    const sheetAfter = await second.call('get_character_sheet', { id: 'brann' })
    expect(sheetAfter.data!.sheet).toEqual(sheetBefore.data!.sheet)
    expect(sheetAfter.data!.sheet.hp.current).toBe(17)
    expect(sheetAfter.data!.sheet.conditions).toContain('frightened')

    const state = await second.call('get_state')
    expect(state.data!.scene).toBe('A rope bridge over a gorge, an ogre at the far end.')
    expect(state.data!.creatures).toHaveLength(2)

    // And the fight carries on rather than restarting.
    const resumed = await second.call('next_turn')
    expect(resumed.data!.round).toBeGreaterThanOrEqual(before.data!.round)
    second.close()
  })

  it('keeps the dice where they were rather than replaying them', async () => {
    const continuous = await session({ seed: 4242 })
    const straightThrough: string[] = []
    for (let i = 0; i < 6; i++) {
      straightThrough.push((await continuous.call('roll_dice', { notation: '1d20' })).data!.narration)
    }
    continuous.close()

    rmSync(dbPath, { force: true })
    rmSync(`${dbPath}-wal`, { force: true })
    rmSync(`${dbPath}-shm`, { force: true })

    const firstHalf = await session({ seed: 4242 })
    const split: string[] = []
    for (let i = 0; i < 3; i++) {
      split.push((await firstHalf.call('roll_dice', { notation: '1d20' })).data!.narration)
    }
    firstHalf.close()

    const secondHalf = await session()
    for (let i = 0; i < 3; i++) {
      split.push((await secondHalf.call('roll_dice', { notation: '1d20' })).data!.narration)
    }
    secondHalf.close()

    expect(split).toEqual(straightThrough)
  })

  it('reports the campaign it resumed in the recap', async () => {
    const first = await session({ seed: 1, name: 'Mourning Hill' })
    await first.call('add_creature', BRANN)
    await first.call('set_scene', { scene: 'The barrow door stands open.' })
    first.close()

    const second = await session()
    const recap = await second.call('recap')
    expect(recap.data!.campaign.name).toBe('Mourning Hill')
    expect(recap.data!.scene).toBe('The barrow door stands open.')
    expect(recap.data!.events.some((e: { t: string }) => e.t === 'creature-added')).toBe(true)
    expect(recap.data!.events.some((e: { t: string }) => e.t === 'scene')).toBe(true)
    second.close()
  })
})

describe('every mutating tool writes through', () => {
  // A tool that changes state but forgets to commit loses that change on restart,
  // silently. This enumerates them and checks the step count grows.
  const mutations: Array<[string, Record<string, unknown>]> = [
    ['set_scene', { scene: 'somewhere' }],
    ['apply_damage', { id: 'ogre', amount: 3, damage_type: 'fire' }],
    ['heal', { id: 'ogre', amount: 2 }],
    ['apply_temp_hp', { id: 'ogre', amount: 5 }],
    ['apply_condition', { id: 'ogre', condition: 'poisoned' }],
    ['remove_condition', { id: 'ogre', condition: 'poisoned' }],
    ['set_exhaustion', { id: 'ogre', level: 2 }],
    ['start_concentration', { id: 'brann', spell: 'bless' }],
    ['concentration_save', { id: 'brann', damage_taken: 8 }],
    [
      'attack_roll',
      {
        attacker: 'brann',
        target: 'ogre',
        ability: 'str',
        proficient: true,
        damage: '1d8',
        damage_type: 'slashing',
        damage_bonus: 3,
      },
    ],
    ['start_combat', { ids: ['brann', 'ogre'] }],
    ['next_turn', {}],
    ['remove_from_combat', { id: 'ogre' }],
    ['end_combat', {}],
    ['earn_money', { id: 'brann', amount: '10 gp' }],
    ['spend_money', { id: 'brann', amount: '2 sp' }],
    ['give_item', { id: 'brann', name: 'Rope, 50 ft' }],
    ['learn_spell', { id: 'brann', name: 'Shield', level: 1, effect: '+5 AC, reaction' }],
    ['set_rules', { strict_spells: true }],
    ['take_item', { id: 'brann', name: 'Rope, 50 ft' }],
    ['give_item', { id: 'ogre', name: 'Torch', qty: 5, price: '1 cp' }],
    ['buy', { buyer_id: 'brann', vendor_id: 'ogre', lines: [{ name: 'Torch', qty: 2 }] }],
    ['sell', { seller_id: 'brann', vendor_id: 'ogre', lines: [{ name: 'Torch', unit_price: '1 cp' }] }],
    ['update_npc', { id: 'ogre', race: 'ogre', attitude: 'hostile', presence: 'present' }],
    ['add_note', { id: 'ogre', note: 'Keeps a locket it cannot open.' }],
    ['reveal_note', { id: 'ogre', match: 'locket' }],
    ['set_story', { premise: 'The tithe is late.', question: 'Who took it?', beats: ['The ledger is wrong.'] }],
    ['amend_story', { truth: 'The reeve took it.' }],
    ['beat', { match: 'ledger', op: 'reached' }],
  ]

  it('persists each one', async () => {
    const play = await session({ seed: 5 })
    await play.call('add_creature', BRANN)
    await play.call('add_creature', OGRE)

    for (const [tool, args] of mutations) {
      const stepsBefore = (await play.call('list_campaigns')).data!.campaigns[0].steps
      const result = await play.call(tool, args)
      expect(result.isError, `${tool}: ${result.text}`).toBe(false)
      const stepsAfter = (await play.call('list_campaigns')).data!.campaigns[0].steps
      expect(stepsAfter, `${tool} did not persist`).toBeGreaterThan(stepsBefore)
    }
    play.close()
  })

  it('does not write a step for a read-only tool', async () => {
    const play = await session({ seed: 5 })
    await play.call('add_creature', BRANN)

    const before = (await play.call('list_campaigns')).data!.campaigns[0].steps
    await play.call('get_state')
    await play.call('get_character_sheet', { id: 'brann' })
    await play.call('get_combat_state')
    await play.call('recent_events')
    await play.call('recap')
    await play.call('get_purse', { id: 'brann' })
    await play.call('get_cast')
    await play.call('offer_choice', { prompt: 'Which way?', options: ['left', 'right'] })
    const after = (await play.call('list_campaigns')).data!.campaigns[0].steps

    expect(after).toBe(before)
    play.close()
  })

  it('writes a step for a dice roll, so the dice position survives', async () => {
    const play = await session({ seed: 5 })
    await play.call('add_creature', BRANN)
    const before = (await play.call('list_campaigns')).data!.campaigns[0].steps
    await play.call('roll_dice', { notation: '1d20' })
    const after = (await play.call('list_campaigns')).data!.campaigns[0].steps
    expect(after).toBeGreaterThan(before)
    play.close()
  })
})

describe('undo', () => {
  it('reverts the last change', async () => {
    const play = await session({ seed: 9 })
    await play.call('add_creature', OGRE)
    await play.call('apply_damage', { id: 'ogre', amount: 20, damage_type: 'slashing' })

    const hurt = await play.call('get_character_sheet', { id: 'ogre' })
    expect(hurt.data!.sheet.hp.current).toBe(39)

    const undone = await play.call('undo')
    expect(undone.data!.undone).toBe('apply_damage')

    const healed = await play.call('get_character_sheet', { id: 'ogre' })
    expect(healed.data!.sheet.hp.current).toBe(59)
    play.close()
  })

  it('walks back several steps', async () => {
    const play = await session({ seed: 9 })
    await play.call('add_creature', OGRE)
    await play.call('apply_damage', { id: 'ogre', amount: 10, damage_type: 'fire' })
    await play.call('apply_damage', { id: 'ogre', amount: 10, damage_type: 'fire' })
    await play.call('apply_damage', { id: 'ogre', amount: 10, damage_type: 'fire' })

    await play.call('undo')
    await play.call('undo')
    expect((await play.call('get_character_sheet', { id: 'ogre' })).data!.sheet.hp.current).toBe(49)
    play.close()
  })

  it('undoes a creature back out of existence', async () => {
    const play = await session({ seed: 9 })
    await play.call('add_creature', OGRE)
    await play.call('undo')
    const gone = await play.call('get_character_sheet', { id: 'ogre' })
    expect(gone.isError).toBe(true)
    play.close()
  })

  it('survives a restart', async () => {
    const first = await session({ seed: 9 })
    await first.call('add_creature', OGRE)
    await first.call('apply_damage', { id: 'ogre', amount: 20, damage_type: 'slashing' })
    first.close()

    const second = await session()
    await second.call('undo')
    expect((await second.call('get_character_sheet', { id: 'ogre' })).data!.sheet.hp.current).toBe(59)
    second.close()
  })

  it('says so when there is nothing to undo', async () => {
    const play = await session({ seed: 9 })
    const result = await play.call('undo')
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/nothing to undo/)
    play.close()
  })
})

describe('campaign management', () => {
  it('keeps campaigns apart and switches between them', async () => {
    const play = await session({ seed: 1, name: 'First' })
    await play.call('add_creature', BRANN)

    const created = await play.call('new_campaign', { name: 'Second', seed: 2 })
    const secondId = created.data!.campaign.id

    // The new campaign starts empty.
    expect((await play.call('get_state')).data!.creatures).toEqual([])
    await play.call('add_creature', OGRE)

    const listed = await play.call('list_campaigns')
    expect(listed.data!.campaigns).toHaveLength(2)
    expect(listed.data!.current).toBe(secondId)

    // Back to the first, with Brann still in it.
    const firstId = listed.data!.campaigns.find((c: { name: string }) => c.name === 'First').id
    await play.call('load_campaign', { id: firstId })
    const back = await play.call('get_state')
    expect(back.data!.creatures.map((c: { id: string }) => c.id)).toEqual(['brann'])
    play.close()
  })

  it('names the known campaigns when given a bad id', async () => {
    const play = await session({ seed: 1, name: 'Only One' })
    const result = await play.call('load_campaign', { id: 999 })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/Only One/)
    play.close()
  })

  it('renames the loaded campaign', async () => {
    const play = await session({ seed: 1, name: 'Untitled campaign' })
    await play.call('rename_campaign', { name: 'The Drowned Warren' })
    expect((await play.call('recap')).data!.campaign.name).toBe('The Drowned Warren')
    play.close()
  })

  it('clears the board but keeps the campaign, reversibly', async () => {
    const play = await session({ seed: 1 })
    await play.call('add_creature', BRANN)
    await play.call('add_creature', OGRE)
    await play.call('set_scene', { scene: 'A bridge.' })

    await play.call('reset_campaign', { confirm: true })
    const cleared = await play.call('get_state')
    expect(cleared.data!.creatures).toEqual([])
    expect(cleared.data!.combat).toBeNull()

    // The journal is intact, so it can be walked back.
    await play.call('undo')
    expect((await play.call('get_state')).data!.creatures).toHaveLength(2)
    play.close()
  })

  it('refuses reset and delete without an explicit confirmation', async () => {
    const play = await session({ seed: 1 })
    await play.call('add_creature', BRANN)

    expect((await play.call('reset_campaign', {})).isError).toBe(true)
    expect((await play.call('delete_campaign', { id: 1 })).isError).toBe(true)

    // And nothing was cleared on the way.
    expect((await play.call('get_state')).data!.creatures).toHaveLength(1)
    play.close()
  })

  it('deletes a campaign and moves to another', async () => {
    const play = await session({ seed: 1, name: 'Doomed' })
    await play.call('add_creature', BRANN)
    const keeper = (await play.call('new_campaign', { name: 'Keeper', seed: 2 })).data!.campaign.id
    const doomed = (await play.call('list_campaigns')).data!.campaigns.find(
      (c: { name: string }) => c.name === 'Doomed',
    ).id

    const deleted = await play.call('delete_campaign', { id: doomed, confirm: true })
    expect(deleted.data!.nowLoaded).toBe(keeper)

    const listed = await play.call('list_campaigns')
    expect(listed.data!.campaigns).toHaveLength(1)
    expect(listed.data!.campaigns[0].name).toBe('Keeper')
    play.close()
  })

  it('starts a fresh campaign after deleting the last one', async () => {
    const play = await session({ seed: 1, name: 'Only' })
    const only = (await play.call('list_campaigns')).data!.campaigns[0].id
    await play.call('delete_campaign', { id: only, confirm: true })

    const listed = await play.call('list_campaigns')
    expect(listed.data!.campaigns).toHaveLength(1)
    expect((await play.call('get_state')).data!.creatures).toEqual([])
    play.close()
  })
})

describe('steps record which engine run wrote them', () => {
  it('stamps every step with the session', async () => {
    const play = await session()
    await play.call('add_creature', BRANN)
    await play.call('set_scene', { scene: 'A road.' })

    const db = new CampaignDb(dbPath)
    open.push({ db })
    const campaign = db.mostRecentCampaign()!
    const steps = db.recentSteps(campaign.id, 10)

    expect(steps.length).toBeGreaterThan(0)
    for (const step of steps) {
      expect(step.session, `step ${step.seq} "${step.label}" has no session`).toBeTruthy()
    }
    // One process, so one session across the lot.
    expect(new Set(steps.map((s) => s.session)).size).toBe(1)
    expect(db.latestSession(campaign.id)).toBe(steps.at(-1)!.session)
    play.close()
  })

  it('reads back as null for steps written before sessions existed', () => {
    const db = new CampaignDb(dbPath)
    open.push({ db })
    const campaign = db.createCampaign('Old', 1)
    // appendStep's session argument defaults to null, which is exactly what an
    // older build wrote.
    db.appendStep(campaign.id, 'ancient', [], {
      rngState: 1,
      scene: 'Long ago.',
      creatures: [],
      combat: null,
    })

    expect(db.recentSteps(campaign.id, 1)[0]!.session).toBeNull()
    expect(db.latestSession(campaign.id)).toBeNull()
  })

  it('survives a database created before the column existed', () => {
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
    const legacyPath = join(dir, 'legacy.db')
    const raw = new DatabaseSync(legacyPath)
    raw.exec(`
      CREATE TABLE campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        seed INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE steps (campaign_id INTEGER NOT NULL, seq INTEGER NOT NULL, label TEXT NOT NULL,
        events TEXT NOT NULL, event_count INTEGER NOT NULL, state TEXT NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY (campaign_id, seq));
    `)
    raw.exec(
      `INSERT INTO campaigns (name, seed, created_at, updated_at) VALUES ('Legacy', 7, 'then', 'then')`,
    )
    raw.exec(
      `INSERT INTO steps (campaign_id, seq, label, events, event_count, state, created_at)
       VALUES (1, 1, 'old step', '[]', 0, '{"rngState":1,"scene":"x","creatures":[],"combat":null}', 'then')`,
    )
    raw.close()

    // Opening it must add the column rather than throw.
    const db = new CampaignDb(legacyPath)
    open.push({ db })

    expect(db.recentSteps(1, 5)[0]!.session).toBeNull()
    expect(() =>
      db.appendStep(1, 'new step', [], {
        rngState: 2,
        scene: 'now',
        creatures: [],
        combat: null,
      }, 'abc123'),
    ).not.toThrow()
    expect(db.latestSession(1)).toBe('abc123')
  })
})

describe('the browser follows the campaign in play', () => {
  /**
   * `readTable` draws whatever `mostRecentCampaign` returns, and that is ordered
   * by `updated_at`. Writing a step bumps it, so ordinary play is fine — but a
   * resume writes nothing, and the panels used to stay on the previously played
   * campaign until the first mutating call landed. Which is the whole of the
   * start of a session: the recap, the "last time you were…", the first look at
   * the character sheet.
   */
  it('makes a resumed campaign the most recent one', async () => {
    const play = await session()

    // Two campaigns, the second played after the first.
    await play.call('new_campaign', { name: 'Older' })
    await play.call('set_scene', { scene: 'The older road.' })
    const older = (await play.call('list_campaigns')).data!['current'] as number

    await play.call('new_campaign', { name: 'Newer' })
    await play.call('set_scene', { scene: 'The newer road.' })

    const db = new CampaignDb(dbPath)
    open.push({ db })
    expect(db.mostRecentCampaign()!.name).toBe('Newer')

    // Resuming the older one is a read, not a write — nothing is committed.
    await play.call('load_campaign', { id: older })

    expect(db.mostRecentCampaign()!.name).toBe('Older')
    expect(db.latestSnapshot(older)!.scene).toBe('The older road.')
    play.close()
  })
})
