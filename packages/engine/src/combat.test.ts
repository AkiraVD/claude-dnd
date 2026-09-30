import type { AbilityScores } from '@dnd/content'
import { describe, expect, it } from 'vitest'
import { addCondition, createCreature, withDeath, withHp, type Creature } from './character.js'
import {
  attack,
  attackConditionAdvantage,
  attackModifier,
  currentActor,
  endCombat,
  nextTurn,
  removeFromCombat,
  startCombat,
} from './combat.js'
import { RulesError } from './errors.js'
import { scriptedRng } from './testing.js'

const SCORES: AbilityScores = { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 }

const hero = (overrides: Partial<Parameters<typeof createCreature>[0]> = {}): Creature =>
  createCreature({
    id: 'hero',
    name: 'Brann',
    kind: 'pc',
    level: 5,
    scores: SCORES,
    maxHp: 44,
    ac: 18,
    ...overrides,
  })

const dummy = (overrides: Partial<Parameters<typeof createCreature>[0]> = {}): Creature =>
  createCreature({ id: 'dummy', name: 'Dummy', scores: SCORES, maxHp: 30, ac: 15, ...overrides })

/** Longsword in the hands of a level 5 fighter: +3 str, +3 proficiency. */
const swing = (rng: ReturnType<typeof scriptedRng>, over: Partial<Parameters<typeof attack>[0]> = {}) =>
  attack({
    attacker: hero(),
    target: dummy(),
    ability: 'str',
    proficient: true,
    damage: '1d8',
    damageType: 'slashing',
    damageBonus: 3,
    rng,
    ...over,
  })

