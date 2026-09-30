import type { Ability } from './abilities.js'

/** The 18 SRD skills, each mapped to its governing ability. */
export const SKILLS = {
  acrobatics: 'dex',
  'animal-handling': 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  'sleight-of-hand': 'dex',
  stealth: 'dex',
  survival: 'wis',
} as const satisfies Record<string, Ability>

export type Skill = keyof typeof SKILLS

export const SKILL_LIST = Object.keys(SKILLS) as Skill[]

export function isSkill(value: string): value is Skill {
  return Object.hasOwn(SKILLS, value)
}
