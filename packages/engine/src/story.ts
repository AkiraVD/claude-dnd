/**
 * The campaign's backbone.
 *
 * Written before the first scene and re-read at the start of every session, so
 * a `/clear` cannot quietly turn one story into a different one. It is a record
 * of what is true, not a script: beats are what happens *if nothing disturbs
 * them*, and a player who walks somewhere else is a reason to rewrite the later
 * ones, never a reason to be steered back.
 */
import { RulesError } from './errors.js'
import type { GameEvent } from './events.js'

export type BeatState = 'ahead' | 'reached' | 'abandoned'

export interface StoryBeat {
  readonly text: string
  readonly state: BeatState
  /** Whether the player has learned this much. */
  readonly revealed: boolean
}

export interface Story {
  /** A sentence or two the player knows from the first scene. Never secret. */
  readonly premise: string
  /** The question the campaign is asking. Never secret. */
  readonly question: string
  /** What is actually going on. The DM's alone, always. */
  readonly truth: string
  readonly beats: readonly StoryBeat[]
}

export interface StoryInput {
  premise: string
  question: string
  truth?: string
  beats?: readonly (string | { text: string; revealed?: boolean })[]
}

export interface StoryOutcome {
  story: Story
  events: GameEvent[]
}

const asBeat = (input: string | { text: string; revealed?: boolean }): StoryBeat => {
  const text = (typeof input === 'string' ? input : input.text).trim()
  if (text === '') throw new RulesError('a beat cannot be empty')
  return {
    text,
    state: 'ahead',
    revealed: typeof input === 'string' ? false : (input.revealed ?? false),
  }
}

export function createStory(input: StoryInput): StoryOutcome {
  const premise = input.premise.trim()
  const question = input.question.trim()

  if (premise === '') throw new RulesError('a campaign needs a premise')
  if (question === '') throw new RulesError('a campaign needs a question under the premise')

  const story: Story = {
    premise,
    question,
    truth: (input.truth ?? '').trim(),
    beats: (input.beats ?? []).map(asBeat),
  }

  return { story, events: [{ t: 'story', op: 'set', summary: premise }] }
}

/**
 * Rewrites the parts that no longer fit. Expected to happen often: the beats
 * are a best guess about a story the player has not walked through yet.
 */
export function amendStory(
  story: Story,
  patch: Partial<Pick<Story, 'premise' | 'question' | 'truth'>>,
): StoryOutcome {
  const next: Story = {
    ...story,
    ...(patch.premise === undefined ? {} : { premise: patch.premise.trim() }),
    ...(patch.question === undefined ? {} : { question: patch.question.trim() }),
    ...(patch.truth === undefined ? {} : { truth: patch.truth.trim() }),
  }

  if (next.premise === '') throw new RulesError('a campaign needs a premise')
  if (next.question === '') throw new RulesError('a campaign needs a question under the premise')

  return { story: next, events: [{ t: 'story', op: 'amend', summary: next.premise }] }
}

export function addBeat(story: Story, text: string, revealed = false): StoryOutcome {
  const beat = asBeat({ text, revealed })
  if (story.beats.some((existing) => existing.text === beat.text)) {
    throw new RulesError('that beat is already written down')
  }

  return {
    story: { ...story, beats: [...story.beats, beat] },
    events: [{ t: 'story', op: 'amend', summary: beat.text }],
  }
}

function findBeat(story: Story, match: string): StoryBeat {
  const needle = match.trim().toLowerCase()
  if (needle === '') throw new RulesError('say which beat')

  const found = story.beats.filter((beat) => beat.text.toLowerCase().includes(needle))
  if (found.length === 0) {
    throw new RulesError(
      `no beat matches "${match}". Written: ${story.beats.map((b) => `"${b.text}"`).join(', ')}`,
    )
  }
  if (found.length > 1) {
    throw new RulesError(
      `"${match}" matches ${found.length} beats: ${found.map((b) => `"${b.text}"`).join(', ')}. Say more.`,
    )
  }
  return found[0]!
}

function replaceBeat(story: Story, target: StoryBeat, next: StoryBeat): Story {
  return { ...story, beats: story.beats.map((beat) => (beat === target ? next : beat)) }
}

/**
 * A beat happened. Reaching one reveals it — the player was there.
 */
export function reachBeat(story: Story, match: string): StoryOutcome {
  const target = findBeat(story, match)
  const next: StoryBeat = { ...target, state: 'reached', revealed: true }

  return {
    story: replaceBeat(story, target, next),
    events: [
      { t: 'story', op: 'amend', summary: target.text },
      ...(target.revealed ? [] : [{ t: 'reveal' as const, target: null, note: target.text }]),
    ],
  }
}

/**
 * The player went somewhere else and this will never happen now. Keeping it as
 * `abandoned` rather than deleting it is deliberate: the DM can see what the
 * story was going to be, which is what makes rewriting the rest coherent.
 */
export function abandonBeat(story: Story, match: string): StoryOutcome {
  const target = findBeat(story, match)

  return {
    story: replaceBeat(story, target, { ...target, state: 'abandoned' }),
    events: [{ t: 'story', op: 'amend', summary: target.text }],
  }
}

/** Marks a beat as something the player now knows without having reached it. */
export function revealBeat(story: Story, match: string): StoryOutcome {
  const target = findBeat(story, match)
  if (target.revealed) throw new RulesError(`that beat is already known: "${target.text}"`)

  return {
    story: replaceBeat(story, target, { ...target, revealed: true }),
    events: [{ t: 'reveal', target: null, note: target.text }],
  }
}

/** What is still ahead, for the DM deciding where to put a hint. */
export function beatsAhead(story: Story): readonly StoryBeat[] {
  return story.beats.filter((beat) => beat.state === 'ahead')
}

/**
 * The story as the browser is allowed to see it: premise, question, and the
 * beats that have come out. The truth never leaves the server, and neither does
 * the number of beats still hidden.
 */
export function redactStory(story: Story): Story {
  return {
    premise: story.premise,
    question: story.question,
    truth: '',
    beats: story.beats.filter((beat) => beat.revealed),
  }
}
