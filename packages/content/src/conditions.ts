/**
 * The 15 SRD conditions. `effects` is a short mechanical reminder for the DM
 * prompt; the engine enforces the parts it can (see phase 8).
 */
export const CONDITIONS = {
  blinded: 'Cannot see, auto-fails sight checks. Attacks against it have advantage, its attacks have disadvantage.',
  charmed: 'Cannot attack the charmer. The charmer has advantage on social checks against it.',
  deafened: 'Cannot hear, auto-fails hearing checks.',
  frightened: 'Disadvantage on checks and attacks while the source is in line of sight. Cannot willingly move closer.',
  grappled: 'Speed becomes 0. Ends if the grappler is incapacitated.',
  incapacitated: 'Cannot take actions or reactions.',
  invisible: 'Attacks against it have disadvantage, its attacks have advantage.',
  paralyzed: 'Incapacitated, cannot move or speak, auto-fails Str and Dex saves. Attacks against it have advantage; hits within 5 ft are critical.',
  petrified: 'Transformed to stone, incapacitated, resistance to all damage, immune to poison and disease.',
  poisoned: 'Disadvantage on attack rolls and ability checks.',
  prone: 'Its attacks have disadvantage. Attacks against it have advantage within 5 ft, disadvantage beyond.',
  restrained: 'Speed 0. Attacks against it have advantage, its attacks have disadvantage, disadvantage on Dex saves.',
  stunned: 'Incapacitated, cannot move, can speak only falteringly. Auto-fails Str and Dex saves. Attacks against it have advantage.',
  unconscious: 'Incapacitated, prone, drops what it holds, unaware. Auto-fails Str and Dex saves. Attacks against it have advantage; hits within 5 ft are critical.',
  exhaustion: 'Six cumulative levels, each worse than the last. Level 6 is death.',
} as const

export type Condition = keyof typeof CONDITIONS

export const CONDITION_LIST = Object.keys(CONDITIONS) as Condition[]

/** Exhaustion is the one condition that tracks a level rather than on/off. */
export const MAX_EXHAUSTION = 6

export function isCondition(value: string): value is Condition {
  return Object.hasOwn(CONDITIONS, value)
}
