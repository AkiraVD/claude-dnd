import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cardTransform, faceTransform, portraitFor } from './art.js'
import {
  FACES,
  FACE_RACES,
  faceCounts,
  facesMatching,
  raceLabel,
  raceOfPortrait,
  type Face,
  type FaceRace,
} from './faces.js'
import { UNKNOWN_PORTRAIT, pronounsForPortrait, type Gender } from '@dnd/content'
import { defaultBackstory, rollCharacter, suggestedClass } from './roll-character.js'
import {
  EMPTY_ANSWERS,
  LANGUAGE_OPTIONS,
  SETUP_TABS,
  answerFor,
  briefSummary,
  composeBrief,
  isAnswered,
  portraitAfterDescribing,
  rolledAnswers,
  skipBrief,
  slug,
  type SetupAnswers,
  type SetupTab,
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
/** How far to crop the rolled portrait, which is shown large. */
const ROLL_ZOOM = 1.35

/**
 * The tabs the Character tab now asks for, rather than leaving to a tab of
 * their own.
 *
 * Still tabs in the data: they keep their cards, their custom box and their
 * phrase, so the brief reads them exactly as it reads the rest. Only the row of
 * buttons leaves them out.
 */
const RACE_TAB = SETUP_TABS.find((each) => each.key === 'race')!
const CLASS_TAB = SETUP_TABS.find((each) => each.key === 'class')!
const BACKSTORY_TAB = SETUP_TABS.find((each) => each.key === 'character')!
const FACES_SHOWN = FACES.length

/** "An Elf", not "A Elf". Only the races, so the five vowels are enough. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'An' : 'A'
}

export function Setup({
  onBegin,
  onSkip,
  saves,
  onResume,
}: {
  /** The brief for the DM, and the short version the console shows instead. */
  onBegin: (brief: string, summary: readonly string[]) => void
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
  // A filter, not an answer — which is the whole reason it is here rather than
  // on `answers`. The sex chips used to write the pronouns, the same field the
  // roll's result writes, so the first roll's outcome silently became the next
  // roll's filter and the sex never changed again.
  const [faceGender, setFaceGender] = useState<Gender | null>(null)
  /** Which chooser is open over the form, if any. */
  const [picking, setPicking] = useState<'faces' | 'class' | null>(null)
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
  // The hood stands in for a face nobody has chosen: faceless and race-neutral,
  // so it says "not decided yet" without claiming anything the rest of the form
  // could contradict. On screen only — the answer stays empty, so an untouched
  // form still sends nothing about how you look.
  const shownPortrait = answers.portrait === '' ? UNKNOWN_PORTRAIT : answers.portrait

  // Keyed rather than bound to the active tab, because the Character tab now
  // answers three of them: its own, the class it opens in a modal, and the
  // backstory folded in underneath.
  const pickIn = (key: string, value: string): void =>
    setAnswers({
      ...answers,
      picked: { ...answers.picked, [key]: answers.picked[key] === value ? '' : value },
    })

  const typeIn = (key: string, value: string): void => {
    const described = value.trim() !== ''
    const into = SETUP_TABS.find((each) => each.key === key)
    setAnswers({
      ...answers,
      custom: { ...answers.custom, [key]: value },
      // Typing your own replaces the card you clicked, rather than leaving both
      // selected and making the DM guess which one you meant.
      picked: described ? { ...answers.picked, [key]: '' } : answers.picked,
      ...(into?.picker === 'faces'
        ? { portrait: portraitAfterDescribing(answers.portrait, value) }
        : {}),
    })
  }

  const pick = (value: string): void => pickIn(tab.key, value)
  const type = (value: string): void => typeIn(tab.key, value)

  return (
    <div className="scrim scrim-art">
      <div className="modal modal-setup">
        <div className="modal-head">
          <h3>Before we begin</h3>
          <span className="modal-sub">
            {SETUP_TABS.filter((each) => each.inlined !== true).length} questions, all optional
          </span>
          <ResumeLink saves={saves} onResume={onResume} />
        </div>

        <div className="tabs" role="tablist">
          {SETUP_TABS.filter((each) => each.inlined !== true).map((each) => (
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
            <div className="who">
              {/* The face leads, the way it does in the info bar and the
                  dialogue boxes. It is a picture rather than a field, so it
                  stands in a column of its own beside the stack rather than
                  taking a row away from it. */}
              <div className="roller-avatar">
                <button
                  type="button"
                  className={`roller-face${answers.portrait === '' ? ' roller-face-empty' : ''}`}
                  aria-label="Choose a face"
                  onClick={() => setPicking('faces')}
                >
                  <img
                    src={portraitFor(shownPortrait)!}
                    alt=""
                    draggable={false}
                    style={{ transform: faceTransform(shownPortrait, ROLL_ZOOM) }}
                  />
                </button>
                {/* A portrait on its own does not look like something you can
                    press, so the word underneath says so. */}
                <button type="button" className="ghost" onClick={() => setPicking('faces')}>
                  {answers.portrait === '' ? 'Select' : 'Change'}
                </button>
              </div>

              <div className="who-fields">
                <button
                  type="button"
                  className="ghost roller-roll"
                  onClick={() => {
                    const rolled = rolledAnswers(answers, Math.random, faceGender ?? undefined)
                    // Narrow the grid to what was rolled, so the face is
                    // findable when the picker is next opened.
                    setFaceRace(raceOfPortrait(rolled.portrait))
                    setAnswers(rolled)
                  }}
                >
                  Roll a character
                </button>

                <div className="field-row">
                  <label htmlFor="setup-name">Name</label>
                  <input
                    id="setup-name"
                    className="field-pick"
                    type="text"
                    value={answers.name}
                    placeholder="Brann, Vesper, whatever they answer to"
                    onChange={(event) => setAnswers({ ...answers, name: event.target.value })}
                  />
                </div>

                <div className="field-row">
                  <label htmlFor="setup-class">Class</label>
                  <button
                    id="setup-class"
                    type="button"
                    className="ghost field-pick"
                    onClick={() => setPicking('class')}
                  >
                    {answerFor(answers, 'class') === ''
                      ? 'choose a class…'
                      : answerFor(answers, 'class')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {tab.picker === 'faces' && (
            <CustomBox
              tab={BACKSTORY_TAB}
              rows={3}
              value={answers.custom['character'] ?? ''}
              onChange={(value) => typeIn('character', value)}
              // Worth saying, because the default is filled in for you and it is
              // easy to read it as flavour text. The DM builds the campaign's
              // backbone out of this before the first scene.
              note="The DM builds the campaign around this — whoever you have wronged, lost or left behind will turn up."
            />
          )}

          {picking === 'faces' && (
            <PickerModal
              title="Who are you?"
              sub={`${FACES_SHOWN} faces`}
              onClose={() => setPicking(null)}
            >
              <FacePicker
                chosen={answers.portrait}
                race={faceRace}
                onRace={setFaceRace}
                gender={faceGender ?? undefined}
                describe={answers.custom['race'] ?? ''}
                onDescribe={(value) => typeIn('race', value)}
                onGender={setFaceGender}
                onPick={(face) => {
                  // The trade in the picture suggests a class, and only
                  // suggests: a priest's robes on a barbarian is not a
                  // contradiction, since the brief never claims the portrait is
                  // a statement about the class. An answer already given is
                  // left alone.
                  const suggestion = suggestedClass(face.name)
                  const alreadyChosen = (answers.picked['class'] ?? '') !== ''
                  // Same for the backstory: a default is only worth having
                  // where there is nothing, so it fills an empty box and never
                  // overwrites a sentence someone wrote.
                  const written = (answers.custom['character'] ?? '').trim() !== ''
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
                    custom: written
                      ? answers.custom
                      : { ...answers.custom, character: defaultBackstory(face.name) },
                    pronouns: pronounsForPortrait(face.name) ?? answers.pronouns,
                  })
                  setPicking(null)
                }}
              />
            </PickerModal>
          )}

          {picking === 'class' && (
            <PickerModal
              title={CLASS_TAB.prompt}
              sub="twelve, or your own"
              onClose={() => setPicking(null)}
            >
              <OptionGrid
                tab={CLASS_TAB}
                chosen={answers.picked['class'] ?? ''}
                onPick={(label) => {
                  pickIn('class', label)
                  setPicking(null)
                }}
              />
              <CustomBox
                tab={CLASS_TAB}
                value={answers.custom['class'] ?? ''}
                onChange={(value) => typeIn('class', value)}
              />
            </PickerModal>
          )}

          {tab.picker === undefined && tab.options.length > 0 && (
            <OptionGrid tab={tab} chosen={answers.picked[tab.key] ?? ''} onPick={pick} />
          )}

          {/* The Character tab's own free-text box lives in the face modal, and
              its backstory box is above: what is left down here would be a
              third empty field with nothing to say. */}
          {tab.picker === undefined && (
            <CustomBox tab={tab} value={answers.custom[tab.key] ?? ''} onChange={type} />
          )}
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
          {/* Skipping the questions means answering them at the table, not
              starting on silence — so it sends the line that asks the DM to ask.
              The language goes with it: it was settled on the gate before the
              questions began, and skipping them cannot un-answer it.

              onSkip as well, so the modal closes on the press rather than when
              the echo comes back off the wire. */}
          <button
            className="ghost"
            type="button"
            onClick={() => {
              onBegin(skipBrief(answers.language), briefSummary({ ...EMPTY_ANSWERS, language: answers.language }))
              onSkip()
            }}
          >
            Skip
          </button>
          <button
            className="primary"
            type="button"
            onClick={() => onBegin(composeBrief(answers), summary)}
          >
            Begin
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * A chooser over the form.
 *
 * The Character tab asks for a face out of 190 and a class out of twelve, and
 * neither fits beside a name field. They go over the top instead: the tab keeps
 * three short rows, and the gallery is a page of its own that closes on a pick.
 */
function PickerModal({
  title,
  sub,
  onClose,
  children,
}: {
  title: string
  sub: string
  onClose: () => void
  children: ReactNode
}): JSX.Element {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="scrim scrim-over"
      // Only the backdrop closes it. A click that started on a card inside has
      // already done its job.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal modal-picker">
        <div className="modal-head">
          <h3>{title}</h3>
          <span className="modal-sub">{sub}</span>
          <button type="button" className="ghost resume-link" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

/** A tab's option cards. Shared, because the class tab is now asked twice over. */
function OptionGrid({
  tab,
  chosen,
  onPick,
}: {
  tab: SetupTab
  chosen: string
  onPick: (label: string) => void
}): JSX.Element {
  return (
    <div className={`options${tab.wide === true ? ' wide' : ''}`}>
      {tab.options.map(([label, description]) => (
        <button
          key={label}
          type="button"
          className={`opt${tab.imageFor === undefined ? '' : ' opt-art'}`}
          aria-pressed={chosen === label}
          onClick={() => onPick(label)}
        >
          {tab.imageFor !== undefined && (
            // Wrapped, because the crop is a transform and a transform needs
            // something to be clipped by.
            <span className="opt-shot" style={{ aspectRatio: tab.artAspect ?? '4 / 5' }}>
              <img
                src={tab.imageFor(label)}
                alt=""
                draggable={false}
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
  )
}

/** A tab's free-text box: what the cards do not cover. */
function CustomBox({
  tab,
  value,
  onChange,
  rows,
  note,
}: {
  tab: SetupTab
  value: string
  onChange: (value: string) => void
  rows?: number
  /** A line under the box, for a field whose consequences are not obvious. */
  note?: string
}): JSX.Element {
  return (
    <div className="custom">
      <label htmlFor={`custom-${tab.key}`}>{tab.custom}</label>
      <textarea
        id={`custom-${tab.key}`}
        rows={rows ?? 2}
        placeholder={tab.placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...(note === undefined ? {} : { 'aria-describedby': `note-${tab.key}` })}
      />
      {note !== undefined && (
        <p className="custom-note" id={`note-${tab.key}`}>
          {note}
        </p>
      )}
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
  describe,
  onDescribe,
}: {
  chosen: string
  race: FaceRace | null
  onRace: (race: FaceRace | null) => void
  gender: Gender | undefined
  onGender: (gender: Gender | null) => void
  onPick: (face: Face) => void
  /** What was typed in place of a face, if anything. */
  describe: string
  onDescribe: (value: string) => void
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
              ['male', '\u2642', 'Men'],
              ['female', '\u2640', 'Women'],
            ] as const
          ).map(([value, glyph, label]) => {
            const on = gender === value
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
                onClick={() => onGender(on ? null : value)}
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
                draggable={false}
                style={{ transform: faceTransform(face.name, ROLL_ZOOM) }}
              />
            </span>
            <em>{face.role}</em>
          </button>
        ))}
      </div>

      {/* Here rather than on the tab, because it is the alternative to this
          grid: a goliath is not in it, and saying so belongs where you went
          looking for one. The hood goes on when it is filled. */}
      <CustomBox tab={RACE_TAB} value={describe} onChange={onDescribe} />
    </div>
  )
}
