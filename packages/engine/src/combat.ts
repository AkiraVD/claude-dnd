import type { Ability, DamageType } from '@dnd/content'
import {
  abilityMod,
  findAttack,
  hasCondition,
  initiativeModifier,
  isDead,
  profBonus,
  type Creature,
  type CreatureId,
} from './character.js'
import {
  combineAdvantage,
  d20Test,
  type Advantage,
  type D20TestResult,
} from './checks.js'
import { applyDamage, type DamageOutcome } from './damage.js'
import { criticalNotation, rollDice, type DiceResult } from './dice.js'
import { RulesError } from './errors.js'
import type { GameEvent } from './events.js'
import type { Rng } from './rng.js'

// ── initiative and turn order ──────────────────────────────────────────────────

export interface Combatant {
  id: CreatureId
  name: string
  initiative: number
  /** Dex modifier, the first tiebreaker. */
  dexMod: number
}

export interface CombatState {
  readonly active: boolean
  readonly round: number
  /** Index into `order`. Meaningless when `active` is false. */
  readonly turnIndex: number
  readonly order: readonly Combatant[]
}

export interface InitiativeRoll {
  id: CreatureId
  name: string
  roll: D20TestResult
  initiative: number
}

export interface StartCombatResult {
  state: CombatState
  rolls: InitiativeRoll[]
  events: GameEvent[]
}

/**
 * Roll initiative and build the turn order.
 *
 * Ties break on Dexterity modifier, then on the order the creatures were passed
 * in. The rules leave the final tiebreak to the DM, and a stable, explicit rule
 * beats a coin flip nobody can audit.
 */
export function startCombat(creatures: readonly Creature[], rng: Rng): StartCombatResult {
  if (creatures.length === 0) throw new RulesError('combat needs at least one creature')

  const ids = new Set<CreatureId>()
  for (const creature of creatures) {
    if (ids.has(creature.id)) throw new RulesError(`duplicate creature in combat: ${creature.id}`)
    ids.add(creature.id)
  }

  const rolls: InitiativeRoll[] = creatures.map((creature) => {
    const roll = d20Test({ modifier: initiativeModifier(creature), rng })
    return { id: creature.id, name: creature.name, roll, initiative: roll.total }
  })

  const order: Combatant[] = creatures
    .map((creature, index) => ({
      id: creature.id,
      name: creature.name,
      initiative: rolls[index]!.initiative,
      dexMod: abilityMod(creature, 'dex'),
      index,
    }))
    .sort(
      (a, b) =>
        b.initiative - a.initiative || b.dexMod - a.dexMod || a.index - b.index,
    )
    .map(({ id, name, initiative, dexMod }) => ({ id, name, initiative, dexMod }))

  const state: CombatState = { active: true, round: 1, turnIndex: 0, order }

  return {
    state,
    rolls,
    events: [
      { t: 'combat', op: 'start' },
      {
        t: 'initiative',
        order: order.map(({ id, initiative }) => ({ id, initiative })),
      },
      { t: 'turn', actor: order[0]!.id, round: 1 },
    ],
  }
}

export function currentActor(state: CombatState): Combatant {
  if (!state.active) throw new RulesError('no combat is in progress')
  return state.order[state.turnIndex]!
}

export interface NextTurnResult {
  state: CombatState
  actor: Combatant
  /** True when the turn order wrapped and a new round began. */
  newRound: boolean
  events: GameEvent[]
}

export function nextTurn(state: CombatState): NextTurnResult {
  if (!state.active) throw new RulesError('no combat is in progress')

  const turnIndex = (state.turnIndex + 1) % state.order.length
  const newRound = turnIndex === 0
  const round = newRound ? state.round + 1 : state.round
  const next: CombatState = { ...state, turnIndex, round }
  const actor = next.order[turnIndex]!

  return {
    state: next,
    actor,
    newRound,
    events: [{ t: 'turn', actor: actor.id, round }],
  }
}

export function endCombat(state: CombatState): { state: CombatState; events: GameEvent[] } {
  if (!state.active) throw new RulesError('no combat is in progress')
  return {
    state: { active: false, round: state.round, turnIndex: 0, order: state.order },
    events: [{ t: 'combat', op: 'end' }],
  }
}

/** Drop the dead from the turn order, keeping the current actor pointed correctly. */
export function removeFromCombat(state: CombatState, id: CreatureId): CombatState {
  const index = state.order.findIndex((c) => c.id === id)
  if (index === -1) throw new RulesError(`${id} is not in this combat`)
  if (state.order.length === 1) {
    return { active: false, round: state.round, turnIndex: 0, order: [] }
  }

  const order = state.order.filter((c) => c.id !== id)
  // Removing someone earlier in the order shifts everyone after them back one.
  const turnIndex =
    index < state.turnIndex ? state.turnIndex - 1 : state.turnIndex % order.length

  return { ...state, order, turnIndex }
}

