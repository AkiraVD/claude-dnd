import { useCallback, useEffect, useRef, useState } from 'react'
import type { ServerMessage, TableState, ToolCallView } from '@dnd/server/protocol.js'

export interface NarrationEntry {
  kind: 'narration'
  id: string
  /** The DM's prose. Grows as deltas arrive. */
  text: string
  streaming: boolean
}

export interface PlayerEntry {
  kind: 'player'
  id: string
  text: string
}

export interface RollEntry {
  kind: 'roll'
  id: string
  call: ToolCallView
}

export interface NoticeEntry {
  kind: 'notice'
  id: string
  message: string
  level: 'info' | 'error'
}

export type LogEntry = NarrationEntry | PlayerEntry | RollEntry | NoticeEntry

export interface Table {
  connected: boolean
  thinking: boolean
  model: string | null
  state: TableState | null
  log: LogEntry[]
  costUsd: number | null
  say: (text: string) => void
}

let counter = 0
const nextId = () => `e${++counter}`

/**
 * One WebSocket to the server, turned into a log and a state snapshot.
 *
 * Narration arrives as token deltas, so the newest entry is mutated in place
 * while it streams and sealed when the turn ends — which is what makes the prose
 * type out rather than appearing in a block.
 */
export function useTable(): Table {
  const socket = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [model, setModel] = useState<string | null>(null)
  const [state, setState] = useState<TableState | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [costUsd, setCostUsd] = useState<number | null>(null)

  useEffect(() => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
    const ws = new WebSocket(url)
    socket.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      setThinking(false)
    }

    ws.onmessage = (raw) => {
      const message = JSON.parse(String(raw.data)) as ServerMessage

      switch (message.type) {
        case 'hello':
          setModel(message.model)
          setState(message.state)
          return

        case 'status':
          setModel(message.model)
          return

        case 'state':
          setState(message.state)
          return

        case 'turn-start':
          setThinking(true)
          return

        case 'thinking':
          setThinking(true)
          return

        case 'player':
          setLog((entries) => [...entries, { kind: 'player', id: nextId(), text: message.text }])
          return

        case 'narration-delta':
          setThinking(false)
          setLog((entries) => {
            const last = entries.at(-1)
            if (last?.kind === 'narration' && last.streaming) {
              return [...entries.slice(0, -1), { ...last, text: last.text + message.text }]
            }
            return [
              ...entries,
              { kind: 'narration', id: nextId(), text: message.text, streaming: true },
            ]
          })
          return

        case 'narration':
          // The complete block arrives after its deltas; seal the streaming entry
          // rather than printing the same prose twice.
          setLog((entries) => {
            const last = entries.at(-1)
            if (last?.kind === 'narration' && last.streaming) {
              return [...entries.slice(0, -1), { ...last, text: message.text, streaming: false }]
            }
            return [
              ...entries,
              { kind: 'narration', id: nextId(), text: message.text, streaming: false },
            ]
          })
          return

        case 'roll':
          setLog((entries) => [
            ...sealed(entries),
            { kind: 'roll', id: nextId(), call: message.call },
          ])
          return

        case 'tool':
          // Bookkeeping calls do not earn a card; only failures surface.
          if (message.call.isError) {
            setLog((entries) => [
              ...sealed(entries),
              { kind: 'roll', id: nextId(), call: message.call },
            ])
          }
          return

        case 'turn-end':
          setThinking(false)
          setCostUsd(message.costUsd)
          setLog(sealed)
          return

        case 'notice':
          if (message.level === 'error') {
            setLog((entries) => [
              ...entries,
              { kind: 'notice', id: nextId(), message: message.message, level: 'error' },
            ])
          }
          return
      }
    }

    return () => ws.close()
  }, [])

  const say = useCallback((text: string) => {
    const ws = socket.current
    if (ws === null || ws.readyState !== WebSocket.OPEN) return
    ws.send(JSON.stringify({ type: 'say', text }))
    setThinking(true)
  }, [])

  return { connected, thinking, model, state, log, costUsd, say }
}

/** Close off a streaming narration entry so the next one starts fresh. */
function sealed(entries: LogEntry[]): LogEntry[] {
  const last = entries.at(-1)
  if (last?.kind !== 'narration' || !last.streaming) return entries
  return [...entries.slice(0, -1), { ...last, streaming: false }]
}
