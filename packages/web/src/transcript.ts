/**
 * The log, across a refresh — and across closing the browser.
 *
 * The campaign is in SQLite and survives anything, but the conversation on
 * screen is React state and does not — so F5 left you looking at an empty table
 * with a DM who remembered everything, and no way to read back what had just
 * happened. The DM's own process outlives the browser, so nothing needs
 * restarting; the page just has to remember what it had already been told.
 *
 * In `localStorage` rather than `sessionStorage`, which is the difference
 * between surviving a refresh and surviving the evening. A tab closed and
 * reopened, or a second tab, is the same situation as a refresh from the
 * server's point of view: the same DM, still running, still remembering. There
 * is no reason for the page to be the only one that has forgotten.
 *
 * What makes that safe is the key: the Claude session, not the campaign. It is
 * the difference between two cases that look alike from here — a refresh keeps
 * the conversation and should restore, while `clear`, `resume` and a restarted
 * server all begin a new one and must not. A transcript the DM has no memory of
 * is worse than no transcript, so a stored log whose session does not match is
 * never shown, and is thrown away rather than left on disk for good.
 *
 * Pure, and takes the stored string rather than reaching for storage itself, so
 * the rules can be tested without a browser.
 */
import type { LogEntry } from './useTable.js'

export const TRANSCRIPT_KEY = 'dice-tower:transcript'

/**
 * How many entries are kept. An evening runs to a few hundred; past that the
 * oldest go, because the store is a few megabytes and losing the top of a long
 * scrollback is better than losing the write and with it the whole log.
 */
export const TRANSCRIPT_LIMIT = 400

/**
 * Whether what is stored belongs to this conversation.
 *
 * Distinguishes "nothing stored" from "stored, but another conversation's",
 * which `readTranscript` cannot: both give an empty log, and only the second is
 * worth clearing off the disk.
 */
export function isStale(session: string, raw: string | null): boolean {
  if (raw === null || raw === '') return false
  return readTranscript(session, raw).length === 0
}

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