// ── attack rolls ───────────────────────────────────────────────────────────────

export type AttackRange = 'melee' | 'ranged'

/**
 * Advantage and disadvantage contributed by conditions, for an attack.
 *
 * A documented subset: the conditions whose effect does not depend on geometry
 * or line of sight the engine cannot see. `frightened` is omitted because it
 * only applies while the source of the fear is visible, which is the DM's call;
 * pass it through `extra` when it applies.
 */
export function attackConditionAdvantage(
  attacker: Creature,
  target: Creature,
  range: AttackRange,
): Advantage[] {
  const sources: Advantage[] = []

  if (hasCondition(attacker, 'blinded')) sources.push('disadvantage')
  if (hasCondition(attacker, 'poisoned')) sources.push('disadvantage')
  if (hasCondition(attacker, 'prone')) sources.push('disadvantage')
  if (hasCondition(attacker, 'restrained')) sources.push('disadvantage')
  if (hasCondition(attacker, 'invisible')) sources.push('advantage')

  if (hasCondition(target, 'blinded')) sources.push('advantage')
  if (hasCondition(target, 'paralyzed')) sources.push('advantage')
  if (hasCondition(target, 'petrified')) sources.push('advantage')
  if (hasCondition(target, 'restrained')) sources.push('advantage')
  if (hasCondition(target, 'stunned')) sources.push('advantage')
  if (hasCondition(target, 'unconscious')) sources.push('advantage')
  if (hasCondition(target, 'invisible')) sources.push('disadvantage')

  // Prone cuts both ways: easier to hit up close, harder from a distance.
  if (hasCondition(target, 'prone')) {
    sources.push(range === 'melee' ? 'advantage' : 'disadvantage')
  }

  return sources
}

export interface AttackOptions {
  attacker: Creature
  target: Creature
  /** Ability the attack uses: `str` for a longsword, `dex` for a bow. */
  ability: Ability
  /** Name of the attack used, when it came from the creature's own list. */
  attackName?: string
  /** Adds the proficiency bonus to the attack roll. */
  proficient?: boolean
  /** Magic weapon bonuses and the like, on the attack roll. */
  attackBonus?: number
  /** Damage dice, e.g. `1d8`. Doubled on a critical hit. */
  damage: string
  damageType: DamageType
  /** Flat damage, e.g. the ability modifier. Never doubled on a critical hit. */
  damageBonus?: number
  range?: AttackRange
  /** Advantage from circumstance, stacked with whatever conditions contribute. */
  advantage?: Advantage | readonly Advantage[]
  /** A critical happens on this face or higher. Champions lower it to 19. */
  critOn?: number
  /** Skip the condition-derived advantage and use only what was passed in. */
  ignoreConditions?: boolean
  /**
   * False to knock the target out rather than kill it, when the hit would drop
   * it to 0. Defaults to true.
   */
  lethal?: boolean
  rng: Rng
}

export type AttackReason =
  | 'nat20'
  | 'nat1'
  | 'auto-crit-helpless'
  | 'beat-ac'
  | 'below-ac'

export interface AttackOutcome {
  /** The weapon used, when the attack came off the creature's sheet. */
  attackName: string | null
  roll: D20TestResult
  hit: boolean
  critical: boolean
  reason: AttackReason
  advantage: Advantage
  ac: number
  /** Null on a miss. */
  damageRoll: DiceResult | null
  /** Null on a miss. Carries the updated target. */
  damage: DamageOutcome | null
  /** The target after damage — unchanged on a miss. */
  target: Creature
  /** One line for the DM to narrate from. Never the whole sentence. */
  narrationHint: string
  events: GameEvent[]
}

export function attackModifier(
  attacker: Creature,
  ability: Ability,
  proficient: boolean,
  bonus: number,
): number {
  return abilityMod(attacker, ability) + (proficient ? profBonus(attacker) : 0) + bonus
}

/**
 * Resolve one attack, all the way through to the target's new HP.
 *
 * The rules that live here and nowhere else:
 *  - a natural 20 always hits and always crits, whatever the AC;
 *  - a natural 1 always misses, whatever the modifiers;
 *  - a critical doubles the damage dice, never the flat modifier;
 *  - a melee hit on a paralyzed or unconscious target is automatically critical.
 */
/**
 * Resolve a named attack off the creature's own sheet.
 *
 * `damageBonus` defaults to the governing ability modifier — the 5e rule, and one
 * fewer number to retype correctly on every swing.
 */
