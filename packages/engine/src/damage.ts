import type { DamageType } from '@dnd/content'
import {
  addCondition,
  hasCondition,
  isDead,
  removeCondition,
  resetDeathSaves,
  saveModifier,
  withDeath,
  withHp,
  type Creature,
} from './character.js'
import { d20Test, type D20TestResult } from './checks.js'
import { RulesError } from './errors.js'
import type { DeathSaveOutcome, GameEvent, Mitigation } from './events.js'
import type { Rng } from './rng.js'

export interface DamageOptions {
  amount: number
  damageType: DamageType
  /**
   * A critical hit inflicts two death save failures instead of one when the
   * target is already at 0 HP.
   */
  critical?: boolean
  /**
   * False to pull the blow: the target drops unconscious instead of dying, even
   * if it would normally die at 0 HP. Defaults to true.
   */
  lethal?: boolean
}

export interface DamageOutcome {
  creature: Creature
  /** Damage after resistance, vulnerability and immunity. */
  effective: number
  mitigation: Mitigation
  /** How much of `effective` the temporary HP pool soaked. */
  absorbedByTempHp: number
  /** Actual reduction to current HP. */
  hpLost: number
  /** True when this blow brought the target from above 0 to exactly 0. */
  droppedToZero: boolean
  /** True when this damage killed the target, for any reason. */
  died: boolean
  /** Overkill matched or beat max HP. A stricter case of `died`. */
  instantDeath: boolean
  /** Death save failures inflicted for being hit while already at 0 HP. */
  deathSaveFailures: number
  /**
   * The concentration DC this damage forces, or null when the target was not
   * concentrating. The caller rolls it — see `concentrationSave`.
   */
  concentrationDc: number | null
  events: GameEvent[]
}

export function isResistant(creature: Creature, damageType: DamageType): boolean {
  return creature.defenses.resistances.includes(damageType)
}

export function isVulnerable(creature: Creature, damageType: DamageType): boolean {
  return creature.defenses.vulnerabilities.includes(damageType)
}

export function isImmune(creature: Creature, damageType: DamageType): boolean {
  return creature.defenses.immunities.includes(damageType)
}

/**
 * Resistance, vulnerability and immunity, applied in that order.
 *
 * Immunity short-circuits. Resistance halves and rounds down, then vulnerability
 * doubles — so a creature both resistant and vulnerable to the same type takes
 * `floor(n / 2) * 2`, which loses 1 on odd damage rather than cancelling out
 * exactly. That is what the stated order produces, and the rules never say the
 * two cancel.
 */
export function mitigate(
  creature: Creature,
  amount: number,
  damageType: DamageType,
): { effective: number; mitigation: Mitigation } {
  if (isImmune(creature, damageType)) return { effective: 0, mitigation: 'immune' }

  const resistant = isResistant(creature, damageType)
  const vulnerable = isVulnerable(creature, damageType)

  let effective = amount
  if (resistant) effective = Math.floor(effective / 2)
  if (vulnerable) effective = effective * 2

  const mitigation: Mitigation = resistant
    ? 'resisted'
    : vulnerable
      ? 'vulnerable'
      : 'none'

  return { effective, mitigation }
}

/** DC 10, or half the damage taken, whichever is higher. */
export function concentrationDc(damageTaken: number): number {
  return Math.max(10, Math.floor(damageTaken / 2))
}

