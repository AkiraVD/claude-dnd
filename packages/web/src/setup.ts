/**
 * The opening brief.
 *
 * The setup form runs entirely in the browser — there is no DM yet to ask, so
 * nothing here is a tool call. It composes one ordinary message and sends it the
 * way any other message goes. Kept free of React so the composition can be
 * tested as a function, which is the only part that can quietly go wrong.
 */
import { CLASSES, RACES, raceLabel, type ClassName, type Race } from '@dnd/content'

export interface SetupTab {
  key: string
  label: string
  prompt: string
  /** Label above the free-text box. */
  custom: string
  placeholder: string
  /** Wider cards, for options carrying a sentence. */
  wide?: boolean
  /** A name field above the options. Only the character tab has one. */
  named?: boolean
  options: readonly (readonly [string, string])[]
  /** How the answer reads in the brief. */
  phrase: (value: string) => string
}

const LANGUAGES: readonly (readonly [string, string])[] = [
  ['English', 'english'],
  ['Tiếng Việt', 'vietnamese'],
  ['Español', 'spanish'],
  ['日本語', 'japanese'],
  ['Deutsch', 'german'],
  ['中文', 'chinese'],
]

export const LANGUAGE_OPTIONS = LANGUAGES

const raceOptions = Object.entries(RACES).map(
  ([key, description]) => [raceLabel(key), description] as const,
)

const classOptions = Object.entries(CLASSES).map(
  ([, definition]) =>
    [
      definition.name,
      `d${definition.hitDie} · ${definition.saves.map((s) => s.toUpperCase()).join('/')} saves`,
    ] as const,
)

export const SETUP_TABS: readonly SetupTab[] = [
  {
    key: 'race',
    label: 'Race',
    prompt: 'What are you?',
    custom: 'Or describe your own people',
    placeholder: 'A tiefling raised by dwarves, ashamed of neither…',
    options: raceOptions,
    phrase: (value) => `Race: ${value}`,
  },
  {
    key: 'class',
    label: 'Class',
    prompt: 'How do you solve problems?',
    custom: 'Or something the twelve do not cover',
    placeholder: 'A hedge-witch who learned from a book she should not have…',
    options: classOptions,
    phrase: (value) => `Class: ${value}`,
  },
  {
    key: 'adventure',
    label: 'Adventure',
    prompt: 'What kind of game?',
    custom: 'Or pitch your own',
    placeholder: 'A funeral procession that has to cross a border that closed yesterday…',
    wide: true,
    options: [
      ['Dungeon crawl', 'Rooms, traps, and what lives past the third door'],
      ['Mystery', 'A body, a town, and everyone lying a little'],
      ['Wilderness', 'Distance as the antagonist'],
      ['Intrigue', 'Rooms where the weapons are favours'],
      ['Heist', 'A plan, and the part of it that fails'],
      ['Horror', 'The engine still rolls fair. That is the problem'],
      ['War', 'You are very small and it is very large'],
    ],
    phrase: (value) => `Adventure: ${value}`,
  },
  {
    key: 'difficulty',
    label: 'Difficulty',
    prompt: 'How dangerous should it be?',
    custom: 'Or set your own terms',
    placeholder: 'Deadly, but warn me when I am about to do something stupid…',
    wide: true,
    options: [
      ['Forgiving', 'Setbacks, rarely death. The story keeps going'],
      ['Standard', 'The book as written. A bad night can kill you'],
      ['Hard', 'Resources bite. Retreat is a real move'],
      ['Deadly', 'No pulled punches. Roll a spare character'],
    ],
    phrase: (value) => `Difficulty: ${value}`,
  },
  {
    key: 'tone',
    label: 'Tone',
    prompt: 'How should it feel?',
    custom: 'Or describe the register you want',
    placeholder: 'Funny until it suddenly is not…',
    options: [
      ['Grim', 'A cost on everything'],
      ['Heroic', 'You are meant for this'],
      ['Comic', 'Dignity is the resource'],
      ['Weird', 'The rules of the world are not yours'],
      ['Romantic', 'People, and what they want from you'],
    ],
    phrase: (value) => `Tone: ${value}`,
  },
  {
    key: 'character',
    label: 'Character',
    prompt: 'Who are you, exactly?',
    custom: 'Concept, background, the hook',
    placeholder:
      'Disgraced temple guard. Took the blame for something to protect someone who has not written back…',
    named: true,
    options: [],
    phrase: (value) => value,
  },
]

export interface SetupAnswers {
  language: string
  name: string
  /** Keyed by tab: a chosen preset, or '' when none is picked. */
  picked: Record<string, string>
  /** Keyed by tab: free text, which wins over the preset when filled. */
  custom: Record<string, string>
}

export const EMPTY_ANSWERS: SetupAnswers = { language: '', name: '', picked: {}, custom: {} }

/** What a tab resolves to: the custom text if there is any, else the preset. */
export function answerFor(answers: SetupAnswers, key: string): string {
  const custom = (answers.custom[key] ?? '').trim()
  if (custom !== '') return custom
  return (answers.picked[key] ?? '').trim()
}

export function isAnswered(answers: SetupAnswers, key: string): boolean {
  if (key === 'character') return answers.name.trim() !== '' || answerFor(answers, key) !== ''
  return answerFor(answers, key) !== ''
}

/**
 * Composes the message the form sends.
 *
 * Written as prose rather than a form dump, because the DM reads it as the
 * player's first line and answers it in character. An empty form yields a plain
 * greeting instead of an empty message.
 */
export function composeBrief(answers: SetupAnswers): string {
  const lines: string[] = []
  const language = answers.language.trim()

  if (language !== '') lines.push(`Run the table in ${language}.`)

  const name = answers.name.trim()
  const concept = answerFor(answers, 'character')
  if (name !== '' && concept !== '') lines.push(`I am ${name}. ${concept}`)
  else if (name !== '') lines.push(`I am ${name}.`)
  else if (concept !== '') lines.push(concept)

  const details = SETUP_TABS.filter((tab) => tab.key !== 'character')
    .map((tab) => ({ tab, value: answerFor(answers, tab.key) }))
    .filter(({ value }) => value !== '')
    .map(({ tab, value }) => tab.phrase(value))

  if (details.length > 0) lines.push(details.join('. ') + '.')

  if (lines.length === 0) return "Let's play. Ask me what I want and we'll build it together."

  lines.push('Roll my ability scores and set the scene when you have what you need.')
  return lines.join('\n\n')
}

/** The one-line preview under the form, so nothing is sent unseen. */
export function briefSummary(answers: SetupAnswers): string[] {
  const bits: string[] = []
  if (answers.language.trim() !== '') bits.push(answers.language.trim())
  if (answers.name.trim() !== '') bits.push(answers.name.trim())

  for (const tab of SETUP_TABS) {
    const value = answerFor(answers, tab.key)
    if (value === '') continue
    bits.push(value.length > 30 ? `${value.slice(0, 30)}…` : value)
  }
  return bits
}

export type { ClassName, Race }
