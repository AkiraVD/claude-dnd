import { spellSlotsFor } from '@dnd/content'
import { describe, expect, it } from 'vitest'
import { createCreature, findAttack, spellcasting, withHp, type Creature } from './character.js'
import { attackWith } from './combat.js'
import { kill } from './damage.js'
import { awardXp, levelUp } from './progression.js'
import { availableSlots, findResource, spendResource } from './resources.js'
import { longRest, shortRest, spendHitDie } from './rest.js'
import { canCast, castSpell } from './spells.js'
import { scriptedRng } from './testing.js'

const SCORES = { str: 16, dex: 14, con: 14, int: 16, wis: 12, cha: 10 }

const fighter = (over: Partial<Parameters<typeof createCreature>[0]> = {}): Creature =>
  createCreature({
    id: 'brann',
    name: 'Brann',
    kind: 'pc',
    className: 'fighter',
    level: 3,
    scores: SCORES,
    maxHp: 28,
    ac: 16,
    armour: { name: 'chain mail', stealthDisadvantage: true },
    attacks: [
      { name: 'longsword', ability: 'str', damage: '1d8', damageType: 'slashing' },
      { name: 'longbow', ability: 'dex', damage: '1d8', damageType: 'piercing', range: 'ranged' },
    ],
    resources: [
      { name: 'second-wind', label: 'Second Wind', max: 1, current: 1, recharge: 'short-rest' },
    ],
    ...over,
  })

const wizard = (level = 5): Creature =>
  createCreature({
    id: 'nyx',
    name: 'Nyx',
    kind: 'pc',
    className: 'wizard',
    level,
    scores: SCORES,
    maxHp: 8 + level * 4,
    ac: 12,
  })

describe('classes fill in the sheet', () => {
  it('takes hit die and save proficiencies from the class', () => {
    const brann = fighter()
    expect(brann.hitDie).toBe(10)
    expect(brann.proficiencies.saves).toEqual(['str', 'con'])
    expect(findResource(brann, 'hit-dice')).toMatchObject({ max: 3, current: 3 })
  })

  it('lets explicit proficiencies override the class', () => {
    const odd = fighter({ proficiencies: { saves: ['dex'] } })
    expect(odd.proficiencies.saves).toEqual(['dex'])
  })

  it('gives a full caster the right slots for its level', () => {
    const nyx = wizard(5)
    expect(availableSlots(nyx)).toEqual([
      { level: 3, remaining: 2 },
      { level: 2, remaining: 3 },
      { level: 1, remaining: 4 },
    ])
  })

  it('matches the SRD slot table', () => {
    expect(spellSlotsFor('wizard', 1)).toEqual({ 1: 2 })
    expect(spellSlotsFor('wizard', 20)).toEqual({ 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 })
    expect(spellSlotsFor('paladin', 1)).toEqual({})
    expect(spellSlotsFor('paladin', 5)).toEqual({ 1: 4, 2: 2 })
    expect(spellSlotsFor('fighter', 10)).toEqual({})
  })

  it('gives a warlock few slots that return on a short rest', () => {
    const lock = createCreature({
      id: 'v',
      name: 'V',
      kind: 'pc',
      className: 'warlock',
      level: 5,
      scores: SCORES,
      maxHp: 30,
      ac: 13,
    })
    expect(availableSlots(lock)).toEqual([{ level: 3, remaining: 2 }])
    expect(findResource(lock, 'spell-slot-3').recharge).toBe('short-rest')
  })

  it('derives the spell save DC from the class ability', () => {
    // wizard, int 16 (+3), level 5 proficiency +3
    expect(spellcasting(wizard(5))).toEqual({ ability: 'int', saveDc: 14, attackBonus: 6 })
    expect(spellcasting(fighter())).toBeNull()
  })
})

