import { describe, expect, it } from 'vitest'
import { blocks } from './markdown.js'

describe('blocks', () => {
  it('splits prose on blank lines', () => {
    expect(blocks('The door gives.\n\nBeyond it, stairs.')).toEqual([
      { kind: 'para', text: 'The door gives.' },
      { kind: 'para', text: 'Beyond it, stairs.' },
    ])
  })

  it('keeps a soft-wrapped paragraph as one block', () => {
    expect(blocks('The door gives.\nBeyond it, stairs.')).toEqual([
      { kind: 'para', text: 'The door gives.\nBeyond it, stairs.' },
    ])
  })

  it('reads a pipe table', () => {
    const table = ['| Item | Price |', '|---|---|', '| Rope, 50ft | 1 gp |', '| Torch | 1 cp |'].join(
      '\n',
    )

    expect(blocks(table)).toEqual([
      {
        kind: 'table',
        head: ['Item', 'Price'],
        align: ['left', 'left'],
        rows: [
          ['Rope, 50ft', '1 gp'],
          ['Torch', '1 cp'],
        ],
      },
    ])
  })

  it('lifts a table out from under the line that introduces it', () => {
    const text = ['The shelf holds:', '| Item | Price |', '|---|---|', '| Torch | 1 cp |'].join('\n')

    expect(blocks(text)).toEqual([
      { kind: 'para', text: 'The shelf holds:' },
      {
        kind: 'table',
        head: ['Item', 'Price'],
        align: ['left', 'left'],
        rows: [['Torch', '1 cp']],
      },
    ])
  })

  it('resumes prose after a table ends', () => {
    const text = ['| A |', '|---|', '| 1 |', '', 'And then the lights went out.'].join('\n')

    expect(blocks(text)).toEqual([
      { kind: 'table', head: ['A'], align: ['left'], rows: [['1']] },
      { kind: 'para', text: 'And then the lights went out.' },
    ])
  })

  it('takes alignment from the delimiter row', () => {
    const text = ['| L | C | R |', '|:---|:---:|---:|', '| 1 | 2 | 3 |'].join('\n')
    const [block] = blocks(text)

    expect(block).toMatchObject({ align: ['left', 'center', 'right'] })
  })

  it('accepts a table written without outer pipes', () => {
    const text = ['Item | Price', '--- | ---', 'Torch | 1 cp'].join('\n')

    expect(blocks(text)).toEqual([
      {
        kind: 'table',
        head: ['Item', 'Price'],
        align: ['left', 'left'],
        rows: [['Torch', '1 cp']],
      },
    ])
  })

  it('leaves pipes alone when no delimiter row follows', () => {
    const text = 'You can go left | right | straight on.'

    expect(blocks(text)).toEqual([{ kind: 'para', text }])
  })

  it('does not mistake a rule for a delimiter row', () => {
    const text = ['Hold the line', '-----', 'and push.'].join('\n')

    expect(blocks(text)).toEqual([{ kind: 'para', text }])
  })

  it('keeps an escaped pipe inside a cell', () => {
    const text = ['| Roll | Effect |', '|---|---|', '| 1 | a \\| b |'].join('\n')

    expect(blocks(text)).toMatchObject([{ rows: [['1', 'a | b']] }])
  })

  it('keeps ragged rows as written, for the renderer to pad', () => {
    const text = ['| A | B | C |', '|---|---|---|', '| 1 |', '| 1 | 2 | 3 | 4 |'].join('\n')

    expect(blocks(text)).toMatchObject([{ rows: [['1'], ['1', '2', '3', '4']] }])
  })

  it('renders a half-arrived table mid-stream without throwing', () => {
    expect(blocks(['| Item | Price |', '|---|'].join('\n'))).toMatchObject([
      { kind: 'table', head: ['Item', 'Price'], rows: [] },
    ])
  })

  it('returns nothing for empty text', () => {
    expect(blocks('')).toEqual([])
  })
})
