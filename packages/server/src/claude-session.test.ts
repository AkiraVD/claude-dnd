import { describe, expect, it } from 'vitest'
import { translate } from './claude-session.js'

/**
 * The stream-json shapes below were captured from the real CLI, not read off a
 * doc page. These tests pin them, so a format change fails here rather than
 * showing up as a silently empty game log.
 */
describe('translate', () => {
  it('reads the session identity off system/init', () => {
    expect(
      translate({
        type: 'system',
        subtype: 'init',
        session_id: 'de3692e0-1111',
        model: 'claude-opus-5',
        mcp_servers: [{ name: 'dnd', status: 'connected' }],
      }),
    ).toEqual([
      {
        type: 'ready',
        sessionId: 'de3692e0-1111',
        model: 'claude-opus-5',
        mcpServers: [{ name: 'dnd', status: 'connected' }],
      },
    ])
  })

  it('ignores other system subtypes', () => {
    expect(translate({ type: 'system', subtype: 'status' })).toEqual([])
  })

  it('turns text deltas into narration deltas', () => {
    expect(
      translate({ type: 'stream_event', event: { delta: { type: 'text_delta', text: 'The door' } } }),
    ).toEqual([{ type: 'narration-delta', text: 'The door' }])
  })

  it('reports thinking without leaking its content', () => {
    const events = translate({
      type: 'stream_event',
      event: { delta: { type: 'thinking_delta', thinking: 'secret' } },
    })
    expect(events).toEqual([{ type: 'thinking' }])
  })

  it('ignores deltas it does not understand', () => {
    expect(translate({ type: 'stream_event', event: { delta: { type: 'signature_delta' } } })).toEqual([])
  })

  it('strips the mcp prefix off tool names', () => {
    expect(
      translate({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 't1', name: 'mcp__dnd__attack_roll', input: { attacker: 'brann' } }],
        },
      }),
    ).toEqual([{ type: 'tool-call', id: 't1', name: 'attack_roll', input: { attacker: 'brann' } }])
  })

  it('passes complete narration blocks through and drops empty ones', () => {
    expect(
      translate({
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'It swings wide.' }, { type: 'text', text: '  ' }] },
      }),
    ).toEqual([{ type: 'narration', text: 'It swings wide.' }])
  })

  it('handles a turn with both prose and a tool call', () => {
    const events = translate({
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'You swing.' },
          { type: 'tool_use', id: 't2', name: 'mcp__dnd__roll_dice', input: { notation: '1d20' } },
        ],
      },
    })
    expect(events.map((e) => e.type)).toEqual(['narration', 'tool-call'])
  })

  it('parses the JSON payload out of a tool result', () => {
    const events = translate({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't1',
            content: [{ type: 'text', text: '{"narration":"18 vs AC 15 — hit","hit":true}' }],
          },
        ],
      },
    })
    expect(events).toEqual([
      {
        type: 'tool-result',
        id: 't1',
        isError: false,
        text: '{"narration":"18 vs AC 15 — hit","hit":true}',
        data: { narration: '18 vs AC 15 — hit', hit: true },
      },
    ])
  })

  it('keeps a failed tool result as text', () => {
    const [event] = translate({
      type: 'user',
      message: {
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't9',
            is_error: true,
            content: 'no creature with id "bran"',
          },
        ],
      },
    })
    expect(event).toMatchObject({
      type: 'tool-result',
      isError: true,
      text: 'no creature with id "bran"',
      data: null,
    })
  })

  it('reports the cost at the end of a turn', () => {
    expect(
      translate({ type: 'result', subtype: 'success', total_cost_usd: 0.4799, num_turns: 4 }),
    ).toEqual([{ type: 'turn-end', costUsd: 0.4799, turns: 4, subtype: 'success' }])
  })

  it('survives a result with no cost reported', () => {
    expect(translate({ type: 'result', subtype: 'error_during_execution' })).toEqual([
      { type: 'turn-end', costUsd: null, turns: null, subtype: 'error_during_execution' },
    ])
  })

  it('surfaces rate limit warnings', () => {
    expect(translate({ type: 'rate_limit_event' })).toEqual([
      { type: 'notice', message: 'rate limit warning from the API' },
    ])
  })

  it('ignores message types it has never seen', () => {
    expect(translate({ type: 'something_new_in_2027' })).toEqual([])
  })
})
