import { useEffect, useRef, useState } from 'react'
import { Character } from './Character.js'
import { DiceCard } from './DiceCard.js'
import { blocks, type Block } from './markdown.js'
import { Panels } from './Panels.js'
import { Setup } from './Setup.js'
import { Shop } from './Shop.js'
import { useTable, type LogEntry } from './useTable.js'

export function App(): JSX.Element {
  const table = useTable()
  const [skippedSetup, setSkippedSetup] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  // A fresh campaign: nobody in it and nothing said yet. Resuming never matches,
  // because a saved campaign has creatures, and neither does a mid-session
  // reset, because the log is not empty.
  const fresh =
    table.state !== null && table.state.creatures.length === 0 && table.log.length === 0

  const met = table.state?.creatures.filter((c) => c.kind !== 'pc').length ?? 0
  const hasCharacter = table.state?.creatures.some((c) => c.kind === 'pc') === true

  return (
    <div className="table">
      <Console
        table={table}
        met={met}
        showSheet={hasCharacter}
        onOpenSheet={() => setSheetOpen(true)}
      />
      <Panels state={table.state} />

      {fresh && !skippedSetup && table.connected && (
        <Setup onBegin={table.say} onSkip={() => setSkippedSetup(true)} />
      )}

      {table.shop !== null && (
        <Shop shop={table.shop} onSend={table.say} onClose={table.closeShop} />
      )}

      {sheetOpen && table.state !== null && (
        <Character state={table.state} onClose={() => setSheetOpen(false)} />
      )}
    </div>
  )
}

function Console({
  table,
  met,
  showSheet,
  onOpenSheet,
}: {
  table: ReturnType<typeof useTable>
  met: number
  showSheet: boolean
  onOpenSheet: () => void
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

  const submit = (): void => {
    const text = draft.trim()
    if (text === '' || !table.connected) return
    table.say(text)
    setDraft('')
  }

  return (
    <main className="console">
      <header className="console-head">
        <span className="brand">dice tower</span>
        <span className={`dot ${table.connected ? 'dot-on' : 'dot-off'}`} />
        <span className="console-meta">
          {table.connected ? (table.model ?? 'starting the DM…') : 'disconnected'}
        </span>
        {showSheet && (
          <button className="headbtn" type="button" onClick={onOpenSheet}>
            Character{met > 0 && <span className="count"> · {met} met</span>}
          </button>
        )}
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
          <Entry key={entry.id} entry={entry} />
        ))}

        {table.thinking && (
          <div className="thinking">
            <span /> <span /> <span />
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
        <button type="button" onClick={submit} disabled={!table.connected || draft.trim() === ''}>
          send
        </button>
      </div>
    </main>
  )
}

function Entry({ entry }: { entry: LogEntry }): JSX.Element {
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
          <Prose text={entry.text} />
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
function Prose({ text }: { text: string }): JSX.Element {
  return (
    <>
      {blocks(text).map((block, index) =>
        block.kind === 'para' ? (
          <p key={index}>{inline(block.text)}</p>
        ) : (
          <ProseTable key={index} block={block} />
        ),
      )}
    </>
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
