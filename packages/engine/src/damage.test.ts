import type { AbilityScores } from '@dnd/content'
import { describe, expect, it } from 'vitest'
import {
  addCondition,
  createCreature,
  hasCondition,
  lifeStatus,
  withDeath,
  withHp,
  type Creature,
} from './character.js'
import {
  applyDamage,
  applyTempHp,
  concentrationDc,
  concentrationSave,
  deathSave,
  heal,
  mitigate,
  stabilise,
  startConcentration,
} from './damage.js'
import { RulesError } from './errors.js'
import { scriptedRng } from './testing.js'

const SCORES: AbilityScores = { str: 14, dex: 12, con: 14, int: 10, wis: 10, cha: 10 }

/** A player character: drops to dying at 0 HP and rolls death saves. */
const subject = (overrides: Partial<Parameters<typeof createCreature>[0]> = {}): Creature =>
  createCreature({
    id: 'x',
    name: 'Target',
    kind: 'pc',
    level: 5,
    scores: SCORES,
    maxHp: 30,
    ac: 14,
    proficiencies: { saves: ['con'] },
    ...overrides,
  })

/** A monster: 0 HP is simply the end. */
const monster = (overrides: Partial<Parameters<typeof createCreature>[0]> = {}): Creature =>
  createCreature({ id: 'm', name: 'Goblin', scores: SCORES, maxHp: 7, ac: 15, ...overrides })

describe('mitigate', () => {
  it('leaves plain damage alone', () => {
    expect(mitigate(subject(), 7, 'slashing')).toEqual({ effective: 7, mitigation: 'none' })
  })

  it('halves resisted damage, rounding down', () => {
    const c = subject({ defenses: { resistances: ['fire'] } })
    expect(mitigate(c, 7, 'fire')).toEqual({ effective: 3, mitigation: 'resisted' })
    expect(mitigate(c, 8, 'fire')).toEqual({ effective: 4, mitigation: 'resisted' })
  })

  it('doubles vulnerable damage', () => {
    const c = subject({ defenses: { vulnerabilities: ['cold'] } })
    expect(mitigate(c, 7, 'cold')).toEqual({ effective: 14, mitigation: 'vulnerable' })
  })

  it('zeroes immune damage', () => {
    const c = subject({ defenses: { immunities: ['poison'] } })
    expect(mitigate(c, 40, 'poison')).toEqual({ effective: 0, mitigation: 'immune' })
  })

  it('lets immunity win over resistance and vulnerability', () => {
    const c = subject({
      defenses: { immunities: ['fire'], resistances: ['fire'], vulnerabilities: ['fire'] },
    })
    expect(mitigate(c, 10, 'fire').effective).toBe(0)
  })

  it('halves then doubles when both resistant and vulnerable', () => {
    // The stated order is resistance, then vulnerability — so odd damage loses 1
    // to rounding rather than cancelling out exactly.
    const c = subject({ defenses: { resistances: ['acid'], vulnerabilities: ['acid'] } })
    expect(mitigate(c, 7, 'acid').effective).toBe(6)
    expect(mitigate(c, 8, 'acid').effective).toBe(8)
  })

  it('only applies defenses to the matching type', () => {
    const c = subject({ defenses: { resistances: ['fire'] } })
    expect(mitigate(c, 7, 'cold').effective).toBe(7)
  })
})

