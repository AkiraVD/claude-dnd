/**
 * What you can do on your turn, and how it reads once you have picked.
 *
 * Kept out of the component for the usual reason: the sheet is derived and the
 * sentence is composed, and both are the sort of thing that goes quietly wrong
 * and renders fine. The modal only arranges what is here.
 *
 * Nothing in this file talks to the engine. The browser is already sent every
 * creature's attacks, resources and the turn order, so the action sheet is a
 * view of state it holds — which is why the modal can open instantly, with no
 * tool call, and why `offer_actions` only has to say "open it".
 */
import type { Creature } from '@dnd/engine'
import type { TableState } from '@dnd/server/protocol.js'

export interface ActionAttack {
  name: string
  damage: string
  damageType: string
  range: 'melee' | 'ranged'
  notes: string | null
}

export interface ActionSlot {
  level: number
  label: string
  current: number
  max: number
}

/**
 * Which side of the fight someone is on, as far as the engine can tell.
 *
 * Attitude is the DM's own record and drifts with events, so this is a read of
 * it rather than a second opinion. Three states, because the colour is there to
 * stop you shooting the innkeeper, not to grade a relationship: everything that
 * is not clearly for you or against you stays neutral and uncoloured.
 */
export type Stance = 'hostile' | 'friendly' | 'neutral'

export function stanceOf(kind: 'pc' | 'npc', attitude: string | null | undefined): Stance {
  // Another player character is on your side by construction.
  if (kind === 'pc') return 'friendly'
  switch (attitude) {
    case 'hostile':
    case 'unfriendly':
      return 'hostile'
    case 'friendly':
    case 'helpful':
      return 'friendly'
    default:
      return 'neutral'
  }
}

export interface ActionTarget {
  id: string
  name: string
  hp: string
  kind: 'pc' | 'npc'
  stance: Stance
  /** The word behind the colour, so the chip can say it rather than only show it. */
  attitude: string | null
  /** Whether a fight is running and it is this creature's turn. */
  acting: boolean
}

export interface ActionSpell {
  name: string
  /** The level it was last cast at, which is the sensible default to re-offer. */
  level: number
  /**
   * What the DM said it does, from the last cast that bothered to say.
   *
   * There is no spell catalogue to look this up in — by design — so this is a
   * reminder of this table's own ruling and nothing more. Null until the DM has
   * described it once.
   */
  effect: string | null
}

export interface ActionItem {
  name: string
  qty: number
}

export interface ActionSheet {
  actor: { id: string; name: string }
  attacks: ActionAttack[]
  slots: ActionSlot[]
  spells: ActionSpell[]
  items: ActionItem[]
  targets: ActionTarget[]
  /**
   * Whether to show the Cast section at all.
   *
   * A fighter has no slots and has never cast anything, so the section is not
   * empty for them — it is absent. The free-text box is still there if they
   * want to try something with a scroll.
   */
  canCast: boolean
  round: number | null
  /** True when a fight is running and the actor is the one up. */
  yourTurn: boolean
}

/** The character the action modal speaks for: the player's, by default. */
export function defaultActor(state: TableState | null): Creature | null {
  if (state === null) return null
  return state.creatures.find((c) => c.kind === 'pc') ?? null
}

const SLOT_PREFIX = 'spell-slot-'

/**
 * Everything the modal offers, read off the table state.
 *
 * Targets exclude the actor — you are not a target of your own longbow — and
 * anything not in the scene, because the cast persists after it leaves.
 */
