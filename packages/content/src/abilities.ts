/** The six ability scores, in canonical sheet order. */
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

export type Ability = (typeof ABILITIES)[number]

export type AbilityScores = Record<Ability, number>

export const ABILITY_NAMES: Record<Ability, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
}

export function isAbility(value: string): value is Ability {
  return (ABILITIES as readonly string[]).includes(value)
}
