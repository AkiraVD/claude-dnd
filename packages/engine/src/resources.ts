import { RulesError } from './errors.js'
import type { Creature } from './character.js'
import type { GameEvent } from './events.js'

/**
 * A limited-use ability, counted rather than special-cased.
 *
 * Second Wind, Action Surge, Channel Divinity, ki points, hit dice, spell slots,
 * a potion belt, three uses of a wand — they are all "n of these, back after
 * that kind of rest". One shape covers the lot, so the engine does not need to
 * know what a Ranger is to stop them using Hunter's Mark four times.
 */
export interface Resource {
  /** Stable id, e.g. `second-wind` or `spell-slot-3`. */
  name: string
  /** Shown to the player, e.g. "Second Wind" or "3rd-level slots". */
  label: string
  max: number
  current: number
  recharge: RechargeTiming
  /** Hit dice come back at half rate on a long rest; everything else fully. */
  rechargeAmount?: 'all' | 'half'
}

export type RechargeTiming = 'short-rest' | 'long-rest' | 'dawn' | 'never'

export function findResource(creature: Creature, name: string): Resource {
  const resource = creature.resources.find((r) => r.name === name)
  if (!resource) {
    const known = creature.resources.map((r) => r.name)
    throw new RulesError(
      `${creature.name} has no resource "${name}". Has: ${known.length > 0 ? known.join(', ') : '(none)'}`,
    )
  }
  return resource
}

export interface SpendResult {
  creature: Creature
  resource: Resource
  events: GameEvent[]
}

export function spendResource(creature: Creature, name: string, amount = 1): SpendResult {
  if (!Number.isInteger(amount) || amount < 1) {
    throw new RulesError(`amount must be a positive integer, got ${amount}`)
  }

  const resource = findResource(creature, name)
  if (resource.current < amount) {
    throw new RulesError(
      `${creature.name} has ${resource.current} of ${resource.max} ${resource.label} left and cannot spend ${amount}`,
    )
  }

  const updated: Resource = { ...resource, current: resource.current - amount }
  return {
    creature: withResource(creature, updated),
    resource: updated,
    events: [
      {
        t: 'resource',
        target: creature.id,
        resource: name,
        label: resource.label,
        spent: amount,
        remaining: updated.current,
        max: updated.max,
      },
    ],
  }
}

export function restoreResource(creature: Creature, name: string, amount?: number): SpendResult {
  const resource = findResource(creature, name)
  const restored =
    amount === undefined
      ? resource.max
      : Math.min(resource.max, resource.current + Math.max(0, amount))
  const updated: Resource = { ...resource, current: restored }

  return {
    creature: withResource(creature, updated),
    resource: updated,
    events: [
      {
        t: 'resource',
        target: creature.id,
        resource: name,
        label: resource.label,
        spent: -(restored - resource.current),
        remaining: updated.current,
        max: updated.max,
      },
    ],
  }
}

export function withResource(creature: Creature, resource: Resource): Creature {
  return {
    ...creature,
    resources: creature.resources.map((r) => (r.name === resource.name ? resource : r)),
  }
}

/** Build the spell slot resources for a caster. */
export function spellSlotResources(slots: Record<number, number>): Resource[] {
  return Object.entries(slots)
    .map(([level, count]) => ({
      name: `spell-slot-${level}`,
      label: `${ordinal(Number(level))}-level slots`,
      max: count,
      current: count,
      recharge: 'long-rest' as RechargeTiming,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))
}

/** Warlock slots come back on a short rest, so they are built separately. */
export function pactSlotResource(level: number, count: number): Resource {
  return {
    name: `spell-slot-${level}`,
    label: `${ordinal(level)}-level pact slots`,
    max: count,
    current: count,
    recharge: 'short-rest',
  }
}

export function hitDiceResource(level: number, hitDie: number): Resource {
  return {
    name: 'hit-dice',
    label: `Hit dice (d${hitDie})`,
    max: level,
    current: level,
    recharge: 'long-rest',
    rechargeAmount: 'half',
  }
}

export function ordinal(n: number): string {
  const suffix = n % 10 === 1 && n % 100 !== 11 ? 'st'
    : n % 10 === 2 && n % 100 !== 12 ? 'nd'
    : n % 10 === 3 && n % 100 !== 13 ? 'rd'
    : 'th'
  return `${n}${suffix}`
}

/** Spell slots the creature still has, highest first. */
export function availableSlots(creature: Creature): Array<{ level: number; remaining: number }> {
  return creature.resources
    .filter((r) => r.name.startsWith('spell-slot-'))
    .map((r) => ({ level: Number(r.name.slice('spell-slot-'.length)), remaining: r.current }))
    .filter((slot) => Number.isInteger(slot.level))
    .sort((a, b) => b.level - a.level)
}
