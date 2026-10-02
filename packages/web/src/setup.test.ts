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
    expect(briefSummary(EMPTY_ANSWERS)).toEqual([])
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

describe('class art', () => {
  it('points every option with art at an asset that exists', async () => {
    const { existsSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')

    const withArt = SETUP_TABS.filter((tab) => tab.imageFor !== undefined)
    expect(withArt.map((tab) => tab.key)).toEqual([
      'race',
      'class',
      'adventure',
      'difficulty',
      'rules',
      'tone',
    ])

    for (const tab of withArt) {
      for (const [label] of tab.options) {
        const href = tab.imageFor!(label)
        const path = fileURLToPath(new URL(`../public${href}`, import.meta.url))
        expect(existsSync(path), `${tab.key}/${label}: ${href} is missing`).toBe(true)
      }
    }
  })

  it('gives the tabs with art an explicit aspect', () => {
    // Three different aspects across the tabs — square busts, landscape pairs,
    // landscape scenes — so a shared default would letterbox something.
    for (const tab of SETUP_TABS) {
      if (tab.imageFor === undefined) continue
      expect(tab.artAspect, `${tab.key} has art but no aspect`).toBeDefined()
    }
    expect(SETUP_TABS.find((t) => t.key === 'class')!.artAspect).toBe('1 / 1')
    expect(SETUP_TABS.find((t) => t.key === 'race')!.artAspect).toBe('3 / 2')
    expect(SETUP_TABS.find((t) => t.key === 'adventure')!.artAspect).toBe('3 / 2')
    // The still-life deck: difficulty, tone and rules share one treatment.
    for (const key of ['difficulty', 'rules', 'tone']) {
      expect(SETUP_TABS.find((t) => t.key === key)!.artAspect, key).toBe('3 / 2')
    }
  })

  it('leaves the tabs without art alone', () => {
    for (const tab of SETUP_TABS) {
      if (!['class', 'race', 'adventure', 'difficulty', 'rules', 'tone'].includes(tab.key)) {
        expect(tab.imageFor, tab.key).toBeUndefined()
      }
    }
  })
})

describe('the rules tab', () => {
  const tab = SETUP_TABS.find((t) => t.key === 'rules')!

  it('exists, with the loose option named as well as the strict one', () => {
    expect(tab).toBeDefined()
    expect(tab.options.map(([label]) => label)).toEqual([
      'Hold me to the sheet',
      'Let the DM judge',
    ])
  })

  it('asks for the tool call by name when strict is chosen', () => {
    // The engine enforces this one, so the brief has to say what to turn on
    // rather than express a mood the DM might only half-act on.
    const line = tab.phrase('Hold me to the sheet')
    expect(line).toContain('set_rules')
    expect(line).toContain('strict_spells')
  })

  it('does not ask for it when the DM is left to judge', () => {
    expect(tab.phrase('Let the DM judge')).not.toContain('set_rules')
  })

  it('carries a chosen answer into the brief', () => {
    const brief = composeBrief({
      ...EMPTY_ANSWERS,
      picked: { ...EMPTY_ANSWERS.picked, rules: 'Hold me to the sheet' },
    })
    expect(brief).toContain('strict_spells')
  })
})

describe('pronouns', () => {
  it('reach the DM as an instruction, not just a field', () => {
    const brief = composeBrief({ ...EMPTY_ANSWERS, language: 'English', pronouns: 'they/them' })

    expect(brief).toContain('Refer to me as they/them')
  })

  it('appear in what the line promises to send', () => {
    // Set by a roll rather than typed, so the easiest thing on the form to
    // carry away without noticing.
    expect(briefSummary({ ...EMPTY_ANSWERS, pronouns: 'he/him' })).toContain('he/him')
  })

  it('are left out entirely when nobody has said', () => {
    const brief = composeBrief({ ...EMPTY_ANSWERS, language: 'English' })

    expect(brief).not.toContain('Refer to me as')
    expect(briefSummary(EMPTY_ANSWERS)).toEqual([])
  })
})
