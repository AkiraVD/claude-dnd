import { isBeast } from '@dnd/content'
/**
 * Picking pre-rendered art.
 *
 * Nothing here generates anything: the images are built once and shipped with
 * the app, so a scene change costs a file read rather than a model.
 */

/** How many variants exist for each backdrop. Keep in step with public/scenes. */
export const BACKDROP_VARIANTS = 5

export const BACKDROPS = ['tavern', 'dungeon', 'road', 'city', 'ruins'] as const

export type Backdrop = (typeof BACKDROPS)[number]

export function isBackdrop(value: string): value is Backdrop {
  return (BACKDROPS as readonly string[]).includes(value)
}

/**
 * A stable number from a string (FNV-1a).
 *
 * The variant has to be derived, not drawn: `Math.random` would deal a new
 * tavern on every React render, and the room would change while the player was
 * reading about it.
 */
export function hash(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * The image for a scene, or null when the DM has not set a backdrop.
 *
 * Keyed on the scene text, so the same scene keeps the same room, and moving to
 * a different tavern picks a different one.
 */
export function backdropFor(backdrop: string | null, scene: string): string | null {
  if (backdrop === null || !isBackdrop(backdrop)) return null
  const variant = (hash(scene) % BACKDROP_VARIANTS) + 1
  return `/scenes/${backdrop}-${variant}.webp`
}

/** The stock portrait for an NPC, or null when none was chosen. */
export function portraitFor(portrait: string | null | undefined): string | null {
  if (portrait === undefined || portrait === null || portrait.trim() === '') return null
  // Names come from the catalogues in @dnd/content; anything else is a typo and
  // the <img> onError hides it rather than showing a broken frame. Which of the
  // two it is decides the directory, so a caller never has to know.
  const name = portrait.trim()
  return isBeast(name) ? `/monsters/${name}.webp` : `/npcs/${name}.webp`
}

/**
 * Whether this portrait is framed whole rather than head-and-shoulders.
 *
 * The folk are shot at head height, so a circle on the middle of the image
 * lands on the face. The bestiary is framed whole, and a standing goblin keeps
 * its head in the top third — without this the cast list would show everything
 * from the waist.
 */
export function isWholeBody(portrait: string | null | undefined): boolean {
  return portrait !== undefined && portrait !== null && isBeast(portrait.trim())
}

/**
 * Item names are free text — the DM writes "Rope, 50 ft" or "Potion of
 * healing", not a slug — so the art is matched on keywords rather than an id.
 *
 * The icons are single-colour SVGs drawn as one family (game-icons.net, CC BY
 * 3.0 — see CREDITS.md), applied as a CSS mask rather than an <img>, because
 * `currentColor` inside an external SVG resolves against that file and not the
 * page. Masking makes them take the surrounding text colour, so one file works
 * in both themes and can be tinted per context.
 *
 * Matching is on whole words, which is what keeps "bow" out of "crossbow" and
 * "axe" out of "greataxe"; where several match, the longest wins, so "chain
 * mail" beats "mail". Anything unrecognised simply gets no picture, which is
 * the right failure: a wrong icon is worse than none.
 */
const ITEM_ART: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['longsword', ['longsword', 'long sword']],
  ['shortsword', ['shortsword', 'short sword']],
  ['dagger', ['dagger', 'knife']],
  ['greataxe', ['greataxe', 'great axe', 'battleaxe', 'battle axe']],
  ['handaxe', ['handaxe', 'hand axe', 'axe']],
  ['warhammer', ['warhammer', 'war hammer', 'hammer']],
  ['mace', ['mace']],
  ['quarterstaff', ['quarterstaff', 'staff']],
  ['spear', ['spear', 'javelin', 'pike']],
  ['rapier', ['rapier']],
  ['shortbow', ['shortbow', 'short bow', 'longbow', 'bow']],
  ['crossbow', ['crossbow']],
  ['quiver', ['quiver', 'arrows', 'bolts']],
  ['shield', ['shield']],
  ['chain-shirt', ['chain shirt', 'chain mail', 'chainmail', 'mail']],
  ['leather-armour', ['leather armour', 'leather armor', 'studded leather', 'leather']],
  ['helm', ['helm', 'helmet']],
  ['potion-healing', ['potion of healing', 'healing potion']],
  ['potion-poison', ['poison', 'venom']],
  ['antitoxin', ['antitoxin']],
  ['oil-flask', ['oil']],
  ['rations', ['rations', 'ration']],
  ['rope', ['rope']],
  ['torch', ['torch', 'torches']],
  ['lantern', ['lantern']],
  ['bedroll', ['bedroll']],
  ['thieves-tools', ["thieves' tools", 'thieves tools', 'lockpicks', 'lockpick']],
  ['crowbar', ['crowbar']],
  ['grappling-hook', ['grappling hook', 'grapnel']],
  ['tinderbox', ['tinderbox']],
  ['waterskin', ['waterskin']],
  ['healers-kit', ["healer's kit", 'healers kit', 'healing kit']],
  ['caltrops', ['caltrops', 'caltrop']],
  ['manacles', ['manacles']],
  ['gold-coins', ['coins', 'coin', 'gold pieces']],
  ['gem', ['gemstone', 'gem', 'ruby', 'sapphire', 'emerald', 'diamond']],
  ['silver-locket', ['locket']],
  ['crown', ['crown', 'circlet']],
  ['chest', ['chest', 'strongbox', 'coffer']],
  ['key', ['key']],
  ['spellbook', ['spellbook', 'spell book']],
  ['scroll', ['scroll']],
  ['wand', ['wand']],
  ['orb', ['orb']],
  ['holy-symbol', ['holy symbol']],
  ['component-pouch', ['component pouch']],
]

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The picture for an item, or null when nothing matches confidently. */
export function itemArtFor(name: string): string | null {
  const text = name.toLowerCase()
  let best: { asset: string; length: number } | null = null

  for (const [asset, keywords] of ITEM_ART) {
    for (const keyword of keywords) {
      if (!new RegExp(`\\b${escape(keyword)}\\b`).test(text)) continue
      if (best === null || keyword.length > best.length) {
        best = { asset, length: keyword.length }
      }
    }
  }

  return best === null ? null : `/items/${best.asset}.svg`
}

/** Every asset the matcher can point at, for the test that they all exist. */
export const ITEM_ASSETS: readonly string[] = ITEM_ART.map(([asset]) => asset)