describe('named attacks', () => {
  it('takes everything off the sheet, defaulting damage bonus to the ability modifier', () => {
    const brann = fighter()
    const goblin = createCreature({ id: 'g', name: 'Goblin', scores: SCORES, maxHp: 7, ac: 15 })

    // 14 + str 3 + proficiency 2 = 19 against AC 15, then 1d8 + 3
    const out = attackWith(brann, goblin, 'longsword', scriptedRng([14, 5]))
    expect(out.attackName).toBe('longsword')
    expect(out.hit).toBe(true)
    expect(out.damage?.effective).toBe(8)
  })

  it('is case insensitive and lists what exists on a miss-spelling', () => {
    expect(findAttack(fighter(), 'LONGSWORD').name).toBe('longsword')
    expect(() => findAttack(fighter(), 'greataxe')).toThrow(/longsword, longbow/)
  })

  it('resolves a shortened name when only one attack can be meant', () => {
    // The miss that actually happens in play: an attack is defined as
    // "weighted net" and called for as "net" once the fight is moving.
    const sabat = createCreature({
      id: 'sabat',
      name: 'Sabat',
      scores: SCORES,
      maxHp: 20,
      ac: 13,
      attacks: [
        { name: 'weighted net', ability: 'dex', damage: '1d4', damageType: 'bludgeoning' },
        { name: 'boarding axe', ability: 'str', damage: '1d6', damageType: 'slashing' },
      ],
    })
    expect(findAttack(sabat, 'net').name).toBe('weighted net')
    expect(findAttack(sabat, 'axe').name).toBe('boarding axe')
  })

  it('refuses a shortened name that two attacks answer to', () => {
    // "sword" against a longsword and a shortsword is a question, not shorthand.
    const duellist = createCreature({
      id: 'd',
      name: 'Duellist',
      scores: SCORES,
      maxHp: 20,
      ac: 13,
      attacks: [
        { name: 'longsword', ability: 'str', damage: '1d8', damageType: 'slashing' },
        { name: 'shortsword', ability: 'dex', damage: '1d6', damageType: 'piercing' },
      ],
    })
    expect(() => findAttack(duellist, 'sword')).toThrow(/matches 2 of/)
    expect(() => findAttack(duellist, 'sword')).toThrow(/longsword, shortsword/)
    // The unambiguous halves still resolve.
    expect(findAttack(duellist, 'short').name).toBe('shortsword')
  })

  it('still refuses an attack the creature does not have', () => {
    expect(() => findAttack(fighter(), '?')).toThrow(/no attack called "\?"/)
    expect(() => findAttack(fighter(), '')).toThrow(/no attack called/)
    expect(() => findAttack(fighter(), 'trebuchet')).toThrow(/no attack called/)
  })

  it('carries the weapon range through', () => {
    const brann = fighter()
    const prone = createCreature({ id: 'g', name: 'Goblin', scores: SCORES, maxHp: 7, ac: 15 })
    const out = attackWith(brann, { ...prone, conditions: { active: ['prone'], exhaustion: 0 } }, 'longbow', scriptedRng([14, 3, 5]))
    // Prone at range means disadvantage, so two d20 faces are consumed.
    expect(out.advantage).toBe('disadvantage')
  })
})

