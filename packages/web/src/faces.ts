/**
 * Choosing a character by their face.
 *
 * The setup used to ask for a race, then a class, and only then offer a
 * portrait that approximated both. Backwards: the picture already knows the
 * race and the sex, and those are the two things the DM needs in order to speak
 * about someone at all — in a language that marks gender on the verb it cannot
 * write a sentence without them. So the face is the question now, and race,
 * sex and pronouns are read off it rather than asked for separately and left
 * free to disagree.
 *
 * The trade in the picture is a suggestion and nothing more. A dwarf in a
 * priest's robes playing a barbarian is not a contradiction the way a Vigga
 * with a beard was: the brief carries race, sex, class and concept, and never
 * claims the portrait is a statement about any of them. That is already how
 * every NPC face works — the nearest match, not a likeness.
 */
import { BESTIARY, PORTRAITS, genderOfPortrait, type Gender, type PortraitName } from '@dnd/content'

/** The races the picker groups by, longest first so half-elf beats elf. */
const RACES = [
  'dragonborn',
  'half-elf',
  'half-orc',
  'halfling',
  'human',
  'dwarf',
  'gnome',
  'tiefling',
  'elf',
] as const

export type FaceRace = (typeof RACES)[number]

/** How a race reads in the brief: "half-elf" is sent as "Half-Elf". */
export function raceLabel(race: string): string {
  return race
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-')
}

/**
 * The race a portrait is of, from its name.
 *
 * Longest prefix wins, or `half-elf-scout-listening` would come back as an elf
 * and the brief would say so.
 */
export function raceOfPortrait(name: string): FaceRace | null {
  return RACES.find((race) => name.startsWith(`${race}-`)) ?? null
}

export interface Face {
  name: PortraitName
  race: FaceRace
  gender: Gender | null
  /** The trade in the picture, which is a suggestion and not a claim. */
  role: string
  looks: string
}

/** Every portrait a player can choose, in catalogue order. */
export const FACES: Face[] = (Object.keys(PORTRAITS) as PortraitName[])
  .filter((name) => !(name in BESTIARY))
  .flatMap((name): Face[] => {
    const race = raceOfPortrait(name)
    if (race === null) return []
    return [
      {
        name,
        race,
        gender: genderOfPortrait(name),
        role: name.split('-').at(-2) ?? '',
        // Widened on purpose: PORTRAITS is a const object, so its values are
        // literal types and the inferred shape would be one enormous union.
        looks: PORTRAITS[name] as string,
      },
    ]
  })

export interface FaceFilter {
  race?: FaceRace | null
  gender?: Gender | null
}

export function facesMatching({ race, gender }: FaceFilter = {}): Face[] {
  return FACES.filter(
    (face) =>
      (race === undefined || race === null || face.race === race) &&
      // A portrait that commits to no sex is shown under both, not neither:
      // the dragonborn were unspecified for a long time and hiding them from
      // every filter would have been worse than showing them twice.
      (gender === undefined || gender === null || face.gender === gender || face.gender === null),
  )
}

/** Counts per race, for the filter chips to say how much is behind each. */
export function faceCounts(gender?: Gender | null): Record<string, number> {
  const out: Record<string, number> = {}
  // Spread conditionally: exactOptionalPropertyTypes means an explicit
  // undefined is not the same as an absent key.
  for (const face of facesMatching(gender === undefined ? {} : { gender })) {
    out[face.race] = (out[face.race] ?? 0) + 1
  }
  return out
}

/**
 * The order the chips read in, which is not the order the prefixes match in.
 *
 * RACES is longest-first so `half-elf-…` does not come back an elf; that is a
 * parsing concern and makes a nonsense of a row of buttons.
 */
export const FACE_RACES: readonly FaceRace[] = [
  'human',
  'dwarf',
  'elf',
  'halfling',
  'half-elf',
  'half-orc',
  'gnome',
  'dragonborn',
  'tiefling',
]
