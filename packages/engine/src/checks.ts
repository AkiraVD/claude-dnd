import { SKILLS, type Ability, type AbilityScores, type Skill } from '@dnd/content'
import { naturalFace, rollDice, type DiceResult } from './dice.js'
import type { Rng } from './rng.js'

export type Advantage = 'none' | 'advantage' | 'disadvantage'

/** Ability score to modifier: 10-11 is +0, every 2 points either way is ±1. */
export function abilityModifier(score: number): number {
  if (!Number.isInteger(score)) {
    throw new RangeError(`ability score must be an integer, got ${score}`)
  }
  return Math.floor((score - 10) / 2)
}

/** +2 at levels 1-4, rising by 1 every 4 levels to +6 at 17-20. */
export function proficiencyBonus(level: number): number {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new RangeError(`level must be an integer in 1..20, got ${level}`)
  }
  return 2 + Math.floor((level - 1) / 4)
}

/**
 * Advantage is two d20s keeping the higher, not a flat bonus. Expressing it as
 * notation keeps both dice in the log, which is what the UI wants to show.
 */
export function d20Notation(advantage: Advantage): string {
  switch (advantage) {
    case 'advantage':
      return '2d20kh1'
    case 'disadvantage':
      return '2d20kl1'
    case 'none':
      return '1d20'
  }
}

/** Combine advantage from several sources. Any of each cancel out exactly once. */
export function combineAdvantage(sources: readonly Advantage[]): Advantage {
  const hasAdvantage = sources.includes('advantage')
  const hasDisadvantage = sources.includes('disadvantage')
  if (hasAdvantage === hasDisadvantage) return 'none'
  return hasAdvantage ? 'advantage' : 'disadvantage'
}

export interface ModifierParts {
  score: number
  /** Proficiency bonus to add when `proficient`. */
  profBonus?: number
  proficient?: boolean
  /** Doubles the proficiency bonus. Requires proficiency. */
  expertise?: boolean
  /** Any other situational bonus or penalty. */
  bonus?: number
}

export function checkModifier(parts: ModifierParts): number {
  const { score, profBonus = 0, proficient = false, expertise = false, bonus = 0 } = parts
  if (expertise && !proficient) {
    throw new RangeError('expertise requires proficiency')
  }
  const proficiency = proficient ? profBonus * (expertise ? 2 : 1) : 0
  return abilityModifier(score) + proficiency + bonus
}

export interface D20TestOptions {
  modifier: number
  advantage?: Advantage
  /** Omit for an uncontested roll whose DC the DM has not fixed yet. */
  dc?: number
  rng: Rng
}

export interface D20TestResult {
  roll: DiceResult
  advantage: Advantage
  /** The kept d20 face. "Rolled a 20" means this is 20. */
  natural: number
  modifier: number
  total: number
  dc?: number
  success?: boolean
  isNat20: boolean
  isNat1: boolean
}

/**
 * The single d20 primitive. Ability checks, saving throws and (phase 2) attack
 * rolls all reduce to this.
 *
 * Note what is deliberately absent: a natural 20 does **not** auto-succeed and a
 * natural 1 does **not** auto-fail. That rule applies to attack rolls only, and
 * baking it in here is one of the most common homebrew errors. `isNat20` and
 * `isNat1` are reported so callers that *do* care can act on them.
 */
export function d20Test(options: D20TestOptions): D20TestResult {
  const { modifier, advantage = 'none', dc, rng } = options
  const roll = rollDice(d20Notation(advantage), rng)
  const natural = naturalFace(roll)
  const total = natural + modifier

  return {
    roll,
    advantage,
    natural,
    modifier,
    total,
    ...(dc === undefined ? {} : { dc, success: total >= dc }),
    isNat20: natural === 20,
    isNat1: natural === 1,
  }
}

export interface CheckOptions extends ModifierParts {
  advantage?: Advantage
  dc?: number
  rng: Rng
}

function runCheck(options: CheckOptions): D20TestResult {
  const { advantage, dc, rng, ...parts } = options
  return d20Test({
    modifier: checkModifier(parts),
    ...(advantage === undefined ? {} : { advantage }),
    ...(dc === undefined ? {} : { dc }),
    rng,
  })
}

/** A raw ability check, e.g. a Strength check to force a door. */
export function abilityCheck(options: CheckOptions): D20TestResult {
  return runCheck(options)
}

/**
 * A saving throw. Mechanically identical to an ability check; kept separate so
 * the event log and the DM prompt can tell them apart, because the fiction and
 * the proficiencies involved differ.
 */
export function savingThrow(options: CheckOptions): D20TestResult {
  return runCheck(options)
}

export function skillAbility(skill: Skill): Ability {
  return SKILLS[skill]
}

export interface SkillCheckOptions {
  skill: Skill
  scores: AbilityScores
  profBonus?: number
  proficient?: boolean
  expertise?: boolean
  bonus?: number
  advantage?: Advantage
  dc?: number
  rng: Rng
}

export function skillCheck(options: SkillCheckOptions): D20TestResult {
  const { skill, scores, ...rest } = options
  return abilityCheck({ score: scores[skillAbility(skill)], ...rest })
}

/**
 * A passive score: no roll, taking 10 on the die. Advantage and disadvantage
 * shift it by 5 rather than changing dice.
 */
export function passiveScore(options: { modifier: number; advantage?: Advantage }): number {
  const { modifier, advantage = 'none' } = options
  const shift = advantage === 'advantage' ? 5 : advantage === 'disadvantage' ? -5 : 0
  return 10 + modifier + shift
}
