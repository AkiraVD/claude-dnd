import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COMMONER, addNote, createCreature, createStory, updateProfile } from '@dnd/engine'
import { CampaignDb } from '@dnd/mcp/db.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readTable } from './table.js'

/**
 * The spoiler boundary.
 *
 * Everything here asserts a negative — that something is *not* in what the
 * browser receives. A test that only checked the panel rendered correctly would
 * pass just as happily while the secret sat in a network frame.
 */

let dir: string
let db: CampaignDb

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'dnd-table-'))
  db = new CampaignDb(join(dir, 'campaign.db'))
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

const veyl = () => {
  let creature = createCreature({
    id: 'veyl',
    name: 'Sister Veyl',
    scores: COMMONER.scores,
    maxHp: COMMONER.maxHp,
    ac: COMMONER.ac,
    purse: '3 gp',
  })
  creature = updateProfile(creature, {
    race: 'human',
    role: 'priest of the Hollow',
    attitude: 'indifferent',
    principal: true,
    want: 'the workshop burned before anyone reads the ledger',
  }).creature
  creature = addNote(creature, 'Turned the locket over twice.', true).creature
  creature = addNote(creature, 'It is her sister in the locket.').creature
  creature = addNote(creature, 'She has been paying the Tallow Man for a year.').creature
  return creature
}

const backbone = () =>
  createStory({
    premise: 'The Stonehollow tithe has not arrived in three seasons.',
    question: 'Who is eating the town’s silver?',
    truth: 'The Tallow Man is rendering it into something that has to be poured.',
    beats: [
      { text: 'The ledger does not add up.', revealed: true },
      'The chapel has a second cellar, through the ossuary.',
      'Burn the workshop, or take it.',
    ],
  }).story

function seed(): void {
  const campaign = db.createCampaign('Stonehollow', 1)
  db.appendStep(campaign.id, 'seed', [], {
    rngState: 1,
    scene: 'The chapel steps.',
    creatures: [veyl()],
    combat: null,
    story: backbone(),
  })
}

describe('what crosses the wire', () => {
  it('sends what the player can plainly see', () => {
    seed()
    const table = readTable(db)
    const seen = table.creatures[0]!

    expect(seen.name).toBe('Sister Veyl')
    expect(seen.profile.race).toBe('human')
    expect(seen.profile.role).toBe('priest of the Hollow')
    expect(seen.profile.attitude).toBe('indifferent')
    expect(seen.purse).toBe(300)
  })

  it('never sends what the DM is holding back', () => {
    seed()
    const wire = JSON.stringify(readTable(db))

    expect(wire).not.toContain('her sister')
    expect(wire).not.toContain('Tallow Man')
    expect(wire).not.toContain('workshop burned')
    expect(wire).not.toContain('ossuary')
  })

  it('sends the notes that have come out, and only those', () => {
    seed()
    const seen = readTable(db).creatures[0]!

    expect(seen.profile.notes).toEqual([
      { text: 'Turned the locket over twice.', revealed: true },
    ])
  })

  it('leaves no way to count what is hidden', () => {
    seed()
    const seen = readTable(db).creatures[0]!

    // Three notes exist; one is known. Nothing in what is sent says "two more".
    expect(seen.profile.notes).toHaveLength(1)
    expect(seen.profile.want).toBeNull()
  })

  it('does not say who the story turns on', () => {
    seed()

    expect(readTable(db).creatures[0]!.profile.principal).toBe(false)
  })

  it('sends the premise and question but never the truth', () => {
    seed()
    const story = readTable(db).story!

    expect(story.premise).toBe('The Stonehollow tithe has not arrived in three seasons.')
    expect(story.question).toBe('Who is eating the town’s silver?')
    expect(story.truth).toBe('')
    expect(story.beats.map((b) => b.text)).toEqual(['The ledger does not add up.'])
  })

  it('survives a campaign saved before any of this existed', () => {
    const campaign = db.createCampaign('Old save', 1)
    const ancient = JSON.parse(
      JSON.stringify({
        ...createCreature({
          id: 'brann',
          name: 'Brann',
          kind: 'pc',
          scores: COMMONER.scores,
          maxHp: 10,
          ac: 12,
        }),
        purse: undefined,
        items: undefined,
        profile: undefined,
        presence: undefined,
      }),
    )
    // No `story` key at all, exactly as an older snapshot was written.
    db.appendStep(campaign.id, 'seed', [], {
      rngState: 1,
      scene: 'A road.',
      creatures: [ancient],
      combat: null,
    })

    const table = readTable(db)

    expect(table.story).toBeNull()
    expect(table.creatures[0]!.purse).toBe(0)
    expect(table.creatures[0]!.items).toEqual([])
    expect(table.creatures[0]!.profile.notes).toEqual([])
  })

  it('has something to say with no campaign at all', () => {
    const table = readTable(db)

    expect(table.creatures).toEqual([])
    expect(table.story).toBeNull()
    expect(table.campaign.name).toBe('No campaign yet')
  })
})
