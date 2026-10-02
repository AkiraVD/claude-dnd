import { describe, expect, it } from 'vitest'
import { doingLabel } from './doing.js'

describe('doingLabel', () => {
  it('says what is happening at the table, not what the tool is called', () => {
    expect(doingLabel('set_story')).toBe('writing the backbone of the story')
    expect(doingLabel('attack_roll')).toBe('resolving the attack')
  })

  it('falls back to something readable for a tool it has not met', () => {
    // There are 65 tools and this list will fall behind one of them. Readable
    // beats silent, and silent is what the dots already were.
    expect(doingLabel('summon_kraken')).toBe('summon kraken')
    expect(doingLabel('mcp__dnd__summon_kraken')).toBe('summon kraken')
  })

  it('has nothing to say when nothing is running', () => {
    expect(doingLabel(null)).toBeNull()
    expect(doingLabel('')).toBeNull()
    expect(doingLabel('   ')).toBeNull()
  })

  it('never returns an empty or underscored phrase', () => {
    for (const name of ['set_story', 'roll_dice', 'anything_at_all']) {
      const label = doingLabel(name)!
      expect(label.length).toBeGreaterThan(2)
      expect(label).not.toContain('_')
    }
  })
})
