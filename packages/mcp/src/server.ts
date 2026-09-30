import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { CampaignDb } from './db.js'
import { GameStore } from './store.js'
import { registerCampaignTools, registerTools } from './tools.js'

export interface BuildOptions {
  /** SQLite file, or ':memory:' for a throwaway campaign. */
  dbPath?: string
  /** Load this campaign instead of the most recently updated one. */
  campaignId?: number
  /** Seed for a campaign created because the database was empty. */
  seed?: number
  /** Name for a campaign created because the database was empty. */
  name?: string
}

export function buildServer(options: BuildOptions = {}): {
  server: McpServer
  store: GameStore
  db: CampaignDb
} {
  const db = new CampaignDb(options.dbPath ?? ':memory:')
  const store = GameStore.open(db, {
    ...(options.campaignId === undefined ? {} : { campaignId: options.campaignId }),
    ...(options.seed === undefined ? {} : { seed: options.seed }),
    ...(options.name === undefined ? {} : { name: options.name }),
  })
  const server = new McpServer({ name: 'dnd', version: '0.0.0' })
  registerTools(server, store)
  registerCampaignTools(server, store)
  return { server, store, db }
}
