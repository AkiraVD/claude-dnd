import { describe, expect, it } from 'vitest'
import { PORTRAITS, genderOfPortrait } from '@dnd/content'
import { FACES, faceCounts, facesMatching, raceLabel, raceOfPortrait } from './faces.js'
import { suggestedClass } from './roll-character.js'

describe('reading a character off their face', () => {
  it('takes the longest race prefix, not the first that matches', () => {
    // half-elf starts with neither half nor elf by accident: read loosely it
    // comes back an elf, and the brief then tells the DM the wrong people.
    expect(raceOfPortrait('half-elf-scout-listening')).toBe('half-elf')
    expect(raceOfPortrait('half-orc-guard-tusked')).toBe('half-orc')
    expect(raceOfPortrait('elf-scout-lean')).toBe('elf')
    expect(raceOfPortrait('goblin')).toBeNull()
  })

  it('offers every folk portrait and no creatures', () => {
    expect(FACES.length).toBe(190)
    for (const face of FACES) expect(face.name in PORTRAITS).toBe(true)
    // Typed as PortraitName, so the comparison is against the string rather
    // than the union — a creature in here would be a type error first anyway.
    expect(FACES.some((f) => (f.name as string) === 'goblin')).toBe(false)
  })

  it('agrees with the catalogue about who is a man and who a woman', () => {
    for (const face of FACES) expect(face.gender).toBe(genderOfPortrait(face.name))
  })

  it('filters by race and by sex', () => {
    const dwarves = facesMatching({ race: 'dwarf' })
    expect(dwarves.length).toBeGreaterThan(20)
    for (const face of dwarves) expect(face.race).toBe('dwarf')

    const women = facesMatching({ race: 'dwarf', gender: 'female' })
    for (const face of women) expect(face.gender === 'female' || face.gender === null).toBe(true)
    expect(women.length).toBeLessThan(dwarves.length)
  })

  it('shows a face that commits to no sex under both filters', () => {
    // Otherwise a portrait the picture says nothing about would be reachable
    // from neither, which is the opposite of what unspecified means.
    const neutral = FACES.filter((f) => f.gender === null)
    expect(neutral.length).toBeGreaterThan(0)
    for (const face of neutral) {
      expect(facesMatching({ race: face.race, gender: 'male' }).map((f) => f.name)).toContain(face.name)
      expect(facesMatching({ race: face.race, gender: 'female' }).map((f) => f.name)).toContain(face.name)
    }
  })

  it('counts what is behind each chip', () => {
    const counts = faceCounts()
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(190)
    expect(counts['human']).toBeGreaterThan(counts['half-elf']!)
  })

  it('writes a race the way the brief should say it', () => {
    expect(raceLabel('half-elf')).toBe('Half-Elf')
    expect(raceLabel('dragonborn')).toBe('Dragonborn')
  })
})

describe('suggestedClass', () => {
  it('reads the trade in the picture', () => {
    expect(suggestedClass('dwarf-shieldbreaker-ringed')).toBe('barbarian')
    expect(suggestedClass('human-courtmage-inked')).toBe('wizard')
    expect(suggestedClass('elf-grovepriest-antlered')).toBe('druid')
    expect(suggestedClass('halfling-cardsharp-waistcoated')).toBe('rogue')
  })

  it('suggests nothing for a face that is only a trade', () => {
    // Chosen because someone wants to look like a miller. Inventing a class
    // for them would be noise, and the Class tab simply opens unanswered.
    expect(suggestedClass('human-baker-floured')).toBeNull()
    expect(suggestedClass('unknown-figure-hooded')).toBeNull()
  })

  it('suggests something for most of the library', () => {
    const with_ = FACES.filter((f) => suggestedClass(f.name) !== null)
    expect(with_.length).toBe(134)
  })
})
