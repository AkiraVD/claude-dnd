import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { CampaignDb } from '@dnd/mcp/db.js'
import { WebSocketServer, type WebSocket } from 'ws'
import { ClaudeSession, type SessionEvent } from './claude-session.js'
import { readTable as readTableFrom } from './table.js'
import type { ClientMessage, ServerMessage, TableState, ToolCallView } from './protocol.js'

const ROOT = resolve(process.env['DND_ROOT'] ?? process.cwd())
const DB_PATH = process.env['DND_DB'] ?? join(ROOT, 'campaign.db')
const WEB_DIST = join(ROOT, 'packages/web/dist')
const PORT = Number(process.env['PORT'] ?? 5173)
/**
 * Loopback by default. A page on this server can send arbitrary prompts to a
 * `claude` child process running under your subscription, so it should not be
 * reachable just because someone is on the same wifi. Put a tunnel or reverse
 * proxy in front of it to share the table, or set HOST=0.0.0.0 deliberately.
 */
const HOST = process.env['HOST'] ?? '127.0.0.1'

/**
 * The MCP server runs as a child of `claude`, not of this process, and persists
 * everything to SQLite. So this reads the same file directly to hydrate a
 * freshly-loaded page: the browser gets authoritative state on connect, and
 * live updates arrive from the claude stream.
 */
const db = new CampaignDb(DB_PATH)

// ── the DM process ─────────────────────────────────────────────────────────────

const clients = new Set<WebSocket>()
let model: string | null = null
let mcp: Array<{ name: string; status: string }> = []

function broadcast(message: ServerMessage): void {
  const payload = JSON.stringify(message)
  for (const client of clients) {
    if (client.readyState === 1) client.send(payload)
  }
}

const session = new ClaudeSession({
  cwd: ROOT,
  systemPromptFile: join(ROOT, '.claude/dm-prompt.md'),
  mcpConfig: join(ROOT, '.mcp.json'),
  allowedTools: ['mcp__dnd'],
  env: { DND_DB: DB_PATH },
})

/** Tool calls awaiting their result, so the card can carry both. */
const pending = new Map<string, { name: string; input: Record<string, unknown> }>()

/** Which tools produce a dice result worth its own card in the log. */
const ROLL_TOOLS = new Set([
  'roll_dice',
  'ability_check',
  'skill_check',
  'saving_throw',
  'attack_roll',
  'death_save',
  'concentration_save',
  'spend_hit_die',
  'start_combat',
])

/** Tools after which the panels are stale and should be re-read. */
const STATE_TOOLS =
  /^(add_creature|remove_creature|apply_|heal|attack_roll|death_save|stabilise|kill|set_|remove_condition|start_c|next_turn|end_combat|remove_from_combat|cast_spell|spend_|short_rest|long_rest|award_xp|level_up|add_resource|concentration_save|undo|reset_campaign|new_campaign|load_campaign|rename_campaign|earn_money|spend_money|give_item|take_item|buy|sell|update_npc|add_note|reveal_note|amend_story|beat)/

session.on('event', (event: SessionEvent) => {
  switch (event.type) {
    case 'ready':
      model = event.model
      mcp = event.mcpServers
      broadcast({ type: 'status', model, sessionId: event.sessionId, mcp })
      return

    case 'turn-start':
      broadcast({ type: 'turn-start' })
      return

    case 'narration-delta':
      broadcast({ type: 'narration-delta', text: event.text })
      return

    case 'narration':
      broadcast({ type: 'narration', text: event.text })
      return

    case 'thinking':
      broadcast({ type: 'thinking' })
      return

    case 'tool-call':
      pending.set(event.id, { name: event.name, input: event.input })
      return

    case 'tool-result': {
      const call = pending.get(event.id)
      pending.delete(event.id)
      if (!call) return

      const data =
        event.data !== null && typeof event.data === 'object'
          ? (event.data as Record<string, unknown>)
          : null

      const view: ToolCallView = {
        id: event.id,
        name: call.name,
        input: call.input,
        isError: event.isError,
        narration: event.isError
          ? event.text
          : typeof data?.['narration'] === 'string'
            ? (data['narration'] as string)
            : event.text.slice(0, 200),
        data,
      }

      broadcast({ type: ROLL_TOOLS.has(call.name) || event.isError ? 'roll' : 'tool', call: view })
      if (STATE_TOOLS.test(call.name)) broadcast({ type: 'state', state: readTableFrom(db) })
      return
    }

    case 'turn-end':
      broadcast({ type: 'turn-end', costUsd: event.costUsd })
      broadcast({ type: 'state', state: readTableFrom(db) })
      return

    case 'notice':
      broadcast({ type: 'notice', message: event.message, level: 'info' })
      return

    case 'error':
      broadcast({ type: 'notice', message: event.message, level: 'error' })
      return

    case 'exit':
      broadcast({
        type: 'notice',
        message: `the DM process exited (code ${event.code ?? 'null'}) — restart the server`,
        level: 'error',
      })
      return
  }
})

// ── http + websocket ───────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function serveStatic(request: IncomingMessage, response: ServerResponse): void {
  const url = new URL(request.url ?? '/', 'http://localhost')

  if (url.pathname === '/api/state') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify(readTableFrom(db)))
    return
  }

  if (!existsSync(WEB_DIST)) {
    response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(
      'The web app has not been built yet.\n\nRun:  npm run build --workspace @dnd/web\n',
    )
    return
  }

  // Everything that is not a file falls through to index.html.
  const requested = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '')
  let file = join(WEB_DIST, requested)
  if (!file.startsWith(WEB_DIST) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(WEB_DIST, 'index.html')
  }

  response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(response)
}

const http = createServer(serveStatic)
const wss = new WebSocketServer({ server: http, path: '/ws' })

wss.on('connection', (socket) => {
  clients.add(socket)

  const hello: ServerMessage = {
    type: 'hello',
    model,
    sessionId: session.sessionId,
    state: readTableFrom(db),
  }
  socket.send(JSON.stringify(hello))

  socket.on('message', (raw) => {
    let message: ClientMessage
    try {
      message = JSON.parse(String(raw)) as ClientMessage
    } catch {
      return
    }

    if (message.type === 'say' && message.text.trim() !== '') {
      // Echo the player's own line so every connected tab shows it.
      broadcast({ type: 'player', text: message.text })
      session.send(message.text)
    } else if (message.type === 'refresh') {
      socket.send(JSON.stringify({ type: 'state', state: readTableFrom(db) } satisfies ServerMessage))
    }
  })

  socket.on('close', () => clients.delete(socket))
})

http.listen(PORT, HOST, () => {
  console.log(`\n  dnd table ready\n`)
  console.log(`  play at      http://${HOST}:${PORT}`)
  console.log(`  campaigns    ${DB_PATH}`)
  console.log(`  project root ${ROOT}`)
  if (!existsSync(WEB_DIST)) {
    console.log(`\n  the UI is not built yet — run: npm run build --workspace @dnd/web`)
  }
  console.log('')
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log('\nshutting the table down…')
    session.stop()
    db.close()
    http.close(() => process.exit(0))
  })
}
