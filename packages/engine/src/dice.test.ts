import { describe, expect, it } from 'vitest'
import { formatDiceResult, naturalFace, parseDice, rollDice } from './dice.js'
import { DiceError } from './errors.js'
import { SeededRng } from './rng.js'
import { constantRng, scriptedRng } from './testing.js'

const roll = (notation: string, faces: readonly number[]) =>
  rollDice(notation, scriptedRng(faces))

const faces = (notation: string, scripted: readonly number[]) => {
  const result = roll(notation, scripted)
  const term = result.terms.find((t) => t.kind === 'dice')
  if (term?.kind !== 'dice') throw new Error('no dice term')
  return term.rolls
}

describe('rollDice — basics', () => {
  it('rolls a bare die', () => {
    expect(roll('d20', [14]).total).toBe(14)
  })

  it('rolls count, sides and a flat bonus', () => {
    expect(roll('2d6+3', [4, 5]).total).toBe(12)
  })

  it('subtracts', () => {
    expect(roll('1d8-1', [8]).total).toBe(7)
  })

  it('sums several dice terms', () => {
    expect(roll('1d8+1d6+2', [5, 3]).total).toBe(10)
  })

  it('subtracts a dice term', () => {
    expect(roll('1d8-1d4', [8, 3]).total).toBe(5)
  })

  it('tolerates whitespace and capital D', () => {
    expect(roll('2D6 + 3', [1, 1]).total).toBe(5)
  })

  it('consumes exactly one rng draw per die', () => {
    const rng = scriptedRng([1, 2, 3])
    rollDice('3d6', rng)
    expect(rng.remaining()).toBe(0)
  })

  it('records the rng state for replay', () => {
    const rng = new SeededRng(4242)
    const state = rng.state()
    const result = rollDice('2d6', rng)

    expect(result.stateBefore).toBe(state)
    expect(rollDice('2d6', SeededRng.fromState(result.stateBefore!)).total).toBe(result.total)
  })
})

describe('rollDice — keep and drop', () => {
  it('keeps the highest three of 4d6, the ability score roll', () => {
    const rolls = faces('4d6kh3', [1, 6, 3, 5])

    expect(rolls.filter((r) => r.kept).map((r) => r.value).sort()).toEqual([3, 5, 6])
    expect(rolls.find((r) => r.value === 1)!.kept).toBe(false)
    expect(roll('4d6kh3', [1, 6, 3, 5]).total).toBe(14)
  })

  it('treats 2d20kh1 as advantage and 2d20kl1 as disadvantage', () => {
    expect(roll('2d20kh1', [7, 19]).total).toBe(19)
    expect(roll('2d20kl1', [7, 19]).total).toBe(7)
  })

  it('keeps the lowest with kl', () => {
    expect(roll('4d6kl2', [1, 6, 3, 5]).total).toBe(4)
  })

  it('drops the highest with dh', () => {
    expect(roll('4d6dh1', [1, 6, 3, 5]).total).toBe(9)
  })

  it('drops the lowest with dl', () => {
    expect(roll('4d6dl1', [1, 6, 3, 5]).total).toBe(14)
  })

  it('breaks ties by position so results are stable', () => {
    const rolls = faces('3d6kh2', [4, 4, 4])
    expect(rolls.map((r) => r.kept)).toEqual([false, true, true])
  })
})

describe('rollDice — rerolls', () => {
  it('replaces a low face and remembers the original', () => {
    const [die] = faces('1d6r1', [1, 5])
    expect(die).toMatchObject({ value: 5, rerolledFrom: 1 })
  })

  it('rerolls only once, so a second low face stands', () => {
    // The D&D rule is "reroll the die, use the new result" — not "reroll until
    // it is good". A rerolled 1 that comes up 1 again is a 1.
    const [die] = faces('1d6r1', [1, 1])
    expect(die).toMatchObject({ value: 1, rerolledFrom: 1 })
  })

  it('leaves faces above the threshold alone', () => {
    const [die] = faces('1d6r1', [4])
    expect(die!.rerolledFrom).toBeUndefined()
  })

  it('rerolls each qualifying die in a pool', () => {
    expect(roll('2d6r2', [1, 5, 6]).total).toBe(11)
  })

  it('accepts ro as an alias', () => {
    expect(roll('1d6ro1', [1, 4]).total).toBe(4)
  })
})

describe('rollDice — exploding', () => {
  it('adds a die on a maximum face', () => {
    const result = roll('1d6!', [6, 6, 2])
    expect(result.total).toBe(14)

    const rolls = faces('1d6!', [6, 6, 2])
    expect(rolls.map((r) => r.exploded)).toEqual([undefined, true, true])
  })

  it('does not explode on a non-maximum face', () => {
    expect(faces('1d6!', [5])).toHaveLength(1)
  })

  it('caps runaway explosions instead of hanging', () => {
    expect(() => rollDice('1d6!', constantRng(6))).toThrow(DiceError)
    expect(() => rollDice('1d6!', constantRng(6))).toThrow(/exploded past the limit/)
  })
})

describe('parseDice — rejections', () => {
  const bad: Array<[string, RegExp]> = [
    ['', /empty/],
    ['   ', /empty/],
    ['abc', /expected a die group or a number/],
    ['2d', /needs a side count/],
    ['2d6+4d', /needs a side count/],
    ['2d6+', /dangling/],
    ['2d6 3', /expected \+ or -/],
    ['0d6', /at least 1/],
    ['201d6', /exceeds the limit/],
    ['1d0', /at least 1 side/],
    ['1d1001', /exceeds the limit/],
    ['4d6kh5', /cannot keep more than/],
    ['4d6dh4', /would drop every one/],
    ['2d6r6', /would reroll every face/],
    ['1d1!', /never stop/],
  ]

  for (const [notation, message] of bad) {
    it(`rejects ${JSON.stringify(notation)}`, () => {
      expect(() => parseDice(notation)).toThrow(DiceError)
      expect(() => parseDice(notation)).toThrow(message)
    })
  }
})

describe('helpers', () => {
  it('reads the natural face off a roll', () => {
    expect(naturalFace(roll('2d20kh1+5', [3, 18]))).toBe(18)
  })

  it('throws when asked for the natural face of a constant', () => {
    expect(() => naturalFace(rollDice('5', scriptedRng([])))).toThrow(/no dice/)
  })

  it('formats a breakdown with dropped dice and rerolls', () => {
    expect(formatDiceResult(roll('4d6kh3+2', [1, 6, 3, 5]))).toBe(
      '4d6kh3+2: [~1~, 6, 3, 5] +2 = 16',
    )
    expect(formatDiceResult(roll('1d6r1', [1, 5]))).toBe('1d6r1: [1→5] = 5')
    expect(formatDiceResult(roll('1d8-2', [7]))).toBe('1d8-2: [7] -2 = 5')
  })
})