export function applyDamage(creature: Creature, options: DamageOptions): DamageOutcome {
  const { amount, damageType, critical = false, lethal = true } = options

  if (!Number.isInteger(amount) || amount < 0) {
    throw new RulesError(`damage must be a non-negative integer, got ${amount}`)
  }

  const events: GameEvent[] = []
  const inert: DamageOutcome = {
    creature,
    effective: 0,
    mitigation: 'none',
    absorbedByTempHp: 0,
    hpLost: 0,
    droppedToZero: false,
    died: false,
    instantDeath: false,
    deathSaveFailures: 0,
    concentrationDc: null,
    events,
  }

  // A corpse can be hit; nothing changes. Not an error — the fiction allows it.
  if (isDead(creature)) return inert

  const { effective, mitigation } = mitigate(creature, amount, damageType)

  // Temporary HP is spent before real HP, and only what is left carries through.
  const absorbedByTempHp = Math.min(creature.hp.temp, effective)
  const toHp = effective - absorbedByTempHp

  const hpBefore = creature.hp.current
  const hpAfter = Math.max(0, hpBefore - toHp)
  const hpLost = hpBefore - hpAfter
  const overkill = toHp - hpLost

  let next = withHp(creature, { current: hpAfter, temp: creature.hp.temp - absorbedByTempHp })

  events.push({
    t: 'damage',
    target: creature.id,
    requested: amount,
    applied: hpLost,
    damageType,
    mitigation,
    absorbedByTempHp,
    hpAfter,
  })

  // Concentration is checked on damage taken, and broken outright by going down.
  let dc: number | null = null
  if (creature.concentration && effective > 0) {
    dc = concentrationDc(effective)
  }

  let died = false
  let instantDeath = false
  let deathSaveFailures = 0
  const droppedToZero = hpBefore > 0 && hpAfter === 0

  if (droppedToZero) {
    if (!lethal) {
      // The attacker pulled the blow: unconscious, whatever the creature is.
      next = addCondition(resetDeathSaves(next), 'unconscious')
      events.push({ t: 'down', target: creature.id })
    } else if (overkill >= creature.hp.max) {
      // Massive damage: leftover damage at or above max HP kills outright.
      died = true
      instantDeath = true
      next = withDeath(next, { dead: true })
      events.push({ t: 'death', target: creature.id, cause: 'massive-damage' })
    } else if (creature.diesAtZero) {
      // Monsters and NPCs do not roll death saves; 0 HP is simply the end.
      died = true
      next = withDeath(next, { dead: true })
      events.push({ t: 'death', target: creature.id, cause: 'dropped-to-zero' })
    } else {
      next = addCondition(resetDeathSaves(next), 'unconscious')
      events.push({ t: 'down', target: creature.id })
    }

    if (next.concentration) {
      events.push({
        t: 'concentration',
        target: creature.id,
        spell: next.concentration.spell,
        op: 'broken',
      })
      next = { ...next, concentration: null }
      dc = null
    }
  } else if (hpBefore === 0 && effective > 0) {
    // Already down and hit again: one failed death save, two on a critical.
    // This also undoes being stable — a stabilised creature that takes a hit is
    // dying again, starting from that one failure.
    deathSaveFailures = critical ? 2 : 1
    const failures = Math.min(3, next.death.failures + deathSaveFailures)
    next = withDeath(next, { failures, stable: false })
    events.push({
      t: 'death-save',
      target: creature.id,
      natural: 0,
      outcome: failures >= 3 ? 'dead' : 'failure',
      successes: next.death.successes,
      failures,
    })
    if (failures >= 3) {
      died = true
      next = withDeath(next, { dead: true })
      events.push({ t: 'death', target: creature.id, cause: 'death-saves' })
    }
  }

  return {
    creature: next,
    effective,
    mitigation,
    absorbedByTempHp,
    hpLost,
    droppedToZero,
    died,
    instantDeath,
    deathSaveFailures,
    concentrationDc: dc,
    events,
  }
}

export interface HealOutcome {
  creature: Creature
  /** How much HP was actually restored, after the max HP cap. */
  healed: number
  /** True when this healing brought the target back from 0 HP. */
  revived: boolean
  events: GameEvent[]
}

export function heal(creature: Creature, amount: number): HealOutcome {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RulesError(`healing must be a non-negative integer, got ${amount}`)
  }
  if (isDead(creature)) {
    throw new RulesError(`${creature.name} is dead — healing cannot revive them`)
  }

  const events: GameEvent[] = []
  const hpBefore = creature.hp.current
  const hpAfter = Math.min(creature.hp.max, hpBefore + amount)
  const healed = hpAfter - hpBefore
  const revived = hpBefore === 0 && hpAfter > 0

  let next = withHp(creature, { current: hpAfter })
  if (healed > 0) events.push({ t: 'heal', target: creature.id, amount: healed, hpAfter })

  if (revived) {
    next = removeCondition(resetDeathSaves(next), 'unconscious')
    events.push({ t: 'revived', target: creature.id, hp: hpAfter })
  }

  return { creature: next, healed, revived, events }
}

export interface TempHpOutcome {
  creature: Creature
  /** False when the existing pool was larger and was kept instead. */
  replaced: boolean
  events: GameEvent[]
}

/** Temporary HP never stacks: the larger pool wins, the other is discarded. */
export function applyTempHp(creature: Creature, amount: number): TempHpOutcome {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RulesError(`temporary HP must be a non-negative integer, got ${amount}`)
  }
  const replaced = amount > creature.hp.temp
  const next = replaced ? withHp(creature, { temp: amount }) : creature
  return {
    creature: next,
    replaced,
    events: [{ t: 'temp-hp', target: creature.id, amount, replaced }],
  }
}

