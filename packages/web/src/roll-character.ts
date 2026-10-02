/**
 * Rolling a character for the setup form.
 *
 * Entirely in the browser and deliberately so: there is no DM yet to ask when
 * this form is open, and the point of the button is that it answers instantly.
 * Kept out of React for the usual reason — what it produces is the part that
 * can quietly go wrong while rendering perfectly.
 *
 * The avatar is *matched*, not made. Nothing in this project generates an image
 * at run time; the art is built once and shipped, and there is no API key here
 * to call anything with. So a roll picks the closest portrait the library
 * already holds, preferring one whose role suits the class and settling for any
 * face of the right race.
 */
import {
  BESTIARY,
  PORTRAITS,
  UNKNOWN_PORTRAIT,
  genderOfPortrait,
  pronounsForPortrait,
  type Gender,
  type PortraitName,
} from '@dnd/content'

export interface RolledCharacter {
  name: string
  concept: string
  /**
   * What the DM should call them, taken from the face.
   *
   * Null only when the portrait commits to nothing — the dragonborn are scales
   * and harness — in which case the DM is left to decide rather than told
   * wrongly.
   */
  pronouns: string | null
  /**
   * A portrait from the stock library. Never null: a race the library has no
   * faces for gets the hood rather than an empty frame.
   */
  portrait: PortraitName
}

/** Injectable so a test can pin the roll; `Math.random` by default. */
export type Rng = () => number

const pick = <T,>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!

/**
 * Names, by race. Written to sound like the people rather than to be unusual —
 * a name the DM can say out loud twice without stumbling is worth more than a
 * clever one.
 */
/**
 * Names, by race and by gender.
 *
 * Split, because the roll has to agree with the face. Picking a name and a
 * portrait independently produced Vigga Ironmoot wearing a bearded dwarf, and
 * the DM resolved that contradiction by following the name — which an English
 * reader barely notices and a Vietnamese one cannot avoid, since the verb is
 * marked.
 *
 * Written to sound like the people rather than to be unusual: a name the DM can
 * say out loud twice without stumbling is worth more than a clever one.
 */
const NAMES: Record<string, { male: readonly string[]; female: readonly string[] }> = {
  human: {
    male: ['Alder Venn', 'Tobin Rask', 'Garrin Hale', 'Edric Vance'],
    female: ['Mira Castell', 'Sela Marchant', 'Noa Pell', 'Wren Carrow'],
  },
  dwarf: {
    male: ['Borin Stonecarl', 'Dural Kettleback', 'Thrain Copperfell', 'Balder Grimsson'],
    female: ['Hilda Oreheart', 'Vigga Ironmoot', 'Sigrun Deepwell', 'Orla Flintmarrow'],
  },
  elf: {
    male: ['Aelrin Thessaly', 'Caeleth Morrow', 'Thalien Ashgrove', 'Erevan Dusklight'],
    female: ['Ysolde Fairweather', 'Nienor Silverbough', 'Maelis Quen', 'Saria Vaelen'],
  },
  halfling: {
    male: ['Pip Burrowell', 'Milo Hearthwick', 'Fenwick Marsh', 'Samwise Till'],
    female: ['Dayla Tunbridge', 'Rosie Appledore', 'Tilly Goodbarrow', 'Bex Hollyhock'],
  },
  'half-elf': {
    male: ['Kaelen Ivor', 'Corwin Aldreth', 'Dorian Vale', 'Soren Ilyes'],
    female: ['Lyra Sandoval', 'Nessa Ferrow', 'Imogen Rask', 'Ava Lenn'],
  },
  'half-orc': {
    male: ['Grask Ironjaw', 'Dren Halfhand', 'Vosk Redmire', 'Torgan Ash'],
    female: ['Mura Blackfen', 'Yara Stonetooth', 'Ghel Saltbrand', 'Nima Drex'],
  },
  gnome: {
    male: ['Fizwick Trundle', 'Ondry Pell', 'Wendel Quill', 'Orwin Fettle'],
    female: ['Bibi Sprocket', 'Nix Underbough', 'Tappa Glim', 'Sila Coggs'],
  },
  dragonborn: {
    male: ['Rhogar Ashscale', 'Kriv Emberfang', 'Tarhun Stormhide', 'Donaar Brightclaw'],
    female: ['Sora Brasswing', 'Nala Goldmaw', 'Ixen Verath', 'Sesh Ironscale'],
  },
  tiefling: {
    male: ['Ashmodai Crane', 'Corvus Belial', 'Dust Kallus', 'Grim Antony'],
    female: ['Nemeia Vash', 'Sable Morrigen', 'Vesper Ilarion', 'Lileth Fane'],
  },
}

