import { DiceError } from './errors.js'
import type { Rng } from './rng.js'

/** Per-group limits, to keep a typo from allocating a million dice. */
const MAX_COUNT = 200
const MAX_SIDES = 1000

export type KeepMode = 'kh' | 'kl' | 'dh' | 'dl'

export interface DieRoll {
  sides: number
  value: number
  /** False for dice dropped by a keep/drop modifier. The UI greys these out. */
  kept: boolean
  /** The original face, when a reroll modifier replaced it. */
  rerolledFrom?: number
  /** True when an exploding die produced this one. */
  exploded?: boolean
}

export interface DiceTerm {
  kind: 'dice'
  sign: 1 | -1
  /** This term as written, e.g. `4d6kh3`. */
  notation: string
  count: number
  sides: number
  rolls: DieRoll[]
  /** Sum of the kept faces, before `sign` is applied. */
  subtotal: number
}

export interface ConstantTerm {
  kind: 'constant'
  sign: 1 | -1
  value: number
}

export type Term = DiceTerm | ConstantTerm

export interface DiceResult {
  notation: string
  terms: Term[]
  total: number
  /** RNG state before the roll, so a session can be replayed exactly. */
  stateBefore?: number
}

interface GroupSpec {
  count: number
  sides: number
  keep?: { mode: KeepMode; n: number }
  /** Reroll any face at or below this, once. */
  reroll?: number
  explode: boolean
}

interface TermSpec {
  sign: 1 | -1
  /** This term as written, for echoing back in results and errors. */
  text: string
  group?: GroupSpec
  constant?: number
}

const RE_WS = /\s*/y
const RE_DICE = /(\d*)d(\d+)/iy
const RE_MOD = /(kh|kl|dh|dl|ro|r)(\d+)|(!)/iy
const RE_INT = /\d+/y
const RE_SIGN = /[+-]/y

/**
 * Supported notation:
 *
 *   2d6+3        count, sides, flat modifiers, any number of terms
 *   d20          count defaults to 1
 *   4d6kh3       keep highest 3 (ability score generation)
 *   2d20kh1      advantage — this is what advantage *is*, not a flat +5
 *   2d20kl1      disadvantage
 *   4d6kl1       keep lowest; dh<n> / dl<n> drop highest / lowest
 *   2d6r1        reroll any 1, once (D&D rerolls are one-shot, never recursive)
 *   1d6!         exploding: a maximum face adds another die (homebrew)
 */
export function parseDice(notation: string): TermSpec[] {
  const s = notation.trim()
  if (s === '') throw new DiceError('empty dice notation')

  let i = 0
  const skipWs = () => {
    RE_WS.lastIndex = i
    RE_WS.exec(s)
    i = RE_WS.lastIndex
  }
  const at = (re: RegExp) => {
    re.lastIndex = i
    const m = re.exec(s)
    return m && m.index === i ? m : null
  }

  const terms: TermSpec[] = []
  let sign: 1 | -1 = 1

  for (;;) {
    skipWs()
    const start = i

    const dice = at(RE_DICE)
    if (dice) {
      i = RE_DICE.lastIndex
      const count = dice[1] === '' ? 1 : Number(dice[1])
      const sides = Number(dice[2])

      if (count < 1) throw new DiceError(`die count must be at least 1 in "${notation}"`)
      if (count > MAX_COUNT) {
        throw new DiceError(`die count ${count} exceeds the limit of ${MAX_COUNT} in "${notation}"`)
      }
      if (sides < 1) throw new DiceError(`a die needs at least 1 side in "${notation}"`)
      if (sides > MAX_SIDES) {
        throw new DiceError(`${sides} sides exceeds the limit of ${MAX_SIDES} in "${notation}"`)
      }

      const group: GroupSpec = { count, sides, explode: false }

      for (;;) {
        const mod = at(RE_MOD)
        if (!mod) break
        i = RE_MOD.lastIndex

        if (mod[3] === '!') {
          if (sides < 2) throw new DiceError(`d${sides} cannot explode — it would never stop`)
          group.explode = true
          continue
        }

        const kind = mod[1]!.toLowerCase()
        const n = Number(mod[2])

        if (kind === 'r' || kind === 'ro') {
          if (n < 1) throw new DiceError(`reroll threshold must be at least 1 in "${notation}"`)
          if (n >= sides) {
            throw new DiceError(
              `reroll threshold ${n} would reroll every face of a d${sides} in "${notation}"`,
            )
          }
          group.reroll = n
          continue
        }

        const mode = kind as KeepMode
        if (n < 1) throw new DiceError(`${mode} needs a count of at least 1 in "${notation}"`)
        if ((mode === 'kh' || mode === 'kl') && n > count) {
          throw new DiceError(`${mode}${n} cannot keep more than the ${count} dice rolled in "${notation}"`)
        }
        if ((mode === 'dh' || mode === 'dl') && n >= count) {
          throw new DiceError(`${mode}${n} would drop every one of the ${count} dice in "${notation}"`)
        }
        group.keep = { mode, n }
      }

      terms.push({ sign, text: s.slice(start, i), group })
    } else {
      const int = at(RE_INT)
      if (!int) {
        throw new DiceError(
          `expected a die group or a number at position ${i} in "${notation}"`,
        )
      }
      i = RE_INT.lastIndex

      // RE_DICE already failed here, so an integer followed by `d` is a
      // malformed die group rather than a constant. Say so, instead of
      // complaining about a missing operator two characters later.
      if (/^d/i.test(s.slice(i))) {
        throw new DiceError(
          `a die group needs a side count, as in "2d6", but found "${s.slice(start)}" in "${notation}"`,
        )
      }

      terms.push({ sign, text: s.slice(start, i), constant: Number(int[0]) })
    }

    skipWs()
    if (i >= s.length) break

    const op = at(RE_SIGN)
    if (!op) throw new DiceError(`expected + or - at position ${i} in "${notation}"`)
    sign = op[0] === '-' ? -1 : 1
    i = RE_SIGN.lastIndex

    skipWs()
    if (i >= s.length) throw new DiceError(`"${notation}" ends with a dangling ${op[0]}`)
  }

  return terms
}

