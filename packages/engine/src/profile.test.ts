import { describe, expect, it } from 'vitest'
import { COMMONER, createCreature, restoreCreature, type Creature } from './character.js'
import { RulesError } from './errors.js'
import {
  addNote,
  assertPortraitFree,
  portraitHolder,
  knownNotes,
  redactCreature,
  revealNote,
  setAttitude,
  setPresence,
  updateProfile,
} from './profile.js'

const npc = (overrides: Partial<Parameters<typeof createCreature>[0]> = {}): Creature =>
  createCreature({
    id: 'veyl',
    name: 'Sister Veyl',
    scores: COMMONER.scores,
    maxHp: COMMONER.maxHp,
    ac: COMMONER.ac,
    ...overrides,
  })

describe('createCreature', () => {
  it('gives everyone an empty profile rather than no profile', () => {
    expect(npc().profile).toEqual({
      race: null,
      pronouns: null,
      role: null,
      appearance: null,
      manner: null,
      location: null,
      attitude: null,
      principal: false,
      want: null,
      portrait: null,
      notes: [],
    })
    expect(npc().purse).toBe(0)
    expect(npc().items).toEqual([])
    expect(npc().presence).toBe('present')
  })

  it('takes a profile and a purse up front', () => {
    const veyl = npc({
      purse: '3 gp',
      profile: { race: 'human', role: 'priest of the Hollow', attitude: 'indifferent' },
    })

    expect(veyl.purse).toBe(300)
    expect(veyl.profile.race).toBe('human')
    expect(veyl.profile.principal).toBe(false)
  })
})

describe('updateProfile', () => {
  it('patches without wiping what it was not told about', () => {
    const before = npc({ profile: { race: 'human', manner: 'never finishes a sentence' } })
    const { creature } = updateProfile(before, { location: 'the chapel steps' })

    expect(creature.profile.race).toBe('human')
    expect(creature.profile.location).toBe('the chapel steps')
  })

  it('logs an attitude change and nothing else', () => {
    const before = npc({ profile: { attitude: 'indifferent' } })

    expect(updateProfile(before, { appearance: 'ash on both sleeves' }).events).toEqual([])
    expect(setAttitude(before, 'friendly').events).toEqual([
      { t: 'attitude', target: 'veyl', attitude: 'friendly' },
    ])
  })

  it('stays quiet when the attitude is set to what it already was', () => {
    const before = npc({ profile: { attitude: 'friendly' } })

    expect(setAttitude(before, 'friendly').events).toEqual([])
  })
})

describe('presence', () => {
  it('moves someone off screen without forgetting them', () => {
    const { creature, events } = setPresence(npc(), 'offscreen')

    expect(creature.presence).toBe('offscreen')
    expect(creature.name).toBe('Sister Veyl')
    expect(events).toEqual([{ t: 'presence', target: 'veyl', presence: 'offscreen' }])
  })

  it('says nothing when nothing moved', () => {
    expect(setPresence(npc(), 'present').events).toEqual([])
  })
})

