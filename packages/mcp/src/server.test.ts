import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildServer } from './server.js'

/**
 * Integration tests over the real MCP protocol, through linked in-memory
 * transports. These exercise the schemas, the JSON round-trip, and the error
 * path exactly as Claude Code will — the engine's own tests live next door in
 * @dnd/engine and do not cover any of that.
 */

let client: Client

async function connect(seed = 1234): Promise<Client> {
  const { server } = buildServer({ seed })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const c = new Client({ name: 'test', version: '0' })
  await Promise.all([c.connect(clientTransport), server.connect(serverTransport)])
  return c
}

/** Call a tool and parse the JSON payload back out of the text content. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as Array<{ type: string; text: string }>
  const text = content[0]!.text
  return {
    isError: result.isError === true,
    text,
    data: result.isError === true ? null : (JSON.parse(text) as Record<string, any>),
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
  skill_proficiencies: ['athletics', 'perception'],
  expertise: ['athletics'],
}

const GOBLIN = {
  id: 'goblin-a',
  name: 'Goblin A',
  str: 8,
  dex: 14,
  con: 10,
  int: 10,
  wis: 8,
  cha: 8,
  max_hp: 7,
  ac: 15,
}

beforeEach(async () => {
  client = await connect()
})

describe('tool surface', () => {
  it('advertises every tool with a description', async () => {
    const { tools } = await client.listTools()
    expect(tools.length).toBeGreaterThanOrEqual(24)
    for (const tool of tools) {
      expect(tool.description, tool.name).toBeTruthy()
      expect(tool.inputSchema, tool.name).toBeTruthy()
    }
  })

  it('covers the mechanics the DM needs', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual(
      expect.arrayContaining([
        'ability_check',
        'add_creature',
        'apply_condition',
        'apply_damage',
        'apply_temp_hp',
        'attack_roll',
        'concentration_save',
        'death_save',
        'end_combat',
        'get_character_sheet',
        'get_combat_state',
        'get_state',
        'heal',
        'next_turn',
        'recent_events',
        'roll_dice',
        'saving_throw',
        'set_scene',
        'skill_check',
        'stabilise',
        'start_combat',
        'start_concentration',
      ]),
    )
  })
})

describe('dice', () => {
  it('rolls notation and reports the breakdown', async () => {
    const { data } = await call('roll_dice', { notation: '4d6kh3', purpose: 'ability scores' })
    expect(data!.narration).toMatch(/^4d6kh3: \[/)
    expect(data!.total).toBeGreaterThanOrEqual(3)
    expect(data!.total).toBeLessThanOrEqual(18)
    expect(data!.purpose).toBe('ability scores')
  })

  it('is deterministic for a given seed', async () => {
    const first = await call('roll_dice', { notation: '3d20' })
    client = await connect()
    const second = await call('roll_dice', { notation: '3d20' })
    expect(second.data!.narration).toBe(first.data!.narration)
  })

  it('returns bad notation as a failed call, not a crash', async () => {
    const result = await call('roll_dice', { notation: '2d' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/needs a side count/)
  })
})

describe('creatures', () => {
  it('derives the whole sheet from raw scores', async () => {
    const { data } = await call('add_creature', BRANN)
    const sheet = data!.sheet

    expect(sheet.hp).toEqual({ current: 28, max: 28, temp: 0 })
    expect(sheet.abilities.str).toMatchObject({ score: 16, modifier: '+3', save: '+5' })
    expect(sheet.abilities.dex).toMatchObject({ modifier: '+2', save: '+2', saveProficient: false })
    // athletics has expertise: str +3 plus twice the +2 proficiency bonus
    expect(sheet.proficientSkills.athletics).toBe('+7 (expertise)')
    expect(sheet.proficientSkills.perception).toBe('+3')
    expect(sheet.passivePerception).toBe(13)
  })

  it('refuses a duplicate id', async () => {
    await call('add_creature', BRANN)
    const again = await call('add_creature', BRANN)
    expect(again.isError).toBe(true)
    expect(again.text).toMatch(/already exists/)
  })

  it('names the known ids when given an unknown one', async () => {
    await call('add_creature', BRANN)
    const result = await call('get_character_sheet', { id: 'bran' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/no creature with id "bran"/)
    expect(result.text).toMatch(/brann/)
  })

  it('rejects an out-of-range score at the schema boundary', async () => {
    const result = await call('add_creature', { ...BRANN, str: 40 })
    expect(result.isError).toBe(true)
  })

  it('rejects expertise without proficiency', async () => {
    const result = await call('add_creature', { ...BRANN, expertise: ['stealth'] })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/requires proficiency/)
  })
})

describe('checks', () => {
  beforeEach(async () => {
    await call('add_creature', BRANN)
  })

  it('applies proficiency and expertise from the sheet', async () => {
    const { data } = await call('skill_check', { id: 'brann', skill: 'athletics', dc: 15 })
    expect(data!.test.modifier).toBe(7)
    expect(data!.narration).toMatch(/^Brann athletics check: \[\d+\] \+7 = \d+ vs DC 15 — (success|failure)$/)
  })

  it('leaves an unproficient skill at the bare ability modifier', async () => {
    const { data } = await call('skill_check', { id: 'brann', skill: 'stealth' })
    expect(data!.test.modifier).toBe(2)
    expect(data!.test.dc).toBeUndefined()
  })

  it('applies save proficiency', async () => {
    const proficient = await call('saving_throw', { id: 'brann', ability: 'con', dc: 12 })
    expect(proficient.data!.test.modifier).toBe(4)

    const not = await call('saving_throw', { id: 'brann', ability: 'cha', dc: 12 })
    expect(not.data!.test.modifier).toBe(-1)
  })

  it('rolls two dice with advantage', async () => {
    const { data } = await call('ability_check', {
      id: 'brann',
      ability: 'str',
      dc: 10,
      advantage: 'advantage',
    })
    expect(data!.test.roll.notation).toBe('2d20kh1')
    expect(data!.narration).toMatch(
      /^Brann STR check with advantage: \[(~?\d+~?), (~?\d+~?)\] -> \d+ \+3 = \d+ vs DC 10 — (success|failure)$/,
    )
  })
})

describe('combat', () => {
  beforeEach(async () => {
    await call('add_creature', BRANN)
    await call('add_creature', GOBLIN)
  })

  it('refuses to advance a turn before combat starts', async () => {
    const result = await call('next_turn')
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/no combat is in progress/)
  })

  it('rolls initiative and reports the order', async () => {
    const { data } = await call('start_combat', { ids: ['brann', 'goblin-a'] })
    expect(data!.round).toBe(1)
    expect(data!.order).toHaveLength(2)
    expect(data!.rolls).toHaveLength(2)

    const initiatives = data!.order.map((c: { initiative: number }) => c.initiative)
    expect(initiatives[0]).toBeGreaterThanOrEqual(initiatives[1])
  })

  it('advances turns and wraps into a new round', async () => {
    await call('start_combat', { ids: ['brann', 'goblin-a'] })
    const second = await call('next_turn')
    expect(second.data!.round).toBe(1)
    expect(second.data!.newRound).toBe(false)

    const third = await call('next_turn')
    expect(third.data!.round).toBe(2)
    expect(third.data!.newRound).toBe(true)
  })

  it('resolves an attack and applies the damage in one call', async () => {
    const { data } = await call('attack_roll', {
      attacker: 'brann',
      target: 'goblin-a',
      ability: 'str',
      proficient: true,
      damage: '1d8',
      damage_type: 'slashing',
      damage_bonus: 3,
    })

    expect(data!.attackRoll.ac).toBe(15)
    expect(data!.attackRoll.modifier).toBe('+5')
    expect(typeof data!.hit).toBe('boolean')

    if (data!.hit) {
      expect(data!.damageApplied).toBeGreaterThan(0)
      expect(data!.target.hp).not.toBe('7/7')
    } else {
      expect(data!.target.hp).toBe('7/7')
    }
  })

  it('reports the sheet change after damage', async () => {
    await call('apply_damage', { id: 'goblin-a', amount: 4, damage_type: 'piercing' })
    const { data } = await call('get_character_sheet', { id: 'goblin-a' })
    expect(data!.sheet.hp).toEqual({ current: 3, max: 7, temp: 0 })
  })

  it('takes a creature down without killing it, then heals it back up', async () => {
    const down = await call('apply_damage', { id: 'goblin-a', amount: 7, damage_type: 'piercing' })
    expect(down.data!.droppedToZero).toBe(true)
    expect(down.data!.instantDeath).toBe(false)
    expect(down.data!.creature.status).toBe('dying')
    expect(down.data!.creature.conditions).toContain('unconscious')

    const revived = await call('heal', { id: 'goblin-a', amount: 3 })
    expect(revived.data!.revived).toBe(true)
    expect(revived.data!.creature.status).toBe('alive')
    expect(revived.data!.creature.conditions).not.toContain('unconscious')
  })

  it('kills outright when overkill reaches max HP', async () => {
    const { data } = await call('apply_damage', { id: 'goblin-a', amount: 14, damage_type: 'force' })
    expect(data!.instantDeath).toBe(true)
    expect(data!.creature.status).toBe('dead')
  })

  it('drops a fallen combatant from the order', async () => {
    await call('start_combat', { ids: ['brann', 'goblin-a'] })
    const { data } = await call('remove_from_combat', { id: 'goblin-a' })
    expect(data!.order).toEqual(['Brann'])
  })
})

describe('conditions and concentration', () => {
  beforeEach(async () => {
    await call('add_creature', BRANN)
  })

  it('adds and clears conditions', async () => {
    const added = await call('apply_condition', { id: 'brann', condition: 'poisoned' })
    expect(added.data!.creature.conditions).toContain('poisoned')

    const removed = await call('remove_condition', { id: 'brann', condition: 'poisoned' })
    expect(removed.data!.creature.conditions).not.toContain('poisoned')
  })

  it('sends exhaustion to its own tool', async () => {
    const result = await call('apply_condition', { id: 'brann', condition: 'exhaustion' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/use set_exhaustion/)
  })

  it('tracks exhaustion as a level and kills at 6', async () => {
    const three = await call('set_exhaustion', { id: 'brann', level: 3 })
    expect(three.data!.creature.conditions).toContain('exhaustion 3')

    const six = await call('set_exhaustion', { id: 'brann', level: 6 })
    expect(six.data!.status).toBe('dead')
  })

  it('reports a concentration DC when a concentrating caster is hurt', async () => {
    await call('start_concentration', { id: 'brann', spell: 'bless' })
    const hurt = await call('apply_damage', { id: 'brann', amount: 9, damage_type: 'fire' })
    expect(hurt.data!.concentrationDc).toBe(10)

    const save = await call('concentration_save', { id: 'brann', damage_taken: 9 })
    expect(typeof save.data!.maintained).toBe('boolean')
  })

  it('refuses a concentration save with nothing to concentrate on', async () => {
    const result = await call('concentration_save', { id: 'brann', damage_taken: 9 })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/not concentrating/)
  })
})

describe('scene and log', () => {
  it('remembers the scene', async () => {
    await call('set_scene', { scene: 'A damp cave mouth, torchlight guttering.' })
    const { data } = await call('get_state')
    expect(data!.scene).toBe('A damp cave mouth, torchlight guttering.')
  })

  it('records an auditable trail of what happened', async () => {
    await call('add_creature', GOBLIN)
    await call('apply_damage', { id: 'goblin-a', amount: 3, damage_type: 'fire' })
    await call('apply_damage', { id: 'goblin-a', amount: 2, damage_type: 'cold' })

    const { data } = await call('recent_events', { limit: 10 })
    const damage = data!.events.filter((e: { t: string }) => e.t === 'damage')
    expect(damage).toHaveLength(2)
    expect(damage[0]).toMatchObject({ target: 'goblin-a', applied: 3, damageType: 'fire', hpAfter: 4 })
    expect(damage[1]).toMatchObject({ applied: 2, damageType: 'cold', hpAfter: 2 })
  })

  it('starts with an empty scene and no combat', async () => {
    const { data } = await call('get_state')
    expect(data!.combat).toBeNull()
    expect(data!.creatures).toEqual([])
  })
})
