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

/** A row of options the DM offered, from `offer_choice`. */
export interface Choice {
  prompt: string
  options: string[]
}

/** A vendor's counter, from `open_shop`. */
export interface Shop {
  vendor: {
    id: string
    name: string
    race: string | null
    role: string | null
    location: string | null
    attitude: string | null
  }
  buyer: { id: string; name: string; purse: number }
  stock: Array<{ name: string; qty: number; price: number; notes?: string }>
  pack: Array<{ name: string; qty: number }>
  canTradeIn: boolean
}

export interface Table {
  connected: boolean
  thinking: boolean
  model: string | null
  /** The `claude` conversation driving the table, from the stream. */
  claudeSession: string | null
  state: TableState | null
  log: LogEntry[]
  costUsd: number | null
  /** The options above the composer, until something is sent. */
  choice: Choice | null
  /** The open counter, or null. */
  shop: Shop | null
  /** Whose options are open, from `offer_actions` or the player's own button. */
  actionsFor: string | null
  openActions: (id: string) => void
  closeActions: () => void
  say: (text: string) => void
  dismissChoice: () => void
  closeShop: () => void
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
  const [claudeSession, setClaudeSession] = useState<string | null>(null)
  const [state, setState] = useState<TableState | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [costUsd, setCostUsd] = useState<number | null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [shop, setShop] = useState<Shop | null>(null)
  const [actionsFor, setActionsFor] = useState<string | null>(null)

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
          setClaudeSession(message.sessionId)
          setState(message.state)
          return

        case 'status':
          setModel(message.model)
          setClaudeSession(message.sessionId)
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

        case 'tool': {
          // Two tools exist only to drive this UI; their payload is the panel.
          const data = message.call.data
          if (!message.call.isError && data !== null) {
            const offered = data['choice'] as Choice | undefined
            if (offered !== undefined) setChoice(offered)
            const counter = data['shop'] as Shop | undefined
            if (counter !== undefined) setShop(counter)
            const options = data['actions'] as { actorId: string } | undefined
            if (options !== undefined) setActionsFor(options.actorId)
          }

          // Bookkeeping calls do not earn a card; only failures surface.
          if (message.call.isError) {
            setLog((entries) => [
              ...sealed(entries),
              { kind: 'roll', id: nextId(), call: message.call },
            ])
          }
          return
        }

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
    // Both panels are answers to a question that has now been answered.
    setChoice(null)
    setShop(null)
  }, [])

  const dismissChoice = useCallback(() => setChoice(null), [])
  const closeShop = useCallback(() => setShop(null), [])

  return {
    connected,
    thinking,
    model,
    claudeSession,
    state,
    log,
    costUsd,
    choice,
    shop,
    actionsFor,
    openActions: setActionsFor,
    closeActions: () => setActionsFor(null),
    say,
    dismissChoice,
    closeShop,
  }
}

/** Close off a streaming narration entry so the next one starts fresh. */
function sealed(entries: LogEntry[]): LogEntry[] {
  const last = entries.at(-1)
  if (last?.kind !== 'narration' || !last.streaming) return entries
  return [...entries.slice(0, -1), { ...last, streaming: false }]
}
