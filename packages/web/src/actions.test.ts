import { describe, expect, it } from 'vitest'
import {
  actionSheet,
  composeAction,
  defaultActor,
  defaultLevel,
  isReady,
  spellLevelLabel,
  spellsForLevel,
  stanceOf,
} from './actions.js'
import type { TableState } from '@dnd/server/protocol.js'

/**
 * The modal exists to hand the DM the exact name of a thing the engine already
 * knows about. A weapon called for as "net" when the sheet says "weighted net"
 * cost a turn in the bench session, and the player typing it by hand is where
 * that came from. So what matters here is that the names come off the sheet
 * unaltered and the sentence reads like something a person would send.
 */

const vessa = {
  id: 'vessa',
  name: 'Vessa Antrim',
  kind: 'pc',
  hp: { current: 19, max: 28, temp: 0 },
  presence: 'present',
  attacks: [
    {
      name: 'longbow',
      ability: 'dex',
      damage: '1d8',
      damageType: 'piercing',
      range: 'ranged',
      notes: 'range 150/600',
    },
    { name: 'shortsword', ability: 'dex', damage: '1d6', damageType: 'piercing' },
  ],
  items: [],
  spells: [],
  resources: [
    { name: 'hit-dice', label: 'Hit dice (d10)', max: 3, current: 3, recharge: 'long-rest' },
    { name: 'spell-slot-2', label: '2nd-level slots', max: 2, current: 0, recharge: 'long-rest' },
    { name: 'spell-slot-1', label: '1st-level slots', max: 3, current: 3, recharge: 'long-rest' },
  ],
}

const vreeke = {
  id: 'vreeke',
  name: 'Tolm Vreeke',
  kind: 'npc',
  hp: { current: 6, max: 16, temp: 0 },
  presence: 'present',
  attacks: [],
  items: [],
  spells: [],
  resources: [],
}

const ghost = {
  id: 'ghost',
  name: 'Someone Elsewhere',
  kind: 'npc',
  hp: { current: 4, max: 4, temp: 0 },
  presence: 'offscreen',
  attacks: [],
  resources: [],
}

const state = {
  creatures: [vessa, vreeke, ghost],
  events: [],
  combat: {
    active: true,
    round: 3,
    turnIndex: 0,
    order: [
      { id: 'vessa', name: 'Vessa Antrim', initiative: 23, dexMod: 3 },
      { id: 'vreeke', name: 'Tolm Vreeke', initiative: 19, dexMod: 2 },
    ],
  },
} as unknown as TableState

describe('the action sheet', () => {
  it('reads the weapons straight off the sheet', () => {
    const sheet = actionSheet(state, 'vessa')!
    expect(sheet.attacks.map((a) => a.name)).toEqual(['longbow', 'shortsword'])
    expect(sheet.attacks[0]).toMatchObject({
      damage: '1d8',
      damageType: 'piercing',
      range: 'ranged',
      notes: 'range 150/600',
    })
    // A weapon with no declared range is a melee weapon.
    expect(sheet.attacks[1]!.range).toBe('melee')
    expect(sheet.attacks[1]!.notes).toBeNull()
  })

  it('lists spell slots lowest first and leaves other resources alone', () => {
    const sheet = actionSheet(state, 'vessa')!
    expect(sheet.slots.map((s) => s.level)).toEqual([1, 2])
    expect(sheet.slots[0]).toMatchObject({ level: 1, current: 3, max: 3 })
    // An exhausted level still shows, because "none left" is worth seeing.
    expect(sheet.slots[1]).toMatchObject({ level: 2, current: 0, max: 2 })
    expect(sheet.slots.some((s) => s.label.includes('Hit dice'))).toBe(false)
  })

  it('does not offer you as your own target, nor anyone offscreen', () => {
    const sheet = actionSheet(state, 'vessa')!
    expect(sheet.targets.map((t) => t.id)).toEqual(['vreeke'])
    expect(sheet.targets[0]).toMatchObject({ name: 'Tolm Vreeke', hp: '6/16' })
  })

  it('knows whose turn it is', () => {
    expect(actionSheet(state, 'vessa')!.yourTurn).toBe(true)
    expect(actionSheet(state, 'vessa')!.round).toBe(3)
    const later = { ...state, combat: { ...state.combat!, turnIndex: 1 } } as TableState
    expect(actionSheet(later, 'vessa')!.yourTurn).toBe(false)
    expect(actionSheet(later, 'vreeke')!.targets[0]!.acting).toBe(false)
  })

  it('works outside a fight', () => {
    const quiet = { ...state, combat: null } as TableState
    const sheet = actionSheet(quiet, 'vessa')!
    expect(sheet.round).toBeNull()
    expect(sheet.yourTurn).toBe(false)
    expect(sheet.targets.map((t) => t.id)).toEqual(['vreeke'])
  })

  it('returns nothing for a creature that is not there', () => {
    expect(actionSheet(state, 'nobody')).toBeNull()
    expect(actionSheet(null, 'vessa')).toBeNull()
  })

  it('speaks for the player character by default', () => {
    expect(defaultActor(state)!.id).toBe('vessa')
    expect(defaultActor(null)).toBeNull()
  })
})

