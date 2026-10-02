import { describe, expect, it } from 'vitest'
import { CLASS_FEATURES, featuresFor } from './features.js'
import { CLASSES, type ClassName } from './classes.js'

const names = (className: ClassName, level: number): string[] =>
  featuresFor(className, level)
    .map((f) => f.name)
    .sort()

describe('class features', () => {
  it('covers every class, even the ones with nothing to count', () => {
    // An empty list is an answer — Favoured Enemy is passive and Sneak Attack is
    // once a turn. A missing key would be an oversight, which is the difference
    // worth catching.
    for (const className of Object.keys(CLASSES) as ClassName[]) {
      expect(CLASS_FEATURES[className], className).toBeDefined()
    }
  })

  it('gives a fighter the two the DM used to have to remember', () => {
    expect(names('fighter', 1)).toEqual(['second-wind'])
    expect(names('fighter', 2)).toEqual(['action-surge', 'second-wind'])
  })

  it('gives one entry per feature, at the best level reached', () => {
    // Action Surge is listed at 2 and again at 17. Seventeen means two uses,
    // not two separate resources called the same thing.
    const surge = featuresFor('fighter', 17).filter((f) => f.name === 'action-surge')

    expect(surge).toHaveLength(1)
    expect(surge[0]!.max).toBe(2)
  })

  it('does not hand out a feature before its level', () => {
    expect(names('cleric', 1)).toEqual([])
    expect(names('monk', 1)).toEqual([])
    expect(names('druid', 1)).toEqual([])
  })

  it('tracks rage up the barbarian table', () => {
    const rage = (level: number): unknown => featuresFor('barbarian', level)[0]?.max
    expect(rage(1)).toBe(2)
    expect(rage(2)).toBe(2)
    expect(rage(3)).toBe(3)
    expect(rage(6)).toBe(4)
    expect(rage(12)).toBe(5)
    expect(rage(17)).toBe(6)
  })

  it('changes what a rest gives back, not just how much', () => {
    // Bardic Inspiration is the only one that moves rest: long until 5, short
    // after. The count is the same, so a table keyed only on max would miss it.
    expect(featuresFor('bard', 4)[0]!.recharge).toBe('long-rest')
    expect(featuresFor('bard', 5)[0]!.recharge).toBe('short-rest')
  })

  it('every entry is reachable and sane', () => {
    for (const [className, features] of Object.entries(CLASS_FEATURES)) {
      for (const feature of features) {
        expect(feature.level, `${className} ${feature.name}`).toBeGreaterThanOrEqual(1)
        expect(feature.level, `${className} ${feature.name}`).toBeLessThanOrEqual(20)
        expect(feature.label.length, `${className} ${feature.name}`).toBeGreaterThan(2)
        expect(featuresFor(className as ClassName, 20).some((f) => f.name === feature.name)).toBe(true)
      }
    }
  })
})
