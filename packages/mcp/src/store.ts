import {
  RulesError,
  SeededRng,
  randomSeed,
  type CombatState,
  type Creature,
  type CreatureId,
  type GameEvent,
} from '@dnd/engine'

/**
 * Everything one campaign knows, held in memory.
 *
 * Phase 4 replaces this with SQLite, which is why every mutation already funnels
 * through `put` and `record`: the durable version has to append the same events
 * this one keeps in an array.
 */
export class GameStore {
  readonly seed: number
  readonly #rng: SeededRng
  readonly #creatures = new Map<CreatureId, Creature>()
  #combat: CombatState | null = null
  #scene = 'No scene set yet.'
  readonly #events: GameEvent[] = []

  constructor(seed: number = randomSeed()) {
    this.seed = seed
    this.#rng = new SeededRng(seed)
  }

  /**
   * One generator for the whole campaign, so the dice stream advances across
   * tool calls and the session can be replayed from the seed.
   */
  get rng(): SeededRng {
    return this.#rng
  }

  get rngState(): number {
    return this.#rng.state()
  }

  get scene(): string {
    return this.#scene
  }

  setScene(scene: string): void {
    this.#scene = scene
  }

  get combat(): CombatState | null {
    return this.#combat
  }

  setCombat(state: CombatState | null): void {
    this.#combat = state
  }

  requireCombat(): CombatState {
    if (!this.#combat?.active) {
      throw new RulesError('no combat is in progress — call start_combat first')
    }
    return this.#combat
  }

  has(id: CreatureId): boolean {
    return this.#creatures.has(id)
  }

  /** Throws with the list of known ids, so a typo is self-correcting. */
  creature(id: CreatureId): Creature {
    const creature = this.#creatures.get(id)
    if (!creature) {
      const known = this.ids()
      throw new RulesError(
        `no creature with id "${id}". Known ids: ${known.length > 0 ? known.join(', ') : '(none yet)'}`,
      )
    }
    return creature
  }

  add(creature: Creature): void {
    if (this.#creatures.has(creature.id)) {
      throw new RulesError(`a creature with id "${creature.id}" already exists`)
    }
    this.#creatures.set(creature.id, creature)
  }

  /** Replace an existing creature after the engine returned new state. */
  put(creature: Creature): void {
    this.#creatures.set(creature.id, creature)
  }

  remove(id: CreatureId): void {
    this.creature(id)
    this.#creatures.delete(id)
  }

  all(): Creature[] {
    return [...this.#creatures.values()]
  }

  ids(): CreatureId[] {
    return [...this.#creatures.keys()]
  }

  record(events: readonly GameEvent[]): void {
    this.#events.push(...events)
  }

  get eventCount(): number {
    return this.#events.length
  }

  recentEvents(limit: number): GameEvent[] {
    return this.#events.slice(-limit)
  }
}
