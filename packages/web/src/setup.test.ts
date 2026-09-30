import { describe, expect, it } from 'vitest'
import {
  EMPTY_ANSWERS,
  SETUP_TABS,
  answerFor,
  briefSummary,
  composeBrief,
  isAnswered,
  type SetupAnswers,
} from './setup.js'

const answers = (patch: Partial<SetupAnswers> = {}): SetupAnswers => ({
  ...EMPTY_ANSWERS,
  picked: {},
  custom: {},
  ...patch,
})

describe('the tabs', () => {
  it('builds race and class from the content package rather than a second list', () => {
    const race = SETUP_TABS.find((t) => t.key === 'race')!
    const klass = SETUP_TABS.find((t) => t.key === 'class')!

    expect(race.options).toHaveLength(9)
    expect(race.options.map(([label]) => label)).toContain('Half-Elf')
    expect(klass.options).toHaveLength(12)
    expect(klass.options.find(([label]) => label === 'Barbarian')?.[1]).toContain('d12')
  })

  it('gives every option a description except where the tab is free text', () => {
    for (const tab of SETUP_TABS) {
      for (const [label, description] of tab.options) {
        expect(label.length, tab.key).toBeGreaterThan(0)
        expect(description.length, `${tab.key}/${label}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('answerFor', () => {
  it('takes the preset when nothing is typed', () => {
    expect(answerFor(answers({ picked: { race: 'Dwarf' } }), 'race')).toBe('Dwarf')
  })

  it('lets what you typed win over what you clicked', () => {
    const a = answers({ picked: { race: 'Dwarf' }, custom: { race: 'A tiefling raised by dwarves' } })

    expect(answerFor(a, 'race')).toBe('A tiefling raised by dwarves')
  })

  it('ignores whitespace typed into the custom box', () => {
    const a = answers({ picked: { race: 'Dwarf' }, custom: { race: '   ' } })

    expect(answerFor(a, 'race')).toBe('Dwarf')
  })
})

describe('isAnswered', () => {
  it('counts a name alone as answering the character tab', () => {
    expect(isAnswered(answers({ name: 'Brann' }), 'character')).toBe(true)
    expect(isAnswered(answers(), 'character')).toBe(false)
  })

  it('counts nothing as answered on an empty form', () => {
    for (const tab of SETUP_TABS) {
      expect(isAnswered(answers(), tab.key), tab.key).toBe(false)
    }
  })
})

describe('composeBrief', () => {
  it('asks to be asked when the form is empty', () => {
    expect(composeBrief(answers())).toBe(
      "Let's play. Ask me what I want and we'll build it together.",
    )
  })

  it('leads with the language, because it governs everything after it', () => {
    const brief = composeBrief(answers({ language: 'Tiếng Việt' }))

    expect(brief.split('\n\n')[0]).toBe('Run the table in Tiếng Việt.')
  })

  it('writes the character as a sentence, not a form dump', () => {
    const brief = composeBrief(
      answers({ name: 'Brann', custom: { character: 'Disgraced temple guard.' } }),
    )

    expect(brief).toContain('I am Brann. Disgraced temple guard.')
  })

  it('handles a name with no concept, and a concept with no name', () => {
    expect(composeBrief(answers({ name: 'Brann' }))).toContain('I am Brann.')
    expect(composeBrief(answers({ custom: { character: 'A runaway apprentice.' } }))).toContain(
      'A runaway apprentice.',
    )
  })

  it('gathers the rest into one line', () => {
    const brief = composeBrief(
      answers({ picked: { race: 'Dwarf', class: 'Fighter', difficulty: 'Deadly' } }),
    )

    expect(brief).toContain('Race: Dwarf. Class: Fighter. Difficulty: Deadly.')
  })

  it('leaves the dice to the engine rather than choosing scores', () => {
    const brief = composeBrief(answers({ picked: { race: 'Dwarf' } }))

    expect(brief).toContain('Roll my ability scores')
    expect(brief).not.toMatch(/\b(strength|str|16|15, 14, 13)\b/i)
  })

  it('says nothing about a tab that was skipped', () => {
    const brief = composeBrief(answers({ picked: { race: 'Dwarf' } }))

    expect(brief).not.toContain('Tone:')
    expect(brief).not.toContain('Adventure:')
  })
})

describe('briefSummary', () => {
  it('is empty when nothing is chosen', () => {
    expect(briefSummary(answers())).toEqual([])
  })

  it('lists what will be sent, language first', () => {
    const summary = briefSummary(
      answers({ language: 'English', name: 'Brann', picked: { race: 'Dwarf' } }),
    )

    expect(summary).toEqual(['English', 'Brann', 'Dwarf'])
  })

  it('truncates a long concept so the footer stays one line', () => {
    const summary = briefSummary(
      answers({
        custom: {
          character: 'Disgraced temple guard who took the blame for something they did not do',
        },
      }),
    )

    expect(summary[0]!.endsWith('…')).toBe(true)
    expect(summary[0]!.length).toBeLessThanOrEqual(31)
  })
})
