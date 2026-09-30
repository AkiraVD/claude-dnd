import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { GameStore } from './store.js'
import { registerTools } from './tools.js'

export interface BuildOptions {
  /** Pin the dice for a reproducible session. */
  seed?: number
}

export function buildServer(options: BuildOptions = {}): { server: McpServer; store: GameStore } {
  const store = options.seed === undefined ? new GameStore() : new GameStore(options.seed)
  const server = new McpServer({ name: 'dnd', version: '0.0.0' })
  registerTools(server, store)
  return { server, store }
}