describe('spell slots', () => {
  it('spends the slot and reports the save DC', () => {
    const out = castSpell(wizard(5), { spell: 'fireball', level: 3 })
    expect(out.slotLevel).toBe(3)
    expect(out.saveDc).toBe(14)
    expect(availableSlots(out.creature).find((s) => s.level === 3)!.remaining).toBe(1)
  })

  it('costs nothing for a cantrip', () => {
    const out = castSpell(wizard(5), { spell: 'fire bolt', level: 0 })
    expect(out.slotLevel).toBeNull()
    expect(availableSlots(out.creature)).toEqual(availableSlots(wizard(5)))
  })

  it('upcasts by spending a higher slot', () => {
    const out = castSpell(wizard(5), { spell: 'magic missile', level: 1, slotLevel: 3 })
    expect(out.slotLevel).toBe(3)
    expect(availableSlots(out.creature).find((s) => s.level === 1)!.remaining).toBe(4)
  })

  it('refuses to downcast', () => {
    expect(() => castSpell(wizard(5), { spell: 'fireball', level: 3, slotLevel: 2 })).toThrow(
      /cannot be cast with a level 2 slot/,
    )
  })

  it('refuses when the slots are gone, and says what is left', () => {
    let nyx = wizard(5)
    nyx = castSpell(nyx, { spell: 'fireball', level: 3 }).creature
    nyx = castSpell(nyx, { spell: 'fireball', level: 3 }).creature
    expect(() => castSpell(nyx, { spell: 'fireball', level: 3 })).toThrow(/no level 3 slots left/)
    expect(() => castSpell(nyx, { spell: 'fireball', level: 3 })).toThrow(/level 2 × 3/)
  })

  it('refuses a level the caster has never had', () => {
    expect(() => castSpell(wizard(1), { spell: 'fireball', level: 3 })).toThrow(
      /no level 3 slots at all/,
    )
  })

  it('refuses to cast while unconscious', () => {
    expect(() => castSpell(withHp(wizard(5), { current: 0 }), { spell: 'shield', level: 1 })).toThrow(
      /unconscious/,
    )
  })

  it('reports castability without rolling anything', () => {
    const nyx = wizard(1)
    expect(canCast(nyx, 0)).toBe(true)
    expect(canCast(nyx, 1)).toBe(true)
    expect(canCast(nyx, 3)).toBe(false)
  })
})

describe('resources', () => {
  it('spends down and refuses past empty', () => {
    const once = spendResource(fighter(), 'second-wind')
    expect(once.resource.current).toBe(0)
    expect(() => spendResource(once.creature, 'second-wind')).toThrow(/0 of 1 Second Wind left/)
  })

  it('names what exists when asked for something that does not', () => {
    expect(() => spendResource(fighter(), 'action-surge')).toThrow(/has no resource "action-surge"/)
    expect(() => spendResource(fighter(), 'action-surge')).toThrow(/second-wind/)
  })
})

describe('rests', () => {
  it('gives back short-rest abilities but no hit points', () => {
    const spent = spendResource(withHp(fighter(), { current: 12 }), 'second-wind').creature
    const out = shortRest(spent)
    expect(findResource(out.creature, 'second-wind').current).toBe(1)
    expect(out.creature.hp.current).toBe(12)
    expect(out.hpRestored).toBe(0)
  })

  it('does not refill long-rest resources on a short rest', () => {
    const nyx = castSpell(wizard(5), { spell: 'fireball', level: 3 }).creature
    const out = shortRest(nyx)
    expect(availableSlots(out.creature).find((s) => s.level === 3)!.remaining).toBe(1)
  })

  it('heals with hit dice, one at a time', () => {
    const hurt = withHp(fighter(), { current: 10 })
    // d10 shows 6, plus CON +2
    const out = spendHitDie(hurt, scriptedRng([6]))
    expect(out.healed).toBe(8)
    expect(out.creature.hp.current).toBe(18)
    expect(out.remaining).toBe(2)
  })

  it('does not overheal past maximum with a hit die', () => {
    const out = spendHitDie(withHp(fighter(), { current: 26 }), scriptedRng([10]))
    expect(out.healed).toBe(2)
    expect(out.creature.hp.current).toBe(28)
  })

  it('refuses hit dice at full HP, at 0 HP, and when exhausted of dice', () => {
    expect(() => spendHitDie(fighter(), scriptedRng([5]))).toThrow(/already at full HP/)
    expect(() => spendHitDie(withHp(fighter(), { current: 0 }), scriptedRng([5]))).toThrow(/0 HP/)

    let brann = withHp(fighter(), { current: 5 })
    for (let i = 0; i < 3; i++) brann = spendHitDie(brann, scriptedRng([1])).creature
    expect(() => spendHitDie(brann, scriptedRng([1]))).toThrow(/no hit dice left/)
  })

  it('restores everything on a long rest', () => {
    let nyx = castSpell(wizard(5), { spell: 'fireball', level: 3 }).creature
    nyx = withHp(nyx, { current: 4 })

    const out = longRest(nyx)
    expect(out.creature.hp.current).toBe(nyx.hp.max)
    expect(out.hpRestored).toBe(nyx.hp.max - 4)
    expect(availableSlots(out.creature).find((s) => s.level === 3)!.remaining).toBe(2)
  })

  it('returns hit dice at half rate on a long rest', () => {
    let brann = withHp(fighter({ level: 4, maxHp: 36 }), { current: 5 })
    for (let i = 0; i < 4; i++) brann = spendHitDie(brann, scriptedRng([1])).creature
    expect(findResource(brann, 'hit-dice').current).toBe(0)

    const rested = longRest(brann)
    expect(findResource(rested.creature, 'hit-dice').current).toBe(2)
  })

  it('lifts one level of exhaustion', () => {
    const tired = { ...fighter(), conditions: { active: [], exhaustion: 3 } }
    expect(longRest(tired).creature.conditions.exhaustion).toBe(2)
  })

  it('refuses a long rest at 0 HP', () => {
    expect(() => longRest(withHp(fighter(), { current: 0 }))).toThrow(/stabilise or heal/)
  })
})

