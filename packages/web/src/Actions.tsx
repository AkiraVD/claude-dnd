import { useState } from 'react'
import {
  composeAction,
  defaultLevel,
  isReady,
  spellLevelLabel,
  spellsForLevel,
  type ActionDraft,
  type ActionSheet,
} from './actions.js'
import type { JSX } from 'react'

/**
 * What you can do, on your turn.
 *
 * Like the counter, an input device rather than a second source of truth: it
 * writes a sentence into the composer and the DM resolves it, so the engine
 * still decides whether the arrow lands. What it buys is that the weapon and
 * the target are spelled exactly as the engine has them — the DM asking for a
 * "net" when the sheet says "weighted net" is a turn gone, and it happens
 * because somebody typed the name from memory.
 *
 * It fills the box rather than sending, so "…then put the bench between us"
 * can still be added. Same as the choice chips.
 */
export function Actions({
  sheet,
  onCompose,
  onClose,
}: {
  sheet: ActionSheet
  onCompose: (text: string) => void
  onClose: () => void
}): JSX.Element {
  const [draft, setDraft] = useState<ActionDraft | null>(null)
  // Nothing preselected: the first creature on the board is as likely to be the
  // innkeeper as the one swinging at you, and a target you did not choose is
  // worse than none.
  const [target, setTarget] = useState<string | null>(null)
  const [lethal, setLethal] = useState(true)
  const [spell, setSpell] = useState('')
  const [level, setLevel] = useState(defaultLevel(sheet.slots))
  const [custom, setCustom] = useState('')

  // The draft is rebuilt from the controls rather than stored, so changing the
  // target after picking a weapon does not leave a stale sentence behind.
  const current: ActionDraft | null =
    draft === null
      ? null
      : draft.kind === 'attack'
        ? { kind: 'attack', weapon: draft.weapon, target, lethal }
        : draft.kind === 'spell'
          ? { kind: 'spell', spell, level, target }
          : draft.kind === 'item'
            ? { kind: 'item', item: draft.item, target }
            : { kind: 'custom', text: custom }

  const castable = spellsForLevel(sheet.spells, level)

  const pickLevel = (next: number): void => {
    setLevel(next)
    // A spell already picked may not survive the new level, so drop it rather
    // than send a 3rd-level spell into a 1st-level slot.
    const stillThere = spellsForLevel(sheet.spells, next).some((s) => s.name === spell)
    const kept = stillThere || sheet.spells.every((s) => s.name !== spell) ? spell : ''
    setSpell(kept)
    if (draft?.kind === 'spell') setDraft({ kind: 'spell', spell: kept, level: next, target })
  }

  const ready = isReady(current)
  const preview = current !== null && ready ? composeAction(current) : null

  const take = (): void => {
    if (preview === null) return
    onCompose(preview)
    onClose()
  }

  return (
    <div className="scrim">
      <div className="modal modal-actions" role="dialog" aria-label="Your options">
        <div className="modal-head">
          <h3>{sheet.actor.name}</h3>
          <span className="modal-sub">
            {sheet.round === null
              ? 'out of combat'
              : `round ${sheet.round}${sheet.yourTurn ? ' · your turn' : ''}`}
          </span>
        </div>

        <div className="modal-body">

        {sheet.targets.length > 0 && (
          <section className="sheet-section">
            <h4>Target</h4>
            <div className="sheet-targets">
              {sheet.targets.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`chip chip-pick stance-${t.stance}`}
                  aria-pressed={target === t.name}
                  // The colour is a reminder, not the only signal: the attitude
                  // is spelled out here for anyone who cannot use it.
                  title={t.attitude === null ? t.name : `${t.name} — ${t.attitude}`}
                  onClick={() => setTarget(target === t.name ? null : t.name)}
                >
                  <span className="stance-dot" aria-hidden="true" />
                  {t.name} <em>{t.hp}</em>
                </button>
              ))}
            </div>
          </section>
        )}

        {sheet.attacks.length > 0 && (
          <section className="sheet-section">
            <h4>Attack</h4>
            <div className="sheet-grid">
              {sheet.attacks.map((attack) => (
                <button
                  key={attack.name}
                  type="button"
                  className="opt sheet-weapon"
                  aria-pressed={draft?.kind === 'attack' && draft.weapon === attack.name}
                  onClick={() =>
                    setDraft({ kind: 'attack', weapon: attack.name, target, lethal })
                  }
                >
                  <span className="sheet-weapon-name">
                    {attack.name}
                    <span className="sheet-dice">{attack.damage}</span>
                  </span>
                  <em>
                    {attack.damageType} · {attack.range}
                    {attack.notes === null ? '' : ` · ${attack.notes}`}
                  </em>
                </button>
              ))}
            </div>
          </section>
        )}

        {sheet.canCast && (
          <section className="sheet-section">
            <h4>Cast</h4>

            {/* The level is chosen first and the list follows from it: a spell
                goes into a slot of its own level or higher, never a lower one,
                so picking the slot is what decides what is castable. */}
            <div className="sheet-targets sheet-levels">
              <button
                type="button"
                className="chip chip-pick"
                aria-pressed={level === 0}
                onClick={() => pickLevel(0)}
              >
                cantrip
              </button>
              {sheet.slots.map((slot) => (
                <button
                  key={slot.level}
                  type="button"
                  className="chip chip-pick"
                  aria-pressed={level === slot.level}
                  disabled={slot.current === 0}
                  onClick={() => pickLevel(slot.level)}
                >
                  {spellLevelLabel(slot.level)}{' '}
                  <em>
                    {'●'.repeat(slot.current)}
                    {'○'.repeat(Math.max(0, slot.max - slot.current))}
                  </em>
                </button>
              ))}
            </div>

            {/* The engine keeps no spell catalogue by design, so the list is
                what this character has been seen to cast — every cast is
                journalled, so the names come back exactly right. Anything new
                is typed once and then joins the row. */}
            {castable.length > 0 && (
              <div className="sheet-targets sheet-spells">
                {castable.map((known) => (
                  <button
                    key={known.name}
                    type="button"
                    className="chip chip-pick"
                    aria-pressed={draft?.kind === 'spell' && spell === known.name}
                    onClick={() => {
                      setSpell(known.name)
                      setDraft({ kind: 'spell', spell: known.name, level, target })
                    }}
                  >
                    {known.name}
                    {known.level !== level && <em>upcast</em>}
                  </button>
                ))}
              </div>
            )}

            <div className="sheet-cast">
              <input
                type="text"
                placeholder={
                  castable.length > 0
                    ? 'or another spell…'
                    : sheet.spells.length > 0
                      ? `nothing cast at ${spellLevelLabel(level)} yet — name one…`
                      : 'spell name…'
                }
                value={spell}
                onChange={(event) => {
                  setSpell(event.target.value)
                  setDraft({ kind: 'spell', spell: event.target.value, level, target })
                }}
              />
            </div>
          </section>
        )}

        {sheet.items.length > 0 && (
          <section className="sheet-section">
            <h4>Use</h4>
            <div className="sheet-targets">
              {sheet.items.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  className="chip chip-pick"
                  aria-pressed={draft?.kind === 'item' && draft.item === item.name}
                  onClick={() => setDraft({ kind: 'item', item: item.name, target })}
                >
                  {item.name}
                  {item.qty > 1 && <em>×{item.qty}</em>}
                </button>
              ))}
            </div>
          </section>
        )}

        {draft?.kind === 'attack' && (
          <label className="sheet-lethal">
            <input
              type="checkbox"
              checked={!lethal}
              onChange={(event) => setLethal(!event.target.checked)}
            />
            Pull the blow — knock them out rather than kill
          </label>
        )}

        <section className="sheet-section">
          <h4>Or do something else</h4>
          <textarea
            rows={2}
            placeholder="I kick the bench into his knees and…"
            value={custom}
            onChange={(event) => {
              setCustom(event.target.value)
              setDraft({ kind: 'custom', text: event.target.value })
            }}
          />
        </section>

        </div>

        <div className="modal-foot">
          <div className="brief">
            {preview === null ? (
              'Nothing picked.'
            ) : (
              <>
                <b>Sends: </b>
                {preview}
              </>
            )}
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!ready} onClick={take}>
            Take it
          </button>
        </div>
      </div>
    </div>
  )
}
