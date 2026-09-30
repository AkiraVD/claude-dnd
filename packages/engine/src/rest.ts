import { RulesError } from './errors.js'
import {
  hasCondition,
  isDead,
  removeCondition,
  setExhaustion,
  withHp,
  type Creature,
} from './character.js'
import { abilityModifier } from './checks.js'
import { rollDice, type DiceResult } from './dice.js'
import type { GameEvent } from './events.js'
import type { Rng } from './rng.js'
import { findResource, restoreResource, withResource, type Resource } from './resources.js'

function rechargeAll(creature: Creature, timings: readonly Resource['recharge'][]): {
  creature: Creature
  restored: Array<{ label: string; to: number; max: number }>
  events: GameEvent[]
} {
  let next = creature
  const restored: Array<{ label: string; to: number; max: number }> = []
  const events: GameEvent[] = []

  for (const resource of creature.resources) {
    if (!timings.includes(resource.recharge)) continue
    if (resource.current >= resource.max) continue

    const amount =
      resource.rechargeAmount === 'half'
        ? Math.max(1, Math.floor(resource.max / 2))
        : resource.max

    const outcome = restoreResource(next, resource.name, amount)
    next = outcome.creature
    events.push(...outcome.events)
    restored.push({ label: resource.label, to: outcome.resource.current, max: resource.max })
  }

  return { creature: next, restored, events }
}

export interface HitDieSpend {
  creature: Creature
  roll: DiceResult
  healed: number
  remaining: number
  events: GameEvent[]
}

/**
 * Spend one hit die to heal during a short rest: roll the die and add the
 * Constitution modifier, minimum 0 healing.
 */
export function spendHitDie(creature: Creature, rng: Rng): HitDieSpend {
  if (isDead(creature)) throw new RulesError(`${creature.name} is dead`)
  if (creature.hp.current === 0) {
    throw new RulesError(`${creature.name} is at 0 HP and cannot spend hit dice`)
  }
  if (creature.hp.current >= creature.hp.max) {
    throw new RulesError(`${creature.name} is already at full HP`)
  }

  const dice = findResource(creature, 'hit-dice')
  if (dice.current < 1) {
    throw new RulesError(`${creature.name} has no hit dice left until a long rest`)
  }

  const size = creature.hitDie
  const roll = rollDice(`1d${size}`, rng)
  const healed = Math.min(
    creature.hp.max - creature.hp.current,
    Math.max(0, roll.total + abilityModifier(creature.scores.con)),
  )

  const spent: Resource = { ...dice, current: dice.current - 1 }
  const next = withHp(withResource(creature, spent), { current: creature.hp.current + healed })

  return {
    creature: next,
    roll,
    healed,
    remaining: spent.current,
    events: [
      { t: 'heal', target: creature.id, amount: healed, hpAfter: next.hp.current },
      {
        t: 'resource',
        target: creature.id,
        resource: 'hit-dice',
        label: dice.label,
        spent: 1,
        remaining: spent.current,
        max: dice.max,
      },
    ],
  }
}

export interface RestResult {
  creature: Creature
  restored: Array<{ label: string; to: number; max: number }>
  hpRestored: number
  events: GameEvent[]
}

/**
 * An hour of rest. Abilities that recharge on a short rest come back; hit
 * points do not, unless hit dice are spent — see `spendHitDie`.
 */
export function shortRest(creature: Creature): RestResult {
  if (isDead(creature)) throw new RulesError(`${creature.name} is dead`)

  const recharged = rechargeAll(creature, ['short-rest'])
  return {
    creature: recharged.creature,
    restored: recharged.restored,
    hpRestored: 0,
    events: [...recharged.events, { t: 'rest', target: creature.id, kind: 'short' }],
  }
}

/**
 * Eight hours. Hit points go to full, hit dice come back at half rate, one level
 * of exhaustion lifts, and everything else recharges.
 */
export function longRest(creature: Creature): RestResult {
  if (isDead(creature)) throw new RulesError(`${creature.name} is dead`)
  if (creature.hp.current === 0) {
    throw new RulesError(
      `${creature.name} is at 0 HP — stabilise or heal them before they can benefit from a long rest`,
    )
  }

  const recharged = rechargeAll(creature, ['short-rest', 'long-rest', 'dawn'])
  const hpRestored = creature.hp.max - creature.hp.current

  let next = withHp(recharged.creature, { current: creature.hp.max, temp: 0 })
  const events: GameEvent[] = [...recharged.events]

  if (hpRestored > 0) {
    events.push({ t: 'heal', target: creature.id, amount: hpRestored, hpAfter: creature.hp.max })
  }

  if (next.conditions.exhaustion > 0) {
    next = setExhaustion(next, next.conditions.exhaustion - 1)
    events.push({ t: 'exhaustion', target: creature.id, level: next.conditions.exhaustion })
  }

  if (hasCondition(next, 'unconscious')) next = removeCondition(next, 'unconscious')

  events.push({ t: 'rest', target: creature.id, kind: 'long' })

  return { creature: next, restored: recharged.restored, hpRestored, events }
}
