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
import { BESTIARY, PORTRAITS, type PortraitName } from '@dnd/content'

export interface RolledCharacter {
  name: string
  concept: string
  /** A portrait from the stock library, or null if the race has no faces. */
  portrait: PortraitName | null
}

/** Injectable so a test can pin the roll; `Math.random` by default. */
export type Rng = () => number

const pick = <T,>(list: readonly T[], rng: Rng): T => list[Math.floor(rng() * list.length)]!

/**
 * Names, by race. Written to sound like the people rather than to be unusual —
 * a name the DM can say out loud twice without stumbling is worth more than a
 * clever one.
 */
const NAMES: Record<string, readonly string[]> = {
  human: ['Alder Venn', 'Mira Castell', 'Tobin Rask', 'Sela Marchant', 'Garrin Hale', 'Noa Pell', 'Edric Vance', 'Wren Carrow'],
  dwarf: ['Borin Stonecarl', 'Hilda Oreheart', 'Dural Kettleback', 'Vigga Ironmoot', 'Thrain Copperfell', 'Sigrun Deepwell', 'Balder Grimsson', 'Orla Flintmarrow'],
  elf: ['Aelrin Thessaly', 'Ysolde Fairweather', 'Caeleth Morrow', 'Nienor Silverbough', 'Thalien Ashgrove', 'Maelis Quen', 'Erevan Dusklight', 'Saria Vaelen'],
  halfling: ['Pip Burrowell', 'Dayla Tunbridge', 'Milo Hearthwick', 'Rosie Appledore', 'Fenwick Marsh', 'Tilly Goodbarrow', 'Samwise Till', 'Bex Hollyhock'],
  'half-elf': ['Kaelen Ivor', 'Lyra Sandoval', 'Corwin Aldreth', 'Nessa Ferrow', 'Dorian Vale', 'Imogen Rask', 'Soren Ilyes', 'Ava Lenn'],
  'half-orc': ['Grask Ironjaw', 'Mura Blackfen', 'Dren Halfhand', 'Yara Stonetooth', 'Vosk Redmire', 'Ghel Saltbrand', 'Torgan Ash', 'Nima Drex'],
  gnome: ['Fizwick Trundle', 'Bibi Sprocket', 'Ondry Pell', 'Nix Underbough', 'Wendel Quill', 'Tappa Glim', 'Orwin Fettle', 'Sila Coggs'],
  dragonborn: ['Rhogar Ashscale', 'Sora Brasswing', 'Kriv Emberfang', 'Nala Goldmaw', 'Tarhun Stormhide', 'Ixen Verath', 'Donaar Brightclaw', 'Sesh Ironscale'],
  tiefling: ['Ashmodai Crane', 'Nemeia Vash', 'Corvus Belial', 'Sable Morrigen', 'Dust Kallus', 'Vesper Ilarion', 'Grim Antony', 'Lileth Fane'],
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
 */
export function avatarFor(race: string, className: string): PortraitName | null {
  const ofRace = portraitsForRace(race)
  if (ofRace.length === 0) return null
  for (const role of ROLES[slug(className)] ?? []) {
    const match = ofRace.find((name) => name.includes(`-${role}-`) || name.endsWith(`-${role}`))
    if (match) return match
  }
  return ofRace[0]!
}

/**
 * A name, a concept and a face.
 *
 * Race and class are what everything keys off, so the caller settles those
 * first — the form rolls them too when they are still empty, rather than
 * inventing a character with no shape.
 */
export function rollCharacter(race: string, className: string, rng: Rng = Math.random): RolledCharacter {
  const names = NAMES[slug(race)] ?? NAMES['human']!
  const concepts = CONCEPTS[slug(className)] ?? CONCEPTS['fighter']!
  return {
    name: pick(names, rng),
    concept: pick(concepts, rng),
    portrait: avatarFor(race, className),
  }
}

/** Guards against a roster entry naming a creature instead of a person. */
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
