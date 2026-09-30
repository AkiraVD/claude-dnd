import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { buildServer } from './server.js'

/**
 * The dice tower, exposed over MCP.
 *
 * Nothing here may write to stdout — that is the protocol channel, and a stray
 * console.log corrupts the stream. Diagnostics go to stderr.
 *
 * DND_DB   where campaigns live. Defaults to ./campaign.db
 * DND_SEED seed for a campaign created because the database was empty
 * DND_CAMPAIGN  load this campaign id instead of the most recent one
 */
function intFromEnv(name: string): number | undefined {
  const raw = process.env[name]
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value)) {
    console.error(`${name} must be an integer, got ${JSON.stringify(raw)}`)
    process.exit(1)
  }
  return value
}

const seed = intFromEnv('DND_SEED')
const campaignId = intFromEnv('DND_CAMPAIGN')

const { server, store } = buildServer({
  dbPath: process.env['DND_DB'] ?? 'campaign.db',
  ...(seed === undefined ? {} : { seed }),
  ...(campaignId === undefined ? {} : { campaignId }),
})

await server.connect(new StdioServerTransport())

const campaign = store.campaign
console.error(
  `dnd engine ready · campaign ${campaign.id} "${campaign.name}" · ` +
    `${campaign.steps} step(s) · ${store.all().length} creature(s) · seed ${campaign.seed}`,
)
