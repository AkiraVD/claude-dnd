import { describe, expect, it } from 'vitest'
import { blocks, speakerKey } from './markdown.js'

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

  it('lifts a marked line of dialogue out of the prose', () => {
    const text = [
      'She thumbs to the back page.',
      '',
      'Varn: "First one, Fennow. Second evening. I went down."',
      '',
      'She says it flat.',
    ].join('\n')

    expect(blocks(text)).toEqual([
      { kind: 'para', text: 'She thumbs to the back page.' },
      { kind: 'speech', speaker: 'Varn', text: '"First one, Fennow. Second evening. I went down."' },
      { kind: 'para', text: 'She says it flat.' },
    ])
  })

  it('takes a speech line without a blank line around it', () => {
    // The DM writes an exchange as consecutive lines; each is its own box.
    const text = 'Varn: "I went down."\nSool: "You did not."'

    expect(blocks(text)).toEqual([
      { kind: 'speech', speaker: 'Varn', text: '"I went down."' },
      { kind: 'speech', speaker: 'Sool', text: '"You did not."' },
    ])
  })

  it('reads a curly opening quote too', () => {
    expect(blocks('Varn: \u201cI went down.\u201d')).toEqual([
      { kind: 'speech', speaker: 'Varn', text: '\u201cI went down.\u201d' },
    ])
  })

  it('leaves prose with a colon alone', () => {
    // The quote is what makes the marker safe: without it, every label and
    // aside in the narration would put on somebody's face.
    const prose = [
      'There is one way down: the stair behind the winch.',
      '',
      'Note: she has not moved.',
    ].join('\n')

    expect(blocks(prose).every((block) => block.kind === 'para')).toBe(true)
  })

  it('does not mistake a quote inside narration for a speech line', () => {
    const prose = 'She says it flat. "Got within ten paces."'

    expect(blocks(prose)).toEqual([{ kind: 'para', text: prose }])
  })

  it('still reads a table after a speech line', () => {
    const text = ['Varn: "Here is the tally."', '| Item | Cost |', '|---|---|', '| rope | 1 gp |'].join('\n')
    const out = blocks(text)

    expect(out[0]!.kind).toBe('speech')
    expect(out[1]!.kind).toBe('table')
  })
})

describe('speakerKey', () => {
  const cast = ['Ilde Varn', 'Sool', 'Brann']

  it('matches the name as written', () => {
    expect(speakerKey('Sool', cast)).toBe('Sool')
    expect(speakerKey('sool', cast)).toBe('Sool')
  })

  it('matches the part of the name the DM actually says', () => {
    expect(speakerKey('Varn', cast)).toBe('Ilde Varn')
  })

  it('will not match a fragment of a longer word', () => {
    // A wrong face is a wrong character, so no portrait beats a near miss.
    expect(speakerKey('Sool', ['Soolhaven Guard'])).toBeNull()
  })

  it('says nothing when two people answer to it', () => {
    expect(speakerKey('Varn', ['Ilde Varn', 'Kest Varn'])).toBeNull()
  })

  it('has no opinion about someone not in the cast', () => {
    expect(speakerKey('A voice behind you', cast)).toBeNull()
    expect(speakerKey('', cast)).toBeNull()
  })
})