/**
 * Concepts, by class. Each is a background and a hook in one breath, in the
 * shape of the placeholder in the form: something that happened, and something
 * still unresolved for the DM to pull on.
 */
const CONCEPTS: Record<string, readonly string[]> = {
  barbarian: [
    'Last of a war band that walked into something it could not fight. Does not talk about who gave the order.',
    'Fought in a pit for three years to buy someone out. Bought them out. They did not come.',
    'Exiled for refusing a killing. The village that exiled them has started writing letters.',
  ],
  bard: [
    'Knows a song that two separate people have paid to have forgotten. Has not worked out why yet.',
    'Was the toast of a city for one season. Will not say which city, or what ended it.',
    'Collects the stories nobody wants told, and is starting to notice what they have in common.',
  ],
  cleric: [
    'Prayed over a battlefield and something answered that was not what they prayed to.',
    'Keeps a temple that burned down. Still keeps it. The order has sent someone to ask about that.',
    'Healed the wrong person once, on purpose, and has been paying for it in small instalments.',
  ],
  druid: [
    'Watched a wood die in a single season and found the cause written on a tax ledger.',
    'Speaks for a river that is being argued over by two towns, neither of which asked it.',
    'Left the circle over a disagreement about mercy. Was not wrong. Is still not welcome.',
  ],
  fighter: [
    'Disgraced temple guard. Took the blame for something to protect someone who has not written back.',
    'Twenty years under a banner that turned out to be a front. Found out last winter.',
    'Good at exactly one thing, and has recently met the only person better at it.',
  ],
  monk: [
    'Left the monastery with a question the abbot would not answer. Still carrying it.',
    'Trained to be a weapon. Was used as one once, and has been walking away from it since.',
    'Keeps a discipline nobody else at the table recognises, for a master nobody can find.',
  ],
  paladin: [
    'Swore an oath to a dead order and keeps it anyway, which is either faith or stubbornness.',
    'Broke the oath once in a way nobody else noticed. Has not forgiven it.',
    'Hunting the person who taught them everything, and is not sure what happens when they catch up.',
  ],
  ranger: [
    'Guided a company into a pass and came back alone. Has walked that pass every year since.',
    'Knows the border better than the people who drew it, and is wanted on both sides of it.',
    'Tracking something that has started leaving messages.',
  ],
  rogue: [
    'Stole something small from someone patient. It has been four years and they are still looking.',
    'Was the one who got out. Spends the money looking for the ones who did not.',
    'Has a key and no longer remembers what it opens, only that it was worth killing for.',
  ],
  sorcerer: [
    'Something in the blood woke up uninvited, and the family has been very polite about it since.',
    'Set a house on fire at eleven without touching it. Nobody has mentioned it since. Everyone remembers.',
    'Carries a power that is clearly inherited, from a parent who will not be named.',
  ],
  warlock: [
    'Made a bargain in a bad week and has been reading the small print ever since.',
    'Owes a favour to something that has not called it in yet, and is enjoying the wait more than they are.',
    'Was offered a way out and took it. The way out is still holding the door open.',
  ],
  wizard: [
    'Expelled for an experiment that worked. Kept the notes.',
    'Spent nine years on one translation and found a line that should not be in it.',
    'Was somebody’s apprentice until that somebody disappeared mid-sentence.',
  ],
}

/**
 * Which stock roles suit which class, best first.
 *
 * The library is full of townsfolk rather than adventurers, so these are
 * approximations: a mercenary stands in for a barbarian, an archivist for a
 * wizard. The written concept carries the class; the face only has to not
 * contradict it.
 */
