import { CLASSES } from '@dnd/content'
import { hasCondition, isDead, spellcasting, type Creature } from './character.js'
import { RulesError } from './errors.js'
import type { GameEvent } from './events.js'
import { availableSlots, findResource, spendResource } from './resources.js'

export interface CastOptions {
  spell: string
  /** The spell's own level. 0 for a cantrip, which costs nothing. */
  level: number
  /** Cast at a higher level than written. Defaults to the spell's own level. */
  slotLevel?: number
  /**
   * One line on what the spell does, as the DM is adjudicating it.
   *
   * The engine has no spell catalogue and is not acquiring one here: this is
   * never read back by any rule, only journalled so the browser can remind the
   * player what they cast last time. The DM remains the authority on the effect.
   */
  effect?: string
}

export interface CastResult {
  creature: Creature
  spell: string
  level: number
  /** Null for a cantrip. */
  slotLevel: number | null
  slotsRemaining: Array<{ level: number; remaining: number }>
  saveDc: number | null
  spellAttackBonus: number | null
  events: GameEvent[]
}

/**
 * Spend a slot and report the spell's save DC.
 *
 * The engine does not know what any particular spell does — that is the DM's
 * job, and a spell catalogue is a different project. What it does enforce is the
 * part a DM cannot hold in their head across a three-hour session: that the slot
 * existed, and that it is gone now.
 */
export function castSpell(creature: Creature, options: CastOptions): CastResult {
  const { spell, level } = options
  const slotLevel = options.slotLevel ?? level

  if (isDead(creature)) throw new RulesError(`${creature.name} is dead`)
  if (creature.hp.current === 0) {
    throw new RulesError(`${creature.name} is unconscious and cannot cast`)
  }
  if (hasCondition(creature, 'incapacitated')) {
    throw new RulesError(`${creature.name} is incapacitated and cannot cast`)
  }
  if (!Number.isInteger(level) || level < 0 || level > 9) {
    throw new RulesError(`spell level must be an integer in 0..9, got ${level}`)
  }
  if (!Number.isInteger(slotLevel) || slotLevel < 0 || slotLevel > 9) {
    throw new RulesError(`slot level must be an integer in 0..9, got ${slotLevel}`)
  }
  if (level > 0 && slotLevel < level) {
    throw new RulesError(
      `${spell} is a level ${level} spell and cannot be cast with a level ${slotLevel} slot`,
    )
  }

  const casting = spellcasting(creature)
  const events: GameEvent[] = []
  let next = creature

  // Cantrips cost nothing.
  if (level > 0) {
    const name = `spell-slot-${slotLevel}`
    // A clearer error than the generic resource one, since "no slots" is the
    // single most common illegal action in play.
    const resource = creature.resources.find((r) => r.name === name)
    if (!resource) {
      const has = availableSlots(creature)
      throw new RulesError(
        `${creature.name} has no level ${slotLevel} slots at all. Available: ` +
          (has.length > 0
            ? has.map((s) => `level ${s.level} × ${s.remaining}`).join(', ')
            : 'none'),
      )
    }
    if (resource.current < 1) {
      const has = availableSlots(creature).filter((s) => s.remaining > 0)
      throw new RulesError(
        `${creature.name} has no level ${slotLevel} slots left. Still available: ` +
          (has.length > 0
            ? has.map((s) => `level ${s.level} × ${s.remaining}`).join(', ')
            : 'none — they are out of spells until a rest'),
      )
    }

    const spent = spendResource(creature, name)
    next = spent.creature
    events.push(...spent.events)
  }

  events.push({
    t: 'spell',
    caster: creature.id,
    ...(options.effect === undefined || options.effect.trim() === ''
      ? {}
      : { effect: options.effect.trim() }),
    spell,
    level,
    slotLevel: level === 0 ? null : slotLevel,
  })

  return {
    creature: next,
    spell,
    level,
    slotLevel: level === 0 ? null : slotLevel,
    slotsRemaining: availableSlots(next),
    saveDc: casting?.saveDc ?? null,
    spellAttackBonus: casting?.attackBonus ?? null,
    events,
  }
}

/** Whether the creature could cast at this slot level right now. */
export function canCast(creature: Creature, slotLevel: number): boolean {
  if (slotLevel === 0) return true
  try {
    return findResource(creature, `spell-slot-${slotLevel}`).current > 0
  } catch {
    return false
  }
}

export function knownCasterClasses(): string[] {
  return Object.entries(CLASSES)
    .filter(([, definition]) => definition.casterType !== 'none')
    .map(([name]) => name)
}
