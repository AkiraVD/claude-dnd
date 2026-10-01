import type { CombatState, Creature, GameEvent, Story } from '@dnd/engine'

/**
 * What the browser and the server say to each other.
 *
 * Kept in one file both sides import, so a field cannot be renamed on one end
 * only.
 */
export interface CampaignHeader {
  id: number
  name: string
  steps: number
  seed: number
  lastPlayed: string
}

export interface TableState {
  campaign: CampaignHeader
  scene: string
  /** Already redacted: see readTable in the server. */
  creatures: Creature[]
  combat: CombatState | null
  /** Premise, question, and only the beats the player has learned. */
  story: Story | null
  /** Which scenery set to show behind the scene, or null for none. */
  backdrop: string | null
  /** The engine run that wrote the newest step. Shown in the header for debugging. */
  session: string | null
  events: GameEvent[]
}

export type ServerMessage =
  | { type: 'hello'; model: string | null; sessionId: string | null; state: TableState }
  | { type: 'state'; state: TableState }
  | { type: 'status'; model: string | null; sessionId: string | null; mcp: Array<{ name: string; status: string }> }
  | { type: 'turn-start' }
  | { type: 'narration-delta'; text: string }
  | { type: 'narration'; text: string }
  | { type: 'thinking' }
  | { type: 'roll'; call: ToolCallView }
  | { type: 'tool'; call: ToolCallView }
  | { type: 'turn-end'; costUsd: number | null }
  | { type: 'notice'; message: string; level: 'info' | 'error' }
  | { type: 'player'; text: string }
  /** The conversation was thrown away; the log should empty. */
  | { type: 'cleared' }
  | { type: 'campaigns'; campaigns: CampaignHeader[] }

export interface ToolCallView {
  id: string
  name: string
  input: Record<string, unknown>
  isError: boolean
  /** The tool's own one-line summary. */
  narration: string
  /** Everything else the tool returned, for the card to render. */
  data: Record<string, unknown> | null
}

export type ClientMessage =
  | { type: 'say'; text: string }
  | { type: 'refresh' }
  /** Throw the DM's conversation away and start a new one. The campaign stays. */
  | { type: 'clear' }
  /**
   * Switch tables: a fresh conversation, then a first turn telling the new DM
   * which campaign to load. Both halves matter — a conversation that outlives
   * the campaign switch keeps narrating the campaign it remembers.
   */
  | { type: 'resume'; campaignId: number }
