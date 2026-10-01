/**
 * An id for one run of the engine.
 *
 * A campaign outlives any number of processes: the MCP server is a child of
 * `claude`, so it restarts on every `/clear`, every crash, and every time the
 * code changes underneath a running game. When something looks wrong in the
 * journal, the first question is always "which process wrote that, and did it
 * have the fix in it?" — and until now nothing recorded the answer.
 *
 * Every step is stamped with this, so `steps` can be read back per session.
 */

const ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789'

/** Short, lowercase, no vowel-digit lookalikes — meant to be read off a screen. */
function generate(): string {
  let id = ''
  for (let i = 0; i < 6; i += 1) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return id
}

/**
 * The current session id.
 *
 * `DND_SESSION` wins when set, so a test can pin it and a wrapper can hand down
 * an id that means something outside this process. Otherwise one is generated
 * per process, which is the unit that actually matters here.
 */
export const SESSION_ID: string = (() => {
  const given = process.env['DND_SESSION']?.trim()
  return given !== undefined && given !== '' ? given.slice(0, 32) : generate()
})()