describe('levelling', () => {
  it('awards xp and reports the level it earns, without changing the sheet', () => {
    // 600 XP earns level 2; the fighter is already level 3 by fiat, so nothing
    // is owed. award_xp never levels anyone up on its own.
    const out = awardXp(fighter(), 600)
    expect(out.total).toBe(600)
    expect(out.level).toBe(2)
    expect(out.creature.level).toBe(3)
    expect(out.levelledUp).toBe(false)
    expect(out.toNextLevel).toBe(300)
  })

  it('flags when the award earns a level above the current one', () => {
    // Level 4 starts at 2700.
    const out = awardXp(fighter({ xp: 2500 }), 200)
    expect(out.total).toBe(2700)
    expect(out.level).toBe(4)
    expect(out.levelledUp).toBe(true)
  })

  it('adds the average hit points by default', () => {
    // d10 fighter: half plus one is 6, plus CON +2
    const out = levelUp(fighter())
    expect(out.hpGained).toBe(8)
    expect(out.creature.hp.max).toBe(36)
    expect(out.creature.level).toBe(4)
  })

  it('accepts a rolled value', () => {
    expect(levelUp(fighter(), { hpGained: 3 }).hpGained).toBe(3)
  })

  it('grows the hit dice pool and the proficiency bonus', () => {
    const out = levelUp(fighter({ level: 4 }))
    expect(out.level).toBe(5)
    expect(findResource(out.creature, 'hit-dice').max).toBe(5)
  })

  it('grants new spell slots without refilling spent ones', () => {
    const nyx = castSpell(wizard(4), { spell: 'shield', level: 1 }).creature
    expect(availableSlots(nyx).find((s) => s.level === 1)!.remaining).toBe(3)

    const out = levelUp(nyx)
    // Level 5 brings 3rd-level slots; the spent 1st-level slot stays spent.
    expect(availableSlots(out.creature).find((s) => s.level === 3)!.remaining).toBe(2)
    expect(availableSlots(out.creature).find((s) => s.level === 1)!.remaining).toBe(3)
    expect(out.gained.some((g) => g.label.includes('3rd'))).toBe(true)
  })

  it('refuses past level 20', () => {
    expect(() => levelUp(fighter({ level: 20, maxHp: 200 }))).toThrow(/already level 20/)
  })
})

describe('kill', () => {
  it('declares death with a reason', () => {
    const out = kill(fighter(), 'drowned while unconscious')
    expect(out.creature.death.dead).toBe(true)
    expect(out.creature.hp.current).toBe(0)
    expect(out.events).toEqual([
      { t: 'killed', target: 'brann', reason: 'drowned while unconscious' },
    ])
  })

  it('insists on a reason, and refuses twice over', () => {
    expect(() => kill(fighter(), '  ')).toThrow(/needs a reason/)
    const dead = kill(fighter(), 'cliff').creature
    expect(() => kill(dead, 'again')).toThrow(/already dead/)
  })
})

describe('armour and skills', () => {
  it('knows heavy armour hampers stealth', () => {
    expect(fighter().armour).toEqual({ name: 'chain mail', stealthDisadvantage: true })
    expect(wizard().armour).toBeNull()
  })
})
