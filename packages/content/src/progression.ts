/** Total XP required to reach each level, index 0 being level 1. */
export const XP_THRESHOLDS = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000,
  165000, 195000, 225000, 265000, 305000, 355000,
] as const

export const MAX_LEVEL = 20

/** The highest level reachable with this much total XP. */
export function levelForXp(xp: number): number {
  if (!Number.isInteger(xp) || xp < 0) {
    throw new RangeError(`xp must be a non-negative integer, got ${xp}`)
  }
  let level = 1
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]!) level = i + 1
  }
  return level
}

/** XP still needed for the next level, or null at level 20. */
export function xpToNextLevel(xp: number): number | null {
  const level = levelForXp(xp)
  if (level >= MAX_LEVEL) return null
  return XP_THRESHOLDS[level]! - xp
}
