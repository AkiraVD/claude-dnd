import { useCallback, useEffect, useRef, useState } from 'react'
import type { CampaignHeader, ServerMessage, TableState, ToolCallView } from '@dnd/server/protocol.js'
import { TRANSCRIPT_KEY, packTranscript, readTranscript } from './transcript.js'

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
  /** The saves, for the session picker. Loaded on demand. */
  campaigns: CampaignHeader[]
  loadCampaigns: () => void
  /** Throw the DM's conversation away. The campaign is untouched. */
  clearSession: () => void
  /** Fresh conversation, then load that campaign into it. */
  resume: (campaignId: number) => void
  say: (text: string) => void
  dismissChoice: () => void
  closeShop: () => void
}

let counter = 0
// Namespaced per page load, so ids restored from a previous load of this tab
// cannot collide with ids minted after it and leave React with two keys alike.
const run = Math.random().toString(36).slice(2, 7)
const nextId = () => `${run}-${++counter}`

/** sessionStorage, which is absent in a private window and throws when full. */
const store = {
  read(): string | null {
    try {
      return sessionStorage.getItem(TRANSCRIPT_KEY)
    } catch {
      return null
    }
  },
  write(value: string): void {
    try {
      sessionStorage.setItem(TRANSCRIPT_KEY, value)
    } catch {
      // Out of quota or blocked. The log stays on screen; it just will not
      // survive the next refresh, which is where it was before this existed.
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(TRANSCRIPT_KEY)
    } catch {
      /* nothing to do */
    }
  },
}

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
  const [campaigns, setCampaigns] = useState<CampaignHeader[]>([])

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

        case 'cleared':
          // The DM that wrote these lines no longer exists; keeping them would
          // suggest it remembers them.
          setLog([])
          setThinking(false)
          setChoice(null)
          setShop(null)
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

  // Restore once, as soon as the server names the conversation. A refresh keeps
  // the DM's process and so keeps its session id, which is what makes this the
  // same session rather than a new one wearing the same campaign.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current || claudeSession === null) return
    restored.current = true
    const saved = readTranscript(claudeSession, store.read())
    // Only into an empty log: anything already here arrived on this connection
    // and is newer than what was written before the refresh.
    if (saved.length > 0) setLog((entries) => (entries.length === 0 ? saved : entries))
  }, [claudeSession])

  useEffect(() => {
    if (claudeSession === null) return
    if (log.length === 0) return
    store.write(packTranscript(claudeSession, log))
  }, [claudeSession, log])

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
    campaigns,
    loadCampaigns: () => {
      void fetch('/api/campaigns')
        .then((r) => r.json())
        .then((body: { campaigns: CampaignHeader[] }) => setCampaigns(body.campaigns))
        .catch(() => setCampaigns([]))
    },
    clearSession: () => {
      // The DM is about to forget; the transcript goes with it, or a refresh
      // would restore prose this conversation has never seen.
      store.clear()
      setLog([])
      socket.current?.send(JSON.stringify({ type: 'clear' }))
    },
    resume: (campaignId: number) => {
      store.clear()
      setLog([])
      socket.current?.send(JSON.stringify({ type: 'resume', campaignId }))
    },
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
