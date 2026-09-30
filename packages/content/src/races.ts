/**
 * The nine SRD 5.1 races, as choices for character creation.
 *
 * Names and nothing else: the engine does not model race, so there is no speed,
 * darkvision or ability increase here to imply that it does. A race is carried
 * on `Creature.profile.race` as a string, which is also why an NPC can be "a
 * fox-headed thing from the ossuary" without anything breaking.
 *
 * The descriptions are written for the picker, not lifted from the SRD.
 */
export const RACES = {
  human: 'Everywhere, and rarely settled for long',
  dwarf: 'Stone-stubborn, with a long memory for debts',
  elf: 'A century is a season',
  halfling: 'Underestimated, and content to be',
  dragonborn: 'Clan before self, always',
  gnome: 'Curious well past the point of safety',
  'half-elf': 'Welcome anywhere, at home nowhere',
  'half-orc': 'Strength that other people read as a threat',
  tiefling: 'Blood no one will let you forget',
} as const

export type Race = keyof typeof RACES

export const RACE_LIST = Object.keys(RACES) as Race[]

export function isRace(value: string): value is Race {
  return value.toLowerCase() in RACES
}

/** "half-elf" → "Half-Elf". For display; the stored value stays as given. */
export function raceLabel(race: string): string {
  return race
    .split('-')
    .map((part) => (part === '' ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join('-')
}
