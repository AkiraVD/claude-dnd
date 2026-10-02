/**
 * Who someone is, kept where it cannot drift.
 *
 * A DM asked to remember that the quartermaster is a dwarf who speaks without
 * contractions will get it right twice and then quietly get it wrong, and after
 * a `/clear` she never existed at all. So the profile is state, and the only
 * question the engine answers about it is what the player is allowed to see.
 */
import { BESTIARY, UNKNOWN_PORTRAIT, pronounsForPortrait } from '@dnd/content'
import type { Attitude, Creature, CreatureProfile, Presence, ProfileNote } from './character.js'
import { RulesError } from './errors.js'
import type { GameEvent } from './events.js'

export interface ProfileOutcome {
  creature: Creature
  events: GameEvent[]
}

/**
 * Patches the narrative fields. Only a changed attitude earns an event — nobody
 * needs a log line because the DM refined a description.
 */
export function updateProfile(
  creature: Creature,
  patch: Partial<Omit<CreatureProfile, 'notes'>>,
): ProfileOutcome {
  const profile: CreatureProfile = { ...creature.profile, ...patch }
  const events: GameEvent[] = []

  // A portrait settles the question the prose leaves open.
  //
  // A character called Vigga wearing a bearded dwarf is a contradiction, and the
  // DM has to resolve it in the first sentence of a language that marks gender
  // on the verb — which is where it went wrong: the name read female, the
  // picture was a man, and the pronouns followed the name. The picture is the
  // thing the player can see, so the picture wins.
  //
  // Only when nothing has been said. Pronouns given explicitly are never
  // overwritten, here or anywhere, because a character whose portrait is the
  // nearest match rather than a likeness is exactly the case this must not
  // trample.
  const implied =
    profile.portrait !== null && (profile.pronouns === null || profile.pronouns === '')
      ? pronounsForPortrait(profile.portrait)
      : null
  const settled: CreatureProfile = implied === null ? profile : { ...profile, pronouns: implied }

  if (
    patch.attitude !== undefined &&
    patch.attitude !== null &&
    patch.attitude !== creature.profile.attitude
  ) {
    events.push({ t: 'attitude', target: creature.id, attitude: patch.attitude })
  }

  return { creature: { ...creature, profile: settled }, events }
}

export function setAttitude(creature: Creature, attitude: Attitude): ProfileOutcome {
  return updateProfile(creature, { attitude })
}

export function setPresence(creature: Creature, presence: Presence): ProfileOutcome {
  if (creature.presence === presence) return { creature, events: [] }
  return {
    creature: { ...creature, presence },
    events: [{ t: 'presence', target: creature.id, presence }],
  }
}

/**
 * Writes something down about someone. Hidden by default: the DM notes what is
 * true, and reveals it separately when it comes out in play.
 */
export function addNote(creature: Creature, text: string, revealed = false): ProfileOutcome {
  const trimmed = text.trim()
  if (trimmed === '') throw new RulesError(`${creature.name}: a note cannot be empty`)

  if (creature.profile.notes.some((note) => note.text === trimmed)) {
    throw new RulesError(`${creature.name} already has that note`)
  }

  const note: ProfileNote = { text: trimmed, revealed }
  const profile: CreatureProfile = {
    ...creature.profile,
    notes: [...creature.profile.notes, note],
  }

  return {
    creature: { ...creature, profile },
    events: revealed ? [{ t: 'reveal', target: creature.id, note: trimmed }] : [],
  }
}

/**
 * Marks a note as something the player now knows, matching on any distinctive
 * part of its text. Ambiguity is an error rather than a guess — revealing the
 * wrong secret cannot be taken back.
 */
export function revealNote(creature: Creature, match: string): ProfileOutcome {
  const needle = match.trim().toLowerCase()
  if (needle === '') throw new RulesError('say which note to reveal')

  const hidden = creature.profile.notes.filter((note) => !note.revealed)
  const found = hidden.filter((note) => note.text.toLowerCase().includes(needle))

  if (found.length === 0) {
    throw new RulesError(
      hidden.length === 0
        ? `${creature.name} has nothing left hidden`
        : `no hidden note on ${creature.name} matches "${match}". Hidden: ${hidden
            .map((note) => `"${note.text}"`)
            .join(', ')}`,
    )
  }
  if (found.length > 1) {
    throw new RulesError(
      `"${match}" matches ${found.length} hidden notes on ${creature.name}: ${found
        .map((note) => `"${note.text}"`)
        .join(', ')}. Say more.`,
    )
  }

  const target = found[0]!
  const profile: CreatureProfile = {
    ...creature.profile,
    notes: creature.profile.notes.map((note) =>
      note === target ? { ...note, revealed: true } : note,
    ),
  }

  return {
    creature: { ...creature, profile },
    events: [{ t: 'reveal', target: creature.id, note: target.text }],
  }
}

/**
 * Who already has this face, if anyone.
 *
 * A face is how the player tells one person from another, so two people wearing
 * it is not a cosmetic slip: the quartermaster and the priest become the same
 * person at a glance, and no amount of prose undoes that. The DM cannot hold the
 * whole assigned set in its head across three hours, which is exactly the kind
 * of thing that belongs here rather than in the prompt.
 *
 * Two deliberate exceptions, both because sharing is the point:
 *
 * - The hood is what an unseen figure looks like. Three of them at once is three
 *   people the player has not seen yet, not a mistake.
 * - The bestiary is a species, not a portrait. Ten goblins should look like
 *   goblins; giving the tenth a different face would be the bug.
 *
 * `except` is the creature being written to, so re-saving someone's own face is
 * not a collision with themselves.
 */
export function portraitHolder(
  cast: readonly Creature[],
  portrait: string,
  except: string,
): Creature | null {
  if (portrait === UNKNOWN_PORTRAIT) return null
  if (Object.prototype.hasOwnProperty.call(BESTIARY, portrait)) return null

  return cast.find((who) => who.id !== except && who.profile.portrait === portrait) ?? null
}

/**
 * Throws if someone else is already wearing this face.
 *
 * Names them, because "taken" alone leaves the DM guessing which of a cast of
 * twenty it collided with, and the useful next move is to pick a different one.
 */
export function assertPortraitFree(
  cast: readonly Creature[],
  portrait: string | null | undefined,
  except: string,
): void {
  if (portrait === null || portrait === undefined || portrait === '') return

  const held = portraitHolder(cast, portrait, except)
  if (held !== null) {
    throw new RulesError(
      `${portrait} is already ${held.name}'s face. Pick another from get_portraits, ` +
        `or leave portrait unset — two people with one face is two people the player cannot tell apart.`,
    )
  }
}

/** What the player has actually learned. */
export function knownNotes(creature: Creature): readonly ProfileNote[] {
  return creature.profile.notes.filter((note) => note.revealed)
}

/**
 * The creature as the browser is allowed to see it.
 *
 * Applied at the server, not in the UI: what is stripped here never crosses the
 * wire, so no rendering bug can leak a secret and nothing shows up in the
 * browser's devtools either. Note that the count of hidden notes goes too —
 * "Sister Veyl · 2 secrets" tells the player exactly where to dig.
 */
export function redactCreature(creature: Creature): Creature {
  return {
    ...creature,
    profile: {
      ...creature.profile,
      principal: false,
      want: null,
      notes: knownNotes(creature),
    },
  }
}
