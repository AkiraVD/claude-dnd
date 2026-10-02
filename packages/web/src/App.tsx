import { useEffect, useRef, useState } from 'react'
import type { Creature } from '@dnd/engine'
import { backdropFor, faceTransform, portraitFor } from './art.js'
import { Actions } from './Actions.js'
import { actionSheet, defaultActor } from './actions.js'
import { Character } from './Character.js'
import { DiceCard } from './DiceCard.js'
import { doingLabel } from './doing.js'
import { blocks, speakerKey, type Block } from './markdown.js'
import { Panels } from './Panels.js'
import { Sessions } from './Sessions.js'
import { Setup } from './Setup.js'
import { Shop } from './Shop.js'
import { useTable, type LogEntry } from './useTable.js'
import type { JSX } from 'react'

export function App(): JSX.Element {
  const table = useTable()
  const [skippedSetup, setSkippedSetup] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)

  // A fresh campaign: nobody in it and nothing said yet. Resuming never matches,
  // because a saved campaign has creatures, and neither does a mid-session
  // reset, because the log is not empty.
  const fresh =
    table.state !== null && table.state.creatures.length === 0 && table.log.length === 0

  const met = table.state?.creatures.filter((c) => c.kind !== 'pc').length ?? 0
  const hasCharacter = table.state?.creatures.some((c) => c.kind === 'pc') === true

  const showSetup = fresh && !skippedSetup && table.connected
  // The setup modal offers a way back to a saved game, so it needs the list
  // before it is drawn. Loaded once, when the modal appears — the Sessions panel
  // reloads it for itself when it opens.
  useEffect(() => {
    if (showSetup) table.loadCampaigns()
  }, [showSetup])

  const otherSaves = table.campaigns.filter(
    (campaign) => campaign.id !== table.state?.campaign.id,
  ).length

  return (
    <div className="table">
      <Console
        table={table}
        met={met}
        showSheet={hasCharacter}
        onOpenSheet={() => setSheetOpen(true)}
        onOpenSessions={() => setSessionsOpen(true)}
      />
      <Panels state={table.state} />

      {showSetup && (
        <Setup
          onBegin={table.say}
          onSkip={() => setSkippedSetup(true)}
          saves={otherSaves}
          onResume={() => setSessionsOpen(true)}
        />
      )}

      {table.shop !== null && (
        <Shop shop={table.shop} onSend={table.say} onClose={table.closeShop} />
      )}

      {sheetOpen && table.state !== null && (
        <Character state={table.state} onClose={() => setSheetOpen(false)} />
      )}

      {sessionsOpen && (
        <Sessions
          campaigns={table.campaigns}
          current={table.state?.campaign.id ?? null}
          onLoad={table.loadCampaigns}
          onResume={table.resume}
          onClear={table.clearSession}
          onClose={() => setSessionsOpen(false)}
        />
      )}
    </div>
  )
}

function Console({
  table,
  met,
  showSheet,
  onOpenSheet,
  onOpenSessions,
}: {
  table: ReturnType<typeof useTable>
  met: number
  showSheet: boolean
  onOpenSheet: () => void
  onOpenSessions: () => void
}): JSX.Element {
  const [draft, setDraft] = useState('')
  const log = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)
  const pinned = useRef(true)

  /*
   * Follow the newest line, the way a terminal does — but only while the reader
   * is already at the bottom, so scrolling back over an earlier scene is not
   * yanked away by the next streamed token. The jump is instant rather than
   * smooth: a smooth scroll reports mid-animation positions to onScroll, which
   * reads as the reader having scrolled away and unpins the log.
   */
  useEffect(() => {
    const node = log.current
    if (node === null || !pinned.current) return
    node.scrollTop = node.scrollHeight
  }, [table.log, table.thinking])

  useEffect(() => {
    input.current?.focus()
  }, [])

  // Opened either by the player's own button or by `offer_actions`; the sheet
  // itself is derived from state the browser already holds, so there is one
  // derivation behind both doors.
  const sheet = table.actionsFor === null ? null : actionSheet(table.state, table.actionsFor)
  const me = defaultActor(table.state)

  const submit = (): void => {
    const text = draft.trim()
    if (text === '' || !table.connected) return
    table.say(text)
    setDraft('')
  }

  // The room the party is in, behind the reading column. The log is a narrow
  // strip on a wide screen and the rest of the frame was flat; this gives the
  // margins the place you are standing in, rather than nothing.
  const art = backdropFor(table.state?.backdrop ?? null, table.state?.scene ?? '')

  return (
    <main
      className={`console${art === null ? '' : ' console-art'}`}
      style={art === null ? undefined : { ['--scene-art' as string]: `url(${art})` }}
    >
      <header className="console-head">
        <span className="brand">dice tower</span>
        <span className={`dot ${table.connected ? 'dot-on' : 'dot-off'}`} />
        <span className="console-meta">
          {table.connected ? (table.model ?? 'starting the DM…') : 'disconnected'}
        </span>
        <button
          className="headbtn"
          type="button"
          onClick={onOpenSessions}
          title="Load another campaign, or start the DM over"
        >
          {table.state?.campaign.name ?? 'Sessions'}
        </button>
        {showSheet && (
          <button className="headbtn" type="button" onClick={onOpenSheet}>
            Character{met > 0 && <span className="count"> · {met} met</span>}
          </button>
        )}
        <span
          className="console-session"
          title={
            `engine session: ${table.state?.session ?? 'none yet — no step written by a ' +
              'session-aware engine'}\nclaude session: ${table.claudeSession ?? 'unknown'}`
          }
        >
          {table.state?.session ?? '—'}
        </span>
        {table.costUsd !== null && (
          <span className="console-cost">${table.costUsd.toFixed(2)}</span>
        )}
      </header>

      <div
        className="log"
        ref={log}
        onScroll={(event) => {
          const node = event.currentTarget
          pinned.current = node.scrollHeight - node.scrollTop - node.clientHeight < 60
        }}
      >
        {table.log.length === 0 && (
          <div className="empty">
            <p>The table is set.</p>
            <p className="empty-hint">
              Type <code>/play-dnd</code> to begin, or just say hello — in any language you
              like.
            </p>
          </div>
        )}

        {table.log.map((entry) => (
          <Entry key={entry.id} entry={entry} cast={table.state?.creatures ?? []} />
        ))}

        {table.thinking && (
          <div className="thinking">
            <span /> <span /> <span />
            {/* Named while it runs, because the long calls are the ones with
                nothing to show: the dots alone read as a hang. */}
            {doingLabel(table.doing) !== null && <em>{doingLabel(table.doing)}</em>}
          </div>
        )}
      </div>

      {table.choice !== null && (
        <div className="chiprow">
          <span className="lead">{table.choice.prompt}</span>
          {table.choice.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                setDraft(option)
                input.current?.focus()
              }}
            >
              {option}
            </button>
          ))}
          <button type="button" className="dismiss" onClick={table.dismissChoice}>
            something else
          </button>
        </div>
      )}

      {sheet !== null && (
        <Actions
          sheet={sheet}
          onCompose={(text) => {
            setDraft(text)
            input.current?.focus()
          }}
          onClose={table.closeActions}
        />
      )}

      <div className="composer">
        <textarea
          ref={input}
          value={draft}
          rows={1}
          placeholder={table.connected ? 'What do you do?' : 'waiting for the server…'}
          disabled={!table.connected}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        {me !== null && (
          <button
            type="button"
            className="composer-actions"
            onClick={() => table.openActions(me.id)}
            disabled={!table.connected}
            title="Your weapons, spells and targets"
          >
            options
          </button>
        )}
        <button type="button" onClick={submit} disabled={!table.connected || draft.trim() === ''}>
          send
        </button>
      </div>
    </main>
  )
}

