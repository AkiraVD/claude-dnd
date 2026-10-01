import { CLASSES } from '@dnd/content'
import { hasCondition, isDead, spellcasting, type Creature, type CreatureSpell } from './character.js'
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
  /**
   * Refuse a spell that is not on the caster's sheet.
   *
   * Off by default, because a campaign whose spells were never written down
   * would otherwise be unable to cast at all. Turned on at the table's choice,
   * it makes the sheet a rule rather than a reminder: the slot is not spent,
   * nothing is journalled, and the player is told what they actually know.
   */
  requireKnown?: boolean
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
  /**
   * Whether this spell is on the caster's sheet.
   *
   * The engine cannot refuse an unknown spell — it has no catalogue, and a
   * character whose spells were never written down would be unable to cast at
   * all. So it does not pretend to decide: it spends the slot and says plainly
   * that the spell was not on the sheet, and the DM rules on it. Being told is
   * the thing that stops a made-up spell going through unnoticed across three
   * hours of play.
   */
  known: boolean
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

  const known = creature.spells.some((s) => s.name.toLowerCase() === spell.trim().toLowerCase())
  if (options.requireKnown === true && !known) {
    const sheet = creature.spells.map((s) => s.name)
    throw new RulesError(
      `${spell} is not on ${creature.name}'s sheet. ` +
        (sheet.length > 0
          ? `Knows: ${sheet.join(', ')}. Write it down with learn_spell first if they have learned it.`
          : 'Nothing is written down yet — use learn_spell before they cast.'),
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
    known,
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

/**
 * Write a spell onto a creature's sheet, with a line on what it does.
 *
 * Still not a catalogue: nothing here is consulted when the spell is cast, and
 * a spell that was never written down casts exactly the same. This is the sheet
 * — the same role `attacks` plays for weapons — so the player can see what they
 * know and be reminded what it does without asking.
 *
 * Learning a spell twice updates it rather than duplicating it, and a second
 * call that says nothing about the effect keeps the description already there.
 */
export function learnSpell(
  creature: Creature,
  input: { name: string; level: number; effect?: string },
): { creature: Creature; events: GameEvent[]; spell: CreatureSpell } {
  const name = input.name.trim()
  if (name === '') throw new RulesError('a spell needs a name')
  if (!Number.isInteger(input.level) || input.level < 0 || input.level > 9) {
    throw new RulesError(`spell level must be an integer in 0..9, got ${input.level}`)
  }

  const effect = input.effect?.trim()
  const existing = creature.spells.find((s) => s.name.toLowerCase() === name.toLowerCase())
  const kept = effect !== undefined && effect !== '' ? effect : existing?.effect

  const spell: CreatureSpell = {
    name,
    level: input.level,
    ...(kept === undefined ? {} : { effect: kept }),
  }

  const spells =
    existing === undefined
      ? [...creature.spells, spell]
      : creature.spells.map((s) => (s === existing ? spell : s))

  return {
    creature: { ...creature, spells },
    events: [{ t: 'spell-known', caster: creature.id, spell: name, level: input.level }],
    spell,
  }
}