const ROLES: Record<string, readonly string[]> = {
  // Adventurer roles first — they were made for exactly this — then the
  // townsfolk the library started as, which still carry the races the
  // adventurer sheets have not reached yet.
  barbarian: ['shieldbreaker', 'bulwark', 'mercenary', 'sellsword', 'bladedancer', 'veteran', 'labourer', 'quarryman', 'pitfighter'],
  bard: ['silvertongue', 'charlatan', 'grifter', 'cardsharp', 'dicesharp', 'server', 'merchant', 'draper', 'fence', 'courier'],
  cleric: ['warpriest', 'forgepriest', 'grovepriest', 'hearthpriest', 'wanderingpriest', 'priest', 'priestess', 'abbess', 'novice', 'oracle'],
  druid: ['grovepriest', 'hedgewitch', 'trailwise', 'pathfinder', 'herbalist', 'apothecary', 'farmer', 'sexton'],
  fighter: ['mercenary', 'sellsword', 'shieldbreaker', 'bladedancer', 'bulwark', 'sergeant', 'guard', 'veteran', 'soldier', 'duellist'],
  monk: ['bladedancer', 'wanderingpriest', 'hearthpriest', 'novice', 'abbess', 'warden', 'priestess'],
  paladin: ['warpriest', 'bulwark', 'shieldbreaker', 'mercenary', 'sergeant', 'guard', 'warden', 'soldier', 'inquisitor'],
  ranger: ['outrider', 'longstrider', 'pathfinder', 'trailwise', 'scout', 'courier', 'bounty', 'sailor', 'caravan'],
  rogue: ['grifter', 'cardsharp', 'dicesharp', 'silvertongue', 'charlatan', 'thief', 'pickpocket', 'fence', 'spymaster', 'poisoner', 'bounty', 'forger'],
  sorcerer: ['highmage', 'courtmage', 'hedgemage', 'runecarver', 'oracle', 'fortuneteller', 'preacher'],
  warlock: ['hedgewitch', 'hedgemage', 'highmage', 'runecarver', 'inquisitor', 'gravekeeper', 'fortuneteller', 'scholar'],
  wizard: ['courtmage', 'highmage', 'runecarver', 'hedgemage', 'archivist', 'scholar', 'apothecary', 'clockmaker', 'tinker', 'scribe'],
}

const slug = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '-')

/** Every stock portrait of that race, in catalogue order. */
export function portraitsForRace(race: string): PortraitName[] {
  const prefix = `${slug(race)}-`
  return (Object.keys(PORTRAITS) as PortraitName[]).filter((name) => name.startsWith(prefix))
}

/**
 * The closest face the library holds for a race and class.
 *
 * Race first, because a wrong race is wrong in a way a wrong trade is not — a
 * dwarf bard shown as a dwarf innkeeper reads fine, shown as an elf does not.
 * Which is also why the last resort is a hood rather than a near-miss: when the
 * library has nothing of that race, showing a face of another one is worse than
 * showing no face at all.
 */
export function avatarFor(race: string, className: string, gender?: Gender): PortraitName {
  const ofRace = portraitsForRace(race)
  if (ofRace.length === 0) return UNKNOWN_PORTRAIT

  // Role first, gender second, and in that order on purpose. A dwarf barbarian
  // shown as a dwarf priest of the right sex is further from the mark than a
  // dwarf shieldbreaker of the wrong one — the class is what the player chose,
  // the gender is what they may not have. Within a role the gender decides, and
  // asking for one the library cannot supply falls back rather than refusing.
  let fallback: PortraitName | null = null
  for (const role of ROLES[slug(className)] ?? []) {
    const matches = ofRace.filter(
      (name) => name.includes(`-${role}-`) || name.endsWith(`-${role}`),
    )
    if (matches.length === 0) continue
    if (gender !== undefined) {
      const wanted = matches.find((name) => genderOfPortrait(name) === gender)
      if (wanted !== undefined) return wanted
    }
    fallback ??= matches[0]!
  }
  return fallback ?? ofRace[0]!
}

/**
 * A name, a concept and a face.
 *
 * Race and class are what everything keys off, so the caller settles those
 * first — the form rolls them too when they are still empty, rather than
 * inventing a character with no shape.
 */
export function rollCharacter(
  race: string,
  className: string,
  rng: Rng = Math.random,
  gender?: Gender,
): RolledCharacter {
  const concepts = CONCEPTS[slug(className)] ?? CONCEPTS['fighter']!
  const portrait = avatarFor(race, className, gender)

  // The face is chosen first and the name follows it. The other way round is
  // what produced a Vigga with a beard: two independent picks, no reason for
  // them to agree, and a contradiction the DM has to resolve in its first
  // sentence — in English by picking a pronoun, in Vietnamese by marking every
  // verb. Where the portrait commits to nothing, either list will do.
  // The face that was actually found, which is not always the one asked for:
  // a race with no portrait of that sex in that role falls back, and the name
  // has to follow the picture rather than the request.
  const names = NAMES[slug(race)] ?? NAMES['human']!
  const shown = genderOfPortrait(portrait)
  const pool =
    shown === 'male' ? names.male : shown === 'female' ? names.female : [...names.male, ...names.female]

  return {
    name: pick(pool, rng),
    concept: pick(concepts, rng),
    portrait,
    pronouns: pronounsForPortrait(portrait),
  }
}

/** The races the roller has names for. */
export function rolledRaces(): string[] {
  return Object.keys(NAMES)
}

export function rolledClasses(): string[] {
  return Object.keys(CONCEPTS)
}

/** Nothing in the bestiary should ever be reachable as a player's avatar. */
export function isPlayerPortrait(name: string): boolean {
  return name in PORTRAITS && !(name in BESTIARY)
}
