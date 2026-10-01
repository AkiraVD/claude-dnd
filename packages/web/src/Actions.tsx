import { useState } from 'react'
import {
  composeAction,
  isReady,
  spellLevelLabel,
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
  const [level, setLevel] = useState(sheet.slots[0]?.level ?? 1)
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
                  className="chip chip-pick"
                  aria-pressed={target === t.name}
                  onClick={() => setTarget(target === t.name ? null : t.name)}
                >
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

        {(sheet.slots.length > 0 || sheet.spells.length > 0) && (
          <section className="sheet-section">
            <h4>
              Cast
              <span className="sheet-slots">
                {sheet.slots.map((slot) => (
                  <span key={slot.level} className="sheet-slot">
                    {spellLevelLabel(slot.level)}{' '}
                    {'●'.repeat(slot.current)}
                    {'○'.repeat(Math.max(0, slot.max - slot.current))}
                  </span>
                ))}
              </span>
            </h4>

            {/* The engine keeps no spell catalogue by design, so the list is
                what this character has been seen to cast — every cast is
                journalled, so the names come back exactly right. Anything new
                is typed once and then joins the row. */}
            {sheet.spells.length > 0 && (
              <div className="sheet-targets sheet-spells">
                {sheet.spells.map((known) => (
                  <button
                    key={known.name}
                    type="button"
                    className="chip chip-pick"
                    aria-pressed={draft?.kind === 'spell' && spell === known.name}
                    onClick={() => {
                      setSpell(known.name)
                      setLevel(known.level)
                      setDraft({ kind: 'spell', spell: known.name, level: known.level, target })
                    }}
                  >
                    {known.name} <em>{spellLevelLabel(known.level)}</em>
                  </button>
                ))}
              </div>
            )}

            <div className="sheet-cast">
              <input
                type="text"
                placeholder={sheet.spells.length > 0 ? 'or another spell…' : 'spell name…'}
                value={spell}
                onChange={(event) => {
                  setSpell(event.target.value)
                  setDraft({ kind: 'spell', spell: event.target.value, level, target })
                }}
              />
              <select
                value={level}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  setLevel(next)
                  if (draft?.kind === 'spell') setDraft({ kind: 'spell', spell, level: next, target })
                }}
                aria-label="Slot level"
              >
                <option value={0}>cantrip</option>
                {sheet.slots.map((slot) => (
                  <option key={slot.level} value={slot.level} disabled={slot.current === 0}>
                    {spellLevelLabel(slot.level)}
                    {slot.current === 0 ? ' — none left' : ''}
                  </option>
                ))}
              </select>
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
