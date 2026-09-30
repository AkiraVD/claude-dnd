import type { AbilityScores } from '@dnd/content'
import { describe, expect, it } from 'vitest'
import {
  abilityMod,
  addCondition,
  createCreature,
  hasCondition,
  initiativeModifier,
  isConscious,
  lifeStatus,
  passivePerception,
  profBonus,
  removeCondition,
  saveModifier,
  setExhaustion,
  skillModifier,
  unarmoredAc,
  withDeath,
  withHp,
} from './character.js'
import { RulesError } from './errors.js'

const SCORES: AbilityScores = { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 }

const fighter = () =>
  createCreature({
    id: 'pc',
    name: 'Brann',
    kind: 'pc',
    level: 5,
    scores: SCORES,
    maxHp: 44,
    ac: 18,
    proficiencies: { saves: ['str', 'con'], skills: ['athletics', 'perception'], expertise: ['athletics'] },
  })

describe('createCreature', () => {
  it('fills in sensible defaults', () => {
    const goblin = createCreature({ id: 'g', name: 'Goblin', scores: SCORES, maxHp: 7, ac: 15 })
    expect(goblin).toMatchObject({
      kind: 'npc',
      level: 1,
      speed: 30,
      hp: { current: 7, max: 7, temp: 0 },
      concentration: null,
      conditions: { active: [], exhaustion: 0 },
      death: { successes: 0, failures: 0, stable: false, dead: false },
    })
  })

  it('accepts a wounded starting state', () => {
    expect(createCreature({ id: 'g', name: 'G', scores: SCORES, maxHp: 10, hp: 3, ac: 12 }).hp)
      .toMatchObject({ current: 3, max: 10 })
  })

  it('deduplicates proficiency and defense lists', () => {
    const c = createCreature({
      id: 'g',
      name: 'G',
      scores: SCORES,
      maxHp: 7,
      ac: 15,
      proficiencies: { skills: ['stealth', 'stealth'] },
      defenses: { resistances: ['fire', 'fire'] },
    })
    expect(c.proficiencies.skills).toEqual(['stealth'])
    expect(c.defenses.resistances).toEqual(['fire'])
  })

  const rejections: Array<[string, Parameters<typeof createCreature>[0], RegExp]> = [
    ['an empty id', { id: '  ', name: 'X', scores: SCORES, maxHp: 1, ac: 1 }, /id cannot be empty/],
    ['an empty name', { id: 'x', name: '', scores: SCORES, maxHp: 1, ac: 1 }, /needs a name/],
    ['level 0', { id: 'x', name: 'X', scores: SCORES, maxHp: 1, ac: 1, level: 0 }, /1\.\.20/],
    ['level 21', { id: 'x', name: 'X', scores: SCORES, maxHp: 1, ac: 1, level: 21 }, /1\.\.20/],
    ['a 0 score', { id: 'x', name: 'X', scores: { ...SCORES, str: 0 }, maxHp: 1, ac: 1 }, /str must be an integer/],
    ['a 31 score', { id: 'x', name: 'X', scores: { ...SCORES, cha: 31 }, maxHp: 1, ac: 1 }, /cha must be an integer/],
    ['0 max HP', { id: 'x', name: 'X', scores: SCORES, maxHp: 0, ac: 1 }, /positive integer/],
    ['HP above max', { id: 'x', name: 'X', scores: SCORES, maxHp: 5, hp: 6, ac: 1 }, /0\.\.5/],
    ['negative HP', { id: 'x', name: 'X', scores: SCORES, maxHp: 5, hp: -1, ac: 1 }, /0\.\.5/],
    ['negative AC', { id: 'x', name: 'X', scores: SCORES, maxHp: 5, ac: -1 }, /non-negative/],
    [
      'expertise without proficiency',
      { id: 'x', name: 'X', scores: SCORES, maxHp: 5, ac: 1, proficiencies: { expertise: ['stealth'] } },
      /requires proficiency/,
    ],
  ]

  for (const [label, input, message] of rejections) {
    it(`rejects ${label}`, () => {
      expect(() => createCreature(input)).toThrow(RulesError)
      expect(() => createCreature(input)).toThrow(message)
    })
  }
})

