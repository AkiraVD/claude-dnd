import { describe, expect, it } from 'vitest'
import {
  addCondition,
  createCreature,
  hasCondition,
  lifeStatus,
  withHp,
  type Creature,
} from './character.js'
import { attack, nextTurn, removeFromCombat, startCombat } from './combat.js'
import { applyDamage, deathSave, heal } from './damage.js'
import { criticalNotation } from './dice.js'
import { scriptedRng } from './testing.js'

/**
 * The phase 2 acceptance test: a whole fight, resolved through the public API
 * with nothing scripted but the dice.
 *
 * Each action gets its own `scriptedRng` holding exactly the faces that action
 * consumes. That is far easier to read than one long array, and it fails loudly
 * if a rule starts drawing a different number of dice than expected.
 */

const fighter = (): Creature =>
  createCreature({
    id: 'brann',
    name: 'Brann',
    kind: 'pc',
    level: 3,
    scores: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
    maxHp: 28,
    ac: 16,
    proficiencies: { saves: ['str', 'con'], skills: ['athletics'] },
  })

const goblin = (id: string, name: string): Creature =>
  createCreature({
    id,
    name,
    scores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    maxHp: 7,
    ac: 15,
    speed: 30,
  })

/** Longsword: str +3, proficiency +3 at level 3 → +6 to hit, 1d8+3. */
const longsword = { ability: 'str', proficient: true, damage: '1d8', damageType: 'slashing', damageBonus: 3 } as const

/** Scimitar: dex +2, proficiency +2 → +4 to hit, 1d6+2. */
const scimitar = { ability: 'dex', proficient: true, damage: '1d6', damageType: 'slashing', damageBonus: 2 } as const

