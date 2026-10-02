import { useEffect, useRef, useState } from 'react'
import { cardTransform, faceTransform, portraitFor } from './art.js'
import {
  FACE_RACES,
  faceCounts,
  facesMatching,
  raceLabel,
  raceOfPortrait,
  type Face,
  type FaceRace,
} from './faces.js'
import { pronounsForPortrait, type Gender } from '@dnd/content'
import { rollCharacter, suggestedClass } from './roll-character.js'
import {
  EMPTY_ANSWERS,
  LANGUAGE_OPTIONS,
  SETUP_TABS,
  answerFor,
  briefSummary,
  composeBrief,
  isAnswered,
  portraitAfterDescribing,
  slug,
  type SetupAnswers,
} from './setup.js'
import type { JSX } from 'react'

/**
 * The opening form.
 *
 * Language comes first, on its own, because it governs everything after it —
 * including this form. Then six tabs of presets with a custom box on each, and
 * a footer that shows exactly what will be sent. Nothing here is a tool call:
 * there is no DM yet to ask, so it composes one ordinary first message.
 */
/** A random option from a tab, for when the player has not chosen one. */
/**
 * The gender a chosen pronoun asks the roll for.
 *
 * they/them asks for neither, which is not the same as asking for nothing: the
 * library has no third set of faces, so the roll is left free rather than
 * forced into one of the two.
 */
function genderFor(pronouns: string): 'male' | 'female' | undefined {
  if (pronouns === 'he/him') return 'male'
  if (pronouns === 'she/her') return 'female'
  return undefined
}

/** How far to crop the rolled portrait, which is shown large. */
const ROLL_ZOOM = 1.35

