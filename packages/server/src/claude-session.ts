import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'

/**
 * One long-lived `claude` process per campaign, driven over stdin.
 *
 * `--input-format stream-json` lets many player turns go down one stdin, which is
 * what makes this viable: no respawn between turns, so no startup cost, and the
 * stdio MCP server it launches stays alive for the whole session.
 *
 * The message shape below was established by probing the CLI rather than read off
 * a doc page: `{type:'user', message:{role:'user', content:[{type:'text',...}]}}`,
 * with no session id or parent tool id needed.
 */
export type SessionEvent =
  | { type: 'ready'; sessionId: string; model: string; mcpServers: Array<{ name: string; status: string }> }
  | { type: 'turn-start' }
  | { type: 'narration-delta'; text: string }
  | { type: 'narration'; text: string }
  | { type: 'thinking' }
  | { type: 'tool-call'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool-result'; id: string; isError: boolean; text: string; data: unknown }
  | { type: 'turn-end'; costUsd: number | null; turns: number | null; subtype: string }
  | { type: 'notice'; message: string }
  | { type: 'error'; message: string }
  | { type: 'exit'; code: number | null }

export interface SessionOptions {
  /** Working directory; the CLI resolves .mcp.json and skills relative to it. */
  cwd: string
  /** Passed to --append-system-prompt-file. */
  systemPromptFile: string
  /** Passed to --mcp-config. */
  mcpConfig: string
  /** Tool name patterns that never prompt, e.g. ['mcp__dnd']. */
  allowedTools: string[]
  /** Reuse an existing conversation. */
  resumeSessionId?: string
  /**
   * The command and arguments to run instead of the CLI. Only tests pass this —
   * they need a process that starts and stays up, which `claude` will not do
   * without a real config, and what is worth testing here is how a child is
   * torn down rather than which child it was.
   */
  spawnAs?: { command: string; args: string[] }
  env?: Record<string, string>
}

export declare interface ClaudeSession {
  on(event: 'event', listener: (e: SessionEvent) => void): this
  emit(event: 'event', e: SessionEvent): boolean
}

export class ClaudeSession extends EventEmitter {
  #child!: ChildProcessWithoutNullStreams
  #options: SessionOptions
  #buffer = ''
  #sessionId: string | null = null
  #busy = false
  #queue: string[] = []

  constructor(options: SessionOptions) {
    super()
    this.#options = options
    this.#spawn()
  }

  /**
   * Start the CLI. Separate from the constructor so a conversation can be
   * thrown away and begun again without rebuilding anything around it.
   */
  #spawn(): void {
    const options = this.#options
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--replay-user-messages',
      '--append-system-prompt-file', options.systemPromptFile,
      '--mcp-config', options.mcpConfig,
      // Strip every built-in tool. The DM gets the game tools and nothing else:
      // no filesystem, no shell, no network. There is no blast radius to reason
      // about, which is what makes running it unattended reasonable.
      '--tools', '',
      '--permission-mode', 'dontAsk',
    ]
    for (const pattern of options.allowedTools) args.push('--allowedTools', pattern)
    if (options.resumeSessionId !== undefined) args.push('--resume', options.resumeSessionId)

    this.#child = spawn(options.spawnAs?.command ?? 'claude', options.spawnAs?.args ?? args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    }) as ChildProcessWithoutNullStreams

    this.#child.stdout.setEncoding('utf8')
    this.#child.stdout.on('data', (chunk: string) => this.#consume(chunk))

    this.#child.stderr.setEncoding('utf8')
    this.#child.stderr.on('data', (chunk: string) => {
      // The CLI and the MCP server both use stderr for diagnostics. Surface the
      // interesting lines and drop the noise.
      for (const line of chunk.split('\n')) {
        const text = line.trim()
        if (text === '') continue
        if (/ExperimentalWarning|Use `node --trace-warnings/.test(text)) continue
        this.emit('event', { type: 'notice', message: text })
      }
    })

    this.#child.on('error', (error) => {
      this.emit('event', { type: 'error', message: `could not start claude: ${error.message}` })
    })

    this.#child.on('exit', (code) => {
      this.emit('event', { type: 'exit', code })
    })
  }

  /**
   * Throw the conversation away and start a new one.
   *
   * This is what `/clear` does, done from the outside: the campaign is in SQLite
   * and untouched, so the new DM reads the same table with no memory of how it
   * got there. Queued turns are dropped — they were meant for the conversation
   * that no longer exists.
   */
  restart(): void {
    // Detach the outgoing child before killing it, rather than guarding its exit
    // with a flag: the exit event arrives a tick later, by which time any flag
    // set around the kill has already been cleared, and the player sees "the DM
    // process exited" for a restart they asked for.
    const previous = this.#child
    previous.removeAllListeners()
    previous.stdout.removeAllListeners()
    previous.stderr.removeAllListeners()
    previous.stdin.end()
    previous.kill('SIGTERM')

    this.#buffer = ''
    this.#sessionId = null
    this.#busy = false
    this.#queue = []
    this.#spawn()
  }

  get sessionId(): string | null {
    return this.#sessionId
  }

  get busy(): boolean {
    return this.#busy
  }

  /**
   * Queue a player turn. The CLI processes one turn at a time, so turns sent
   * while it is thinking wait rather than interleaving.
   */
  send(text: string): void {
    if (this.#busy) {
      this.#queue.push(text)
      return
    }
    this.#write(text)
  }

  #write(text: string): void {
    this.#busy = true
    this.emit('event', { type: 'turn-start' })
    this.#child.stdin.write(
      `${JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text }] },
      })}\n`,
    )
  }

  stop(): void {
    this.#child.stdin.end()
    this.#child.kill('SIGTERM')
  }

  #consume(chunk: string): void {
    this.#buffer += chunk
    const lines = this.#buffer.split('\n')
    this.#buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (line.trim() === '') continue
      let message: Record<string, any>
      try {
        message = JSON.parse(line)
      } catch {
        this.emit('event', { type: 'notice', message: `unparseable line: ${line.slice(0, 200)}` })
        continue
      }
      this.#handle(message)
    }
  }

  #handle(message: Record<string, any>): void {
    for (const event of translate(message)) {
      if (event.type === 'ready') this.#sessionId = event.sessionId === '' ? null : event.sessionId
      if (event.type === 'turn-end') this.#busy = false
      this.emit('event', event)
    }

    if (message['type'] === 'result') {
      const next = this.#queue.shift()
      if (next !== undefined) this.#write(next)
    }
  }
}

/**
 * One stream-json message to zero or more session events.
 *
 * Pure, so the wire format can be tested against recorded lines without
 * spawning the CLI — which is where the shapes below came from in the first
 * place.
 */
export function translate(message: Record<string, any>): SessionEvent[] {
  switch (message['type']) {
    case 'system': {
      if (message['subtype'] !== 'init') return []
      return [
        {
          type: 'ready',
          sessionId: message['session_id'] ?? '',
          model: message['model'] ?? 'unknown',
          mcpServers: message['mcp_servers'] ?? [],
        },
      ]
    }

    case 'stream_event': {
      const delta = message['event']?.delta
      if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
        return [{ type: 'narration-delta', text: delta.text }]
      }
      if (delta?.type === 'thinking_delta') return [{ type: 'thinking' }]
      return []
    }

    case 'assistant': {
      const events: SessionEvent[] = []
      for (const block of message['message']?.content ?? []) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
          events.push({ type: 'narration', text: block.text })
        } else if (block.type === 'tool_use') {
          events.push({
            type: 'tool-call',
            id: block.id,
            name: String(block.name).replace(/^mcp__dnd__/, ''),
            input: block.input ?? {},
          })
        }
      }
      return events
    }

    case 'user': {
      const events: SessionEvent[] = []
      for (const block of message['message']?.content ?? []) {
        if (block.type !== 'tool_result') continue
        const text = Array.isArray(block.content)
          ? block.content.map((c: { text?: string }) => c.text ?? '').join('')
          : String(block.content ?? '')
        let data: unknown = null
        try {
          data = JSON.parse(text)
        } catch {
          data = null
        }
        events.push({
          type: 'tool-result',
          id: block.tool_use_id,
          isError: block.is_error === true,
          text,
          data,
        })
      }
      return events
    }

    case 'result':
      return [
        {
          type: 'turn-end',
          costUsd: typeof message['total_cost_usd'] === 'number' ? message['total_cost_usd'] : null,
          turns: typeof message['num_turns'] === 'number' ? message['num_turns'] : null,
          subtype: String(message['subtype'] ?? 'unknown'),
        },
      ]

    case 'rate_limit_event':
      return [{ type: 'notice', message: 'rate limit warning from the API' }]

    default:
      return []
  }
}
