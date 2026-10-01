import { abilityModifier, formatCoin, type Creature } from '@dnd/engine'
import { faceTransform, itemArtFor, portraitFor } from './art.js'
import type { TableState } from '@dnd/server/protocol.js'
import { useState } from 'react'
import type { JSX } from 'react'

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const

/**
 * You, the cast, and the journal.
 *
 * Everything here is already redacted at the server, so there is no filtering to
 * do and no way to get it wrong: an unrevealed note never arrived. That also
 * means this panel cannot say how many notes are hidden, which is deliberate —
 * "Sister Veyl · 2 secrets" tells the player exactly where to dig.
 */
export function Character({
  state,
  onClose,
}: {
  state: TableState
  onClose: () => void
}): JSX.Element {
  const party = state.creatures.filter((c) => c.kind === 'pc')
  const cast = state.creatures.filter((c) => c.kind !== 'pc')
  const [tab, setTab] = useState<'you' | 'met' | 'journal'>('you')

  const you = party[0] ?? null

  return (
    <div className="scrim">
      <div className="modal modal-character">
        <div className="modal-head">
          <h3>{tab === 'you' ? (you?.name ?? 'No character yet') : tab === 'met' ? 'Met' : 'Journal'}</h3>
          <span className="modal-sub">
            {tab === 'you'
              ? describe(you)
              : tab === 'met'
                ? `${cast.length} remembered`
                : 'what you have pieced together'}
          </span>
        </div>

        <div className="tabs" role="tablist">
          {(
            [
              ['you', 'You'],
              ['met', `Met · ${cast.length}`],
              ['journal', 'Journal'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="modal-body">
          {tab === 'you' && (you === null ? <Empty>No character yet.</Empty> : <Sheet you={you} />)}
          {tab === 'met' && <Cast cast={cast} />}
          {tab === 'journal' && <Journal state={state} />}
        </div>

        <div className="modal-foot">
          <div className="brief">Read only. Nothing here sends anything to the DM.</div>
          <button className="ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function describe(creature: Creature | null): string {
  if (creature === null) return ''
  return [creature.profile.race, creature.className, `level ${creature.level}`]
    .filter((part): part is string => typeof part === 'string' && part !== '')
    .join(' · ')
}

function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="pane-empty">{children}</p>
}

function Sheet({ you }: { you: Creature }): JSX.Element {
  const ratio = Math.max(0, Math.min(1, you.hp.current / you.hp.max))

  return (
    <>
      <div className="hpline">
        <span className="hp-label">HP</span>
        <span className="hp-track">
          <span className="hp-fill" style={{ width: `${ratio * 100}%` }} />
        </span>
        <span className="hp-label">
          {you.hp.current}/{you.hp.max}
        </span>
        <span className="hp-label">AC {you.ac}</span>
        <span className="hp-label">{you.speed} ft</span>
      </div>

      <div className="abilities">
        {ABILITIES.map((ability) => {
          const mod = abilityModifier(you.scores[ability])
          return (
            <div key={ability} className="ability">
              <span className="ability-name">{ability}</span>
              <span className="ability-mod">
                {mod >= 0 ? '+' : ''}
                {mod}
              </span>
              <span className="ability-score">{you.scores[ability]}</span>
            </div>
          )
        })}
      </div>

      <div className="subhead">
        <span>Purse</span>
        <span className="right">{formatCoin(you.purse)}</span>
      </div>

      <div className="subhead">
        <span>Pack</span>
      </div>
      {you.items.length === 0 ? (
        <Empty>Nothing but what you stand up in.</Empty>
      ) : (
        <div className="rows">
          {you.items.map((item) => (
            <div key={item.name} className="row">
              <span className="nm">
                <ItemArt name={item.name} />
                {item.name}
                {item.notes !== undefined && <span className="hint"> — {item.notes}</span>}
              </span>
              <span className="qty">×{item.qty}</span>
            </div>
          ))}
        </div>
      )}

      {you.attacks.length > 0 && (
        <>
          <div className="subhead">
            <span>Attacks</span>
          </div>
          <div className="rows">
            {you.attacks.map((attack) => (
              <div key={attack.name} className="row">
                <span className="nm">{attack.name}</span>
                <span className="val">
                  {attack.damage} {attack.damageType}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {you.resources.length > 0 && (
        <>
          <div className="subhead">
            <span>Resources</span>
          </div>
          <div className="rows">
            {you.resources.map((resource) => (
              <div key={resource.name} className="row">
                <span className="nm">{resource.label}</span>
                <span className="qty">
                  {resource.current}/{resource.max}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

/** A small picture for an item, when one of the stock pieces matches its name. */
function ItemArt({ name }: { name: string }): JSX.Element | null {
  const art = itemArtFor(name)
  if (art === null) return null

  return (
    <span
      className="item-art"
      role="presentation"
      style={{ WebkitMaskImage: `url(${art})`, maskImage: `url(${art})` }}
    />
  )
}

function Cast({ cast }: { cast: Creature[] }): JSX.Element {
  if (cast.length === 0) return <Empty>You have not met anyone yet.</Empty>

  return (
    <div className="cast">
      {cast.map((npc) => {
        const who = [npc.profile.race, npc.profile.role, npc.profile.location]
          .filter((part): part is string => typeof part === 'string' && part !== '')
          .join(' · ')

        return (
          <div key={npc.id} className="npc">
            <div className="npc-head">
              {portraitFor(npc.profile.portrait) !== null && (
                <span className="npc-face">
                  <img
                    src={portraitFor(npc.profile.portrait)!}
                    alt=""
                    style={{ transform: faceTransform(npc.profile.portrait) }}
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                </span>
              )}
              <span className="nm">{npc.name}</span>
              <span className="who">{who === '' ? '—' : who}</span>
              <span className="npc-meta">
                {npc.items.some((item) => item.price !== undefined) && (
                  <span className="chip chip-info">trades</span>
                )}
                {npc.profile.attitude !== null && (
                  <span className={`chip ${attitudeClass(npc.profile.attitude)}`}>
                    {npc.profile.attitude}
                  </span>
                )}
              </span>
            </div>

            {npc.profile.manner !== null && <p className="npc-note">{npc.profile.manner}</p>}

            {npc.profile.notes.length === 0 && npc.profile.manner === null ? (
              <p className="npc-note unknown">You have not learned anything about them yet.</p>
            ) : (
              npc.profile.notes.map((note) => (
                <p key={note.text} className="npc-note">
                  {note.text}
                </p>
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}

function Journal({ state }: { state: TableState }): JSX.Element {
  const story = state.story

  if (story === null) {
    return <Empty>The campaign has no shape yet.</Empty>
  }

  return (
    <>
      <p className="journal-premise">{story.premise}</p>
      <p className="journal-question">{story.question}</p>

      {story.beats.length > 0 && (
        <>
          <div className="subhead">
            <span>So far</span>
          </div>
          <div className="rows">
            {story.beats.map((beat) => (
              <div key={beat.text} className="row">
                <span className="nm">{beat.text}</span>
                {beat.state === 'reached' && <span className="hint">done</span>}
              </div>
            ))}
          </div>
        </>
      )}

      <p className="spoiler">
        The campaign has more written down than this. A line appears when you have earned it in
        play.
      </p>
    </>
  )
}

function attitudeClass(attitude: string): string {
  switch (attitude) {
    case 'hostile':
      return 'chip-bad'
    case 'unfriendly':
      return 'chip-crit'
    case 'friendly':
    case 'helpful':
      return 'chip-good'
    default:
      return 'chip-faint'
  }
}
