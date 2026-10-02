import { describe, expect, it } from 'vitest'
import { BESTIARY, PORTRAITS, UNKNOWN_PORTRAIT, genderOfPortrait, pronounsForPortrait } from '@dnd/content'
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
    // The property, not the file. Naming the portrait pinned an answer that was
    // only right while the race had one option in that cluster — a second dwarf
    // priest broke this, by being picked, which is what it is for.
    const CLUSTER: Record<string, string[]> = {
      fighter: ['mercenary', 'sellsword', 'shieldbreaker', 'bladedancer', 'bulwark'],
      wizard: ['courtmage', 'highmage', 'runecarver', 'hedgemage'],
      ranger: ['outrider', 'longstrider', 'pathfinder', 'trailwise', 'scout'],
      rogue: ['grifter', 'cardsharp', 'dicesharp', 'silvertongue', 'charlatan'],
      cleric: ['warpriest', 'forgepriest', 'grovepriest', 'hearthpriest', 'wanderingpriest'],
    }
    for (const race of RACES) {
      for (const [cls, roles] of Object.entries(CLUSTER)) {
        const role = avatarFor(race, cls).split('-').at(-2)!
        expect(roles, `${race} ${cls} got ${role}`).toContain(role)
      }
    }
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
    // A hood rather than nothing, and rather than a face of the wrong race.
    expect(rolled.portrait).toBe(UNKNOWN_PORTRAIT)
  })

  it('keeps the hood for the cases nothing else fits', () => {
    // It is in the catalogue, so the DM can pick it for a figure the player has
    // only seen at a distance — but a race the library covers must never get it.
    expect(UNKNOWN_PORTRAIT in PORTRAITS).toBe(true)
    for (const race of RACES) {
      for (const cls of CLASSES) {
        expect(avatarFor(race, cls), `${race} ${cls}`).not.toBe(UNKNOWN_PORTRAIT)
      }
    }
  })

  it('never gives a face one gender and a name the other', () => {
    // The bug this was written for: Vigga Ironmoot wearing a bearded dwarf,
    // because the name and the portrait were drawn independently. Checked
    // across every pairing and both ends of the dice, not a sample.
    const forGender = (gender: 'male' | 'female'): Set<string> => {
      const out = new Set<string>()
      for (const race of RACES) {
        for (const cls of CLASSES) {
          for (const roll of [0, 0.25, 0.5, 0.75, 0.999]) {
            const rolled = rollCharacter(race, cls, () => roll)
            if (genderOfPortrait(rolled.portrait) === gender) out.add(rolled.name)
          }
        }
      }
      return out
    }
    const male = forGender('male')
    const female = forGender('female')

    expect(male.size).toBeGreaterThan(0)
    expect(female.size).toBeGreaterThan(0)
    for (const name of male) expect(female.has(name), `${name} on both`).toBe(false)
  })

  it('takes the pronouns from the face, and says nothing when the face does not', () => {
    for (const race of RACES) {
      for (const cls of CLASSES) {
        const rolled = rollCharacter(race, cls, () => 0.5)
        expect(rolled.pronouns, `${race} ${cls}`).toBe(pronounsForPortrait(rolled.portrait))
      }
    }
    // And a portrait that commits to nothing yields nothing. The hood is the
    // case that stays that way: it is faceless on purpose, where the dragonborn
    // only looked uncommitted until someone judged them by eye.
    expect(pronounsForPortrait(UNKNOWN_PORTRAIT)).toBeNull()
    expect(genderOfPortrait(UNKNOWN_PORTRAIT)).toBeNull()
  })
})
