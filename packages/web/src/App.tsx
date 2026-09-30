import { useEffect, useRef, useState } from 'react'
import { DiceCard } from './DiceCard.js'
import { Panels } from './Panels.js'
import { useTable, type LogEntry } from './useTable.js'

export function App(): JSX.Element {
  const table = useTable()

  return (
    <div className="table">
      <Console table={table} />
      <Panels state={table.state} />
    </div>
  )
}

function Console({ table }: { table: ReturnType<typeof useTable> }): JSX.Element {
  const [draft, setDraft] = useState('')
  const log = useRef<HTMLDivElement | null>(null)
  const input = useRef<HTMLTextAreaElement | null>(null)

  // Follow the newest line, the way a terminal does.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' })
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
        {table.costUsd !== null && (
          <span className="console-cost">${table.costUsd.toFixed(2)}</span>
        )}
      </header>

      <div className="log" ref={log}>
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
 * beats, and the occasional bracketed English term. Enough of it is rendered to
 * read well without pulling in a Markdown parser.
 */
function Prose({ text }: { text: string }): JSX.Element {
  return (
    <>
      {text.split(/\n{2,}/).map((paragraph, index) => (
        <p key={index}>{inline(paragraph)}</p>
      ))}
    </>
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
