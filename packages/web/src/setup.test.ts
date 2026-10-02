import { describe, expect, it } from 'vitest'
import { UNKNOWN_PORTRAIT, genderOfPortrait, pronounsForPortrait } from '@dnd/content'
import {
  EMPTY_ANSWERS,
  SETUP_TABS,
  answerFor,
  briefSummary,
  portraitAfterDescribing,
  skipBrief,
  rolledAnswers,
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

describe('the character tab', () => {
  it('asks the class and the backstory inside it rather than beside it', () => {
    // One tab called Character, holding a name, a face, a class and a backstory.
    // The class and backstory tabs still exist in the data — they keep their
    // cards and their phrase, so the brief reads them unchanged — they just do
    // not get a button of their own.
    const inlined = SETUP_TABS.filter((tab) => tab.inlined === true).map((tab) => tab.key)

    expect(inlined).toEqual(['class', 'character'])
    const shown = SETUP_TABS.filter((tab) => tab.inlined !== true)
    expect(shown.map((tab) => tab.label)).toEqual([
      'Character',
      'Adventure',
      'Difficulty',
      'Rules',
      'Tone',
    ])
  })

  it('is the only tab with a name field, and it is the one with the faces', () => {
    const named = SETUP_TABS.filter((tab) => tab.named === true)

    expect(named).toHaveLength(1)
    expect(named[0]!.picker).toBe('faces')
  })

  it('still carries an inlined answer into the brief', () => {
    // The whole risk of folding a tab in: it stops being asked and nobody
    // notices it also stopped being sent.
    const brief = composeBrief(
      answers({ picked: { class: 'Fighter' }, custom: { character: 'Took the blame.' } }),
    )

    expect(brief).toContain('Class: Fighter')
    expect(brief).toContain('Took the blame.')
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

/** A fixed sequence, so a measured rate is a fact about the library. */
const seeded = (seed: number) => (): number => {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}

describe('rolling a character', () => {
  const classes = SETUP_TABS.find((tab) => tab.key === 'class')!.options.map(([label]) => label)

  it('rolls the class rather than reusing the one already on the form', () => {
    // The defect this is here for: the roll read the class off the form and
    // only drew one when it was empty — but the roll had written it. So the
    // first press chose a class and every press after it kept that class,
    // changing the face and nothing else.
    const pinned = answers({ picked: { class: 'Wizard', race: 'Tiefling' } })

    expect(rolledAnswers(pinned, () => 0).picked['class']).toBe(classes[0])
    expect(rolledAnswers(pinned, () => 0.999).picked['class']).toBe(classes.at(-1))
  })

  it('rolls the race the same way, for the same reason', () => {
    const races = SETUP_TABS.find((tab) => tab.key === 'race')!.options.map(([label]) => label)
    const pinned = answers({ picked: { race: 'Tiefling' } })

    expect(rolledAnswers(pinned, () => 0).picked['race']).toBe(races[0])
  })

  it('fills the name, the face and the backstory together', () => {
    const rolled = rolledAnswers(answers(), () => 0)

    expect(rolled.name).not.toBe('')
    expect(rolled.portrait).not.toBe('')
    expect(rolled.custom['character']).not.toBe('')
  })

  it('reads the pronouns off the face it landed on, every press', () => {
    // The lock this replaced: the roll kept whatever pronouns were already set,
    // but the roll had set them. From the second press on it was reading its
    // own last answer, so the sex never changed again.
    const rolled = rolledAnswers(answers({ pronouns: 'they/them' }), () => 0)

    expect(rolled.pronouns).toBe(pronounsForPortrait(rolled.portrait) ?? '')
    expect(rolled.pronouns).not.toBe('they/them')
  })

  it('can roll either sex, rather than whichever came up first', () => {
    let a = answers()
    const seen = new Set<string>()
    for (let i = 0; i < 60; i++) {
      a = rolledAnswers(a)
      if (a.pronouns !== '') seen.add(a.pronouns)
    }

    expect(seen).toEqual(new Set(['he/him', 'she/her']))
  })

  it('takes a sex to aim at, which the caller supplies and the form never does', () => {
    // The steer survives the fix: the picker's filter chips are their own state
    // now, so they can aim the roll without the roll writing them back.
    //
    // Aim, not a guarantee. avatarFor falls back rather than refusing, because
    // eighteen race-and-class pairings still have a face for only one sex, and
    // a roll that refused would be a button that sometimes does nothing. Seeded
    // so the margin is a fact about the library rather than today's dice.
    for (const want of ['female', 'male'] as const) {
      const rng = seeded(20260101)
      const rolls = Array.from({ length: 300 }, () => rolledAnswers(answers(), rng, want))
      const hit = rolls.filter((r) => genderOfPortrait(r.portrait) === want).length

      expect(hit / rolls.length, want).toBeGreaterThan(0.8)
    }
  })

  it('keeps the answers it was not asked about', () => {
    const rolled = rolledAnswers(
      answers({ language: 'Tiếng Việt', picked: { tone: 'Grim' } }),
      () => 0,
    )

    expect(rolled.language).toBe('Tiếng Việt')
    expect(rolled.picked['tone']).toBe('Grim')
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

describe('skipBrief', () => {
  it('asks the DM to ask, rather than starting on silence', () => {
    // Skip used to send nothing: the modal closed and the DM opened on an empty
    // conversation with no instruction at all. Skipping the questions means
    // answering them at the table, which is what the footer always promised.
    expect(skipBrief('')).toBe("Let's play. Ask me what I want and we'll build it together.")
  })

  it('still carries the language, which the gate settled before the questions', () => {
    const brief = skipBrief('Tiếng Việt')

    expect(brief.split('\n\n')[0]).toBe('Run the table in Tiếng Việt.')
    expect(brief).toContain('Ask me what I want')
  })

  it('says the same thing an untouched form says', () => {
    // Two ways to answer nothing, one sentence. They used to be a shared string
    // literal and a silence, which is how they came to disagree.
    expect(skipBrief('')).toBe(composeBrief(EMPTY_ANSWERS))
    expect(skipBrief('English')).toBe(
      composeBrief({ ...EMPTY_ANSWERS, language: 'English' }).split('\n\n')[0] +
        '\n\n' +
        skipBrief(''),
    )
  })

  it('asks for nothing the DM has not been given', () => {
    // No ability scores, no scene: there is no character to roll for yet, which
    // is the whole reason the DM is being asked to ask.
    expect(skipBrief('English')).not.toContain('Roll my ability scores')
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
    // 'race' is not here any more: it asks with a grid of portraits rather than
    // nine painted cards, because the picture already settles the race and the
    // sex and asking for them separately only let them disagree with it.
    expect(withArt.map((tab) => tab.key)).toEqual([
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

  it('asks with cards or with faces, never both', () => {
    // A tab that renders a picker ignores options art entirely, so carrying
    // both would mean one of them is dead weight nobody notices is wrong.
    for (const tab of SETUP_TABS) {
      if (tab.picker === undefined) continue
      expect(tab.imageFor, `${tab.key} has a picker and card art`).toBeUndefined()
      expect(tab.artAspect, `${tab.key} has a picker and an art aspect`).toBeUndefined()
    }
    expect(SETUP_TABS.filter((tab) => tab.picker !== undefined).map((t) => t.key)).toEqual(['race'])
  })

  it('gives the tabs with art an explicit aspect', () => {
    // Two aspects across the tabs — square busts and landscape scenes — so a
    // shared default would letterbox one of them. The race pairs used to be a
    // third; that tab asks with portraits now.
    for (const tab of SETUP_TABS) {
      if (tab.imageFor === undefined) continue
      expect(tab.artAspect, `${tab.key} has art but no aspect`).toBeDefined()
    }
    expect(SETUP_TABS.find((t) => t.key === 'class')!.artAspect).toBe('1 / 1')
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

describe('the choosers the form opens', () => {
  const source = async (): Promise<string> => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    return readFileSync(fileURLToPath(new URL('./Setup.tsx', import.meta.url)), 'utf8')
  }

  it('renders something for every chooser a button can open', async () => {
    // A block edit once deleted both picker renders and left the buttons that
    // open them. Nothing failed: it built, it typechecked, the whole suite
    // passed, and the face, the Select button and the class row were all dead.
    // With no DOM in the test environment the source is the only place that is
    // visible from.
    const text = await source()
    const opened = new Set([...text.matchAll(/setPicking\('(\w+)'\)/g)].map((m) => m[1]!))

    expect(opened).toEqual(new Set(['faces', 'class']))
    for (const which of opened) {
      expect(text, `nothing renders for setPicking('${which}')`).toContain(`picking === '${which}'`)
    }
  })

  it('still asks the inlined tabs somewhere, now that they have no tab button', async () => {
    // The other half of the same risk: a tab that is folded in and then not
    // rendered is a question nobody can answer and nobody can see is missing.
    const text = await source()

    for (const tab of SETUP_TABS.filter((each) => each.inlined === true)) {
      expect(text, `${tab.key} is inlined but nothing renders it`).toMatch(
        new RegExp(`(CLASS_TAB|BACKSTORY_TAB|'${tab.key}')`),
      )
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

describe('describing a people of your own', () => {
  it('puts the hood on when there is no face to be', () => {
    // A goliath has no portrait in a library of nine races. The hood is
    // race-neutral and faceless, so it cannot contradict what was typed.
    expect(portraitAfterDescribing('', 'A goliath, far from home')).toBe(UNKNOWN_PORTRAIT)
  })

  it('never overrides a face that was chosen', () => {
    expect(portraitAfterDescribing('dwarf-smith-broad', 'A goliath')).toBe('dwarf-smith-broad')
  })

  it('leaves the hood alone once the text is cleared', () => {
    // By then it is as much a choice as any other face, and snatching it back
    // would empty the portrait for someone who had settled on it.
    const hooded = portraitAfterDescribing('', 'A goliath')
    expect(portraitAfterDescribing(hooded, '')).toBe(UNKNOWN_PORTRAIT)
  })

  it('does nothing at all when nothing has been typed', () => {
    expect(portraitAfterDescribing('', '')).toBe('')
    expect(portraitAfterDescribing('', '   ')).toBe('')
  })
})