export interface DeathSaveResult {
  creature: Creature
  roll: D20TestResult
  outcome: DeathSaveOutcome
  events: GameEvent[]
}

/**
 * A death saving throw: a flat d20 against DC 10 with no modifier, since it is
 * not really a Constitution save. A natural 20 brings the creature back up at
 * 1 HP; a natural 1 counts as two failures.
 */
export function deathSave(creature: Creature, rng: Rng): DeathSaveResult {
  if (isDead(creature)) {
    throw new RulesError(`${creature.name} is already dead`)
  }
  if (creature.hp.current > 0) {
    throw new RulesError(`${creature.name} is not dying — death saves apply at 0 HP`)
  }
  if (creature.death.stable) {
    throw new RulesError(`${creature.name} is stable and no longer rolls death saves`)
  }

  const events: GameEvent[] = []
  const roll = d20Test({ modifier: 0, dc: 10, rng })

  let successes = creature.death.successes
  let failures = creature.death.failures
  let next = creature
  let outcome: DeathSaveOutcome

  if (roll.isNat20) {
    next = removeCondition(resetDeathSaves(withHp(creature, { current: 1 })), 'unconscious')
    outcome = 'revived'
    events.push({ t: 'revived', target: creature.id, hp: 1 })
  } else if (roll.isNat1) {
    failures = Math.min(3, failures + 2)
    outcome = failures >= 3 ? 'dead' : 'failure'
  } else if (roll.success === true) {
    successes = Math.min(3, successes + 1)
    outcome = successes >= 3 ? 'stabilised' : 'success'
  } else {
    failures = Math.min(3, failures + 1)
    outcome = failures >= 3 ? 'dead' : 'failure'
  }

  if (outcome !== 'revived') {
    next = withDeath(creature, {
      successes,
      failures,
      stable: outcome === 'stabilised',
      dead: outcome === 'dead',
    })
  }

  events.push({
    t: 'death-save',
    target: creature.id,
    natural: roll.natural,
    outcome,
    successes: next.death.successes,
    failures: next.death.failures,
  })
  if (outcome === 'dead') events.push({ t: 'death', target: creature.id, cause: 'death-saves' })

  return { creature: next, roll, outcome, events }
}

/** Bring a dying creature to stable without healing it: no more death saves. */
export function stabilise(creature: Creature): { creature: Creature; events: GameEvent[] } {
  if (isDead(creature)) throw new RulesError(`${creature.name} is dead`)
  if (creature.hp.current > 0) {
    throw new RulesError(`${creature.name} is not dying`)
  }
  return {
    creature: withDeath(creature, { stable: true, successes: 0, failures: 0 }),
    events: [
      {
        t: 'death-save',
        target: creature.id,
        natural: 0,
        outcome: 'stabilised',
        successes: 0,
        failures: 0,
      },
    ],
  }
}

export interface ConcentrationResult {
  creature: Creature
  roll: D20TestResult
  maintained: boolean
  events: GameEvent[]
}

export function startConcentration(creature: Creature, spell: string): {
  creature: Creature
  events: GameEvent[]
} {
  if (!isConsciousEnoughToCast(creature)) {
    throw new RulesError(`${creature.name} cannot concentrate while incapacitated`)
  }
  const events: GameEvent[] = []
  if (creature.concentration) {
    events.push({
      t: 'concentration',
      target: creature.id,
      spell: creature.concentration.spell,
      op: 'broken',
    })
  }
  events.push({ t: 'concentration', target: creature.id, spell, op: 'start' })
  return { creature: { ...creature, concentration: { spell } }, events }
}

function isConsciousEnoughToCast(creature: Creature): boolean {
  return (
    !isDead(creature) &&
    creature.hp.current > 0 &&
    !hasCondition(creature, 'incapacitated') &&
    !hasCondition(creature, 'unconscious')
  )
}

/** A Constitution save to keep a spell going after taking damage. */
export function concentrationSave(
  creature: Creature,
  damageTaken: number,
  rng: Rng,
): ConcentrationResult {
  if (!creature.concentration) {
    throw new RulesError(`${creature.name} is not concentrating on anything`)
  }

  const { spell } = creature.concentration
  const roll = d20Test({
    modifier: saveModifier(creature, 'con'),
    dc: concentrationDc(damageTaken),
    rng,
  })

  const maintained = roll.success === true
  return {
    creature: maintained ? creature : { ...creature, concentration: null },
    roll,
    maintained,
    events: [
      {
        t: 'concentration',
        target: creature.id,
        spell,
        op: maintained ? 'maintained' : 'broken',
      },
    ],
  }
}