function Entry({ entry, cast }: { entry: LogEntry; cast: readonly Creature[] }): JSX.Element {
  switch (entry.kind) {
    case 'player':
      return (
        <div className="line line-player">
          <span className="prompt">&gt;</span>
          <p>{entry.text}</p>
        </div>
      )

    case 'narration':
      return (
        <div className="line line-dm">
          <Prose text={entry.text} cast={cast} />
          {entry.streaming && <span className="caret" />}
        </div>
      )

    case 'roll':
      return <DiceCard call={entry.call} />

    case 'notice':
      return <div className={`line line-notice notice-${entry.level}`}>{entry.message}</div>
  }
}

/**
 * The DM writes in Markdown-ish prose: paragraphs, **bold** for the mechanical
 * beats, pipe tables for stock lists and loot, and the occasional bracketed
 * English term. Enough of it is rendered to read well without pulling in a
 * Markdown parser.
 */
function Prose({ text, cast }: { text: string; cast: readonly Creature[] }): JSX.Element {
  return (
    <>
      {blocks(text).map((block, index) => {
        if (block.kind === 'para') return <p key={index}>{inline(block.text)}</p>
        if (block.kind === 'speech') return <Speech key={index} block={block} cast={cast} />
        return <ProseTable key={index} block={block} />
      })}
    </>
  )
}

/**
 * A line of dialogue, under the face of whoever said it.
 *
 * The speaker is whatever the DM wrote before the colon, and that is what the
 * box shows — the cast is consulted only for the portrait. So a voice from the
 * dark, or someone the player has not met and who therefore is not in the cast
 * yet, still gets a box with their name on it and simply no face.
 */
function Speech({
  block,
  cast,
}: {
  block: Extract<Block, { kind: 'speech' }>
  cast: readonly Creature[]
}): JSX.Element {
  const match = speakerKey(
    block.speaker,
    cast.map((creature) => creature.name),
  )
  const who = cast.find((creature) => creature.name === match) ?? null
  const face = portraitFor(who?.profile.portrait)

  return (
    <div className="speech">
      {face !== null && (
        <span className="speech-face">
          <img
            src={face}
            alt=""
            style={{ transform: faceTransform(who?.profile.portrait) }}
            onError={(event) => {
              event.currentTarget.style.display = 'none'
            }}
          />
        </span>
      )}
      <div className="speech-said">
        <span className="speech-who">{block.speaker}</span>
        <p>{inline(block.text)}</p>
      </div>
    </div>
  )
}

function ProseTable({ block }: { block: Extract<Block, { kind: 'table' }> }): JSX.Element {
  return (
    <div className="prose-table">
      <table>
        <thead>
          <tr>
            {block.head.map((cell, column) => (
              <th key={column} style={{ textAlign: block.align[column] ?? 'left' }}>
                {inline(cell)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, index) => (
            <tr key={index}>
              {/* Walk the header, not the row: a short or long row still lines up. */}
              {block.head.map((_, column) => (
                <td key={column} style={{ textAlign: block.align[column] ?? 'left' }}>
                  {inline(row[column] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function inline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index))
    if (match[1] !== undefined) parts.push(<strong key={key++}>{match[1]}</strong>)
    else if (match[2] !== undefined) parts.push(<em key={key++}>{match[2]}</em>)
    else if (match[3] !== undefined) parts.push(<code key={key++}>{match[3]}</code>)
    last = pattern.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}