describe('a goblin ambush, start to finish', () => {
  it('runs initiative, a hit, a lethal crit, a miss, and a killing blow', () => {
    let brann = fighter()
    let alpha = goblin('goblin-a', 'Goblin A')
    let beta = goblin('goblin-b', 'Goblin B')

    // ── initiative ────────────────────────────────────────────────────────────
    // dex +2 all round. Faces 15, 10, 18 → Brann 17, Alpha 12, Beta 20.
    const opening = startCombat([brann, alpha, beta], scriptedRng([15, 10, 18]))
    let state = opening.state

    expect(opening.rolls.map((r) => r.initiative)).toEqual([17, 12, 20])
    expect(state.order.map((c) => c.name)).toEqual(['Goblin B', 'Brann', 'Goblin A'])
    expect(state.round).toBe(1)

    // ── round 1, Goblin B ─────────────────────────────────────────────────────
    // 12 + 4 = 16 against AC 16: a hit by exactly nothing. 1d6 shows 4, +2 = 6.
    const betaSwing = attack({
      attacker: beta,
      target: brann,
      ...scimitar,
      rng: scriptedRng([12, 4]),
    })
    brann = betaSwing.target

    expect(betaSwing.hit).toBe(true)
    expect(betaSwing.critical).toBe(false)
    expect(brann.hp.current).toBe(22)

    // ── round 1, Brann ────────────────────────────────────────────────────────
    state = nextTurn(state).state
    expect(state.order[state.turnIndex]!.name).toBe('Brann')

    // Natural 20: automatic hit, automatic crit. 1d8+3 becomes 2d8+3 — faces 7
    // and 6 make 13, plus 3 for 16. Never plus 6.
    const brannCrit = attack({
      attacker: brann,
      target: beta,
      ...longsword,
      rng: scriptedRng([20, 7, 6]),
    })
    beta = brannCrit.target

    expect(brannCrit.critical).toBe(true)
    expect(brannCrit.damageRoll?.notation).toBe('2d8')
    expect(brannCrit.damage?.effective).toBe(16)

    // 16 damage against 7 HP leaves 9 overkill, which beats Goblin B's 7 max HP:
    // dead where it stands, no death saves.
    expect(brannCrit.damage?.instantDeath).toBe(true)
    expect(lifeStatus(beta)).toBe('dead')

    state = removeFromCombat(state, beta.id)
    expect(state.order.map((c) => c.name)).toEqual(['Brann', 'Goblin A'])
    // Still Brann's turn: removing someone ahead of him must not skip him.
    expect(state.order[state.turnIndex]!.name).toBe('Brann')

    // ── round 1, Goblin A ─────────────────────────────────────────────────────
    state = nextTurn(state).state
    expect(state.order[state.turnIndex]!.name).toBe('Goblin A')

    const alphaMiss = attack({
      attacker: alpha,
      target: brann,
      ...scimitar,
      rng: scriptedRng([3]),
    })
    expect(alphaMiss.hit).toBe(false)
    expect(alphaMiss.damageRoll).toBeNull()
    expect(alphaMiss.target.hp.current).toBe(22)

    // ── round 2 ───────────────────────────────────────────────────────────────
    const wrap = nextTurn(state)
    state = wrap.state
    expect(wrap.newRound).toBe(true)
    expect(state.round).toBe(2)
    expect(wrap.actor.name).toBe('Brann')

    // 14 + 6 = 20 against AC 15. 1d8 shows 5, +3 = 8 against 7 HP: one point of
    // overkill, nowhere near the 7 needed for massive damage — but a goblin dies
    // at 0 regardless, with no death saves to roll.
    const finisher = attack({
      attacker: brann,
      target: alpha,
      ...longsword,
      rng: scriptedRng([14, 5]),
    })
    alpha = finisher.target

    expect(finisher.hit).toBe(true)
    expect(finisher.damage?.instantDeath).toBe(false)
    expect(finisher.damage?.droppedToZero).toBe(true)
    expect(finisher.damage?.died).toBe(true)
    expect(alpha.hp.current).toBe(0)
    expect(lifeStatus(alpha)).toBe('dead')
    expect(hasCondition(alpha, 'unconscious')).toBe(false)

    // Brann walked away from two goblins having taken a single scimitar hit.
    expect(brann.hp.current).toBe(22)
  })

  it('takes a goblin alive when the fighter pulls the blow', () => {
    const brann = fighter()
    const alpha = goblin('goblin-a', 'Goblin A')

    const subdue = attack({
      attacker: brann,
      target: alpha,
      ...longsword,
      lethal: false,
      rng: scriptedRng([14, 5]),
    })

    expect(subdue.damage?.died).toBe(false)
    expect(lifeStatus(subdue.target)).toBe('dying')
    expect(hasCondition(subdue.target, 'unconscious')).toBe(true)
    expect(subdue.narrationHint).toMatch(/knocked unconscious/)

    // And a prisoner can be patched up rather than left to bleed out.
    const stable = heal(subdue.target, 3)
    expect(lifeStatus(stable.creature)).toBe('alive')
  })

  it('takes a fighter down, through death saves, and back up again', () => {
    let brann = fighter()

    // An ogre's club: 28 damage exactly empties him. Zero overkill, so he is
    // dying rather than dead.
    const felled = applyDamage(brann, { amount: 28, damageType: 'bludgeoning' })
    brann = felled.creature

    expect(felled.droppedToZero).toBe(true)
    expect(felled.instantDeath).toBe(false)
    expect(lifeStatus(brann)).toBe('dying')
    expect(hasCondition(brann, 'unconscious')).toBe(true)

    // Two failed saves: one short of dying.
    const first = deathSave(brann, scriptedRng([7]))
    brann = first.creature
    expect(first.outcome).toBe('failure')

    const second = deathSave(brann, scriptedRng([3]))
    brann = second.creature
    expect(second.outcome).toBe('failure')
    expect(brann.death.failures).toBe(2)

    // A natural 20 on a death save is not merely a success — he is back up.
    const lucky = deathSave(brann, scriptedRng([20]))
    brann = lucky.creature

    expect(lucky.outcome).toBe('revived')
    expect(brann.hp.current).toBe(1)
    expect(hasCondition(brann, 'unconscious')).toBe(false)
    expect(brann.death).toMatchObject({ successes: 0, failures: 0 })

    // A cure wounds on top of that.
    const healed = heal(brann, 9)
    expect(healed.creature.hp.current).toBe(10)
    expect(healed.revived).toBe(false)
  })

  it('kills a downed fighter with one more hit at the wrong moment', () => {
    let brann = withHp(fighter(), { current: 0 })
    brann = addCondition(brann, 'unconscious')

    // Attacking a helpless target in melee is automatically critical, and a
    // critical against someone at 0 HP costs two death saves rather than one.
    const alpha = goblin('goblin-a', 'Goblin A')
    const coup = attack({
      attacker: alpha,
      target: brann,
      ...scimitar,
      // Unconscious grants advantage, so two d20 faces (12 + 4 clears AC 16),
      // then the doubled 2d6.
      rng: scriptedRng([4, 12, 3, 2]),
    })

    expect(coup.critical).toBe(true)
    expect(coup.reason).toBe('auto-crit-helpless')
    expect(coup.damage?.deathSaveFailures).toBe(2)
    expect(coup.target.death.failures).toBe(2)
    expect(lifeStatus(coup.target)).toBe('dying')

    // One more, and that is three failures.
    const final = attack({
      attacker: alpha,
      target: coup.target,
      ...scimitar,
      rng: scriptedRng([4, 12, 3, 2]),
    })
    expect(lifeStatus(final.target)).toBe('dead')
  })
})

describe('criticalNotation', () => {
  const cases: Array<[string, string]> = [
    ['1d8+3', '2d8+3'],
    ['d8', '2d8'],
    ['2d6+2', '4d6+2'],
    ['2d6+1d4', '4d6+2d4'],
    ['1d8-1', '2d8-1'],
    ['4d6kh3', '8d6kh3'],
    ['2d6r1', '4d6r1'],
    ['5', '5'],
  ]

  for (const [input, expected] of cases) {
    it(`${input} → ${expected}`, () => {
      expect(criticalNotation(input)).toBe(expected)
    })
  }
})
