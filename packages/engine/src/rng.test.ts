import { describe, expect, it } from 'vitest'
import { SeededRng, randomSeed } from './rng.js'

const draw = (rng: SeededRng, n: number) => Array.from({ length: n }, () => rng.int(1, 20))

describe('SeededRng', () => {
  it('is deterministic for a given seed', () => {
    expect(draw(new SeededRng(12345), 50)).toEqual(draw(new SeededRng(12345), 50))
  })

  it('diverges for different seeds', () => {
    expect(draw(new SeededRng(1), 50)).not.toEqual(draw(new SeededRng(2), 50))
  })

  it('resumes mid-stream from a captured state', () => {
    const original = new SeededRng(999)
    draw(original, 10)
    const state = original.state()
    const expected = draw(original, 20)

    expect(draw(SeededRng.fromState(state), 20)).toEqual(expected)
  })

  it('advances its state as it draws', () => {
    const rng = new SeededRng(7)
    const before = rng.state()
    rng.int(1, 6)
    expect(rng.state()).not.toBe(before)
  })

  it('stays within bounds', () => {
    const rng = new SeededRng(42)
    for (let i = 0; i < 10_000; i++) {
      const value = rng.int(3, 9)
      expect(value).toBeGreaterThanOrEqual(3)
      expect(value).toBeLessThanOrEqual(9)
      expect(Number.isInteger(value)).toBe(true)
    }
  })

  it('handles a single-value range', () => {
    expect(new SeededRng(1).int(4, 4)).toBe(4)
  })

  it('rejects malformed bounds and seeds', () => {
    const rng = new SeededRng(1)
    expect(() => rng.int(10, 1)).toThrow(/inverted/)
    expect(() => rng.int(1.5, 6)).toThrow(/must be integers/)
    expect(() => new SeededRng(1.5)).toThrow(/must be an integer/)
  })

  it('distributes d20 faces evenly', () => {
    const rng = new SeededRng(0xd20)
    const trials = 200_000
    const counts = new Map<number, number>()
    for (let i = 0; i < trials; i++) {
      const face = rng.int(1, 20)
      counts.set(face, (counts.get(face) ?? 0) + 1)
    }

    expect(counts.size).toBe(20)
    const expected = trials / 20
    for (const [face, count] of counts) {
      // 5% is roughly five standard deviations here, so this is a real check
      // that will not flake.
      expect(Math.abs(count - expected) / expected, `face ${face}`).toBeLessThan(0.05)
    }
  })

  it('produces floats in [0, 1)', () => {
    const rng = new SeededRng(3)
    for (let i = 0; i < 1000; i++) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('generates usable fresh seeds', () => {
    const seed = randomSeed()
    expect(Number.isInteger(seed)).toBe(true)
    expect(() => new SeededRng(seed)).not.toThrow()
  })
})