describe('derived numbers', () => {
  it('reads ability modifiers off the sheet', () => {
    expect(abilityMod(fighter(), 'str')).toBe(3)
    expect(abilityMod(fighter(), 'cha')).toBe(-1)
  })

  it('derives the proficiency bonus from level', () => {
    expect(profBonus(fighter())).toBe(3)
  })

  it('adds proficiency to saves only where proficient', () => {
    expect(saveModifier(fighter(), 'con')).toBe(2 + 3)
    expect(saveModifier(fighter(), 'dex')).toBe(2)
  })

  it('doubles proficiency for expertise skills', () => {
    // athletics: str +3, proficiency +3 doubled
    expect(skillModifier(fighter(), 'athletics')).toBe(3 + 6)
    // perception: wis +1, proficiency +3
    expect(skillModifier(fighter(), 'perception')).toBe(1 + 3)
    // stealth: dex +2, no proficiency
    expect(skillModifier(fighter(), 'stealth')).toBe(2)
  })

  it('computes passive perception for the DM to roll against', () => {
    expect(passivePerception(fighter())).toBe(14)
  })

  it('reports initiative and unarmored AC', () => {
    expect(initiativeModifier(fighter())).toBe(2)
    expect(unarmoredAc(fighter())).toBe(12)
  })
})

describe('life status', () => {
  it('is alive above 0 HP', () => {
    expect(lifeStatus(fighter())).toBe('alive')
  })

  it('is dying at 0 HP', () => {
    expect(lifeStatus(withHp(fighter(), { current: 0 }))).toBe('dying')
  })

  it('is stable once stabilised', () => {
    const down = withDeath(withHp(fighter(), { current: 0 }), { stable: true })
    expect(lifeStatus(down)).toBe('stable')
  })

  it('is dead when dead, whatever the HP says', () => {
    expect(lifeStatus(withDeath(fighter(), { dead: true }))).toBe('dead')
  })

  it('treats 0 HP and the unconscious condition as both disqualifying', () => {
    expect(isConscious(fighter())).toBe(true)
    expect(isConscious(withHp(fighter(), { current: 0 }))).toBe(false)
    expect(isConscious(addCondition(fighter(), 'unconscious'))).toBe(false)
  })
})

describe('conditions', () => {
  it('adds and removes', () => {
    const poisoned = addCondition(fighter(), 'poisoned')
    expect(hasCondition(poisoned, 'poisoned')).toBe(true)
    expect(hasCondition(removeCondition(poisoned, 'poisoned'), 'poisoned')).toBe(false)
  })

  it('is idempotent in both directions', () => {
    const once = addCondition(fighter(), 'prone')
    expect(addCondition(once, 'prone')).toBe(once)
    const clean = fighter()
    expect(removeCondition(clean, 'prone')).toBe(clean)
  })

  it('does not mutate the original', () => {
    const before = fighter()
    addCondition(before, 'stunned')
    expect(before.conditions.active).toEqual([])
  })

  it('tracks exhaustion as a level, not a flag', () => {
    const tired = setExhaustion(fighter(), 3)
    expect(tired.conditions.exhaustion).toBe(3)
    expect(hasCondition(tired, 'exhaustion')).toBe(true)
    expect(hasCondition(fighter(), 'exhaustion')).toBe(false)
  })

  it('kills at exhaustion 6', () => {
    expect(lifeStatus(setExhaustion(fighter(), 6))).toBe('dead')
    expect(lifeStatus(setExhaustion(fighter(), 5))).toBe('alive')
  })

  it('rejects an out-of-range exhaustion level', () => {
    expect(() => setExhaustion(fighter(), 7)).toThrow(/0\.\.6/)
    expect(() => setExhaustion(fighter(), -1)).toThrow(/0\.\.6/)
  })
})
