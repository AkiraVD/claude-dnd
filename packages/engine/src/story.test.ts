import { describe, expect, it } from 'vitest'
import { RulesError } from './errors.js'
import {
  abandonBeat,
  addBeat,
  amendStory,
  beatsAhead,
  createStory,
  reachBeat,
  redactStory,
  revealBeat,
  type Story,
} from './story.js'

const backbone = (): Story =>
  createStory({
    premise: 'The Stonehollow tithe has not arrived in three seasons.',
    question: 'Who is eating the town’s silver, and what for?',
    truth: 'The Tallow Man is rendering it into something that has to be poured, not struck.',
    beats: [
      { text: 'The ledger does not add up.', revealed: true },
      'The chapel has a second cellar, reached through the ossuary.',
      'Burn the workshop, or take it.',
    ],
  }).story

describe('createStory', () => {
  it('writes the backbone down', () => {
    const { story, events } = createStory({ premise: 'A town is starving.', question: 'Why?' })

    expect(story.premise).toBe('A town is starving.')
    expect(story.beats).toEqual([])
    expect(events).toEqual([{ t: 'story', op: 'set', summary: 'A town is starving.' }])
  })

  it('insists on a premise and a question', () => {
    expect(() => createStory({ premise: '  ', question: 'Why?' })).toThrow(RulesError)
    expect(() => createStory({ premise: 'A town.', question: '' })).toThrow(/question/)
  })

  it('starts every beat ahead and hidden unless told otherwise', () => {
    expect(backbone().beats).toEqual([
      { text: 'The ledger does not add up.', state: 'ahead', revealed: true },
      {
        text: 'The chapel has a second cellar, reached through the ossuary.',
        state: 'ahead',
        revealed: false,
      },
      { text: 'Burn the workshop, or take it.', state: 'ahead', revealed: false },
    ])
  })
})

describe('amending', () => {
  it('rewrites the premise without touching the beats', () => {
    const { story } = amendStory(backbone(), { premise: 'The tithe is arriving, and it is wrong.' })

    expect(story.premise).toBe('The tithe is arriving, and it is wrong.')
    expect(story.beats).toHaveLength(3)
  })

  it('adds a beat the story grew', () => {
    const { story } = addBeat(backbone(), 'Kell finally writes back.')

    expect(story.beats).toHaveLength(4)
    expect(story.beats.at(-1)).toMatchObject({ text: 'Kell finally writes back.', state: 'ahead' })
  })

  it('refuses to write the same beat twice', () => {
    expect(() => addBeat(backbone(), 'Burn the workshop, or take it.')).toThrow(/already written/)
  })
})

describe('beats happening, or not', () => {
  it('reaching one reveals it — the player was there', () => {
    const { story, events } = reachBeat(backbone(), 'second cellar')
    const beat = story.beats[1]!

    expect(beat.state).toBe('reached')
    expect(beat.revealed).toBe(true)
    expect(events).toContainEqual({
      t: 'reveal',
      target: null,
      note: 'The chapel has a second cellar, reached through the ossuary.',
    })
  })

  it('does not re-announce a beat the player already knew', () => {
    const { events } = reachBeat(backbone(), 'ledger')

    expect(events.filter((e) => e.t === 'reveal')).toEqual([])
  })

  it('keeps an abandoned beat instead of deleting it', () => {
    const { story } = abandonBeat(backbone(), 'ossuary')

    expect(story.beats).toHaveLength(3)
    expect(story.beats[1]!.state).toBe('abandoned')
    // The ledger beat is revealed but has not happened, so it is still ahead:
    // knowing a beat is coming is not the same as having reached it.
    expect(beatsAhead(story).map((b) => b.text)).toEqual([
      'The ledger does not add up.',
      'Burn the workshop, or take it.',
    ])
  })

  it('can reveal a beat the player heard about but has not reached', () => {
    const { story } = revealBeat(backbone(), 'ossuary')

    expect(story.beats[1]).toMatchObject({ state: 'ahead', revealed: true })
  })

  it('refuses an ambiguous beat rather than advancing the wrong one', () => {
    const story = addBeat(backbone(), 'The workshop is already empty.').story

    expect(() => reachBeat(story, 'workshop')).toThrow(/matches 2 beats/)
  })

  it('lists the beats when nothing matches', () => {
    expect(() => reachBeat(backbone(), 'a dragon')).toThrow(/no beat matches "a dragon"/)
  })

  it('will not reveal what is already revealed', () => {
    expect(() => revealBeat(backbone(), 'ledger')).toThrow(/already known/)
  })
})

describe('redactStory', () => {
  it('sends the premise and question but never the truth', () => {
    const seen = redactStory(backbone())

    expect(seen.premise).toBe('The Stonehollow tithe has not arrived in three seasons.')
    expect(seen.question).toBe('Who is eating the town’s silver, and what for?')
    expect(seen.truth).toBe('')
  })

  it('sends only the beats that have come out', () => {
    const seen = redactStory(backbone())

    expect(seen.beats.map((b) => b.text)).toEqual(['The ledger does not add up.'])
  })

  it('leaves nothing to count the hidden beats by', () => {
    const json = JSON.stringify(redactStory(backbone()))

    expect(json).not.toMatch(/ossuary|Tallow|workshop/)
  })

  it('grows as the story is played', () => {
    const played = reachBeat(backbone(), 'ossuary').story

    expect(redactStory(played).beats).toHaveLength(2)
  })
})
