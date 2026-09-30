import type { AbilityScores } from '@dnd/content'
import { describe, expect, it } from 'vitest'
import {
  abilityCheck,
  abilityModifier,
  checkModifier,
  combineAdvantage,
  d20Notation,
  d20Test,
  passiveScore,
  proficiencyBonus,
  savingThrow,
  skillAbility,
  skillCheck,
} from './checks.js'
import { scriptedRng } from './testing.js'

const SCORES: AbilityScores = { str: 10, dex: 16, con: 14, int: 8, wis: 12, cha: 15 }

describe('abilityModifier', () => {
  const table: Array<[number, number]> = [
    [1, -5],
    [3, -4],
    [8, -1],
    [9, -1],
    [10, 0],
    [11, 0],
    [12, 1],
    [15, 2],
    [16, 3],
    [20, 5],
    [30, 10],
  ]

  for (const [score, modifier] of table) {
    it(`maps ${score} to ${modifier >= 0 ? '+' : ''}${modifier}`, () => {
      expect(abilityModifier(score)).toBe(modifier)
    })
  }

  it('rejects a fractional score', () => {
    expect(() => abilityModifier(13.5)).toThrow(/must be an integer/)
  })
})

describe('proficiencyBonus', () => {
  const table: Array<[number, number]> = [
    [1, 2],
    [4, 2],
    [5, 3],
    [8, 3],
    [9, 4],
    [12, 4],
    [13, 5],
    [16, 5],
    [17, 6],
    [20, 6],
  ]

  for (const [level, bonus] of table) {
    it(`is +${bonus} at level ${level}`, () => {
      expect(proficiencyBonus(level)).toBe(bonus)
    })
  }

  it('rejects levels outside 1..20', () => {
    expect(() => proficiencyBonus(0)).toThrow(/1\.\.20/)
    expect(() => proficiencyBonus(21)).toThrow(/1\.\.20/)
  })
})

describe('checkModifier', () => {
  it('uses the ability modifier alone when not proficient', () => {
    expect(checkModifier({ score: 16, profBonus: 3 })).toBe(3)
  })

  it('adds the proficiency bonus when proficient', () => {
    expect(checkModifier({ score: 16, profBonus: 3, proficient: true })).toBe(6)
  })

  it('doubles the proficiency bonus with expertise', () => {
    expect(checkModifier({ score: 16, profBonus: 3, proficient: true, expertise: true })).toBe(9)
  })

  it('adds a situational bonus', () => {
    expect(checkModifier({ score: 16, bonus: 2 })).toBe(5)
  })

  it('refuses expertise without proficiency', () => {
    expect(() => checkModifier({ score: 16, profBonus: 3, expertise: true })).toThrow(
      /expertise requires proficiency/,
    )
  })
})

describe('advantage', () => {
  it('expresses itself as notation, not a flat bonus', () => {
    expect(d20Notation('none')).toBe('1d20')
    expect(d20Notation('advantage')).toBe('2d20kh1')
    expect(d20Notation('disadvantage')).toBe('2d20kl1')
  })

  it('keeps the higher die with advantage', () => {
    const result = d20Test({ modifier: 0, advantage: 'advantage', rng: scriptedRng([8, 17]) })
    expect(result.natural).toBe(17)
  })

  it('keeps the lower die with disadvantage', () => {
    const result = d20Test({ modifier: 0, advantage: 'disadvantage', rng: scriptedRng([8, 17]) })
    expect(result.natural).toBe(8)
  })

  it('keeps both dice in the log so the UI can show them', () => {
    const result = d20Test({ modifier: 0, advantage: 'advantage', rng: scriptedRng([8, 17]) })
    const term = result.roll.terms[0]
    expect(term?.kind === 'dice' && term.rolls).toHaveLength(2)
  })

  it('cancels exactly once when both apply', () => {
    expect(combineAdvantage(['advantage', 'disadvantage'])).toBe('none')
    expect(combineAdvantage(['advantage', 'advantage', 'disadvantage'])).toBe('none')
    expect(combineAdvantage(['advantage', 'advantage'])).toBe('advantage')
    expect(combineAdvantage(['disadvantage'])).toBe('disadvantage')
    expect(combineAdvantage([])).toBe('none')
  })
})

describe('d20Test', () => {
  it('succeeds when the total meets the DC exactly', () => {
    const result = d20Test({ modifier: 3, dc: 15, rng: scriptedRng([12]) })
    expect(result.total).toBe(15)
    expect(result.success).toBe(true)
  })

  it('fails one below the DC', () => {
    expect(d20Test({ modifier: 3, dc: 15, rng: scriptedRng([11]) }).success).toBe(false)
  })

  it('leaves success undefined with no DC', () => {
    const result = d20Test({ modifier: 3, rng: scriptedRng([11]) })
    expect(result.success).toBeUndefined()
    expect(result.total).toBe(14)
  })

  it('does NOT auto-succeed on a natural 20', () => {
    // Nat 20 auto-succeeds on attack rolls only. Applying it to ability checks
    // is a common homebrew error, so this is pinned deliberately.
    const result = d20Test({ modifier: 0, dc: 25, rng: scriptedRng([20]) })
    expect(result.isNat20).toBe(true)
    expect(result.success).toBe(false)
  })

  it('does NOT auto-fail on a natural 1', () => {
    const result = d20Test({ modifier: 10, dc: 5, rng: scriptedRng([1]) })
    expect(result.isNat1).toBe(true)
    expect(result.success).toBe(true)
  })
})

describe('checks and saves', () => {
  it('composes an ability check from score and proficiency', () => {
    const result = abilityCheck({
      score: 16,
      profBonus: 2,
      proficient: true,
      dc: 15,
      rng: scriptedRng([10]),
    })
    expect(result.modifier).toBe(5)
    expect(result.total).toBe(15)
    expect(result.success).toBe(true)
  })

  it('rolls saving throws on the same machinery', () => {
    const result = savingThrow({ score: 14, profBonus: 3, proficient: true, dc: 13, rng: scriptedRng([9]) })
    expect(result.total).toBe(14)
    expect(result.success).toBe(true)
  })
})

describe('skills', () => {
  it('maps a skill to its governing ability', () => {
    expect(skillAbility('stealth')).toBe('dex')
    expect(skillAbility('athletics')).toBe('str')
    expect(skillAbility('arcana')).toBe('int')
    expect(skillAbility('animal-handling')).toBe('wis')
  })

  it('pulls the right score off the sheet', () => {
    const result = skillCheck({
      skill: 'stealth',
      scores: SCORES,
      profBonus: 2,
      proficient: true,
      dc: 14,
      rng: scriptedRng([11]),
    })
    // dex 16 = +3, plus proficiency +2
    expect(result.modifier).toBe(5)
    expect(result.total).toBe(16)
    expect(result.success).toBe(true)
  })

  it('applies a penalty from a low score', () => {
    const result = skillCheck({ skill: 'arcana', scores: SCORES, rng: scriptedRng([10]) })
    expect(result.modifier).toBe(-1)
    expect(result.total).toBe(9)
  })
})

describe('passiveScore', () => {
  it('takes 10 on the die', () => {
    expect(passiveScore({ modifier: 3 })).toBe(13)
  })

  it('shifts by 5 for advantage and disadvantage', () => {
    expect(passiveScore({ modifier: 3, advantage: 'advantage' })).toBe(18)
    expect(passiveScore({ modifier: 3, advantage: 'disadvantage' })).toBe(8)
  })
})
