/**
 * Class features that have uses, by class and level.
 *
 * The engine already counts anything with uses and a recharge, and refuses to
 * spend past empty — but it only counted what someone had thought to create.
 * Hit dice and spell slots came from the class tables; Second Wind, Rage and ki
 * came from the DM remembering to call `add_resource`, which is exactly the kind
 * of thing a DM gets right twice and then forgets at hour three. Then nothing
 * stops a fighter using Second Wind in every round of a fight, because as far as
 * the engine knows there is no such thing.
 *
 * Only features with a *counter* are here. Fighting Style, Extra Attack, Sneak
 * Attack and the rest are real rules, but there is nothing to track: they are
 * conditions on a roll, not a pool that runs out, and the engine has no opinion
 * about them.
 *
 * Data only. The maximum is left symbolic where it depends on the character
 * rather than the level, because resolving `{ ability: 'cha' }` means knowing
 * how an ability modifier works — and that rule lives in the engine, once.
 *
 * SRD 5.1, CC-BY-4.0. Base classes only; subclass features are not in scope.
 */
import type { Ability } from './abilities.js'
import type { ClassName } from './classes.js'

/** Mirrors the engine's RechargeTiming. Content cannot import the engine. */
export type FeatureRecharge = 'short-rest' | 'long-rest' | 'dawn' | 'never'

/**
 * How many uses.
 *
 * A plain number where the table says so; `'level'` for pools that track class
 * level exactly (ki, sorcery points); `{ perLevel }` for one that is a multiple
 * of it (lay on hands); `{ ability }` for one read off the character.
 */
export type FeatureMax =
  | number
  | 'level'
  | { perLevel: number }
  | { ability: Ability; plus?: number; min?: number }

export interface ClassFeature {
  /** The class level at which this entry applies. */
  level: number
  /** Stable id, as a resource name. */
  name: string
  label: string
  max: FeatureMax
  recharge: FeatureRecharge
}

/**
 * Every entry, lowest level first.
 *
 * A feature that changes with level is listed again at each level it changes —
 * a later entry for the same name supersedes the earlier one entirely, rather
 * than patching it. Action Surge at 17 is a whole row, and so is Bardic
 * Inspiration at 5, which changes nothing but the rest it comes back on.
 */
export const CLASS_FEATURES: Record<ClassName, readonly ClassFeature[]> = {
  barbarian: [
    { level: 1, name: 'rage', label: 'Rage', max: 2, recharge: 'long-rest' },
    { level: 3, name: 'rage', label: 'Rage', max: 3, recharge: 'long-rest' },
    { level: 6, name: 'rage', label: 'Rage', max: 4, recharge: 'long-rest' },
    { level: 12, name: 'rage', label: 'Rage', max: 5, recharge: 'long-rest' },
    { level: 17, name: 'rage', label: 'Rage', max: 6, recharge: 'long-rest' },
    // Level 20 is unlimited rages. There is no number for that, and a counter
    // that cannot run out is worse than none: it would still be refused at
    // zero if anything ever decremented it wrongly.
  ],
  bard: [
    {
      level: 1,
      name: 'bardic-inspiration',
      label: 'Bardic Inspiration',
      max: { ability: 'cha', min: 1 },
      recharge: 'long-rest',
    },
    {
      level: 5,
      name: 'bardic-inspiration',
      label: 'Bardic Inspiration',
      max: { ability: 'cha', min: 1 },
      recharge: 'short-rest',
    },
  ],
  cleric: [
    { level: 2, name: 'channel-divinity', label: 'Channel Divinity', max: 1, recharge: 'short-rest' },
    { level: 6, name: 'channel-divinity', label: 'Channel Divinity', max: 2, recharge: 'short-rest' },
    { level: 18, name: 'channel-divinity', label: 'Channel Divinity', max: 3, recharge: 'short-rest' },
  ],
  druid: [{ level: 2, name: 'wild-shape', label: 'Wild Shape', max: 2, recharge: 'short-rest' }],
  fighter: [
    { level: 1, name: 'second-wind', label: 'Second Wind', max: 1, recharge: 'short-rest' },
    { level: 2, name: 'action-surge', label: 'Action Surge', max: 1, recharge: 'short-rest' },
    { level: 9, name: 'indomitable', label: 'Indomitable', max: 1, recharge: 'long-rest' },
    { level: 13, name: 'indomitable', label: 'Indomitable', max: 2, recharge: 'long-rest' },
    { level: 17, name: 'action-surge', label: 'Action Surge', max: 2, recharge: 'short-rest' },
    { level: 17, name: 'indomitable', label: 'Indomitable', max: 3, recharge: 'long-rest' },
  ],
  monk: [{ level: 2, name: 'ki', label: 'Ki points', max: 'level', recharge: 'short-rest' }],
  paladin: [
    {
      level: 1,
      name: 'divine-sense',
      label: 'Divine Sense',
      max: { ability: 'cha', plus: 1, min: 1 },
      recharge: 'long-rest',
    },
    {
      level: 1,
      name: 'lay-on-hands',
      label: 'Lay on Hands (hit points)',
      max: { perLevel: 5 },
      recharge: 'long-rest',
    },
    { level: 3, name: 'channel-divinity', label: 'Channel Divinity', max: 1, recharge: 'short-rest' },
    {
      level: 14,
      name: 'cleansing-touch',
      label: 'Cleansing Touch',
      max: { ability: 'cha', min: 1 },
      recharge: 'long-rest',
    },
  ],
  // Favoured Enemy and Natural Explorer are passive, and Hunter's Mark is a
  // spell slot like any other. Nothing to count.
  ranger: [],
  // Sneak Attack is once a turn, not a pool, and Cunning Action is every turn.
  rogue: [{ level: 20, name: 'stroke-of-luck', label: 'Stroke of Luck', max: 1, recharge: 'short-rest' }],
  sorcerer: [
    { level: 2, name: 'sorcery-points', label: 'Sorcery points', max: 'level', recharge: 'long-rest' },
  ],
  warlock: [
    // Pact slots come from the class table with the other spell slots. These
    // are the once-a-day spells beside them, one at each level that grants one.
    { level: 11, name: 'mystic-arcanum-6', label: 'Mystic Arcanum (6th)', max: 1, recharge: 'long-rest' },
    { level: 13, name: 'mystic-arcanum-7', label: 'Mystic Arcanum (7th)', max: 1, recharge: 'long-rest' },
    { level: 15, name: 'mystic-arcanum-8', label: 'Mystic Arcanum (8th)', max: 1, recharge: 'long-rest' },
    { level: 17, name: 'mystic-arcanum-9', label: 'Mystic Arcanum (9th)', max: 1, recharge: 'long-rest' },
  ],
  wizard: [
    { level: 1, name: 'arcane-recovery', label: 'Arcane Recovery', max: 1, recharge: 'long-rest' },
  ],
}

/**
 * The features a character of this class and level has, one entry per name.
 *
 * Where a feature is listed more than once, the highest entry at or below the
 * character's level wins — so a fighter 17 gets Action Surge twice over, not
 * once and then again.
 */
export function featuresFor(className: ClassName, level: number): ClassFeature[] {
  const best = new Map<string, ClassFeature>()
  for (const feature of CLASS_FEATURES[className]) {
    if (feature.level > level) continue
    const held = best.get(feature.name)
    if (held === undefined || feature.level >= held.level) best.set(feature.name, feature)
  }
  return [...best.values()]
}
