/**
 * Just enough Markdown block parsing for what the DM actually writes: prose
 * paragraphs and pipe tables. Kept free of React so it can be tested as a
 * plain function, the way the engine is.
 */

export type Align = 'left' | 'center' | 'right'

export type Block =
  | { kind: 'para'; text: string }
  | { kind: 'table'; head: string[]; align: Align[]; rows: string[][] }
  | { kind: 'speech'; speaker: string; text: string }

/**
 * A line of dialogue: a name, a colon, and speech that opens with a quote.
 *
 * The quote is what makes this safe to key off. "Varn:" alone would also match
 * a stat line or a list label, and the cost of a false positive is a paragraph
 * of narration wearing somebody's face. The name is capped at a few words
 * because a speaker is a name, not a sentence — and `[^:]` keeps it from
 * leaping over a second colon further along the line.
 */
const SPEECH = /^([^:\n]{1,40}):\s+(["\u201c].*)$/

/**
 * Splits prose on blank lines, and lifts out any run of lines that reads as a
 * pipe table: a header row followed by a `|---|:--:|` delimiter. A table need
 * not be fenced off by blank lines, because the DM usually introduces one on
 * the line immediately above it.
 */
export function blocks(text: string): Block[] {
  const lines = text.split('\n')
  const out: Block[] = []
  let para: string[] = []

  const flush = (): void => {
    if (para.length > 0) {
      out.push({ kind: 'para', text: para.join('\n') })
      para = []
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (line.trim() === '') {
      flush()
      continue
    }

    // Before the table check: a speech line has no pipes, so the two cannot
    // disagree, but reading it first keeps the intent obvious.
    const speech = SPEECH.exec(line.trim())
    if (speech !== null) {
      flush()
      out.push({ kind: 'speech', speaker: speech[1]!.trim(), text: speech[2]!.trim() })
      continue
    }

    const align = alignments(lines[i + 1])
    if (align !== null && line.includes('|')) {
      flush()
      const head = cells(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length) {
        const row = lines[i] ?? ''
        if (row.trim() === '' || !row.includes('|')) break
        rows.push(cells(row))
        i += 1
      }
      i -= 1
      out.push({ kind: 'table', head, align, rows })
      continue
    }

    para.push(line)
  }

  flush()
  return out
}

/** The alignments a delimiter row declares, or null if it is not one. */
function alignments(line: string | undefined): Align[] | null {
  if (line === undefined || !line.includes('|')) return null
  const parts = cells(line)
  if (parts.length === 0) return null

  const align: Align[] = []
  for (const part of parts) {
    if (!/^:?-+:?$/.test(part)) return null
    align.push(
      part.startsWith(':') && part.endsWith(':')
        ? 'center'
        : part.endsWith(':')
          ? 'right'
          : 'left',
    )
  }
  return align
}

function cells(row: string): string[] {
  return row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'))
}


/**
 * The cast member a speaker name refers to, for the avatar beside the box.
 *
 * The DM writes what it would say out loud — "Varn" for a creature recorded as
 * "Ilde Varn" — so an exact match is tried first and a whole-word match after.
 * Whole-word matters: "Sool" must not match "Soolhaven", and a stray match is
 * worse than no portrait, because a wrong face is a wrong character.
 */
export function speakerKey(speaker: string, names: readonly string[]): string | null {
  const said = speaker.trim().toLowerCase()
  if (said === '') return null

  const exact = names.find((name) => name.toLowerCase() === said)
  if (exact !== undefined) return exact

  const words = (name: string): string[] => name.toLowerCase().split(/[^\p{L}\p{N}]+/u)
  const matches = names.filter((name) => words(name).includes(said))
  // Two people called Varn: say neither rather than guess between them.
  return matches.length === 1 ? matches[0]! : null
}
