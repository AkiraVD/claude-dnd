import {
  CLASSES,
  MAX_EXHAUSTION,
  spellSlotsFor,
  type Ability,
  type AbilityScores,
  type ClassName,
  type Condition,
  type DamageType,
  type Skill,
} from '@dnd/content'
import { abilityModifier, proficiencyBonus, skillAbility, type Advantage } from './checks.js'
import { RulesError } from './errors.js'
import {
  hitDiceResource,
  pactSlotResource,
  spellSlotResources,
  type Resource,
} from './resources.js'
import { parseCoin, type Item } from './wealth.js'

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

/** 5e's social scale. It moves, which is why the engine holds it and not the DM. */
export type Attitude = 'hostile' | 'unfriendly' | 'indifferent' | 'friendly' | 'helpful'

/** Whether they are in the scene. The cast persists either way. */
export type Presence = 'present' | 'offscreen'

/**
 * One thing that is true about someone.
 *
 * `revealed` is the only thing standing between the DM's notes and the player's
 * screen, so it is a field on the record rather than a convention. The server
 * strips unrevealed notes before the browser ever sees the state; a bug in the
 * UI cannot leak what was never sent.
 */
export interface ProfileNote {
  readonly text: string
  readonly revealed: boolean
}

/**
 * Who someone is, as opposed to what they can survive.
 *
 * None of this is computed with — the engine only refuses to lose it. Without
 * it a barkeep is a different person every time they are on screen, and after a
 * `/clear` they never existed. `want` and unrevealed notes are the DM's alone.
 */
export interface CreatureProfile {
  readonly race: string | null
  readonly pronouns: string | null
  readonly role: string | null
  readonly appearance: string | null
  readonly manner: string | null
  readonly location: string | null
  readonly attitude: Attitude | null
  /**
   * A key character in the backbone, carrying more than an ordinary NPC.
   * Never sent to the browser: telling the player who matters is a spoiler.
   */
  readonly principal: boolean
  /** What they are after. DM-only. */
  readonly want: string | null
  readonly notes: readonly ProfileNote[]
}

export const EMPTY_PROFILE: CreatureProfile = {
  race: null,
  pronouns: null,
  role: null,
  appearance: null,
  manner: null,
  location: null,
  attitude: null,
  principal: false,
  want: null,
  notes: [],
}

/**
 * A weapon or attack the creature can make, defined once and referenced by name.
 *
 * The playtest retyped `1d8` / `str` / `+3` / `slashing` on every swing, six
 * chances to mistype a damage bonus with nothing to catch it. Defining the
 * weapon on the creature removes that entirely, and `damageBonus` defaults to
 * the governing ability modifier, which is the 5e rule and one less thing to get
 * wrong.
 */
export interface CreatureAttack {
  name: string
  ability: Ability
  damage: string
  damageType: DamageType
  proficient?: boolean
  /** Defaults to the ability modifier. */
  damageBonus?: number
  attackBonus?: number
  range?: 'melee' | 'ranged'
  critOn?: number
  /** Informational, e.g. "finesse", "versatile (1d10)", "reach". */
  notes?: string
}

/**
 * Worn armour. Only what the rules key off mechanically: heavy armour imposes
 * disadvantage on Stealth, which the playtest narrated and then failed to apply
 * because nothing knew what Brann was wearing.
 */
export interface Armour {
  name: string
  stealthDisadvantage?: boolean
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
  readonly attacks: readonly CreatureAttack[]
  readonly armour: Armour | null
  readonly resources: readonly Resource[]
  /** Die size for hit dice, from the class. */
  readonly hitDie: number
  readonly className: ClassName | null
  readonly xp: number
  /** Coin carried, in copper. See `wealth.ts` for why it is one integer. */
  readonly purse: number
  /** A ledger of what they carry. Priced entries are what they will sell. */
  readonly items: readonly Item[]
  readonly profile: CreatureProfile
  readonly presence: Presence
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
  attacks?: readonly CreatureAttack[]
  armour?: Armour | null
  /**
   * Naming a class fills in the hit die, save proficiencies, hit dice, and spell
   * slots for the level. Anything passed explicitly wins.
   */
  className?: ClassName
  /** Extra resources beyond what the class provides. */
  resources?: readonly Resource[]
  hitDie?: number
  xp?: number
  /** Coin carried. Accepts "12 gp 4 sp" or a number of copper. */
  purse?: string | number
  items?: readonly Item[]
  profile?: Partial<CreatureProfile>
  presence?: Presence
}

/**
 * The SRD commoner, so recording an innkeeper costs you a name and nothing else.
 * Without this every named NPC needs six ability scores invented for it, and the
 * DM stops writing them down.
 */