describe('applyDamage', () => {
  it('reduces HP and reports the loss', () => {
    const out = applyDamage(subject(), { amount: 11, damageType: 'slashing' })
    expect(out.creature.hp.current).toBe(19)
    expect(out.hpLost).toBe(11)
    expect(out.droppedToZero).toBe(false)
  })

  it('applies defenses before HP', () => {
    const out = applyDamage(subject({ defenses: { resistances: ['fire'] } }), {
      amount: 9,
      damageType: 'fire',
    })
    expect(out.effective).toBe(4)
    expect(out.creature.hp.current).toBe(26)
  })

  it('spends temporary HP first', () => {
    const out = applyDamage(withHp(subject(), { temp: 5 }), { amount: 8, damageType: 'force' })
    expect(out.absorbedByTempHp).toBe(5)
    expect(out.hpLost).toBe(3)
    expect(out.creature.hp).toMatchObject({ current: 27, temp: 0 })
  })

  it('leaves real HP untouched when temporary HP covers it all', () => {
    const out = applyDamage(withHp(subject(), { temp: 10 }), { amount: 6, damageType: 'force' })
    expect(out.hpLost).toBe(0)
    expect(out.creature.hp).toMatchObject({ current: 30, temp: 4 })
  })

  it('applies defenses before temporary HP, not after', () => {
    // 10 fire, resisted to 5, of which a 5-point temp pool absorbs all of it.
    const c = withHp(subject({ defenses: { resistances: ['fire'] } }), { temp: 5 })
    const out = applyDamage(c, { amount: 10, damageType: 'fire' })
    expect(out.effective).toBe(5)
    expect(out.absorbedByTempHp).toBe(5)
    expect(out.hpLost).toBe(0)
  })

  it('floors a player character at 0 HP and starts them dying', () => {
    const out = applyDamage(subject(), { amount: 34, damageType: 'bludgeoning' })
    expect(out.creature.hp.current).toBe(0)
    expect(out.hpLost).toBe(30)
    expect(out.droppedToZero).toBe(true)
    expect(out.instantDeath).toBe(false)
    expect(hasCondition(out.creature, 'unconscious')).toBe(true)
    expect(lifeStatus(out.creature)).toBe('dying')
    expect(out.events.some((e) => e.t === 'down')).toBe(true)
  })

  it('kills outright when overkill matches max HP', () => {
    // 30 HP taken to 0 leaves 30 overkill, which equals max HP.
    const out = applyDamage(subject(), { amount: 60, damageType: 'force' })
    expect(out.instantDeath).toBe(true)
    expect(lifeStatus(out.creature)).toBe('dead')
    expect(out.events.some((e) => e.t === 'death' && e.cause === 'massive-damage')).toBe(true)
  })

  it('does not kill a player character outright when overkill falls one short', () => {
    const out = applyDamage(subject(), { amount: 59, damageType: 'force' })
    expect(out.instantDeath).toBe(false)
    expect(out.died).toBe(false)
    expect(lifeStatus(out.creature)).toBe('dying')
  })

  it('costs a death save failure when the target is already down', () => {
    const down = addCondition(withHp(subject(), { current: 0 }), 'unconscious')
    const out = applyDamage(down, { amount: 4, damageType: 'piercing' })
    expect(out.deathSaveFailures).toBe(1)
    expect(out.creature.death.failures).toBe(1)
  })

  it('costs two failures on a critical hit', () => {
    const down = addCondition(withHp(subject(), { current: 0 }), 'unconscious')
    const out = applyDamage(down, { amount: 4, damageType: 'piercing', critical: true })
    expect(out.deathSaveFailures).toBe(2)
    expect(out.creature.death.failures).toBe(2)
  })

  it('destabilises a stable creature that is hit again', () => {
    const stable = withDeath(withHp(subject(), { current: 0 }), { stable: true })
    const out = applyDamage(stable, { amount: 3, damageType: 'slashing' })
    expect(out.creature.death.stable).toBe(false)
    expect(out.creature.death.failures).toBe(1)
    expect(lifeStatus(out.creature)).toBe('dying')
  })

  it('kills on the third failure while down', () => {
    const down = withDeath(withHp(subject(), { current: 0 }), { failures: 2 })
    const out = applyDamage(down, { amount: 1, damageType: 'slashing' })
    expect(lifeStatus(out.creature)).toBe('dead')
  })

  it('kills a monster outright at 0 HP, with no death saves', () => {
    // Death saving throws are a player-character rule. A goblin at 0 is dead.
    const out = applyDamage(monster(), { amount: 7, damageType: 'slashing' })
    expect(out.droppedToZero).toBe(true)
    expect(out.died).toBe(true)
    expect(out.instantDeath).toBe(false)
    expect(lifeStatus(out.creature)).toBe('dead')
    expect(hasCondition(out.creature, 'unconscious')).toBe(false)
    expect(out.events.some((e) => e.t === 'death' && e.cause === 'dropped-to-zero')).toBe(true)
    expect(out.events.some((e) => e.t === 'down')).toBe(false)
  })

  it('lets a named NPC take death saves when told to', () => {
    const villain = monster({ diesAtZero: false, maxHp: 30 })
    const out = applyDamage(villain, { amount: 30, damageType: 'slashing' })
    expect(out.died).toBe(false)
    expect(lifeStatus(out.creature)).toBe('dying')
  })

  it('knocks a monster unconscious instead of killing it when the blow is pulled', () => {
    const out = applyDamage(monster(), { amount: 7, damageType: 'bludgeoning', lethal: false })
    expect(out.droppedToZero).toBe(true)
    expect(out.died).toBe(false)
    expect(lifeStatus(out.creature)).toBe('dying')
    expect(hasCondition(out.creature, 'unconscious')).toBe(true)
  })

  it('spares even massive damage when the blow is pulled', () => {
    const out = applyDamage(monster(), { amount: 40, damageType: 'bludgeoning', lethal: false })
    expect(out.instantDeath).toBe(false)
    expect(out.died).toBe(false)
    expect(lifeStatus(out.creature)).toBe('dying')
  })

  it('reports died when the third death save failure lands', () => {
    const down = withDeath(withHp(subject(), { current: 0 }), { failures: 2 })
    const out = applyDamage(down, { amount: 1, damageType: 'slashing' })
    expect(out.died).toBe(true)
  })

  it('does nothing to a corpse', () => {
    const dead = withDeath(subject(), { dead: true })
    const out = applyDamage(dead, { amount: 50, damageType: 'fire' })
    expect(out.hpLost).toBe(0)
    expect(out.creature).toBe(dead)
    expect(out.events).toEqual([])
  })

  it('rejects negative and fractional damage', () => {
    expect(() => applyDamage(subject(), { amount: -1, damageType: 'fire' })).toThrow(RulesError)
    expect(() => applyDamage(subject(), { amount: 1.5, damageType: 'fire' })).toThrow(/non-negative integer/)
  })
})

