import {
  MAX_EXHAUSTION,
  type Ability,
  type AbilityScores,
  type Condition,
  type DamageType,
  type Skill,
} from '@dnd/content'
import { abilityModifier, proficiencyBonus, skillAbility, type Advantage } from './checks.js'
import { RulesError } from './errors.js'

export type CreatureId = string

/** Every condition but exhaustion, which tracks a level instead of on/off. */
export type SimpleCondition = Exclude<Condition, 'exhaustion'>

export interface HitPoints {
  current: number
  max: number
  temp: number
}

export interface Proficiencies {
  saves: readonly Ability[]
  skills: readonly Skill[]
  /** Doubles the proficiency bonus. Must be a subset of `skills`. */
  expertise: readonly Skill[]
}

export interface Defenses {
  resistances: readonly DamageType[]
  vulnerabilities: readonly DamageType[]
  immunities: readonly DamageType[]
}

export interface ConditionState {
  active: readonly SimpleCondition[]
  /** 0..6. Level 6 is death. */
  exhaustion: number
}

export interface DeathState {
  successes: number
  failures: number
  /** Stabilised at 0 HP: still unconscious, but no longer rolling death saves. */
  stable: boolean
  dead: boolean
}

export interface Concentration {
  spell: string
}

export interface Creature {
  readonly id: CreatureId
  readonly name: string
  readonly kind: 'pc' | 'npc'
  readonly level: number
  readonly scores: AbilityScores
  readonly hp: HitPoints
  readonly ac: number
  readonly speed: number
  readonly proficiencies: Proficiencies
  readonly defenses: Defenses
  readonly conditions: ConditionState
  readonly death: DeathState
  readonly concentration: Concentration | null
  /**
   * Whether dropping to 0 HP kills outright.
   *
   * True for monsters and NPCs, false for player characters. Death saving
   * throws are a player-character rule — a goblin at 0 HP is simply dead, and
   * making it roll saves every round is both wrong and tedious. An attacker can
   * still choose to spare a creature that dies at zero; see `lethal` on
   * applyDamage.
   */
  readonly diesAtZero: boolean
}

export type LifeStatus = 'alive' | 'dying' | 'stable' | 'dead'

export interface CreatureInput {
  id: string
  name: string
  kind?: 'pc' | 'npc'
  level?: number
  scores: AbilityScores
  maxHp: number
  hp?: number
  tempHp?: number
  ac: number
  speed?: number
  proficiencies?: Partial<Proficiencies>
  defenses?: Partial<Defenses>
  /** Defaults to false for `pc` and true for `npc`. */
  diesAtZero?: boolean
}

const unique = <T>(values: readonly T[]): readonly T[] => [...new Set(values)]

export function createCreature(input: CreatureInput): Creature {
  const {
    id,
    name,
    kind = 'npc',
    level = 1,
    scores,
    maxHp,
    hp = maxHp,
    tempHp = 0,
    ac,
    speed = 30,
    proficiencies = {},
    defenses = {},
    diesAtZero = kind !== 'pc',
  } = input

  if (id.trim() === '') throw new RulesError('creature id cannot be empty')
  if (name.trim() === '') throw new RulesError(`creature ${id} needs a name`)
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new RulesError(`${name}: level must be an integer in 1..20, got ${level}`)
  }
  for (const [ability, score] of Object.entries(scores)) {
    if (!Number.isInteger(score) || score < 1 || score > 30) {
      throw new RulesError(`${name}: ${ability} must be an integer in 1..30, got ${score}`)
    }
  }
  if (!Number.isInteger(maxHp) || maxHp < 1) {
    throw new RulesError(`${name}: max HP must be a positive integer, got ${maxHp}`)
  }
  if (!Number.isInteger(hp) || hp < 0 || hp > maxHp) {
    throw new RulesError(`${name}: HP must be an integer in 0..${maxHp}, got ${hp}`)
  }
  if (!Number.isInteger(tempHp) || tempHp < 0) {
    throw new RulesError(`${name}: temporary HP cannot be negative, got ${tempHp}`)
  }
  if (!Number.isInteger(ac) || ac < 0) {
    throw new RulesError(`${name}: AC must be a non-negative integer, got ${ac}`)
  }
  if (!Number.isInteger(speed) || speed < 0) {
    throw new RulesError(`${name}: speed must be a non-negative integer, got ${speed}`)
  }

  const skills = unique(proficiencies.skills ?? [])
  const expertise = unique(proficiencies.expertise ?? [])
  for (const skill of expertise) {
    if (!skills.includes(skill)) {
      throw new RulesError(`${name}: expertise in ${skill} requires proficiency in it`)
    }
  }

  return {
    id,
    name,
    kind,
    level,
    scores: { ...scores },
    hp: { current: hp, max: maxHp, temp: tempHp },
    ac,
    speed,
    proficiencies: { saves: unique(proficiencies.saves ?? []), skills, expertise },
    defenses: {
      resistances: unique(defenses.resistances ?? []),
      vulnerabilities: unique(defenses.vulnerabilities ?? []),
      immunities: unique(defenses.immunities ?? []),
    },
    conditions: { active: [], exhaustion: 0 },
    death: { successes: 0, failures: 0, stable: false, dead: false },
    concentration: null,
    diesAtZero,
  }
}

