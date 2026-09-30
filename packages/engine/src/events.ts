import type { DamageType } from '@dnd/content'
import type { CreatureId, SimpleCondition } from './character.js'

export type Mitigation = 'none' | 'resisted' | 'vulnerable' | 'immune'

export type DeathSaveOutcome = 'success' | 'failure' | 'stabilised' | 'dead' | 'revived'

export type DeathCause = 'death-saves' | 'massive-damage' | 'dropped-to-zero' | 'exhaustion'

/**
 * A faithful record of everything the rules did, in order.
 *
 * Phase 4 appends these to SQLite; the browser panels replay them; the DM reads
 * them back for "previously on…". They are deliberately descriptive rather than
 * prescriptive — the command functions in this package compute state directly
 * and emit events alongside it. Whether the log becomes the single source of
 * truth, replayed through a reducer, is a phase 4 decision; these events carry
 * enough detail either way.
 */
export type GameEvent =
  | {
      t: 'damage'
      target: CreatureId
      /** What was dealt, before defenses. */
      requested: number
      /** What actually came off, after defenses and temp HP. */
      applied: number
      damageType: DamageType
      mitigation: Mitigation
      absorbedByTempHp: number
      hpAfter: number
    }
  | { t: 'heal'; target: CreatureId; amount: number; hpAfter: number }
  | { t: 'temp-hp'; target: CreatureId; amount: number; replaced: boolean }
  | { t: 'condition'; target: CreatureId; condition: SimpleCondition; op: 'add' | 'remove' }
  | { t: 'exhaustion'; target: CreatureId; level: number }
  | { t: 'down'; target: CreatureId }
  | {
      t: 'death-save'
      target: CreatureId
      natural: number
      outcome: DeathSaveOutcome
      successes: number
      failures: number
    }
  | { t: 'death'; target: CreatureId; cause: DeathCause }
  | { t: 'revived'; target: CreatureId; hp: number }
  | {
      t: 'concentration'
      target: CreatureId
      spell: string
      op: 'start' | 'maintained' | 'broken'
    }
  | {
      t: 'attack'
      attacker: CreatureId
      target: CreatureId
      total: number
      ac: number
      hit: boolean
      critical: boolean
    }
  | { t: 'initiative'; order: readonly { id: CreatureId; initiative: number }[] }
  | { t: 'turn'; actor: CreatureId; round: number }
  | { t: 'combat'; op: 'start' | 'end' }
  | { t: 'creature-added'; id: CreatureId; name: string; kind: 'pc' | 'npc' }
  | { t: 'creature-removed'; id: CreatureId; name: string }
  | { t: 'scene'; scene: string }
  | {
      t: 'resource'
      target: CreatureId
      resource: string
      label: string
      /** Positive when spent, negative when restored. */
      spent: number
      remaining: number
      max: number
    }
  | { t: 'rest'; target: CreatureId; kind: 'short' | 'long' }
  | { t: 'killed'; target: CreatureId; reason: string }
  | { t: 'spell'; caster: CreatureId; spell: string; level: number; slotLevel: number | null }
  | { t: 'level-up'; target: CreatureId; level: number; hpGained: number }
  | { t: 'xp'; target: CreatureId; amount: number; total: number; level: number }
  | { t: 'roll'; notation: string; total: number; purpose?: string }
  | {
      t: 'check'
      actor: CreatureId
      /** What was rolled, e.g. "stealth check" or "CON save". */
      label: string
      natural: number
      total: number
      dc?: number
      success?: boolean
    }
