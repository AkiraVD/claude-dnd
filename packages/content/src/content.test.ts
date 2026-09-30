import { describe, expect, it } from 'vitest'
import { ABILITIES, ABILITY_NAMES, isAbility } from './abilities.js'
import { CONDITION_LIST, isCondition } from './conditions.js'
import { DAMAGE_TYPES, isDamageType } from './damage-types.js'
import { MAX_LEVEL, XP_THRESHOLDS, levelForXp, xpToNextLevel } from './progression.js'
import { RACES, RACE_LIST, isRace, raceLabel } from './races.js'
import { SKILLS, SKILL_LIST, isSkill } from './skills.js'

describe('taxonomies are complete', () => {
  it('has six abilities, all named', () => {
    expect(ABILITIES).toHaveLength(6)
    for (const ability of ABILITIES) expect(ABILITY_NAMES[ability]).toBeTruthy()
  })

  it('has the 18 SRD skills', () => {
    expect(SKILL_LIST).toHaveLength(18)
  })

  it('maps every skill to a real ability', () => {
    for (const [skill, ability] of Object.entries(SKILLS)) {
      expect(isAbility(ability), skill).toBe(true)
    }
  })

  it('has the 13 SRD damage types', () => {
    expect(DAMAGE_TYPES).toHaveLength(13)
  })

  it('has the 15 SRD conditions', () => {
    expect(CONDITION_LIST).toHaveLength(15)
  })

  it('guards reject unknown values', () => {
    expect(isAbility('luck')).toBe(false)
    expect(isSkill('haggling')).toBe(false)
    expect(isDamageType('sonic')).toBe(false)
    expect(isCondition('confused')).toBe(false)
  })
})

describe('progression', () => {
  it('covers 20 levels, strictly increasing', () => {
    expect(XP_THRESHOLDS).toHaveLength(MAX_LEVEL)
    for (let i = 1; i < XP_THRESHOLDS.length; i++) {
      expect(XP_THRESHOLDS[i]!).toBeGreaterThan(XP_THRESHOLDS[i - 1]!)
    }
  })

  it('derives level from total xp', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(299)).toBe(1)
    expect(levelForXp(300)).toBe(2)
    expect(levelForXp(6500)).toBe(5)
    expect(levelForXp(354_999)).toBe(19)
    expect(levelForXp(355_000)).toBe(20)
    expect(levelForXp(1_000_000)).toBe(20)
  })

  it('reports xp remaining, and nothing at level 20', () => {
    expect(xpToNextLevel(0)).toBe(300)
    expect(xpToNextLevel(250)).toBe(50)
    expect(xpToNextLevel(355_000)).toBeNull()
  })

  it('rejects negative xp', () => {
    expect(() => levelForXp(-1)).toThrow(/non-negative/)
  })
})

describe('races', () => {
  it('lists the nine SRD races', () => {
    expect(RACE_LIST).toHaveLength(9)
    expect(RACE_LIST).toContain('half-orc')
  })

  it('recognises a race whatever the casing', () => {
    expect(isRace('Tiefling')).toBe(true)
    expect(isRace('Ent')).toBe(false)
  })

  it('titles a hyphenated name for display', () => {
    expect(raceLabel('half-elf')).toBe('Half-Elf')
    expect(raceLabel('dwarf')).toBe('Dwarf')
  })

  it('gives every race a description for the picker', () => {
    for (const race of RACE_LIST) {
      expect(RACES[race].length).toBeGreaterThan(10)
    }
  })
})
