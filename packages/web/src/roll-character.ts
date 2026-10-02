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
 * Story starters.
 *
 * Two rules pull against each other here, and the shape is what satisfies both.
 *
 * The prose names no race, class or sex. It used to be written per class, which
 * read well and contradicted the picture the moment you chose a different face —
 * a hook about a priest's vows under a portrait of a smith. So every line here
 * says what happened and leaves who it happened to entirely open.
 *
 * What is keyed by class is which lines you are offered. `fits` is the
 * selection, not the subject: a fighter is shown the ones about coming back
 * alone and a wizard the ones about an apprenticeship, without either line ever
 * saying so. A starter can fit several classes, so this stays one table rather
 * than twelve that drift.
 *
 * Each is a past and an unresolved thing in one breath — something the DM can
 * pull on in the first scene without being told what the answer is.
 */
interface Starter {
  /** Classes this is offered for. Every class has at least four. */
  fits: readonly string[]
  text: string
}

const STARTERS: readonly Starter[] = [
  {
    fits: ['fighter', 'barbarian', 'paladin', 'ranger'],
    text: 'Was the only one who came back, and nobody has asked why.',
  },
  {
    fits: ['barbarian', 'fighter', 'druid', 'ranger'],
    text: 'The village burned while they were away. Nobody there will say who by.',
  },
  {
    fits: ['warlock', 'rogue', 'bard', 'sorcerer'],
    text: 'Signed a contract without reading the back of it. Someone is coming to collect.',
  },
  {
    fits: ['rogue', 'bard', 'wizard', 'cleric'],
    text: 'A letter arrived with the right name on it and a dead man’s seal.',
  },
  {
    fits: ['paladin', 'fighter', 'cleric', 'monk'],
    text: 'Took the blame for something to protect someone who has not written back.',
  },
  {
    fits: ['rogue', 'ranger', 'monk', 'sorcerer'],
    text: 'Left home at night without telling anyone, and has not stopped moving since.',
  },
  {
    fits: ['wizard', 'sorcerer', 'bard', 'rogue'],
    text: 'Apprenticed to someone who vanished, leaving behind the tools and the debts.',
  },
  {
    fits: ['cleric', 'warlock', 'paladin'],
    text: 'Prayed over something that answered, and has not slept properly since.',
  },
  {
    fits: ['rogue', 'bard', 'fighter'],
    text: 'Owes money to someone patient enough to wait and rich enough not to have to.',
  },
  {
    fits: ['rogue', 'bard', 'sorcerer'],
    text: 'Won something in a card game that people keep trying to take back.',
  },
  {
    fits: ['rogue', 'warlock', 'cleric'],
    text: 'There is a grave somewhere with their name cut into it, and they did not put it there.',
  },
  {
    fits: ['ranger', 'wizard', 'druid'],
    text: 'Carries a half-burned map with one place circled, and has never been there.',
  },
  {
    fits: ['monk', 'wizard', 'fighter'],
    text: 'Spent nine years learning one thing perfectly and has never once been asked to use it.',
  },
  {
    fits: ['barbarian', 'rogue', 'sorcerer'],
    text: 'Woke in a ditch three days from anywhere, holding a purse that was not earned and remembering none of it.',
  },
  {
    fits: ['bard', 'wizard', 'cleric'],
    text: 'Sold the last thing they owned to buy passage here. It had better be worth it.',
  },
  {
    fits: ['warlock', 'paladin', 'fighter'],
    text: 'Someone saved their life and named a price they have not collected yet.',
  },
  {
    fits: ['rogue', 'bard', 'warlock'],
    text: 'Travelling under a name that is not theirs, and has nearly got used to it.',
  },
  {
    fits: ['ranger', 'druid', 'fighter', 'barbarian'],
    text: 'The thing that took the rest of the party is still out there, and it knows their face.',
  },
  {
    fits: ['wizard', 'bard', 'ranger'],
    text: 'Has been following a rumour for two years. It keeps turning out to be true.',
  },
  {
    fits: ['sorcerer', 'warlock', 'monk'],
    text: 'Woke one morning able to do something nobody had taught, and told no one.',
  },
  {
    fits: ['monk', 'cleric', 'paladin'],
    text: 'Walked out of the order the day before the vows, and still keeps the hours.',
  },
  {
    fits: ['rogue', 'wizard', 'bard'],
    text: 'Burned the ledger rather than hand it over, and has been remembering the numbers ever since.',
  },
  {
    fits: ['monk', 'warlock', 'barbarian'],
    text: 'Was traded away young to settle someone else’s debt, and the debt is still open.',
  },
  {
    fits: ['druid', 'cleric', 'ranger'],
    text: 'Knows which well the sickness came from, and said so, and was not believed.',
  },
]

/**
 * The starters offered for a class.
 *
 * An unknown class — or none at all, which is what a baker's portrait gives —
 * gets the whole table rather than nothing. Better a past that merely does not
 * lean toward the build than an empty box.
 */
export function startersFor(className: string | null): readonly string[] {
  const fitting =
    className === null ? [] : STARTERS.filter((starter) => starter.fits.includes(slug(className)))
  return (fitting.length === 0 ? STARTERS : fitting).map((starter) => starter.text)
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

/**
 * The class a portrait's trade suggests, or null when it suggests none.
 *
 * Inverted from ROLES rather than written out again: a second table would be a
 * second opinion, and the two would drift until a shieldbreaker suggested
 * barbarian in one place and fighter in the other. Whichever class ranks the
 * role highest wins, which is the same preference the roller uses when going
 * the other way.
 *
 * Null for the fifty-six faces that are purely a trade — a baker, a miller, a
 * ratcatcher. Those are chosen because someone wants to look like a miller, and
 * inventing a class for them would be noise.
 */
const SUGGESTED = new Map<string, string>()
for (const [className, roles] of Object.entries(ROLES)) {
  roles.forEach((role, rank) => {
    const held = SUGGESTED.get(role)
    if (held === undefined) {
      SUGGESTED.set(role, `${rank}:${className}`)
      return
    }
    if (rank < Number(held.split(':')[0])) SUGGESTED.set(role, `${rank}:${className}`)
  })
}

/**
 * The backstory a face arrives with.
 *
 * Keyed on the portrait's own name rather than drawn at random, so the same
 * face always offers the same past. A hook that changed every time you clicked
 * back onto a face would read as the form losing your place.
 *
 * Every face gets one. It used to return nothing for a face whose trade implied
 * no class — a baker is a person, not a build — but the starters do not know
 * what a class is any more, so there is nothing left for that to mean.
 */
export function defaultBackstory(portrait: string): string {
  const pool = startersFor(suggestedClass(portrait))
  return pool[hashOf(portrait) % pool.length]!
}

/** FNV-1a, so the choice is stable across reloads and machines. */
function hashOf(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

export function suggestedClass(portrait: string): string | null {
  const role = portrait.split('-').at(-2) ?? ''
  const held = SUGGESTED.get(role)
  return held === undefined ? null : held.slice(held.indexOf(':') + 1)
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
    concept: pick(startersFor(className), rng),
    portrait,
    pronouns: pronounsForPortrait(portrait),
  }
}

/** The races the roller has names for. */
export function rolledRaces(): string[] {
  return Object.keys(NAMES)
}

export function rolledClasses(): string[] {
  return Object.keys(ROLES)
}

/** Nothing in the bestiary should ever be reachable as a player's avatar. */
export function isPlayerPortrait(name: string): boolean {
  return name in PORTRAITS && !(name in BESTIARY)
}
