import { describe, expect, it } from 'vitest'
import { attackLabel } from './DiceCard.js'

/**
 * The heading ran its words together for as long as attack cards existed:
 * "longbowVessa → Vreeke". It was JSX, and JSX throws away whitespace that
 * spans a line break, so the separator between `{weapon}` and `{attacker}`
 * silently was not there. Nothing failed; it just looked wrong on every card.
 */
describe('the attack card heading', () => {
  it('separates the weapon from the attacker', () => {
    expect(attackLabel('longbow', 'Vessa', 'Vreeke')).toBe('longbow · Vessa → Vreeke')
  })

  it('names the weaponless swing', () => {
    expect(attackLabel(null, 'Sabat', 'Vessa')).toBe('attack · Sabat → Vessa')
  })

  it('never runs two names together', () => {
    for (const weapon of ['longbow', 'hand crossbow', 'weighted net', null]) {
      const label = attackLabel(weapon, 'Vessa', 'Vreeke')
      expect(label, `"${label}" has no separator`).toMatch(/ · /)
      expect(label).toContain(' → ')
      expect(label).not.toMatch(/[a-z]Vessa/)
    }
  })

  it('survives a missing attacker or target', () => {
    expect(attackLabel('club', undefined, undefined)).toBe('club ·  → ')
  })
})
