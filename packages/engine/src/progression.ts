import { CLASSES, levelForXp, spellSlotsFor, xpToNextLevel } from '@dnd/content'
import { abilityModifier } from './checks.js'
import { isDead, type Creature } from './character.js'
import { RulesError } from './errors.js'
import type { GameEvent } from './events.js'
import { hitDiceResource, pactSlotResource, spellSlotResources, type Resource } from './resources.js'

export interface XpResult {
  creature: Creature
  total: number
  level: number
  /** True when this award crossed a level threshold. */
  levelledUp: boolean
  toNextLevel: number | null
  events: GameEvent[]
}

export function awardXp(creature: Creature, amount: number): XpResult {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RulesError(`xp award must be a non-negative integer, got ${amount}`)
  }

  const total = creature.xp + amount
  const level = levelForXp(total)
  const next = { ...creature, xp: total }

  return {
    creature: next,
    total,
    level,
    levelledUp: level > creature.level,
    toNextLevel: xpToNextLevel(total),
    events: [{ t: 'xp', target: creature.id, amount, total, level }],
  }
}

export interface LevelUpOptions {
  /**
   * Hit points gained. Omit to take the fixed average, which is the common table
   * choice: half the hit die plus one, plus the Constitution modifier.
   */
  hpGained?: number
}

export interface LevelUpResult {
  creature: Creature
  level: number
  hpGained: number
  /** Slots and other resources that changed shape at the new level. */
  gained: Array<{ label: string; max: number }>
  events: GameEvent[]
}

/**
 * Advance one level: more hit points, a larger hit dice pool, and the spell slots
 * the new level brings. The proficiency bonus is derived from level, so it
 * follows automatically.
 */
export function levelUp(creature: Creature, options: LevelUpOptions = {}): LevelUpResult {
  if (isDead(creature)) throw new RulesError(`${creature.name} is dead`)
  if (creature.level >= 20) throw new RulesError(`${creature.name} is already level 20`)

  const level = creature.level + 1
  const conModifier = abilityModifier(creature.scores.con)
  const average = Math.floor(creature.hitDie / 2) + 1
  const hpGained = Math.max(1, options.hpGained ?? average + conModifier)

  if (!Number.isInteger(hpGained)) {
    throw new RulesError(`hp gained must be an integer, got ${options.hpGained}`)
  }

  const definition = creature.className === null ? null : CLASSES[creature.className]
  const before = new Map(creature.resources.map((r) => [r.name, r]))
  let resources: Resource[] = [...creature.resources]

  if (definition !== null) {
    const rebuilt: Resource[] = [hitDiceResource(level, creature.hitDie)]

    if (definition.casterType === 'pact') {
      for (const [slotLevel, count] of Object.entries(spellSlotsFor(creature.className!, level))) {
        rebuilt.push(pactSlotResource(Number(slotLevel), count))
      }
    } else if (definition.casterType !== 'none') {
      rebuilt.push(...spellSlotResources(spellSlotsFor(creature.className!, level)))
    }

    // Keep what has been spent: a level-up should not silently refill slots.
    const carried = rebuilt.map((resource) => {
      const existing = before.get(resource.name)
      if (!existing) return resource
      const gainedMax = resource.max - existing.max
      return { ...resource, current: Math.min(resource.max, existing.current + Math.max(0, gainedMax)) }
    })

    resources = [
      ...carried,
      ...creature.resources.filter((r) => !carried.some((c) => c.name === r.name)),
    ]
  }

  const gained = resources
    .filter((resource) => (before.get(resource.name)?.max ?? 0) < resource.max)
    .map((resource) => ({ label: resource.label, max: resource.max }))

  const next: Creature = {
    ...creature,
    level,
    hp: { ...creature.hp, max: creature.hp.max + hpGained, current: creature.hp.current + hpGained },
    resources,
  }

  return {
    creature: next,
    level,
    hpGained,
    gained,
    events: [{ t: 'level-up', target: creature.id, level, hpGained }],
  }
}