describe('healing and temporary HP', () => {
  it('restores HP up to the maximum', () => {
    const out = heal(withHp(subject(), { current: 25 }), 20)
    expect(out.creature.hp.current).toBe(30)
    expect(out.healed).toBe(5)
  })

  it('brings a dying creature back to consciousness', () => {
    const down = addCondition(withHp(subject(), { current: 0 }), 'unconscious')
    const wounded = withDeath(down, { failures: 2 })
    const out = heal(wounded, 4)

    expect(out.revived).toBe(true)
    expect(out.creature.hp.current).toBe(4)
    expect(hasCondition(out.creature, 'unconscious')).toBe(false)
    expect(out.creature.death).toMatchObject({ successes: 0, failures: 0, stable: false })
  })

  it('refuses to heal the dead', () => {
    expect(() => heal(withDeath(subject(), { dead: true }), 10)).toThrow(/cannot revive/)
  })

  it('keeps the larger temporary HP pool instead of stacking', () => {
    const withTemp = applyTempHp(subject(), 8).creature
    expect(applyTempHp(withTemp, 5).creature.hp.temp).toBe(8)
    expect(applyTempHp(withTemp, 5).replaced).toBe(false)
    expect(applyTempHp(withTemp, 12).creature.hp.temp).toBe(12)
  })
})