/** "An Elf", not "A Elf". Only the races, so the five vowels are enough. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'An' : 'A'
}

function pickFrom(tabs: typeof SETUP_TABS, key: string): string {
  const options = tabs.find((tab) => tab.key === key)?.options ?? []
  return options.length === 0 ? '' : options[Math.floor(Math.random() * options.length)]![0]
}

export function Setup({
  onBegin,
  onSkip,
  saves,
  onResume,
}: {
  onBegin: (brief: string) => void
  onSkip: () => void
  /** Campaigns on disk other than this empty one. */
  saves: number
  onResume: () => void
}): JSX.Element {
  const [answers, setAnswers] = useState<SetupAnswers>(EMPTY_ANSWERS)
  // Up here rather than inside the picker, so rolling can move it: a rolled
  // dwarf whose face sits behind the "all" filter, ninety portraits down, has
  // been chosen without being shown.
  const [faceRace, setFaceRace] = useState<FaceRace | null>(null)
  const [active, setActive] = useState(SETUP_TABS[0]!.key)

  if (answers.language === '') {
    return (
      <LanguageGate
        onPick={(language) => setAnswers({ ...answers, language })}
        saves={saves}
        onResume={onResume}
      />
    )
  }

  const tab = SETUP_TABS.find((t) => t.key === active)!
  const summary = briefSummary(answers)

  const pick = (value: string): void =>
    setAnswers({
      ...answers,
      picked: { ...answers.picked, [tab.key]: answers.picked[tab.key] === value ? '' : value },
    })

  const type = (value: string): void => {
    const described = value.trim() !== ''
    setAnswers({
      ...answers,
      custom: { ...answers.custom, [tab.key]: value },
      // Typing your own replaces the card you clicked, rather than leaving both
      // selected and making the DM guess which one you meant.
      picked: described ? { ...answers.picked, [tab.key]: '' } : answers.picked,
      ...(tab.picker === 'faces'
        ? { portrait: portraitAfterDescribing(answers.portrait, value) }
        : {}),
    })
  }

  return (
    <div className="scrim scrim-art">
      <div className="modal modal-setup">
        <div className="modal-head">
          <h3>Before we begin</h3>
          <span className="modal-sub">{SETUP_TABS.length} questions, all optional</span>
          <ResumeLink saves={saves} onResume={onResume} />
        </div>

        <div className="tabs" role="tablist">
          {SETUP_TABS.map((each) => (
            <button
              key={each.key}
              type="button"
              role="tab"
              aria-selected={each.key === active}
              className={isAnswered(answers, each.key) ? 'done' : ''}
              onClick={() => setActive(each.key)}
            >
              <span className="mark" />
              {each.label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          <p className="field-label">{tab.prompt}</p>

          {tab.named === true && (
            <div className="roller">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  // Race and class are what a roll is made of, so settle them
                  // first rather than inventing a character with no shape.
                  const race = answers.picked['race'] ?? pickFrom(SETUP_TABS, 'race')
                  const className = answers.picked['class'] ?? pickFrom(SETUP_TABS, 'class')
                  // A pronoun already chosen steers the roll rather than being
                  // overwritten by it: picking she/her and then rolling should
                  // give a woman, not replace the choice with whatever face came
                  // up. Left unset, the face decides and fills it in.
                  const rolled = rollCharacter(race, className, Math.random, genderFor(answers.pronouns))
                  // Show what was rolled: narrow the grid to its race, and let
                  // the sex filter follow the pronouns below.
                  setFaceRace(raceOfPortrait(rolled.portrait))
                  setAnswers({
                    ...answers,
                    name: rolled.name,
                    picked: { ...answers.picked, race, class: className },
                    custom: { ...answers.custom, character: rolled.concept },
                    portrait: rolled.portrait,
                    pronouns: answers.pronouns !== '' ? answers.pronouns : (rolled.pronouns ?? ''),
                  })
                }}
              >
                Roll a character
              </button>
              {/* No portrait here: the grid below highlights what is chosen,
                  and showing it twice spent the room the faces needed. */}
              <input
                id="setup-name"
                type="text"
                aria-label="Name"
                value={answers.name}
                placeholder="Brann, Vesper, whatever they answer to"
                onChange={(event) => setAnswers({ ...answers, name: event.target.value })}
              />
            </div>
          )}

          {tab.picker === 'faces' && (
            <FacePicker
              chosen={answers.portrait}
              race={faceRace}
              onRace={setFaceRace}
              gender={genderFor(answers.pronouns)}
              onGender={(pronouns) => setAnswers({ ...answers, pronouns })}
              onPick={(face) => {
                // The trade in the picture suggests a class, and only suggests:
                // a priest's robes on a barbarian is not a contradiction, since
                // the brief never claims the portrait is a statement about the
                // class. An answer already given is left alone.
                const suggestion = suggestedClass(face.name)
                const alreadyChosen = (answers.picked['class'] ?? '') !== ''
                setAnswers({
                  ...answers,
                  portrait: face.name,
                  // Race and pronouns are read off the picture rather than
                  // asked for, which is the whole point: they cannot disagree
                  // with it if they came from it.
                  picked: {
                    ...answers.picked,
                    race: raceLabel(face.race),
                    ...(suggestion === null || alreadyChosen
                      ? {}
                      : { class: suggestion.charAt(0).toUpperCase() + suggestion.slice(1) }),
                  },
                  pronouns: pronounsForPortrait(face.name) ?? answers.pronouns,
                })
              }}
            />
          )}

          {tab.picker === undefined && tab.options.length > 0 && (
            <div className={`options${tab.wide === true ? ' wide' : ''}`}>
              {tab.options.map(([label, description]) => (
                <button
                  key={label}
                  type="button"
                  className={`opt${tab.imageFor === undefined ? '' : ' opt-art'}`}
                  aria-pressed={answers.picked[tab.key] === label}
                  onClick={() => pick(label)}
                >
                  {tab.imageFor !== undefined && (
                    // Wrapped, because the crop is a transform and a transform
                    // needs something to be clipped by.
                    <span
                      className="opt-shot"
                      style={{ aspectRatio: tab.artAspect ?? '4 / 5' }}
                    >
                      <img
                        src={tab.imageFor(label)}
                        alt=""
                        style={{ transform: cardTransform(slug(label)) }}
                        // A missing asset should cost the art, not the card.
                        onError={(event) => {
                          event.currentTarget.style.display = 'none'
                        }}
                      />
                    </span>
                  )}
                  <span className="opt-text">
                    {label}
                    <em>{description}</em>
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="custom">
            <label htmlFor={`custom-${tab.key}`}>{tab.custom}</label>
            <textarea
              id={`custom-${tab.key}`}
              rows={tab.named === true ? 4 : 2}
              placeholder={tab.placeholder}
              value={answers.custom[tab.key] ?? ''}
              onChange={(event) => type(event.target.value)}
            />
          </div>
        </div>

        <div className="modal-foot">
          <div className="brief">
            {summary.length === 0 ? (
              'Answer nothing and the DM will just ask you at the table.'
            ) : (
              <>
                <b>Sends: </b>
                {summary.join(' · ')}
              </>
            )}
          </div>
          <button className="ghost" type="button" onClick={onSkip}>
            Skip
          </button>
          <button className="primary" type="button" onClick={() => onBegin(composeBrief(answers))}>
            Begin
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * The way back to a game already in progress.
 *
 * This modal only appears on an empty campaign, and an empty campaign is what
 * you get by pressing the button that makes one — including by accident. Without
 * this the only way back to last week's game was to answer seven questions you
 * did not want to answer, or know that the campaign name in the corner was a
 * button. Hidden when there is nothing to go back to.
 */
function ResumeLink({ saves, onResume }: { saves: number; onResume: () => void }): JSX.Element | null {
  if (saves === 0) return null
  return (
    <button type="button" className="ghost resume-link" onClick={onResume}>
      Resume a campaign
      <em>{saves} saved</em>
    </button>
  )
}

function LanguageGate({
  onPick,
  saves,
  onResume,
}: {
  onPick: (language: string) => void
  saves: number
  onResume: () => void
}): JSX.Element {
  const [custom, setCustom] = useState('')
  const chosen = custom.trim()

  return (
    <div className="scrim scrim-art">
      <div className="modal modal-language">
        <div className="modal-head">
          <h3>Language</h3>
          <span className="modal-sub">ngôn ngữ · idioma · 言語</span>
          <ResumeLink saves={saves} onResume={onResume} />
        </div>

        <div className="modal-body">
          <div className="langs">
            {LANGUAGE_OPTIONS.map(([label, hint]) => (
              <button key={label} type="button" className="lang" onClick={() => onPick(label)}>
                {label}
                <em>{hint}</em>
              </button>
            ))}
          </div>

          <div className="custom">
            <label htmlFor="lang-custom">Or name another</label>
            <input
              id="lang-custom"
              type="text"
              value={custom}
              placeholder="Français, Português, Bahasa Indonesia…"
              onChange={(event) => setCustom(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && chosen !== '') onPick(chosen)
              }}
            />
          </div>
        </div>

        <div className="modal-foot">
          <div className="brief">
            <b>The DM will speak: </b>
            {chosen === '' ? 'whichever you pick' : chosen}
          </div>
          <button
            className="primary"
            type="button"
            disabled={chosen === ''}
            onClick={() => onPick(chosen)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

export { answerFor }

/**
 * Choosing a character by their face.
 *
 * Race and sex come off the picture instead of being asked for beside it, so
 * they cannot contradict it. The filters are a way through 190 portraits, not
 * questions in their own right — picking "dwarf" here narrows the grid, it does
 * not answer anything the brief will carry on its own.
 */
function FacePicker({
  chosen,
  race,
  onRace,
  gender,
  onGender,
  onPick,
}: {
  chosen: string
  race: FaceRace | null
  onRace: (race: FaceRace | null) => void
  gender: Gender | undefined
  onGender: (pronouns: string) => void
  onPick: (face: Face) => void
}): JSX.Element {
  const counts = faceCounts(gender ?? null)
  const grid = useRef<HTMLDivElement>(null)

  // Bring the chosen face into view when something else chose it — a roll can
  // land ten rows down, and a selection you cannot see is one you distrust.
  useEffect(() => {
    const picked = grid.current?.querySelector('[aria-pressed="true"]')
    picked?.scrollIntoView({ block: 'nearest' })
  }, [chosen, race, gender])
  const shown = facesMatching({
    race,
    ...(gender === undefined ? {} : { gender }),
  })

  return (
    <div className="faces">
      {/* One row. Race narrows, the two toggles narrow further, and both are
          ways through 190 faces rather than questions in their own right. */}
      <div className="faces-filter">
        <button
          type="button"
          className="chip chip-pick"
          aria-pressed={race === null}
          onClick={() => onRace(null)}
        >
          all <em>{Object.values(counts).reduce((a, b) => a + b, 0)}</em>
        </button>
        {FACE_RACES.map((option) => (
          <button
            key={option}
            type="button"
            className="chip chip-pick"
            aria-pressed={race === option}
            onClick={() => onRace(option)}
          >
            {raceLabel(option)} <em>{counts[option] ?? 0}</em>
          </button>
        ))}
        <span className="faces-sex">
          {(
            [
              ['he/him', '\u2642', 'Men'],
              ['she/her', '\u2640', 'Women'],
            ] as const
          ).map(([value, glyph, label]) => {
            const on = (gender === 'male' ? 'he/him' : gender === 'female' ? 'she/her' : '') === value
            return (
              <button
                key={label}
                type="button"
                className="chip chip-pick"
                title={label}
                aria-label={label}
                aria-pressed={on}
                // A second press clears it, so there is no third button for
                // "either" — the row is a filter and an unset filter is off.
                onClick={() => onGender(on ? '' : value)}
              >
                {glyph}
              </button>
            )
          })}
        </span>
      </div>

      <div className="faces-grid" ref={grid}>
        {shown.map((face) => (
          <button
            key={face.name}
            type="button"
            className="face"
            aria-pressed={chosen === face.name}
            title={face.looks}
            onClick={() => onPick(face)}
          >
            <span className="face-shot">
              <img
                src={portraitFor(face.name)!}
                alt=""
                style={{ transform: faceTransform(face.name, ROLL_ZOOM) }}
              />
            </span>
            <em>{face.role}</em>
          </button>
        ))}
      </div>
    </div>
  )
}