export const COMMONER = {
  scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } as AbilityScores,
  maxHp: 4,
  ac: 10,
  speed: 30,
} as const

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
    attacks = [],
    armour = null,
    className,
    xp = 0,
    items = [],
    presence = 'present',
  } = input

  const purse = input.purse === undefined ? 0 : parseCoin(input.purse)
  const profile: CreatureProfile = { ...EMPTY_PROFILE, ...(input.profile ?? {}) }

  const definition = className === undefined ? null : CLASSES[className]
  const hitDie = input.hitDie ?? definition?.hitDie ?? 8

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

  if (!Number.isInteger(hitDie) || hitDie < 1) {
    throw new RulesError(`${name}: hit die must be a positive integer, got ${hitDie}`)
  }
  if (!Number.isInteger(xp) || xp < 0) {
    throw new RulesError(`${name}: xp cannot be negative, got ${xp}`)
  }
  for (const attack of attacks) {
    if (attack.name.trim() === '') throw new RulesError(`${name}: an attack needs a name`)
  }

  const skills = unique(proficiencies.skills ?? [])
  const expertise = unique(proficiencies.expertise ?? [])
  for (const skill of expertise) {
    if (!skills.includes(skill)) {
      throw new RulesError(`${name}: expertise in ${skill} requires proficiency in it`)
    }
  }

  // A class implies its saves unless the caller listed their own.
  const saves = unique(proficiencies.saves ?? definition?.saves ?? [])

  const classResources: Resource[] = []
  if (definition !== null) {
    classResources.push(hitDiceResource(level, hitDie))
    if (definition.casterType === 'pact') {
      const slots = spellSlotsFor(className!, level)
      for (const [slotLevel, count] of Object.entries(slots)) {
        classResources.push(pactSlotResource(Number(slotLevel), count))
      }
    } else if (definition.casterType !== 'none') {
      classResources.push(...spellSlotResources(spellSlotsFor(className!, level)))
    }
  }

  // Caller-supplied resources override same-named class ones.
  const supplied = input.resources ?? []
  const resources = [
    ...classResources.filter((r) => !supplied.some((s) => s.name === r.name)),
    ...supplied,
  ]

  return {
    id,
    name,
    kind,
    level,
    scores: { ...scores },
    hp: { current: hp, max: maxHp, temp: tempHp },
    ac,
    speed,
    proficiencies: { saves, skills, expertise },
    defenses: {
      resistances: unique(defenses.resistances ?? []),
      vulnerabilities: unique(defenses.vulnerabilities ?? []),
      immunities: unique(defenses.immunities ?? []),
    },
    conditions: { active: [], exhaustion: 0 },
    death: { successes: 0, failures: 0, stable: false, dead: false },
    concentration: null,
    attacks: [...attacks],
    armour,
    resources,
    hitDie,
    className: className ?? null,
    xp,
    purse,
    items: [...items],
    profile,
    presence,
    diesAtZero,
  }
}

/**
 * Fills in fields a snapshot predates.
 *
 * Campaigns are stored as JSON snapshots, so a save written before purses and
 * profiles existed deserialises into a creature missing them, and the first
 * `formatCoin(undefined)` takes the session down. Every load goes through here.
 */
export function restoreCreature(stored: Creature): Creature {
  const profile = stored.profile as Partial<CreatureProfile> | undefined

  return {
    ...stored,
    purse: stored.purse ?? 0,
    items: stored.items ?? [],
    presence: stored.presence ?? 'present',
    profile: { ...EMPTY_PROFILE, ...(profile ?? {}), notes: profile?.notes ?? [] },
  }
}

export function findAttack(creature: Creature, name: string): CreatureAttack {
  const wanted = name.trim().toLowerCase()
  const attack = creature.attacks.find((a) => a.name.toLowerCase() === wanted)
  if (!attack) {
    const known = creature.attacks.map((a) => a.name)
    throw new RulesError(
      `${creature.name} has no attack called "${name}". Has: ${known.length > 0 ? known.join(', ') : '(none defined)'}`,
    )
  }
  return attack
}

/** The spell save DC and attack bonus for a caster, from its class. */
export function spellcasting(
  creature: Creature,
): { ability: Ability; saveDc: number; attackBonus: number } | null {
  if (creature.className === null) return null
  const ability = CLASSES[creature.className].spellcastingAbility
  if (ability === null) return null

  const modifier = abilityModifier(creature.scores[ability])
  return {
    ability,
    saveDc: 8 + proficiencyBonus(creature.level) + modifier,
    attackBonus: proficiencyBonus(creature.level) + modifier,
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

/**
 * Advantage or disadvantage a skill check inherits from the creature itself:
 * heavy armour on Stealth, exhaustion on everything.
 */
export function skillConditionAdvantage(creature: Creature, skill: Skill): Advantage[] {
  const sources: Advantage[] = []
  if (skill === 'stealth' && creature.armour?.stealthDisadvantage === true) {
    sources.push('disadvantage')
  }
  // Exhaustion 1 and up: disadvantage on ability checks.
  if (creature.conditions.exhaustion >= 1) sources.push('disadvantage')
  if (hasCondition(creature, 'poisoned')) sources.push('disadvantage')
  return sources
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
