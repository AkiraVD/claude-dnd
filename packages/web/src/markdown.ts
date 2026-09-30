/**
 * Just enough Markdown block parsing for what the DM actually writes: prose
 * paragraphs and pipe tables. Kept free of React so it can be tested as a
 * plain function, the way the engine is.
 */

export type Align = 'left' | 'center' | 'right'

export type Block =
  | { kind: 'para'; text: string }
  | { kind: 'table'; head: string[]; align: Align[]; rows: string[][] }

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