describe('death saves', () => {
  const dying = () => addCondition(withHp(subject(), { current: 0 }), 'unconscious')

  it('counts a success at 10 or above', () => {
    const out = deathSave(dying(), scriptedRng([10]))
    expect(out.outcome).toBe('success')
    expect(out.creature.death.successes).toBe(1)
  })

  it('counts a failure below 10', () => {
    const out = deathSave(dying(), scriptedRng([9]))
    expect(out.outcome).toBe('failure')
    expect(out.creature.death.failures).toBe(1)
  })

  it('stabilises on the third success', () => {
    const out = deathSave(withDeath(dying(), { successes: 2 }), scriptedRng([12]))
    expect(out.outcome).toBe('stabilised')
    expect(lifeStatus(out.creature)).toBe('stable')
  })

  it('dies on the third failure', () => {
    const out = deathSave(withDeath(dying(), { failures: 2 }), scriptedRng([4]))
    expect(out.outcome).toBe('dead')
    expect(lifeStatus(out.creature)).toBe('dead')
  })

  it('counts a natural 1 as two failures', () => {
    const out = deathSave(dying(), scriptedRng([1]))
    expect(out.creature.death.failures).toBe(2)
    expect(out.outcome).toBe('failure')
  })

  it('kills on a natural 1 at one failure already', () => {
    const out = deathSave(withDeath(dying(), { failures: 1 }), scriptedRng([1]))
    expect(out.outcome).toBe('dead')
  })

  it('comes back up at 1 HP on a natural 20', () => {
    const out = deathSave(withDeath(dying(), { failures: 2 }), scriptedRng([20]))
    expect(out.outcome).toBe('revived')
    expect(out.creature.hp.current).toBe(1)
    expect(hasCondition(out.creature, 'unconscious')).toBe(false)
    expect(out.creature.death).toMatchObject({ successes: 0, failures: 0 })
  })

  it('refuses to roll for anyone not dying', () => {
    expect(() => deathSave(subject(), scriptedRng([10]))).toThrow(/not dying/)
    expect(() => deathSave(withDeath(dying(), { dead: true }), scriptedRng([10]))).toThrow(/already dead/)
    expect(() => deathSave(withDeath(dying(), { stable: true }), scriptedRng([10]))).toThrow(/stable/)
  })

  it('stabilises without healing', () => {
    const out = stabilise(withDeath(dying(), { failures: 2 }))
    expect(lifeStatus(out.creature)).toBe('stable')
    expect(out.creature.hp.current).toBe(0)
    expect(out.creature.death.failures).toBe(0)
  })
})

describe('concentration', () => {
  it('sets the DC at 10 or half the damage, whichever is higher', () => {
    expect(concentrationDc(4)).toBe(10)
    expect(concentrationDc(20)).toBe(10)
    expect(concentrationDc(21)).toBe(10)
    expect(concentrationDc(22)).toBe(11)
    expect(concentrationDc(41)).toBe(20)
  })

  it('reports the DC when a concentrating target takes damage', () => {
    // 60 max HP, so 30 damage hurts without dropping them — going down would
    // break the spell outright and there would be no save to make.
    const caster = startConcentration(subject({ maxHp: 60 }), 'bless').creature
    const out = applyDamage(caster, { amount: 30, damageType: 'force' })
    expect(out.creature.hp.current).toBe(30)
    expect(out.concentrationDc).toBe(15)
    expect(out.creature.concentration).toEqual({ spell: 'bless' })
  })

  it('breaks concentration outright when the caster goes down', () => {
    const caster = startConcentration(subject(), 'bless').creature
    const out = applyDamage(caster, { amount: 40, damageType: 'force' })
    expect(out.creature.concentration).toBeNull()
    expect(out.concentrationDc).toBeNull()
    expect(out.events.some((e) => e.t === 'concentration' && e.op === 'broken')).toBe(true)
  })

  it('keeps the spell on a successful save', () => {
    const caster = startConcentration(subject(), 'bless').creature
    // con 14 (+2) with save proficiency at level 5 (+3) = +5, so 5 clears DC 10.
    const out = concentrationSave(caster, 12, scriptedRng([5]))
    expect(out.maintained).toBe(true)
    expect(out.creature.concentration).toEqual({ spell: 'bless' })
  })

  it('drops the spell on a failed save', () => {
    const caster = startConcentration(subject(), 'bless').creature
    const out = concentrationSave(caster, 12, scriptedRng([4]))
    expect(out.maintained).toBe(false)
    expect(out.creature.concentration).toBeNull()
  })

  it('replaces an existing spell and says so', () => {
    const first = startConcentration(subject(), 'bless').creature
    const second = startConcentration(first, 'haste')
    expect(second.creature.concentration).toEqual({ spell: 'haste' })
    expect(second.events).toEqual([
      { t: 'concentration', target: 'x', spell: 'bless', op: 'broken' },
      { t: 'concentration', target: 'x', spell: 'haste', op: 'start' },
    ])
  })

  it('refuses to concentrate while incapacitated, or to save without a spell', () => {
    expect(() => startConcentration(addCondition(subject(), 'incapacitated'), 'bless')).toThrow(
      /cannot concentrate/,
    )
    expect(() => concentrationSave(subject(), 10, scriptedRng([10]))).toThrow(/not concentrating/)
  })
})
