import type { Ability } from './abilities.js'
import type { Skill } from './skills.js'

export type CasterType = 'full' | 'half' | 'third' | 'pact' | 'none'

export interface ClassDefinition {
  name: string
  hitDie: number
  /** Saving throws the class is proficient in at level 1. */
  saves: readonly [Ability, Ability]
  casterType: CasterType
  spellcastingAbility: Ability | null
  /** Skills the class may choose from, for character creation. */
  skillChoices: readonly Skill[]
  skillCount: number
}

/** The 12 SRD classes. */
export const CLASSES = {
  barbarian: {
    name: 'Barbarian',
    hitDie: 12,
    saves: ['str', 'con'],
    casterType: 'none',
    spellcastingAbility: null,
    skillChoices: ['animal-handling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
    skillCount: 2,
  },
  bard: {
    name: 'Bard',
    hitDie: 8,
    saves: ['dex', 'cha'],
    casterType: 'full',
    spellcastingAbility: 'cha',
    skillChoices: [
      'acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history', 'insight',
      'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance',
      'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival',
    ],
    skillCount: 3,
  },
  cleric: {
    name: 'Cleric',
    hitDie: 8,
    saves: ['wis', 'cha'],
    casterType: 'full',
    spellcastingAbility: 'wis',
    skillChoices: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
    skillCount: 2,
  },
  druid: {
    name: 'Druid',
    hitDie: 8,
    saves: ['int', 'wis'],
    casterType: 'full',
    spellcastingAbility: 'wis',
    skillChoices: [
      'arcana', 'animal-handling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival',
    ],
    skillCount: 2,
  },
  fighter: {
    name: 'Fighter',
    hitDie: 10,
    saves: ['str', 'con'],
    casterType: 'none',
    spellcastingAbility: null,
    skillChoices: [
      'acrobatics', 'animal-handling', 'athletics', 'history', 'insight', 'intimidation',
      'perception', 'survival',
    ],
    skillCount: 2,
  },
  monk: {
    name: 'Monk',
    hitDie: 8,
    saves: ['str', 'dex'],
    casterType: 'none',
    spellcastingAbility: null,
    skillChoices: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
    skillCount: 2,
  },
  paladin: {
    name: 'Paladin',
    hitDie: 10,
    saves: ['wis', 'cha'],
    casterType: 'half',
    spellcastingAbility: 'cha',
    skillChoices: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
    skillCount: 2,
  },
  ranger: {
    name: 'Ranger',
    hitDie: 10,
    saves: ['str', 'dex'],
    casterType: 'half',
    spellcastingAbility: 'wis',
    skillChoices: [
      'animal-handling', 'athletics', 'insight', 'investigation', 'nature', 'perception',
      'stealth', 'survival',
    ],
    skillCount: 3,
  },
  rogue: {
    name: 'Rogue',
    hitDie: 8,
    saves: ['dex', 'int'],
    casterType: 'none',
    spellcastingAbility: null,
    skillChoices: [
      'acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation',
      'perception', 'performance', 'persuasion', 'sleight-of-hand', 'stealth',
    ],
    skillCount: 4,
  },
  sorcerer: {
    name: 'Sorcerer',
    hitDie: 6,
    saves: ['con', 'cha'],
    casterType: 'full',
    spellcastingAbility: 'cha',
    skillChoices: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
    skillCount: 2,
  },
  warlock: {
    name: 'Warlock',
    hitDie: 8,
    saves: ['wis', 'cha'],
    casterType: 'pact',
    spellcastingAbility: 'cha',
    skillChoices: [
      'arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion',
    ],
    skillCount: 2,
  },
  wizard: {
    name: 'Wizard',
    hitDie: 6,
    saves: ['int', 'wis'],
    casterType: 'full',
    spellcastingAbility: 'int',
    skillChoices: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'],
    skillCount: 2,
  },
} as const satisfies Record<string, ClassDefinition>

export type ClassName = keyof typeof CLASSES

export const CLASS_LIST = Object.keys(CLASSES) as ClassName[]

export function isClassName(value: string): value is ClassName {
  return Object.hasOwn(CLASSES, value)
}

/**
 * Spell slots by level, index 0 being level 1. Each row is slots for spell
 * levels 1 through 9.
 */
export const FULL_CASTER_SLOTS: readonly (readonly number[])[] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
]

export const HALF_CASTER_SLOTS: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0], [2, 0, 0, 0, 0], [3, 0, 0, 0, 0], [3, 0, 0, 0, 0], [4, 2, 0, 0, 0],
  [4, 2, 0, 0, 0], [4, 3, 0, 0, 0], [4, 3, 0, 0, 0], [4, 3, 2, 0, 0], [4, 3, 2, 0, 0],
  [4, 3, 3, 0, 0], [4, 3, 3, 0, 0], [4, 3, 3, 1, 0], [4, 3, 3, 1, 0], [4, 3, 3, 2, 0],
  [4, 3, 3, 2, 0], [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2],
]

/** Warlock pact magic: few slots, all of the same level, back on a short rest. */
export const PACT_SLOTS: readonly { count: number; level: number }[] = [
  { count: 1, level: 1 }, { count: 2, level: 1 }, { count: 2, level: 2 }, { count: 2, level: 2 },
  { count: 2, level: 3 }, { count: 2, level: 3 }, { count: 2, level: 4 }, { count: 2, level: 4 },
  { count: 2, level: 5 }, { count: 2, level: 5 }, { count: 3, level: 5 }, { count: 3, level: 5 },
  { count: 3, level: 5 }, { count: 3, level: 5 }, { count: 3, level: 5 }, { count: 3, level: 5 },
  { count: 4, level: 5 }, { count: 4, level: 5 }, { count: 4, level: 5 }, { count: 4, level: 5 },
]

/** Slots per spell level for a class at a level, as `{ 1: 4, 2: 3, 3: 2 }`. */
export function spellSlotsFor(className: ClassName, level: number): Record<number, number> {
  if (!Number.isInteger(level) || level < 1 || level > 20) {
    throw new RangeError(`level must be an integer in 1..20, got ${level}`)
  }
  const definition = CLASSES[className]
  const slots: Record<number, number> = {}

  if (definition.casterType === 'full') {
    FULL_CASTER_SLOTS[level - 1]!.forEach((count, index) => {
      if (count > 0) slots[index + 1] = count
    })
  } else if (definition.casterType === 'half') {
    HALF_CASTER_SLOTS[level - 1]!.forEach((count, index) => {
      if (count > 0) slots[index + 1] = count
    })
  } else if (definition.casterType === 'pact') {
    const pact = PACT_SLOTS[level - 1]!
    slots[pact.level] = pact.count
  }

  return slots
}
