import type { Creature } from '@dnd/engine'
import { redactCreature, redactStory, restoreCreature } from '@dnd/engine'
import type { CampaignDb } from '@dnd/mcp/db.js'
import type { TableState } from './protocol.js'

/**
 * The campaign as the browser is allowed to see it.
 *
 * This function is the whole spoiler boundary. An unrevealed profile note or
 * story beat is stripped here, before anything is serialised, so it never
 * reaches the page, a network frame, or the browser's devtools — a rendering
 * bug downstream cannot leak what was never sent. `redactedTable.test.ts` holds
 * it to that.
 */
export function readTable(db: CampaignDb): TableState {
  const campaign = db.mostRecentCampaign()
  if (!campaign) {
    return {
      campaign: { id: 0, name: 'No campaign yet', steps: 0, seed: 0, lastPlayed: '' },
      scene: 'No campaign yet. Say hello to begin.',
      creatures: [],
      combat: null,
      story: null,
      backdrop: null,
      session: null,
      events: [],
    }
  }

  const snapshot = db.latestSnapshot(campaign.id)
  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      steps: campaign.steps,
      seed: campaign.seed,
      lastPlayed: campaign.updatedAt,
    },
    scene: snapshot?.scene ?? 'No scene set yet.',
    creatures: (snapshot?.creatures ?? []).map((creature: Creature) =>
      redactCreature(restoreCreature(creature)),
    ),
    combat: snapshot?.combat ?? null,
    story: snapshot?.story == null ? null : redactStory(snapshot.story),
    backdrop: snapshot?.backdrop ?? null,
    session: db.latestSession(campaign.id),
    events: db.recentEvents(campaign.id, 60),
  }
}
