import type { Rng } from './rng.js'

export interface ScriptedRng extends Rng {
  /** How many scripted values are still unused. */
  remaining(): number
}

/**
 * An `Rng` that returns the faces you hand it, in order. Tests assert on exact
 * outcomes instead of fishing for a seed that happens to produce them, and a
 * scripted value outside the requested range fails loudly rather than silently
 * testing the wrong thing.
 */
export function scriptedRng(faces: readonly number[]): ScriptedRng {
  let i = 0
  return {
    int(min, max) {
      if (i >= faces.length) {
        throw new Error(
          `scriptedRng exhausted: ${faces.length} value(s) supplied, another int(${min}, ${max}) requested`,
        )
      }
      const value = faces[i++]!
      if (value < min || value > max) {
        throw new Error(
          `scriptedRng value ${value} at index ${i - 1} is outside the requested range [${min}, ${max}]`,
        )
      }
      return value
    },
    next() {
      throw new Error('scriptedRng supports int() only')
    },
    remaining() {
      return faces.length - i
    },
  }
}

/** An `Rng` pinned to one face, for testing loops and caps. */
export function constantRng(face: number): Rng {
  return {
    int(min, max) {
      if (face < min || face > max) {
        throw new Error(`constantRng(${face}) is outside the requested range [${min}, ${max}]`)
      }
      return face
    },
    next() {
      throw new Error('constantRng supports int() only')
    },
  }
}