describe('the sentence it composes', () => {
  it('names the weapon and the target exactly', () => {
    expect(
      composeAction({ kind: 'attack', weapon: 'weighted net', target: 'Tolm Vreeke', lethal: true }),
    ).toBe('I attack Tolm Vreeke with my weighted net.')
  })

  it('says so when the blow is pulled', () => {
    expect(
      composeAction({ kind: 'attack', weapon: 'longbow', target: 'Tolm Vreeke', lethal: false }),
    ).toBe(
      'I attack Tolm Vreeke with my longbow. Pull the blow — knock them out rather than kill.',
    )
  })

  it('reads properly with no target chosen', () => {
    expect(composeAction({ kind: 'attack', weapon: 'longbow', target: null, lethal: true })).toBe(
      'I attack with my longbow.',
    )
  })

  it('casts at a level, and knows a cantrip spends nothing', () => {
    expect(
      composeAction({ kind: 'spell', spell: "Hunter's Mark", level: 1, target: 'Tolm Vreeke' }),
    ).toBe("I cast Hunter's Mark on Tolm Vreeke, 1st level.")
    expect(composeAction({ kind: 'spell', spell: 'Fire Bolt', level: 0, target: null })).toBe(
      'I cast Fire Bolt as a cantrip.',
    )
  })

  it('passes a creative action through as written', () => {
    expect(composeAction({ kind: 'custom', text: '  I kick the bench into his knees.  ' })).toBe(
      'I kick the bench into his knees.',
    )
  })

  it('never emits a double space or a stray comma', () => {
    const drafts = [
      { kind: 'attack', weapon: 'longbow', target: null, lethal: true },
      { kind: 'attack', weapon: 'longbow', target: 'Sabat', lethal: false },
      { kind: 'spell', spell: 'Cure Wounds', level: 0, target: null },
      { kind: 'spell', spell: 'Cure Wounds', level: 3, target: 'Vessa' },
    ] as const
    for (const draft of drafts) {
      const line = composeAction(draft)
      expect(line, line).not.toMatch(/ {2}/)
      expect(line, line).not.toMatch(/[ ,]\./)
    }
  })
})

describe('readiness', () => {
  it('needs a weapon, a spell name, or some text', () => {
    expect(isReady(null)).toBe(false)
    expect(isReady({ kind: 'attack', weapon: '', target: 'x', lethal: true })).toBe(false)
    expect(isReady({ kind: 'attack', weapon: 'longbow', target: null, lethal: true })).toBe(true)
    expect(isReady({ kind: 'spell', spell: '   ', level: 1, target: null })).toBe(false)
    expect(isReady({ kind: 'custom', text: '  ' })).toBe(false)
    expect(isReady({ kind: 'custom', text: 'I run' })).toBe(true)
  })
})

describe('spell level labels', () => {
  it('reads the way a player says it', () => {
    expect([0, 1, 2, 3, 4, 9].map(spellLevelLabel)).toEqual([
      'cantrip',
      '1st',
      '2nd',
      '3rd',
      '4th',
      '9th',
    ])
  })
})

describe('nothing is chosen for you', () => {
  it('composes without a target until one is picked', () => {
    // The modal starts with no target, so the sentence has to read correctly
    // without one rather than relying on a default nobody asked for.
    expect(composeAction({ kind: 'attack', weapon: 'shortsword', target: null, lethal: false })).toBe(
      'I attack with my shortsword. Pull the blow — knock them out rather than kill.',
    )
    expect(isReady({ kind: 'attack', weapon: 'shortsword', target: null, lethal: true })).toBe(true)
  })
})

