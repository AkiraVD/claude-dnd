import { describe, expect, it } from 'vitest'
import { BESTIARY, PORTRAITS } from '@dnd/content'
import { avatarFor, portraitsForRace, rollCharacter, rolledClasses, rolledRaces } from './roll-character.js'

/**
 * The roll runs in the browser with no DM and no network: the form is open
 * before anything is started, so it has to answer out of what is shipped.
 */
describe('rolling a character', () => {
  const RACES = rolledRaces()
  const CLASSES = rolledClasses()

  it('covers every race and class the form offers', () => {
    expect(RACES).toHaveLength(9)
    expect(CLASSES).toHaveLength(12)
  })

  it('gives a name, a concept and a face for every pairing', () => {
    for (const race of RACES) {
      for (const cls of CLASSES) {
        const rolled = rollCharacter(race, cls, () => 0.5)
        expect(rolled.name.length, `${race} ${cls}`).toBeGreaterThan(2)
        expect(rolled.concept.length, `${race} ${cls}`).toBeGreaterThan(20)
        expect(rolled.portrait, `${race} ${cls}`).not.toBeNull()
      }
    }
  })

  it('never hands out a monster as a face', () => {
    // The two libraries are separate for a reason; a player rolling a beholder
    // for a face would be a funny bug exactly once.
    for (const race of RACES) {
      for (const cls of CLASSES) {
        const name = rollCharacter(race, cls, () => 0.1).portrait!
        expect(name in PORTRAITS, name).toBe(true)
        expect(name in BESTIARY, name).toBe(false)
      }
    }
  })

  it('always matches the race, whatever the class', () => {
    // A wrong trade reads as a quirk; a wrong race reads as a bug. Race wins.
    for (const race of RACES) {
      const ofRace = new Set(portraitsForRace(race))
      for (const cls of CLASSES) {
        const got = avatarFor(race, cls)!
        expect(ofRace.has(got), `${race} ${cls} got ${got}`).toBe(true)
      }
    }
  })

  it('prefers a role that suits the class where one exists', () => {
    expect(avatarFor('human', 'fighter')).toContain('mercenary')
    expect(avatarFor('human', 'wizard')).toContain('courtmage')
    expect(avatarFor('elf', 'ranger')).toContain('longstrider')
    expect(avatarFor('halfling', 'rogue')).toContain('cardsharp')
    expect(avatarFor('dwarf', 'cleric')).toContain('forgepriest')
  })

  it('is deterministic for a given roll', () => {
    const a = rollCharacter('elf', 'wizard', () => 0.25)
    const b = rollCharacter('elf', 'wizard', () => 0.25)
    expect(a).toEqual(b)
  })

  it('falls back to something sane for an unknown race or class', () => {
    const rolled = rollCharacter('aarakocra', 'artificer', () => 0.5)
    expect(rolled.name.length).toBeGreaterThan(2)
    expect(rolled.concept.length).toBeGreaterThan(20)
    expect(rolled.portrait).toBeNull()
  })
})
