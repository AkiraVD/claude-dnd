/** Malformed dice notation. */
export class DiceError extends Error {
  override readonly name = 'DiceError'
}

/**
 * An action the rules do not allow: healing a corpse, spending a spell slot that
 * is gone, advancing a turn in a combat that has not started.
 *
 * These reach the DM as a failed tool result, and Claude is expected to adapt
 * rather than narrate around them. That is the whole point of validating here.
 */
export class RulesError extends Error {
  override readonly name = 'RulesError'
}