describe('spells and items come off the table, not out of thin air', () => {
  const cast = (caster: string, spell: string, level: number) =>
    ({ t: 'spell', caster, spell, level, slotLevel: level }) as const

  const withEvents = (events: unknown[]) =>
    ({ ...state, events } as unknown as TableState)

  it('lists the spells this character has actually cast', () => {
    const sheet = actionSheet(
      withEvents([cast('vessa', "Hunter's Mark", 1), cast('vessa', 'Cure Wounds', 1)]),
      'vessa',
    )!
    expect(sheet.spells.map((s) => s.name)).toEqual(['Cure Wounds', "Hunter's Mark"])
  })

  it('does not offer somebody else’s spells', () => {
    const sheet = actionSheet(withEvents([cast('vreeke', 'Shield', 1)]), 'vessa')!
    expect(sheet.spells).toEqual([])
  })

  it('remembers a spell once, at the level it was last cast', () => {
    const sheet = actionSheet(
      withEvents([cast('vessa', 'Cure Wounds', 1), cast('vessa', 'Cure Wounds', 3)]),
      'vessa',
    )!
    expect(sheet.spells).toEqual([{ name: 'Cure Wounds', level: 3, effect: null }])
  })

  it('carries the pack through for using an item', () => {
    const packed = {
      ...state,
      creatures: [{ ...vessa, items: [{ name: 'Potion of healing', qty: 2 }] }, vreeke],
    } as unknown as TableState
    const sheet = actionSheet(packed, 'vessa')!
    expect(sheet.items).toEqual([{ name: 'Potion of healing', qty: 2 }])
  })

  it('composes using an item, with and without a target', () => {
    expect(composeAction({ kind: 'item', item: 'Potion of healing', target: null })).toBe(
      'I use my Potion of healing.',
    )
    expect(composeAction({ kind: 'item', item: 'Rope, hempen (50 ft)', target: 'Tolm Vreeke' })).toBe(
      'I use my Rope, hempen (50 ft) on Tolm Vreeke.',
    )
    expect(isReady({ kind: 'item', item: '', target: null })).toBe(false)
    expect(isReady({ kind: 'item', item: 'Arrows (20)', target: null })).toBe(true)
  })
})

describe('the level chooses the list', () => {
  const spells = [
    { name: 'Fire Bolt', level: 0, effect: null },
    { name: "Hunter's Mark", level: 1, effect: null },
    { name: 'Cure Wounds', level: 1, effect: null },
    { name: 'Spike Growth', level: 2, effect: null },
    { name: 'Conjure Animals', level: 3, effect: null },
  ]

  it('offers a spell at its own level and above, because upcasting is a thing', () => {
    expect(spellsForLevel(spells, 2).map((s) => s.name)).toEqual([
      "Hunter's Mark",
      'Cure Wounds',
      'Spike Growth',
    ])
  })

  it('never offers a spell above the slot you picked', () => {
    expect(spellsForLevel(spells, 1).map((s) => s.name)).toEqual(["Hunter's Mark", 'Cure Wounds'])
  })

  it('keeps cantrips to themselves', () => {
    expect(spellsForLevel(spells, 0).map((s) => s.name)).toEqual(['Fire Bolt'])
    expect(spellsForLevel(spells, 3).some((s) => s.level === 0)).toBe(false)
  })

  it('opens on the lowest level that still has a slot', () => {
    expect(defaultLevel([{ level: 1, label: '', current: 0, max: 3 }, { level: 2, label: '', current: 1, max: 2 }])).toBe(2)
    expect(defaultLevel([{ level: 1, label: '', current: 2, max: 3 }])).toBe(1)
    // Nothing left anywhere, so cantrips are all that is castable.
    expect(defaultLevel([{ level: 1, label: '', current: 0, max: 3 }])).toBe(0)
    expect(defaultLevel([])).toBe(0)
  })
})