function applyKeep(rolls: DieRoll[], keep: { mode: KeepMode; n: number }): void {
  // Ascending by face, ties broken by position so the result is stable.
  const ascending = rolls
    .map((_, index) => index)
    .sort((a, b) => rolls[a]!.value - rolls[b]!.value || a - b)

  const len = ascending.length
  let keptIndices: number[]
  switch (keep.mode) {
    case 'kh':
      keptIndices = ascending.slice(Math.max(0, len - keep.n))
      break
    case 'kl':
      keptIndices = ascending.slice(0, keep.n)
      break
    case 'dh':
      keptIndices = ascending.slice(0, Math.max(0, len - keep.n))
      break
    case 'dl':
      keptIndices = ascending.slice(Math.min(keep.n, len))
      break
  }

  const kept = new Set(keptIndices)
  for (const [index, roll] of rolls.entries()) {
    roll.kept = kept.has(index)
  }
}

function rollGroup(spec: TermSpec, rng: Rng): DiceTerm {
  const group = spec.group!
  const rolls: DieRoll[] = []

  for (let n = 0; n < group.count; n++) {
    rolls.push({ sides: group.sides, value: rng.int(1, group.sides), kept: true })
  }

  // Rerolls happen once per die, never recursively — a rerolled 1 that comes up
  // 1 again stands. That is the D&D rule (Great Weapon Fighting, Halfling Lucky).
  if (group.reroll !== undefined) {
    for (const roll of rolls) {
      if (roll.value <= group.reroll) {
        roll.rerolledFrom = roll.value
        roll.value = rng.int(1, group.sides)
      }
    }
  }

  // Explosions do recurse, so they are capped.
  if (group.explode) {
    for (let cursor = 0; cursor < rolls.length; cursor++) {
      if (rolls[cursor]!.value !== group.sides) continue
      if (rolls.length >= MAX_COUNT) {
        throw new DiceError(`"${spec.text}" exploded past the limit of ${MAX_COUNT} dice`)
      }
      rolls.push({
        sides: group.sides,
        value: rng.int(1, group.sides),
        kept: true,
        exploded: true,
      })
    }
  }

  if (group.keep) applyKeep(rolls, group.keep)

  const subtotal = rolls.reduce((sum, roll) => sum + (roll.kept ? roll.value : 0), 0)

  return {
    kind: 'dice',
    sign: spec.sign,
    notation: spec.text,
    count: group.count,
    sides: group.sides,
    rolls,
    subtotal,
  }
}

export function rollDice(notation: string, rng: Rng): DiceResult {
  const specs = parseDice(notation)
  const stateBefore = rng.state?.()

  const terms: Term[] = []
  let total = 0

  for (const spec of specs) {
    if (spec.group) {
      const term = rollGroup(spec, rng)
      terms.push(term)
      total += term.sign * term.subtotal
    } else {
      terms.push({ kind: 'constant', sign: spec.sign, value: spec.constant! })
      total += spec.sign * spec.constant!
    }
  }

  return {
    notation,
    terms,
    total,
    ...(stateBefore === undefined ? {} : { stateBefore }),
  }
}

/** The first kept face of the first dice term — "what did you roll on the d20". */
export function naturalFace(result: DiceResult): number {
  for (const term of result.terms) {
    if (term.kind !== 'dice') continue
    const kept = term.rolls.find((roll) => roll.kept)
    if (kept) return kept.value
  }
  throw new DiceError(`"${result.notation}" contains no dice`)
}

/**
 * Human-readable breakdown, e.g. `4d6kh3+2: [6, 5, 3, ~1~] +2 = 16`.
 * Dropped dice are shown in `~tildes~`, rerolls as `1→5`.
 */
export function formatDiceResult(result: DiceResult): string {
  const parts = result.terms.map((term, index) => {
    const op = term.sign === -1 ? '-' : index === 0 ? '' : '+'
    if (term.kind === 'constant') return `${op}${term.value}`
    const faces = term.rolls
      .map((roll) => {
        const face = roll.rerolledFrom === undefined ? `${roll.value}` : `${roll.rerolledFrom}→${roll.value}`
        return roll.kept ? face : `~${face}~`
      })
      .join(', ')
    return `${op}[${faces}]`
  })
  return `${result.notation}: ${parts.join(' ')} = ${result.total}`
}

/**
 * The notation for a critical hit: every dice term's count doubles, every flat
 * modifier stays as written.
 *
 *   1d8+3   →  2d8+3      not 2d8+6
 *   2d6+1d4 →  4d6+2d4
 *
 * This is the rule people get wrong most often, so it lives in one named
 * function rather than being open-coded at the call site.
 */
export function criticalNotation(notation: string): string {
  const specs = parseDice(notation)
  return specs
    .map((spec, index) => {
      const op = spec.sign === -1 ? '-' : index === 0 ? '' : '+'
      if (spec.group) {
        const doubled = spec.text.replace(
          /^(\d*)(d)/i,
          (_full, count: string, d: string) => `${(count === '' ? 1 : Number(count)) * 2}${d}`,
        )
        return `${op}${doubled}`
      }
      return `${op}${spec.constant}`
    })
    .join('')
}
