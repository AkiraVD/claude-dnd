import { useState } from 'react'
import {
  EMPTY_ANSWERS,
  LANGUAGE_OPTIONS,
  SETUP_TABS,
  answerFor,
  briefSummary,
  composeBrief,
  isAnswered,
  type SetupAnswers,
} from './setup.js'

/**
 * The opening form.
 *
 * Language comes first, on its own, because it governs everything after it —
 * including this form. Then six tabs of presets with a custom box on each, and
 * a footer that shows exactly what will be sent. Nothing here is a tool call:
 * there is no DM yet to ask, so it composes one ordinary first message.
 */
export function Setup({
  onBegin,
  onSkip,
}: {
  onBegin: (brief: string) => void
  onSkip: () => void
}): JSX.Element {
  const [answers, setAnswers] = useState<SetupAnswers>(EMPTY_ANSWERS)
  const [active, setActive] = useState(SETUP_TABS[0]!.key)

  if (answers.language === '') {
    return <LanguageGate onPick={(language) => setAnswers({ ...answers, language })} />
  }

  const tab = SETUP_TABS.find((t) => t.key === active)!
  const summary = briefSummary(answers)

  const pick = (value: string): void =>
    setAnswers({
      ...answers,
      picked: { ...answers.picked, [tab.key]: answers.picked[tab.key] === value ? '' : value },
    })

  const type = (value: string): void =>
    setAnswers({
      ...answers,
      custom: { ...answers.custom, [tab.key]: value },
      // Typing your own replaces the card you clicked, rather than leaving both
      // selected and making the DM guess which one you meant.
      picked: value.trim() === '' ? answers.picked : { ...answers.picked, [tab.key]: '' },
    })

  return (
    <div className="scrim scrim-art">
      <div className="modal modal-setup">
        <div className="modal-head">
          <h3>Before we begin</h3>
          <span className="modal-sub">{SETUP_TABS.length} questions, all optional</span>
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
            <div className="custom named">
              <label htmlFor="setup-name">Name</label>
              <input
                id="setup-name"
                type="text"
                value={answers.name}
                placeholder="Brann, Vesper, whatever they answer to"
                onChange={(event) => setAnswers({ ...answers, name: event.target.value })}
              />
            </div>
          )}

          {tab.options.length > 0 && (
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
                    <img
                      src={tab.imageFor(label)}
                      alt=""
                      style={{ aspectRatio: tab.artAspect ?? '4 / 5' }}
                      // A missing asset should cost the art, not the card.
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
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

function LanguageGate({ onPick }: { onPick: (language: string) => void }): JSX.Element {
  const [custom, setCustom] = useState('')
  const chosen = custom.trim()

  return (
    <div className="scrim scrim-art">
      <div className="modal modal-language">
        <div className="modal-head">
          <h3>Language</h3>
          <span className="modal-sub">ngôn ngữ · idioma · 言語</span>
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
