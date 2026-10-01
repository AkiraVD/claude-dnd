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
  DEFAULT_ZOOM,
  faceOf,
  faceTransform,
  hasFace,
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

  it('has a recorded face for every portrait in both libraries', () => {
    // The whole point of measuring them: a name without an entry silently falls
    // back to the centre of the frame, which is exactly the blunt rule this
    // replaced.
    for (const name of PORTRAIT_LIST) expect(hasFace(name), name).toBe(true)
    for (const name of BESTIARY_LIST) expect(hasFace(name), name).toBe(true)
  })

  it('keeps every face inside the frame', () => {
    for (const name of [...PORTRAIT_LIST, ...BESTIARY_LIST]) {
      const face = faceOf(name)
      expect(face.x, `${name} x`).toBeGreaterThan(0)
      expect(face.x, `${name} x`).toBeLessThan(100)
      expect(face.y, `${name} y`).toBeGreaterThan(0)
      expect(face.y, `${name} y`).toBeLessThan(100)
    }
  })

  it('does not assume every face is near the top of the frame', () => {
    // These were all wrong on the first pass for the same reason: a creature on
    // four legs, or built around an eye, carries its face low. The numbers get
    // hand-tuned in the editor, so this asserts the shape of the answer rather
    // than the answer.
    for (const name of ['giant-rat', 'displacer-beast', 'beholder', 'hell-hound', 'dire-wolf']) {
      expect(faceOf(name).y, `${name} should sit well down the frame`).toBeGreaterThan(30)
    }
  })

  it('falls back to the centre rather than nothing', () => {
    expect(faceOf('not-a-real-name')).toEqual({ x: 50, y: 50, zoom: DEFAULT_ZOOM })
    expect(faceOf(null)).toEqual({ x: 50, y: 50, zoom: DEFAULT_ZOOM })
    expect(hasFace('not-a-real-name')).toBe(false)
    expect(hasFace(null)).toBe(false)
  })

  it('aims the zoom at the face', () => {
    // A name with no entry sits at the centre, so nothing moves.
    expect(faceTransform('not-a-real-name')).toBe('scale(2) translate(0%, 0%)')
    // A face below the middle pulls the image up, not down.
    const [, , dy] = /translate\((-?[\d.]+)%, (-?[\d.]+)%\)/.exec(faceTransform('beholder'))!
    expect(faceOf('beholder').y).toBeGreaterThan(50)
    expect(Number(dy)).toBeLessThan(0)
  })

  it('never shifts so far that the background shows through', () => {
    // Scaling by z leaves (z - 1) of overflow to play with, half each side, and
    // the translate is scaled as well. Past that limit the image edge comes
    // inside the box and the circle gets a bite taken out of it.
    for (const zoom of [1.5, 2, 3]) {
      const limit = ((zoom - 1) / (2 * zoom)) * 100
      for (const name of [...PORTRAIT_LIST, ...BESTIARY_LIST]) {
        const [, x, y] = /translate\((-?[\d.]+)%, (-?[\d.]+)%\)/.exec(
          faceTransform(name, zoom),
        )!
        expect(Math.abs(Number(x)), `${name} x at zoom ${zoom}`).toBeLessThanOrEqual(limit + 1e-9)
        expect(Math.abs(Number(y)), `${name} y at zoom ${zoom}`).toBeLessThanOrEqual(limit + 1e-9)
      }
    }
  })

  it('clamps the faces that sit nearest the edge', () => {
    // Some faces are further from the middle than a 2x zoom can reach, and those
    // ride as high in the circle as they can without leaving a gap. Found rather
    // than named, since which portrait is the extreme one changes with tuning.
    const extreme = [...PORTRAIT_LIST, ...BESTIARY_LIST].find(
      (name) => Math.abs(50 - faceOf(name).y) > 25,
    )
    expect(extreme, 'expected at least one face past what 2x can centre').toBeDefined()
    const [, , dy] = /translate\((-?[\d.]+)%, (-?[\d.]+)%\)/.exec(faceTransform(extreme!))!
    expect(Math.abs(Number(dy))).toBe(25)
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

describe('zoom in the metadata', () => {
  it('defaults when the entry does not say', () => {
    // Entries are [x, y] or [x, y, zoom]; the two-element form is the common one
    // and has to keep working.
    expect(faceOf('not-a-real-name').zoom).toBe(DEFAULT_ZOOM)
    for (const name of [...PORTRAIT_LIST, ...BESTIARY_LIST]) {
      expect(faceOf(name).zoom, name).toBeGreaterThanOrEqual(1)
      expect(faceOf(name).zoom, name).toBeLessThanOrEqual(5)
    }
  })

  it('uses the portrait’s own zoom unless told otherwise', () => {
    const name = BESTIARY_LIST[0]!
    const own = faceOf(name).zoom
    expect(faceTransform(name)).toContain(`scale(${own})`)
    expect(faceTransform(name, 3)).toContain('scale(3)')
  })

  it('clamps against whatever zoom is in play, not a fixed one', () => {
    // The shift limit comes from the zoom, so a tighter crop can reach further.
    const reach = (zoom: number): number => {
      const [, , dy] = /translate\((-?[\d.]+)%, (-?[\d.]+)%\)/.exec(faceTransform('ogre', zoom))!
      return Math.abs(Number(dy))
    }
    expect(reach(3)).toBeGreaterThan(reach(1.5))
  })
})