describe('a fighter is not offered spells', () => {
  const noCaster = (over: Record<string, unknown> = {}) =>
    ({
      ...state,
      creatures: [{ ...vessa, resources: [{ name: 'hit-dice', label: 'Hit dice (d10)', max: 5, current: 5, recharge: 'long-rest' }] }, vreeke],
      ...over,
    }) as unknown as TableState

  it('hides the whole cast section for a class with no slots', () => {
    const sheet = actionSheet(noCaster(), 'vessa')!
    expect(sheet.slots).toEqual([])
    expect(sheet.spells).toEqual([])
    expect(sheet.canCast).toBe(false)
  })

  it('still shows their weapons and pack', () => {
    const sheet = actionSheet(noCaster(), 'vessa')!
    expect(sheet.attacks.map((a) => a.name)).toEqual(['longbow', 'shortsword'])
  })

  it('shows the section for anyone who has slots', () => {
    expect(actionSheet(state, 'vessa')!.canCast).toBe(true)
  })

  it('shows it for a slotless caster who has cast a cantrip', () => {
    // No slots, but a cantrip on the journal: they can clearly cast something.
    const sheet = actionSheet(
      noCaster({ events: [{ t: 'spell', caster: 'vessa', spell: 'Fire Bolt', level: 0, slotLevel: null }] }),
      'vessa',
    )!
    expect(sheet.canCast).toBe(true)
    expect(sheet.spells).toEqual([{ name: 'Fire Bolt', level: 0, effect: null }])
  })
})

describe('slots that did not come from a class', () => {
  /**
   * The engine gates casting on a `spell-slot-N` resource, not on the class, so
   * a ring, a boon or a subclass picked up at level 3 all work the same way:
   * the DM grants the resource and the creature can cast. Verified live against
   * a classless commoner handed a ring — the slot spent and the cast landed.
   * The panel has to follow the same rule, or the UI would quietly disagree
   * with the engine about who can cast.
   */
  const ringBearer = {
    ...vessa,
    id: 'corvin',
    name: 'Corvin Hask',
    className: null,
    resources: [
      { name: 'spell-slot-1', label: 'Ring of the Borrowed Word', max: 2, current: 1, recharge: 'dawn' },
    ],
  }

  const withRing = (events: unknown[] = []) =>
    ({ ...state, creatures: [ringBearer, vreeke], events }) as unknown as TableState

  it('offers the slot however the creature came by it', () => {
    const sheet = actionSheet(withRing(), 'corvin')!
    expect(sheet.canCast).toBe(true)
    expect(sheet.slots).toEqual([
      { level: 1, label: 'Ring of the Borrowed Word', current: 1, max: 2 },
    ])
    // The label is the ring's, not a class's, and it is shown as given.
    expect(sheet.slots[0]!.label).toBe('Ring of the Borrowed Word')
  })

  it('opens on that level and lists what was cast with it', () => {
    const sheet = actionSheet(
      withRing([{ t: 'spell', caster: 'corvin', spell: 'Charm Person', level: 1, slotLevel: 1 }]),
      'corvin',
    )!
    expect(defaultLevel(sheet.slots)).toBe(1)
    expect(spellsForLevel(sheet.spells, 1).map((s) => s.name)).toEqual(['Charm Person'])
  })

  it('closes the door again once the charges are gone', () => {
    const spent = {
      ...ringBearer,
      resources: [{ name: 'spell-slot-1', label: 'Ring of the Borrowed Word', max: 2, current: 0, recharge: 'dawn' }],
    }
    const sheet = actionSheet(
      { ...state, creatures: [spent, vreeke], events: [] } as unknown as TableState,
      'corvin',
    )!
    // The level still shows, because "none left" is worth seeing, but there is
    // nothing to open on and cantrips are all that remain.
    expect(sheet.slots[0]!.current).toBe(0)
    expect(defaultLevel(sheet.slots)).toBe(0)
  })
})

describe('telling friend from foe', () => {
  it('reads the attitude the DM has been keeping', () => {
    expect(stanceOf('npc', 'hostile')).toBe('hostile')
    expect(stanceOf('npc', 'unfriendly')).toBe('hostile')
    expect(stanceOf('npc', 'friendly')).toBe('friendly')
    expect(stanceOf('npc', 'helpful')).toBe('friendly')
  })

  it('leaves anyone it cannot place alone', () => {
    // Uncoloured is the honest answer for the quartermaster who has not picked
    // a side; guessing would be worse than saying nothing.
    expect(stanceOf('npc', 'indifferent')).toBe('neutral')
    expect(stanceOf('npc', null)).toBe('neutral')
    expect(stanceOf('npc', undefined)).toBe('neutral')
    expect(stanceOf('npc', 'nonsense')).toBe('neutral')
  })

  it('counts another player character as an ally', () => {
    expect(stanceOf('pc', null)).toBe('friendly')
    expect(stanceOf('pc', 'hostile')).toBe('friendly')
  })

  it('puts the stance and the word on every target', () => {
    const board = {
      ...state,
      creatures: [
        vessa,
        { ...vreeke, profile: { attitude: 'hostile' } },
        { ...vreeke, id: 'hask', name: 'Corvin Hask', profile: { attitude: 'indifferent' } },
      ],
      events: [],
    } as unknown as TableState
    const sheet = actionSheet(board, 'vessa')!
    expect(sheet.targets.map((t) => [t.name, t.stance, t.attitude])).toEqual([
      ['Tolm Vreeke', 'hostile', 'hostile'],
      ['Corvin Hask', 'neutral', 'indifferent'],
    ])
  })
})

