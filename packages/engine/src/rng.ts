/**
 * The random source the engine needs. Narrow on purpose: everything the rules
 * do is expressible as a bounded integer draw, and a narrow interface makes the
 * test double (see `testing.ts`) trivial.
 */
export interface Rng {
  /** Uniform integer in [min, max], both inclusive. */
  int(min: number, max: number): number
  /** Uniform float in [0, 1). */
  next(): number
  /** Current internal state, when this source is reproducible. */
  state?(): number
}

const UINT32 = 0x1_0000_0000

/**
 * mulberry32. Small, fast, and — the property that matters here — its entire
 * state is a single uint32, so a campaign can store it in an event and replay a
 * session exactly.
 */
export class SeededRng implements Rng {
  #state: number

  constructor(seed: number) {
    if (!Number.isInteger(seed)) {
      throw new RangeError(`seed must be an integer, got ${seed}`)
    }
    this.#state = seed >>> 0
  }

  /**
   * Resume a generator mid-stream. Identical to `new SeededRng(state)` — the
   * constructor seeds the state directly — but says what it means at call sites.
   */
  static fromState(state: number): SeededRng {
    return new SeededRng(state)
  }

  state(): number {
    return this.#state
  }

  nextUint32(): number {
    this.#state = (this.#state + 0x6d2b79f5) >>> 0
    let t = this.#state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }

  next(): number {
    return this.nextUint32() / UINT32
  }

  /**
   * Rejection sampling rather than `floor(next() * range)`. The modulo bias is
   * about one part in 200 million at d20 scale, which nobody would ever notice —
   * but this is the dice engine, and "the dice are provably fair" is cheap here.
   */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError(`int bounds must be integers, got [${min}, ${max}]`)
    }
    if (max < min) {
      throw new RangeError(`int bounds inverted: [${min}, ${max}]`)
    }
    const range = max - min + 1
    if (range === 1) return min
    const limit = UINT32 - (UINT32 % range)
    let x = this.nextUint32()
    while (x >= limit) x = this.nextUint32()
    return min + (x % range)
  }
}

/** A generator seeded from the clock, for a brand new campaign. */
export function randomSeed(): number {
  return (Date.now() ^ (Math.random() * UINT32)) >>> 0
}
