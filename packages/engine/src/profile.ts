/**
 * Who someone is, kept where it cannot drift.
 *
 * A DM asked to remember that the quartermaster is a dwarf who speaks without
 * contractions will get it right twice and then quietly get it wrong, and after
 * a `/clear` she never existed at all. So the profile is state, and the only
 * question the engine answers about it is what the player is allowed to see.
 */
import { pronounsForPortrait } from '@dnd/content'
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