export function attackWith(
  attacker: Creature,
  target: Creature,
  name: string,
  rng: Rng,
  overrides: Partial<Pick<AttackOptions, 'advantage' | 'range' | 'lethal' | 'ignoreConditions'>> = {},
): AttackOutcome {
  const weapon = findAttack(attacker, name)
  return attack({
    attacker,
    target,
    attackName: weapon.name,
    ability: weapon.ability,
    damage: weapon.damage,
    damageType: weapon.damageType,
    proficient: weapon.proficient ?? true,
    damageBonus: weapon.damageBonus ?? abilityMod(attacker, weapon.ability),
    ...(weapon.attackBonus === undefined ? {} : { attackBonus: weapon.attackBonus }),
    range: overrides.range ?? weapon.range ?? 'melee',
    ...(weapon.critOn === undefined ? {} : { critOn: weapon.critOn }),
    ...(overrides.advantage === undefined ? {} : { advantage: overrides.advantage }),
    ...(overrides.lethal === undefined ? {} : { lethal: overrides.lethal }),
    ...(overrides.ignoreConditions === undefined
      ? {}
      : { ignoreConditions: overrides.ignoreConditions }),
    rng,
  })
}

export function attack(options: AttackOptions): AttackOutcome {
  const {
    attacker,
    target,
    ability,
    proficient = false,
    attackBonus = 0,
    damage,
    damageType,
    damageBonus = 0,
    range = 'melee',
    advantage,
    critOn = 20,
    ignoreConditions = false,
    lethal = true,
    rng,
  } = options

  if (isDead(attacker)) throw new RulesError(`${attacker.name} is dead and cannot attack`)
  if (hasCondition(attacker, 'incapacitated')) {
    throw new RulesError(`${attacker.name} is incapacitated and cannot attack`)
  }
  if (isDead(target)) throw new RulesError(`${target.name} is already dead`)
  if (!Number.isInteger(critOn) || critOn < 2 || critOn > 20) {
    throw new RulesError(`critOn must be an integer in 2..20, got ${critOn}`)
  }

  const passed: Advantage[] = advantage === undefined ? [] : Array.isArray(advantage) ? [...advantage] : [advantage]
  const fromConditions = ignoreConditions
    ? []
    : attackConditionAdvantage(attacker, target, range)
  const effectiveAdvantage = combineAdvantage([...passed, ...fromConditions])

  const modifier = attackModifier(attacker, ability, proficient, attackBonus)
  const roll = d20Test({
    modifier,
    advantage: effectiveAdvantage,
    dc: target.ac,
    rng,
  })

  // A helpless target in melee turns any hit into a critical.
  const helpless =
    range === 'melee' &&
    (hasCondition(target, 'paralyzed') || hasCondition(target, 'unconscious'))

  let hit: boolean
  let critical: boolean
  let reason: AttackReason

  if (roll.isNat1) {
    hit = false
    critical = false
    reason = 'nat1'
  } else if (roll.isNat20 || roll.natural >= critOn) {
    hit = true
    critical = true
    reason = 'nat20'
  } else if (roll.total >= target.ac) {
    hit = true
    critical = helpless
    reason = helpless ? 'auto-crit-helpless' : 'beat-ac'
  } else {
    hit = false
    critical = false
    reason = 'below-ac'
  }

  const events: GameEvent[] = [
    {
      t: 'attack',
      attacker: attacker.id,
      target: target.id,
      total: roll.total,
      ac: target.ac,
      hit,
      critical,
    },
  ]

  if (!hit) {
    return {
      attackName: options.attackName ?? null,
      roll,
      hit,
      critical,
      reason,
      advantage: effectiveAdvantage,
      ac: target.ac,
      damageRoll: null,
      damage: null,
      target,
      narrationHint: `${roll.total} vs AC ${target.ac} — miss${roll.isNat1 ? ' (natural 1)' : ''}`,
      events,
    }
  }

  const notation = critical ? criticalNotation(damage) : damage
  const damageRoll = rollDice(notation, rng)
  const total = Math.max(0, damageRoll.total + damageBonus)
  const outcome = applyDamage(target, { amount: total, damageType, critical, lethal })
  events.push(...outcome.events)

  const parts = [
    `${roll.total} vs AC ${target.ac} — ${critical ? 'critical hit' : 'hit'}`,
    `${outcome.hpLost} ${damageType}`,
  ]
  if (outcome.mitigation !== 'none') parts.push(outcome.mitigation)
  if (outcome.absorbedByTempHp > 0) parts.push(`${outcome.absorbedByTempHp} soaked by temp HP`)
  parts.push(`${outcome.creature.name} at ${outcome.creature.hp.current}/${outcome.creature.hp.max}`)
  if (outcome.instantDeath) parts.push('killed outright by massive damage')
  else if (outcome.died) parts.push('killed')
  else if (outcome.droppedToZero) parts.push('knocked unconscious')

  return {
    attackName: options.attackName ?? null,
    roll,
    hit,
    critical,
    reason,
    advantage: effectiveAdvantage,
    ac: target.ac,
    damageRoll,
    damage: outcome,
    target: outcome.creature,
    narrationHint: parts.join(' · '),
    events,
  }
}