export function actionSheet(state: TableState | null, actorId: string): ActionSheet | null {
  if (state === null) return null
  const actor = state.creatures.find((c) => c.id === actorId)
  if (actor === undefined) return null

  const combat = state.combat
  const upNow =
    combat !== null && combat.active ? (combat.order[combat.turnIndex]?.id ?? null) : null

  const attacks: ActionAttack[] = actor.attacks.map((attack) => ({
    name: attack.name,
    damage: attack.damage,
    damageType: attack.damageType,
    range: attack.range ?? 'melee',
    notes: attack.notes ?? null,
  }))

  const slots: ActionSlot[] = actor.resources
    .filter((r) => r.name.startsWith(SLOT_PREFIX))
    .map((r) => ({
      level: Number(r.name.slice(SLOT_PREFIX.length)),
      label: r.label,
      current: r.current,
      max: r.max,
    }))
    .filter((s) => Number.isFinite(s.level) && s.level > 0)
    .sort((a, b) => a.level - b.level)

  // The engine has no spell catalogue on purpose, so the list is what this
  // character has actually been seen to cast. Everything cast is journalled, so
  // the names come back exact — and the box is still there for a new one.
  const spells: ActionSpell[] = []
  for (const event of state.events) {
    if (event.t !== 'spell' || event.caster !== actorId) continue
    const seen = spells.find((s) => s.name.toLowerCase() === event.spell.toLowerCase())
    const effect = event.effect ?? null
    if (seen === undefined) spells.push({ name: event.spell, level: event.level, effect })
    else {
      seen.level = event.level
      // A later cast that said nothing does not erase what the DM wrote before.
      if (effect !== null) seen.effect = effect
    }
  }
  spells.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))

  const items: ActionItem[] = actor.items.map((item) => ({ name: item.name, qty: item.qty }))

  const targets: ActionTarget[] = state.creatures
    .filter((c) => c.id !== actorId && c.presence !== 'offscreen')
    .map((c) => ({
      id: c.id,
      name: c.name,
      hp: `${c.hp.current}/${c.hp.max}`,
      kind: c.kind,
      stance: stanceOf(c.kind, c.profile?.attitude),
      attitude: c.profile?.attitude ?? null,
      acting: c.id === upNow,
    }))

  return {
    actor: { id: actor.id, name: actor.name },
    attacks,
    slots,
    spells,
    items,
    targets,
    canCast: slots.length > 0 || spells.length > 0,
    round: combat !== null && combat.active ? combat.round : null,
    yourTurn: upNow === actorId,
  }
}

export type ActionDraft =
  | { kind: 'attack'; weapon: string; target: string | null; lethal: boolean }
  | { kind: 'spell'; spell: string; level: number; target: string | null }
  | { kind: 'item'; item: string; target: string | null }
  | { kind: 'custom'; text: string }

const ORDINALS = [
  'cantrip',
  '1st',
  '2nd',
  '3rd',
  '4th',
  '5th',
  '6th',
  '7th',
  '8th',
  '9th',
] as const

/** "1st", "2nd", … — and "cantrip" for level 0, which spends no slot. */
export function spellLevelLabel(level: number): string {
  return ORDINALS[level] ?? `${level}th`
}

/**
 * The spells worth offering at a chosen slot level.
 *
 * A spell can be cast with a higher slot than its own and not a lower one, so
 * picking 3rd offers everything up to 3rd rather than only the 3rd-level ones.
 * Cantrips are their own case: level 0 spends no slot, so it shows cantrips
 * alone and nothing else shows them.
 */
export function spellsForLevel(spells: readonly ActionSpell[], level: number): ActionSpell[] {
  if (level === 0) return spells.filter((s) => s.level === 0)
  return spells.filter((s) => s.level > 0 && s.level <= level)
}

/** The level the panel opens on: the lowest with a slot left, else cantrip. */
export function defaultLevel(slots: readonly ActionSlot[]): number {
  return slots.find((slot) => slot.current > 0)?.level ?? 0
}

/**
 * The sentence the composer gets.
 *
 * Ordinary prose, not a command: it goes into the box as a message like any
 * other, so the DM reads it the way it reads anything you type, and you can add
 * to it before sending. The point is only that the weapon and the target are
 * spelled exactly as the engine has them — which is the whole reason a
 * mis-named weapon costs a turn today.
 */
export function composeAction(draft: ActionDraft): string {
  switch (draft.kind) {
    case 'attack': {
      const at = draft.target === null ? '' : ` ${draft.target}`
      const swing = `I attack${at} with my ${draft.weapon}.`
      return draft.lethal ? swing : `${swing} Pull the blow — knock them out rather than kill.`
    }
    case 'spell': {
      const at = draft.target === null ? '' : ` on ${draft.target}`
      const level = draft.level === 0 ? ' as a cantrip' : `, ${spellLevelLabel(draft.level)} level`
      return `I cast ${draft.spell}${at}${level}.`
    }
    case 'item': {
      const at = draft.target === null ? '' : ` on ${draft.target}`
      return `I use my ${draft.item}${at}.`
    }
    case 'custom':
      return draft.text.trim()
  }
}

/** Whether the draft is complete enough to send. */
export function isReady(draft: ActionDraft | null): boolean {
  if (draft === null) return false
  if (draft.kind === 'attack') return draft.weapon !== ''
  if (draft.kind === 'spell') return draft.spell.trim() !== ''
  if (draft.kind === 'item') return draft.item !== ''
  return draft.text.trim() !== ''
}