describe('what the DM said the spell does', () => {
  const cast = (spell: string, level: number, effect?: string) =>
    ({ t: 'spell', caster: 'vessa', spell, level, slotLevel: level, ...(effect === undefined ? {} : { effect }) })

  const withEvents = (events: unknown[]) => ({ ...state, events } as unknown as TableState)

  it('carries the DM’s own line through to the sheet', () => {
    const sheet = actionSheet(
      withEvents([cast("Hunter's Mark", 1, 'marks a target: +1d6 from you, concentration')]),
      'vessa',
    )!
    expect(sheet.spells[0]!.effect).toBe('marks a target: +1d6 from you, concentration')
  })

  it('is null until the DM has described it', () => {
    const sheet = actionSheet(withEvents([cast('Cure Wounds', 1)]), 'vessa')!
    expect(sheet.spells[0]!.effect).toBeNull()
  })

  it('does not forget a description because a later cast said nothing', () => {
    // The DM writes the line once; casting it again in a hurry must not wipe it.
    const sheet = actionSheet(
      withEvents([cast('Cure Wounds', 1, 'heals 1d8 + spellcasting modifier, touch'), cast('Cure Wounds', 2)]),
      'vessa',
    )!
    expect(sheet.spells[0]!.effect).toBe('heals 1d8 + spellcasting modifier, touch')
    expect(sheet.spells[0]!.level).toBe(2)
  })

  it('takes the most recent description when the ruling changes', () => {
    const sheet = actionSheet(
      withEvents([cast('Shield', 1, 'old ruling'), cast('Shield', 1, '+5 AC until your next turn, reaction')]),
      'vessa',
    )!
    expect(sheet.spells[0]!.effect).toBe('+5 AC until your next turn, reaction')
  })
})

describe('spells written onto the sheet', () => {
  const caster = (spells: unknown[]) =>
    ({
      ...state,
      creatures: [{ ...vessa, spells }, vreeke],
      events: [],
    }) as unknown as TableState

  it('shows a spell before it has ever been cast', () => {
    // The whole point of writing them down at character creation: the player
    // should not have to cast something blind to find out what it does.
    const sheet = actionSheet(
      caster([{ name: 'Ensnaring Strike', level: 1, effect: 'restrains on a hit, STR save to escape' }]),
      'vessa',
    )!
    expect(sheet.canCast).toBe(true)
    expect(sheet.spells).toEqual([
      { name: 'Ensnaring Strike', level: 1, effect: 'restrains on a hit, STR save to escape' },
    ])
  })

  it('does not list the same spell twice when it is then cast', () => {
    const board = {
      ...state,
      creatures: [{ ...vessa, spells: [{ name: "Hunter's Mark", level: 1, effect: 'marks a target' }] }, vreeke],
      events: [{ t: 'spell', caster: 'vessa', spell: "hunter's mark", level: 1, slotLevel: 1 }],
    } as unknown as TableState
    const sheet = actionSheet(board, 'vessa')!
    expect(sheet.spells).toHaveLength(1)
    // Casting it without a line does not wipe the one from the sheet.
    expect(sheet.spells[0]!.effect).toBe('marks a target')
  })

  it('still shows a spell cast but never written down', () => {
    const board = {
      ...state,
      creatures: [{ ...vessa, spells: [] }, vreeke],
      events: [{ t: 'spell', caster: 'vessa', spell: 'Fog Cloud', level: 1, slotLevel: 1 }],
    } as unknown as TableState
    expect(actionSheet(board, 'vessa')!.spells.map((s) => s.name)).toEqual(['Fog Cloud'])
  })
})