describe('notes', () => {
  it('writes notes down hidden by default', () => {
    const { creature, events } = addNote(npc(), 'She recognised the child in the locket.')

    expect(creature.profile.notes).toEqual([
      { text: 'She recognised the child in the locket.', revealed: false },
    ])
    expect(events).toEqual([])
    expect(knownNotes(creature)).toEqual([])
  })

  it('can write one down already known, and logs that', () => {
    const { creature, events } = addNote(npc(), 'Turned the locket over twice.', true)

    expect(knownNotes(creature)).toHaveLength(1)
    expect(events).toEqual([
      { t: 'reveal', target: 'veyl', note: 'Turned the locket over twice.' },
    ])
  })

  it('refuses the same note twice', () => {
    const once = addNote(npc(), 'Wants the workshop burned.').creature

    expect(() => addNote(once, 'Wants the workshop burned.')).toThrow(/already has that note/)
  })

  it('reveals by any distinctive part of the text', () => {
    let veyl = addNote(npc(), 'She recognised the child in the locket. It is her sister.').creature
    veyl = addNote(veyl, 'Wants the workshop burned before anyone reads the ledger.').creature

    const { creature, events } = revealNote(veyl, 'her sister')

    expect(knownNotes(creature).map((n) => n.text)).toEqual([
      'She recognised the child in the locket. It is her sister.',
    ])
    expect(events[0]).toMatchObject({ t: 'reveal', target: 'veyl' })
  })

  it('refuses an ambiguous match rather than guessing which secret to spill', () => {
    let veyl = addNote(npc(), 'Knows about the locket.').creature
    veyl = addNote(veyl, 'Lied about the locket.').creature

    expect(() => revealNote(veyl, 'locket')).toThrow(/matches 2 hidden notes/)
    expect(knownNotes(veyl)).toEqual([])
  })

  it('lists what is hidden when nothing matches, since the DM may read it', () => {
    const veyl = addNote(npc(), 'Lied about the locket.').creature

    expect(() => revealNote(veyl, 'the ledger')).toThrow(/Hidden: "Lied about the locket."/)
    expect(() => revealNote(npc(), 'anything')).toThrow(/nothing left hidden/)
  })

  it('will not reveal the same note twice', () => {
    const veyl = addNote(npc(), 'Lied about the locket.', true).creature

    expect(() => revealNote(veyl, 'locket')).toThrow(RulesError)
  })
})

describe('redactCreature', () => {
  it('drops everything the player has not earned', () => {
    let veyl = npc({
      profile: {
        race: 'human',
        role: 'priest of the Hollow',
        attitude: 'indifferent',
        principal: true,
        want: 'the workshop burned before anyone reads the ledger',
      },
    })
    veyl = addNote(veyl, 'Turned the locket over twice.', true).creature
    veyl = addNote(veyl, 'It is her sister in the locket.').creature

    const seen = redactCreature(veyl)

    expect(seen.profile.want).toBeNull()
    expect(seen.profile.principal).toBe(false)
    expect(seen.profile.notes).toEqual([{ text: 'Turned the locket over twice.', revealed: true }])
  })

  it('keeps the portrait, which is not a secret', () => {
    const seen = redactCreature(npc({ profile: { portrait: 'dwarf-innkeeper-grey' } }))

    expect(seen.profile.portrait).toBe('dwarf-innkeeper-grey')
  })

  it('keeps what is plainly visible about them', () => {
    const seen = redactCreature(npc({ profile: { race: 'human', attitude: 'friendly' } }))

    expect(seen.profile.race).toBe('human')
    expect(seen.profile.attitude).toBe('friendly')
    expect(seen.name).toBe('Sister Veyl')
  })

  it('leaves no way to count what is hidden', () => {
    let veyl = npc()
    veyl = addNote(veyl, 'one').creature
    veyl = addNote(veyl, 'two').creature
    veyl = addNote(veyl, 'three').creature

    expect(JSON.stringify(redactCreature(veyl))).not.toMatch(/one|two|three/)
    expect(redactCreature(veyl).profile.notes).toHaveLength(0)
  })
})

describe('restoreCreature', () => {
  it('fills in fields a snapshot written before them does not have', () => {
    // Exactly what a campaign saved before purses and profiles deserialises to.
    const old = JSON.parse(
      JSON.stringify({ ...npc(), purse: undefined, items: undefined, profile: undefined, presence: undefined }),
    ) as Creature

    const restored = restoreCreature(old)

    expect(restored.purse).toBe(0)
    expect(restored.items).toEqual([])
    expect(restored.presence).toBe('present')
    expect(restored.profile.notes).toEqual([])
    expect(restored.name).toBe('Sister Veyl')
  })

  it('leaves a current creature alone', () => {
    const current = addNote(npc({ purse: 500 }), 'a note', true).creature

    expect(restoreCreature(current)).toEqual(current)
  })
})

