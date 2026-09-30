import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { buildServer } from './server.js'

/**
 * The dice tower, exposed over MCP.
 *
 * Nothing here may write to stdout — that is the protocol channel, and a stray
 * console.log corrupts the stream. Diagnostics go to stderr.
 *
 * DND_SEED pins the dice for a reproducible session, which is handy when
 * debugging a fight. Left unset, the campaign seeds itself from the clock.
 */
const raw = process.env['DND_SEED']
const seed = raw === undefined ? undefined : Number(raw)

if (seed !== undefined && !Number.isInteger(seed)) {
  console.error(`DND_SEED must be an integer, got ${JSON.stringify(raw)}`)
  process.exit(1)
}

const { server, store } = buildServer(seed === undefined ? {} : { seed })

await server.connect(new StdioServerTransport())

console.error(`dnd engine ready · seed ${store.seed}`)
