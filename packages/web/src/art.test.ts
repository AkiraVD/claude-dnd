import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { BESTIARY, BESTIARY_LIST, PORTRAIT_LIST, PORTRAITS } from '@dnd/content'
import { describe, expect, it } from 'vitest'
import {
  BACKDROPS,
  BACKDROP_VARIANTS,
  ITEM_ASSETS,
  backdropFor,
  hash,
  itemArtFor,
  isWholeBody,
  portraitFor,
} from './art.js'

const asset = (path: string): string =>
  fileURLToPath(new URL(`../public${path}`, import.meta.url))

describe('backdropFor', () => {
  it('returns nothing when the DM has not set one', () => {
    expect(backdropFor(null, 'a room')).toBeNull()
  })

  it('ignores a backdrop it does not have art for', () => {
    expect(backdropFor('spaceship', 'a room')).toBeNull()
  })

  it('gives the same scene the same room every time', () => {
    const scene = 'The Broken Oar, low beams and wet boots.'
    const first = backdropFor('tavern', scene)

    for (let i = 0; i < 20; i += 1) {
      expect(backdropFor('tavern', scene)).toBe(first)
    }
  })

  it('gives a different scene a different chance of a different room', () => {
    const rooms = new Set(
      ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map((s) =>
        backdropFor('tavern', s),
      ),
    )

    // Not a guarantee of all five, but one room for eight scenes would be a bug.
    expect(rooms.size).toBeGreaterThan(1)
  })

  it('stays inside the variants that exist', () => {
    for (const backdrop of BACKDROPS) {
      for (let i = 0; i < 200; i += 1) {
        const path = backdropFor(backdrop, `scene number ${i}`)!
        const variant = Number(path.match(/-(\d+)\.webp$/)![1])
        expect(variant).toBeGreaterThanOrEqual(1)
        expect(variant).toBeLessThanOrEqual(BACKDROP_VARIANTS)
      }
    }
  })

  it('points at art that is actually there', () => {
    for (const backdrop of BACKDROPS) {
      for (let variant = 1; variant <= BACKDROP_VARIANTS; variant += 1) {
        const path = `/scenes/${backdrop}-${variant}.webp`
        expect(existsSync(asset(path)), `${path} is missing`).toBe(true)
      }
    }
  })
})

describe('hash', () => {
  it('is stable across calls', () => {
    expect(hash('Bargha Ironhand')).toBe(hash('Bargha Ironhand'))
  })

  it('separates strings that differ by one character', () => {
    expect(hash('tavern a')).not.toBe(hash('tavern b'))
  })

  it('handles an empty string without throwing', () => {
    expect(typeof hash('')).toBe('number')
  })
})

describe('portraitFor', () => {
  it('returns nothing for an NPC without one', () => {
    expect(portraitFor(null)).toBeNull()
    expect(portraitFor(undefined)).toBeNull()
    expect(portraitFor('  ')).toBeNull()
  })

  it('has a file for every name in the catalogue', () => {
    expect(PORTRAIT_LIST.length).toBeGreaterThan(0)
    for (const name of PORTRAIT_LIST) {
      const path = portraitFor(name)!
      expect(existsSync(asset(path)), `${name}: ${path} is missing`).toBe(true)
    }
  })

  it('describes every portrait, so the DM can pick without looking', () => {
    for (const name of PORTRAIT_LIST) {
      expect(PORTRAITS[name].length).toBeGreaterThan(10)
    }
  })

  it('has a file for every creature in the bestiary', () => {
    expect(BESTIARY_LIST.length).toBeGreaterThan(0)
    for (const name of BESTIARY_LIST) {
      const path = portraitFor(name)!
      expect(path, `${name} should resolve into /monsters/`).toContain('/monsters/')
      expect(existsSync(asset(path)), `${name}: ${path} is missing`).toBe(true)
    }
  })

  it('describes every creature too', () => {
    for (const name of BESTIARY_LIST) {
      expect(BESTIARY[name].length).toBeGreaterThan(10)
    }
  })

  it('keeps the two libraries apart, by name and by directory', () => {
    // A name in both would resolve to one directory and be described by the
    // other, which is the kind of thing that only shows up as a missing image.
    const clash = PORTRAIT_LIST.filter((n) => (BESTIARY_LIST as string[]).includes(n))
    expect(clash, `in both libraries: ${clash.join(', ')}`).toEqual([])
    for (const name of PORTRAIT_LIST) expect(portraitFor(name)).toContain('/npcs/')
  })

  it('knows which portraits are framed whole', () => {
    // The crop leans upward only for the bestiary; getting this backwards would
    // put every innkeeper's forehead in the circle.
    expect(isWholeBody('goblin')).toBe(true)
    expect(isWholeBody('beholder')).toBe(true)
    expect(isWholeBody('human-baker-floured')).toBe(false)
    expect(isWholeBody(null)).toBe(false)
    expect(isWholeBody('  ')).toBe(false)
    expect(isWholeBody('not-a-real-name')).toBe(false)
  })
})

describe('itemArtFor', () => {
  const cases: Array<[string, string | null]> = [
    ['Rope, 50 ft', 'rope'],
    ['Silk rope, 50 feet', 'rope'],
    ['Potion of healing', 'potion-healing'],
    ['Healing potion', 'potion-healing'],
    ['Torch', 'torch'],
    ['Torches', 'torch'],
    ['Hooded lantern', 'lantern'],
    ["Thieves' tools", 'thieves-tools'],
    ["Healer's kit", 'healers-kit'],
    ['Longsword', 'longsword'],
    ['Longsword +1', 'longsword'],
    ['Silver locket', 'silver-locket'],
    ['A small heap of coins', 'gold-coins'],
    ['Spellbook', 'spellbook'],
    ['Scroll of protection', 'scroll'],
    ['Studded leather armour', 'leather-armour'],
    ['Goblin cleaver', null],
    ['A letter from home', null],
    ['', null],
  ]

  for (const [name, expected] of cases) {
    it(`reads "${name}" as ${expected ?? 'no art'}`, () => {
      expect(itemArtFor(name)).toBe(expected === null ? null : `/items/${expected}.svg`)
    })
  }

  it('does not let a short word win inside a longer one', () => {
    // "bow" must not claim a crossbow, nor "axe" a greataxe, nor "mail" chain mail.
    expect(itemArtFor('Light crossbow')).toBe('/items/crossbow.svg')
    expect(itemArtFor('Greataxe')).toBe('/items/greataxe.svg')
    expect(itemArtFor('Chain mail')).toBe('/items/chain-shirt.svg')
  })

  it('prefers the more specific match when both apply', () => {
    expect(itemArtFor('Potion of healing')).toBe('/items/potion-healing.svg')
    expect(itemArtFor('Flask of oil')).toBe('/items/oil-flask.svg')
  })

  it('has a file for every asset it can point at', () => {
    for (const name of ITEM_ASSETS) {
      expect(existsSync(asset(`/items/${name}.svg`)), `${name}.webp is missing`).toBe(true)
    }
  })
})