describe('initiative and turn order', () => {
  const combatants = () => [
    createCreature({ id: 'a', name: 'A', scores: { ...SCORES, dex: 14 }, maxHp: 10, ac: 10 }),
    createCreature({ id: 'b', name: 'B', scores: { ...SCORES, dex: 14 }, maxHp: 10, ac: 10 }),
    createCreature({ id: 'c', name: 'C', scores: { ...SCORES, dex: 20 }, maxHp: 10, ac: 10 }),
  ]

  it('orders by initiative, highest first', () => {
    // dex +2, +2, +5 against faces 5, 18, 3 → 7, 20, 8
    const { state, rolls } = startCombat(combatants(), scriptedRng([5, 18, 3]))
    expect(rolls.map((r) => r.initiative)).toEqual([7, 20, 8])
    expect(state.order.map((c) => c.id)).toEqual(['b', 'c', 'a'])
    expect(state).toMatchObject({ active: true, round: 1, turnIndex: 0 })
  })

  it('breaks ties on dexterity modifier', () => {
    // a and c both reach 15; c has the higher dex.
    const { state } = startCombat(combatants(), scriptedRng([13, 1, 10]))
    expect(state.order.map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })

  it('breaks a remaining tie on the order passed in, not at random', () => {
    // a and b share dex +2 and both reach 12; c trails on 6.
    const { state } = startCombat(combatants(), scriptedRng([10, 10, 1]))
    expect(state.order.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('advances turns and rolls over into a new round', () => {
    const { state } = startCombat(combatants(), scriptedRng([5, 18, 3]))
    expect(currentActor(state).id).toBe('b')

    const second = nextTurn(state)
    expect(second.actor.id).toBe('c')
    expect(second.newRound).toBe(false)
    expect(second.state.round).toBe(1)

    const third = nextTurn(second.state)
    expect(third.actor.id).toBe('a')

    const wrapped = nextTurn(third.state)
    expect(wrapped.actor.id).toBe('b')
    expect(wrapped.newRound).toBe(true)
    expect(wrapped.state.round).toBe(2)
  })

  it('keeps the current actor when someone earlier in the order drops out', () => {
    const { state } = startCombat(combatants(), scriptedRng([5, 18, 3]))
    const onC = nextTurn(state).state
    expect(currentActor(onC).id).toBe('c')

    const without = removeFromCombat(onC, 'b')
    expect(without.order.map((x) => x.id)).toEqual(['c', 'a'])
    expect(currentActor(without).id).toBe('c')
  })

  it('keeps the current actor when someone later in the order drops out', () => {
    const { state } = startCombat(combatants(), scriptedRng([5, 18, 3]))
    const without = removeFromCombat(state, 'a')
    expect(currentActor(without).id).toBe('b')
  })

  it('ends combat when the last combatant leaves', () => {
    const solo = startCombat([combatants()[0]!], scriptedRng([10]))
    expect(removeFromCombat(solo.state, 'a').active).toBe(false)
  })

  it('refuses to act on a combat that is not running', () => {
    const { state } = startCombat(combatants(), scriptedRng([5, 18, 3]))
    const ended = endCombat(state).state
    expect(ended.active).toBe(false)
    expect(() => nextTurn(ended)).toThrow(RulesError)
    expect(() => currentActor(ended)).toThrow(/no combat/)
    expect(() => endCombat(ended)).toThrow(/no combat/)
  })

  it('rejects an empty or duplicated roster', () => {
    expect(() => startCombat([], scriptedRng([]))).toThrow(/at least one creature/)
    expect(() => startCombat([hero(), hero()], scriptedRng([1, 1]))).toThrow(/duplicate/)
  })
})

describe('attack rolls', () => {
  it('adds ability and proficiency to the roll', () => {
    expect(attackModifier(hero(), 'str', true, 0)).toBe(6)
    expect(attackModifier(hero(), 'str', false, 0)).toBe(3)
    expect(attackModifier(hero(), 'str', true, 1)).toBe(7)
  })

  it('hits when the total meets AC exactly', () => {
    // 9 + 6 = 15 against AC 15
    const out = swing(scriptedRng([9, 4]))
    expect(out.hit).toBe(true)
    expect(out.reason).toBe('beat-ac')
    expect(out.critical).toBe(false)
    expect(out.damage?.hpLost).toBe(7)
    expect(out.target.hp.current).toBe(23)
  })

  it('misses one below AC', () => {
    const out = swing(scriptedRng([8]))
    expect(out.hit).toBe(false)
    expect(out.reason).toBe('below-ac')
    expect(out.damageRoll).toBeNull()
    expect(out.target.hp.current).toBe(30)
  })

  it('always hits and always crits on a natural 20', () => {
    const out = swing(scriptedRng([20, 5, 6]), { target: dummy({ ac: 30 }) })
    expect(out.hit).toBe(true)
    expect(out.critical).toBe(true)
    expect(out.reason).toBe('nat20')
  })

  it('always misses on a natural 1, however large the bonus', () => {
    const out = swing(scriptedRng([1]), { attackBonus: 50, target: dummy({ ac: 5 }) })
    expect(out.hit).toBe(false)
    expect(out.reason).toBe('nat1')
  })

  it('doubles the damage dice on a crit but not the modifier', () => {
    // 1d8+3 crits to 2d8+3: faces 5 and 6 give 11, plus 3 — not plus 6.
    const out = swing(scriptedRng([20, 5, 6]))
    expect(out.damageRoll?.notation).toBe('2d8')
    expect(out.damage?.effective).toBe(14)
  })

  it('lowers the crit threshold for a champion', () => {
    const out = swing(scriptedRng([19, 5, 6]), { critOn: 19 })
    expect(out.critical).toBe(true)

    const below = swing(scriptedRng([18, 5]), { critOn: 19 })
    expect(below.critical).toBe(false)
  })

  it('never deals negative damage', () => {
    const out = swing(scriptedRng([15, 1]), { damageBonus: -20 })
    expect(out.damage?.effective).toBe(0)
    expect(out.target.hp.current).toBe(30)
  })

  it('carries defenses through to the damage', () => {
    const out = swing(scriptedRng([15, 5]), {
      target: dummy({ defenses: { resistances: ['slashing'] } }),
    })
    expect(out.damage?.mitigation).toBe('resisted')
    expect(out.damage?.effective).toBe(4)
  })

  it('writes a narration hint rather than the prose itself', () => {
    const out = swing(scriptedRng([9, 4]))
    expect(out.narrationHint).toBe('15 vs AC 15 — hit · 7 slashing · Dummy at 23/30')
  })

  it('refuses illegal attacks', () => {
    expect(() => swing(scriptedRng([10]), { attacker: withDeath(hero(), { dead: true }) })).toThrow(
      /dead and cannot attack/,
    )
    expect(() =>
      swing(scriptedRng([10]), { attacker: addCondition(hero(), 'incapacitated') }),
    ).toThrow(/incapacitated/)
    expect(() => swing(scriptedRng([10]), { target: withDeath(dummy(), { dead: true }) })).toThrow(
      /already dead/,
    )
    expect(() => swing(scriptedRng([10]), { critOn: 1 })).toThrow(/critOn/)
  })
})

describe('conditions on attacks', () => {
  it('gives advantage against a blinded or restrained target', () => {
    expect(attackConditionAdvantage(hero(), addCondition(dummy(), 'blinded'), 'melee')).toEqual([
      'advantage',
    ])
    expect(attackConditionAdvantage(hero(), addCondition(dummy(), 'restrained'), 'melee')).toEqual([
      'advantage',
    ])
  })

  it('gives disadvantage to a poisoned or prone attacker', () => {
    expect(attackConditionAdvantage(addCondition(hero(), 'poisoned'), dummy(), 'melee')).toEqual([
      'disadvantage',
    ])
    expect(attackConditionAdvantage(addCondition(hero(), 'prone'), dummy(), 'melee')).toEqual([
      'disadvantage',
    ])
  })

  it('makes a prone target easier to hit in melee and harder at range', () => {
    const prone = addCondition(dummy(), 'prone')
    expect(attackConditionAdvantage(hero(), prone, 'melee')).toEqual(['advantage'])
    expect(attackConditionAdvantage(hero(), prone, 'ranged')).toEqual(['disadvantage'])
  })

  it('cancels out when both sides contribute', () => {
    const out = swing(scriptedRng([9, 4]), {
      attacker: addCondition(hero(), 'poisoned'),
      target: addCondition(dummy(), 'blinded'),
    })
    // One advantage and one disadvantage cancel: a single d20, so only one draw.
    expect(out.advantage).toBe('none')
    expect(out.roll.roll.notation).toBe('1d20')
  })

  it('rolls two dice when conditions grant advantage', () => {
    const out = swing(scriptedRng([3, 9, 4]), { target: addCondition(dummy(), 'restrained') })
    expect(out.advantage).toBe('advantage')
    expect(out.roll.natural).toBe(9)
    expect(out.hit).toBe(true)
  })

  it('turns a melee hit on an unconscious target into a critical', () => {
    // Unconscious also grants advantage, hence two d20 faces scripted.
    const out = swing(scriptedRng([3, 9, 5, 6]), {
      target: addCondition(withHp(dummy(), { current: 4 }), 'unconscious'),
    })
    expect(out.critical).toBe(true)
    expect(out.reason).toBe('auto-crit-helpless')
    expect(out.damageRoll?.notation).toBe('2d8')
  })

  it('does not auto-crit an unconscious target at range', () => {
    const out = swing(scriptedRng([3, 9, 5]), {
      target: addCondition(dummy(), 'unconscious'),
      range: 'ranged',
    })
    expect(out.critical).toBe(false)
    expect(out.reason).toBe('beat-ac')
  })

  it('can be told to ignore conditions entirely', () => {
    const out = swing(scriptedRng([9, 4]), {
      target: addCondition(dummy(), 'restrained'),
      ignoreConditions: true,
    })
    expect(out.advantage).toBe('none')
  })
})
