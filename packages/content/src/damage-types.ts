/** The 13 SRD damage types. */
export const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const

export type DamageType = (typeof DAMAGE_TYPES)[number]

/** Damage from weapons, which some creatures resist unless the weapon is magical. */
export const PHYSICAL_DAMAGE_TYPES = ['bludgeoning', 'piercing', 'slashing'] as const

export function isDamageType(value: string): value is DamageType {
  return (DAMAGE_TYPES as readonly string[]).includes(value)
}