// ── derived numbers ────────────────────────────────────────────────────────────

export function abilityMod(creature: Creature, ability: Ability): number {
  return abilityModifier(creature.scores[ability])
}

export function profBonus(creature: Creature): number {
  return proficiencyBonus(creature.level)
}

export function saveModifier(creature: Creature, ability: Ability): number {
  const proficient = creature.proficiencies.saves.includes(ability)
  return abilityMod(creature, ability) + (proficient ? profBonus(creature) : 0)
}

export function skillModifier(creature: Creature, skill: Skill): number {
  const base = abilityMod(creature, skillAbility(skill))
  if (!creature.proficiencies.skills.includes(skill)) return base
  const multiplier = creature.proficiencies.expertise.includes(skill) ? 2 : 1
  return base + profBonus(creature) * multiplier
}

export function passiveSkill(creature: Creature, skill: Skill, advantage: Advantage = 'none'): number {
  const shift = advantage === 'advantage' ? 5 : advantage === 'disadvantage' ? -5 : 0
  return 10 + skillModifier(creature, skill) + shift
}

export function passivePerception(creature: Creature): number {
  return passiveSkill(creature, 'perception')
}

export function initiativeModifier(creature: Creature): number {
  return abilityMod(creature, 'dex')
}

/** AC with no armor: the baseline a monster stat block usually overrides. */
export function unarmoredAc(creature: Creature): number {
  return 10 + abilityMod(creature, 'dex')
}

// ── life and conditions ────────────────────────────────────────────────────────

export function lifeStatus(creature: Creature): LifeStatus {
  if (creature.death.dead) return 'dead'
  if (creature.hp.current > 0) return 'alive'
  return creature.death.stable ? 'stable' : 'dying'
}

export function isDead(creature: Creature): boolean {
  return creature.death.dead
}

export function isDown(creature: Creature): boolean {
  return creature.hp.current === 0
}

/** Awake and able to act. Being at 0 HP or `unconscious` both disqualify. */
export function isConscious(creature: Creature): boolean {
  return (
    !creature.death.dead && creature.hp.current > 0 && !hasCondition(creature, 'unconscious')
  )
}

export function hasCondition(creature: Creature, condition: Condition): boolean {
  if (condition === 'exhaustion') return creature.conditions.exhaustion > 0
  return creature.conditions.active.includes(condition)
}

export function addCondition(creature: Creature, condition: SimpleCondition): Creature {
  if (hasCondition(creature, condition)) return creature
  return {
    ...creature,
    conditions: { ...creature.conditions, active: [...creature.conditions.active, condition] },
  }
}

export function removeCondition(creature: Creature, condition: SimpleCondition): Creature {
  if (!hasCondition(creature, condition)) return creature
  return {
    ...creature,
    conditions: {
      ...creature.conditions,
      active: creature.conditions.active.filter((c) => c !== condition),
    },
  }
}

export function setExhaustion(creature: Creature, level: number): Creature {
  if (!Number.isInteger(level) || level < 0 || level > MAX_EXHAUSTION) {
    throw new RulesError(
      `${creature.name}: exhaustion must be an integer in 0..${MAX_EXHAUSTION}, got ${level}`,
    )
  }
  const conditions = { ...creature.conditions, exhaustion: level }
  if (level < MAX_EXHAUSTION) return { ...creature, conditions }
  // Level 6 exhaustion is death.
  return { ...creature, conditions, death: { ...creature.death, dead: true } }
}

// ── internal helpers shared with damage.ts and combat.ts ───────────────────────

export function withHp(creature: Creature, patch: Partial<HitPoints>): Creature {
  return { ...creature, hp: { ...creature.hp, ...patch } }
}

export function withDeath(creature: Creature, patch: Partial<DeathState>): Creature {
  return { ...creature, death: { ...creature.death, ...patch } }
}

export function resetDeathSaves(creature: Creature): Creature {
  return withDeath(creature, { successes: 0, failures: 0, stable: false })
}
