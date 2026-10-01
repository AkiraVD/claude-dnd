import { describe, expect, it } from 'vitest'
import { TRANSCRIPT_LIMIT, packTranscript, readTranscript } from './transcript.js'
import type { LogEntry } from './useTable.js'

const narration = (id: string, text: string, streaming = false): LogEntry => ({
  kind: 'narration',
  id,
  text,
  streaming,
})

describe('the transcript', () => {
  it('comes back for the same conversation', () => {
    const log = [narration('a', 'The door gives.'), { kind: 'player', id: 'b', text: 'I go in' } as LogEntry]

    expect(readTranscript('sess-1', packTranscript('sess-1', log))).toEqual(log)
  })

  it('stays buried when the conversation is a different one', () => {
    // `clear` and `resume` both start a new session. Restoring here would show
    // the player prose the DM has no memory of.
    const packed = packTranscript('sess-1', [narration('a', 'The door gives.')])

    expect(readTranscript('sess-2', packed)).toEqual([])
  })

  it('seals a turn that was still streaming when the page went', () => {
    const packed = packTranscript('sess-1', [narration('a', 'The door gi', true)])

    expect(readTranscript('sess-1', packed)).toEqual([narration('a', 'The door gi', false)])
  })

  it('keeps the newest entries when the log outgrows the limit', () => {
    const log = Array.from({ length: TRANSCRIPT_LIMIT + 50 }, (_, i) => narration(`e${i}`, `line ${i}`))

    const back = readTranscript('sess-1', packTranscript('sess-1', log))

    expect(back).toHaveLength(TRANSCRIPT_LIMIT)
    expect(back.at(-1)).toEqual(log.at(-1))
    expect(back[0]).toEqual(log[50])
  })

  it('has nothing to say about nothing, or about rubbish', () => {
    expect(readTranscript('sess-1', null)).toEqual([])
    expect(readTranscript('sess-1', '')).toEqual([])
    expect(readTranscript('sess-1', 'not json')).toEqual([])
    expect(readTranscript('sess-1', '{"session":"sess-1"}')).toEqual([])
  })
})
