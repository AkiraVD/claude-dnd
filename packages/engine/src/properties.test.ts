import { describe, expect, it } from 'vitest'
import { rollDice } from './dice.js'
import { SeededRng } from './rng.js'

/**
 * Statistical properties, exercising the real generator rather than a scripted
 * one. The unit tests prove each rule in isolation; these prove the rules and
 * the RNG compose into the distributions D&D actually expects.
 *
 * 100k trials puts the standard error of each mean near 0.02, so the tolerances
 * below sit several standard deviations out and will not flake.
 */
const TRIALS = 100_000

const meanOf = (notation: string, seed: number) => {
  const rng = new SeededRng(seed)
  let total = 0
  for (let i = 0; i < TRIALS; i++) total += rollDice(notation, rng).total
  return total / TRIALS
}

describe('distributions', () => {
  it('averages 10.5 on a plain d20', () => {
    expect(meanOf('1d20', 1)).toBeCloseTo(10.5, 1)
  })

  it('averages 13.825 with advantage', () => {
    expect(meanOf('2d20kh1', 2)).toBeCloseTo(13.825, 1)
  })

  it('averages 7.175 with disadvantage', () => {
    expect(meanOf('2d20kl1', 3)).toBeCloseTo(7.175, 1)
  })

  it('orders disadvantage below a flat roll below advantage', () => {
    const flat = meanOf('1d20', 10)
    expect(meanOf('2d20kl1', 10)).toBeLessThan(flat)
    expect(meanOf('2d20kh1', 10)).toBeGreaterThan(flat)
  })

  it('averages 12.24 on 4d6kh3, the ability score roll', () => {
    expect(meanOf('4d6kh3', 4)).toBeCloseTo(12.2446, 1)
  })

  it('averages 7 on 2d6', () => {
    expect(meanOf('2d6', 5)).toBeCloseTo(7, 1)
  })

  it('never leaves the possible range', () => {
    const rng = new SeededRng(6)
    for (let i = 0; i < 20_000; i++) {
      const total = rollDice('2d6+3', rng).total
      expect(total).toBeGreaterThanOrEqual(5)
      expect(total).toBeLessThanOrEqual(15)
    }
  })

  it('keeps exactly three dice on every 4d6kh3', () => {
    const rng = new SeededRng(7)
    for (let i = 0; i < 5_000; i++) {
      const term = rollDice('4d6kh3', rng).terms[0]
      if (term?.kind !== 'dice') throw new Error('expected a dice term')
      expect(term.rolls.filter((roll) => roll.kept)).toHaveLength(3)
      // The dropped die is never higher than a kept one.
      const kept = term.rolls.filter((r) => r.kept).map((r) => r.value)
      const dropped = term.rolls.filter((r) => !r.kept).map((r) => r.value)
      expect(Math.max(...dropped)).toBeLessThanOrEqual(Math.min(...kept))
    }
  })
})
