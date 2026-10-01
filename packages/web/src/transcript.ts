/**
 * The log, across a refresh.
 *
 * The campaign is in SQLite and survives anything, but the conversation on
 * screen is React state and does not — so F5 left you looking at an empty table
 * with a DM who remembered everything, and no way to read back what had just
 * happened. The DM's own process outlives the browser, so nothing needs
 * restarting; the page just has to remember what it had already been told.
 *
 * Keyed by the Claude session rather than the campaign, which is the difference
 * between the two cases that look alike: a refresh keeps the same conversation
 * and should restore, while `clear` and `resume` start a new one and must not —
 * showing a transcript the DM no longer remembers is worse than showing none.
 *
 * Pure, and takes the stored string rather than reaching for `sessionStorage`
 * itself, so the rules can be tested without a browser.
 */
import type { LogEntry } from './useTable.js'

export const TRANSCRIPT_KEY = 'dice-tower:transcript'

/**
 * How many entries are kept. An evening runs to a few hundred; past that the
 * oldest go, because sessionStorage is a few megabytes and losing the top of a
 * long scrollback is better than losing the write and with it the whole log.
 */
export const TRANSCRIPT_LIMIT = 400

export function packTranscript(session: string, log: readonly LogEntry[]): string {
  const kept = log.slice(-TRANSCRIPT_LIMIT).map((entry) =>
    // A refresh mid-sentence would otherwise restore a caret that never stops
    // blinking, waiting on deltas for a turn that finished without it.
    entry.kind === 'narration' && entry.streaming ? { ...entry, streaming: false } : entry,
  )
  return JSON.stringify({ session, log: kept })
}

export function readTranscript(session: string, raw: string | null): LogEntry[] {
  if (raw === null || raw === '') return []
  try {
    const saved = JSON.parse(raw) as { session?: unknown; log?: unknown }
    if (saved.session !== session) return []
    if (!Array.isArray(saved.log)) return []
    return saved.log as LogEntry[]
  } catch {
    // Written by an older build, or truncated by a quota error mid-write.
    return []
  }
}
