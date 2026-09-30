import { ABILITIES, CONDITIONS } from '@dnd/content'
import {
  abilityModifier,
  formatDiceResult,
  lifeStatus,
  passivePerception,
  saveModifier,
  skillModifier,
  type Creature,
  type D20TestResult,
} from '@dnd/engine'
import type { GameStore } from './store.js'

/** A short status line: the shape most tool results carry back. */
export function brief(creature: Creature) {
  return {
    id: creature.id,
    name: creature.name,
    hp: `${creature.hp.current}/${creature.hp.max}${creature.hp.temp > 0 ? ` (+${creature.hp.temp} temp)` : ''}`,
    status: lifeStatus(creature),
    conditions: conditionList(creature),
    ...(creature.concentration ? { concentrating: creature.concentration.spell } : {}),
  }
}

export function conditionList(creature: Creature): string[] {
  const list: string[] = [...creature.conditions.active]
  if (creature.conditions.exhaustion > 0) {
    list.push(`exhaustion ${creature.conditions.exhaustion}`)
  }
  return list
}

/** The full sheet, for `get_character_sheet`. */
export function sheet(creature: Creature) {
  const modifiers = Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      {
        score: creature.scores[ability],
        modifier: signed(abilityModifier(creature.scores[ability])),
        save: signed(saveModifier(creature, ability)),
        saveProficient: creature.proficiencies.saves.includes(ability),
      },
    ]),
  )

  const skills = Object.fromEntries(
    creature.proficiencies.skills.map((skill) => [
      skill,
      signed(skillModifier(creature, skill)) +
        (creature.proficiencies.expertise.includes(skill) ? ' (expertise)' : ''),
    ]),
  )

  return {
    id: creature.id,
    name: creature.name,
    kind: creature.kind,
    level: creature.level,
    hp: { current: creature.hp.current, max: creature.hp.max, temp: creature.hp.temp },
    status: lifeStatus(creature),
    ac: creature.ac,
    speed: creature.speed,
    passivePerception: passivePerception(creature),
    abilities: modifiers,
    proficientSkills: skills,
    conditions: conditionList(creature),
    concentrating: creature.concentration?.spell ?? null,
    defenses: {
      resistant: creature.defenses.resistances,
      vulnerable: creature.defenses.vulnerabilities,
      immune: creature.defenses.immunities,
    },
    ...(creature.hp.current === 0 && !creature.death.dead
      ? { deathSaves: { successes: creature.death.successes, failures: creature.death.failures } }
      : {}),
  }
}

export function signed(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

/**
 * Just the d20 faces, with dropped dice struck through and the kept face called
 * out when there was a choice: `[15]`, or `[~8~, 17] -> 17` with advantage.
 *
 * Deliberately not `formatDiceResult`, which ends in its own `= total` and would
 * read as `1d20: [15] = 15 +7 = 22`.
 */
export function d20Faces(test: D20TestResult): string {
  const term = test.roll.terms[0]
  if (term?.kind !== 'dice') return `[${test.natural}]`

  const faces = term.rolls.map((roll) => (roll.kept ? `${roll.value}` : `~${roll.value}~`)).join(', ')
  return term.rolls.length > 1 ? `[${faces}] -> ${test.natural}` : `[${faces}]`
}

/** One line describing a d20 test, for the DM to narrate from. */
export function describeTest(label: string, test: D20TestResult): string {
  const advantage = test.advantage === 'none' ? '' : ` with ${test.advantage}`
  const verdict =
    test.dc === undefined
      ? ''
      : ` vs DC ${test.dc} — ${test.success ? 'success' : 'failure'}`
  const natural = test.isNat20 ? ' (natural 20)' : test.isNat1 ? ' (natural 1)' : ''

  return `${label}${advantage}: ${d20Faces(test)} ${signed(test.modifier)} = ${test.total}${verdict}${natural}`
}

export function conditionReference(): string {
  return Object.entries(CONDITIONS)
    .map(([name, effect]) => `${name}: ${effect}`)
    .join('\n')
}

export function stateSummary(store: GameStore) {
  const combat = store.combat
  return {
    scene: store.scene,
    combat:
      combat && combat.active
        ? {
            round: combat.round,
            turn: combat.order[combat.turnIndex]?.name ?? null,
            order: combat.order.map((c) => `${c.name} (${c.initiative})`),
          }
        : null,
    creatures: store.all().map(brief),
    eventsRecorded: store.eventCount,
  }
}