describe('pronouns from the portrait', () => {
  const someone = (over: Partial<Parameters<typeof createCreature>[0]> = {}): Creature =>
    createCreature({ id: 'n', name: 'Someone', kind: 'npc', ...COMMONER, ...over })

  it('fills them from the face when nothing has been said', () => {
    // dwarf-smith-broad is "Broad man, soot-streaked beard". A name that reads
    // female to an English speaker plus that picture is a contradiction the DM
    // has to resolve in its first sentence, and in a language that marks gender
    // on the verb it cannot duck it.
    const out = updateProfile(someone(), { portrait: 'dwarf-smith-broad' })

    expect(out.creature.profile.pronouns).toBe('he/him')
  })

  it('never overwrites pronouns that were given', () => {
    const out = updateProfile(someone(), {
      portrait: 'dwarf-smith-broad',
      pronouns: 'they/them',
    })

    expect(out.creature.profile.pronouns).toBe('they/them')
  })

  it('leaves them alone once set, even on a later portrait change', () => {
    const first = updateProfile(someone(), { pronouns: 'she/her' }).creature
    const out = updateProfile(first, { portrait: 'dwarf-smith-broad' })

    expect(out.creature.profile.pronouns).toBe('she/her')
  })

  it('says nothing for a portrait that commits to nothing', () => {
    // The hood is faceless on purpose, so it stays the example. The dragonborn
    // were here too until they were judged by eye and turned out to say plenty.
    expect(updateProfile(someone(), { portrait: 'unknown-figure-hooded' })
      .creature.profile.pronouns).toBeNull()
  })

  it('fills an existing creature the next time it is touched', () => {
    // The retroactive half: a creature saved before any of this gets its
    // pronouns the next time the DM updates it, rather than on load.
    const old = updateProfile(someone(), { portrait: 'human-merchant-stout' }).creature
    const stripped: Creature = { ...old, profile: { ...old.profile, pronouns: null } }

    expect(updateProfile(stripped, { role: 'fence' }).creature.profile.pronouns).toBe('she/her')
  })
})

describe('one face, one person', () => {
  const someone = (id: string, name: string, portrait: string | null): Creature =>
    createCreature({
      id,
      name,
      kind: 'npc',
      ...COMMONER,
      ...(portrait === null ? {} : { profile: { portrait } }),
    })

  const cast = [
    someone('brann', 'Brann', 'dwarf-smith-broad'),
    someone('veyl', 'Sister Veyl', 'human-merchant-stout'),
    someone('nobody', 'A figure', null),
  ]

  it('finds who is already wearing a face', () => {
    expect(portraitHolder(cast, 'dwarf-smith-broad', 'veyl')?.name).toBe('Brann')
    expect(portraitHolder(cast, 'elf-archivist-silver', 'veyl')).toBeNull()
  })

  it('does not collide someone with themselves', () => {
    // Re-saving a profile sends the portrait back unchanged, every time.
    expect(portraitHolder(cast, 'dwarf-smith-broad', 'brann')).toBeNull()
    expect(() => assertPortraitFree(cast, 'dwarf-smith-broad', 'brann')).not.toThrow()
  })

  it('refuses a face someone else has, and says whose it is', () => {
    // Naming them is the point: "taken" alone leaves the DM guessing which of a
    // cast of twenty it collided with.
    expect(() => assertPortraitFree(cast, 'dwarf-smith-broad', 'veyl')).toThrow(/Brann/)
    expect(() => assertPortraitFree(cast, 'dwarf-smith-broad', 'veyl')).toThrow(RulesError)
  })

  it('lets any number of figures wear the hood', () => {
    // It is what an unseen figure looks like. Three at once is three people the
    // player has not seen yet, not a mistake.
    const hooded = [...cast, someone('a', 'A shape', 'unknown-figure-hooded')]

    expect(portraitHolder(hooded, 'unknown-figure-hooded', 'b')).toBeNull()
    expect(() => assertPortraitFree(hooded, 'unknown-figure-hooded', 'b')).not.toThrow()
  })

  it('lets ten goblins look like goblins', () => {
    // The bestiary is a species, not a portrait. Giving the tenth goblin a
    // different face would be the bug.
    const horde = [...cast, someone('g1', 'Goblin', 'goblin')]

    expect(portraitHolder(horde, 'goblin', 'g2')).toBeNull()
    expect(() => assertPortraitFree(horde, 'goblin', 'g2')).not.toThrow()
  })

  it('has nothing to say about no portrait at all', () => {
    for (const nothing of [null, undefined, '']) {
      expect(() => assertPortraitFree(cast, nothing, 'veyl')).not.toThrow()
    }
  })
})
