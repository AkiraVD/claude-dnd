/**
 * Write the gender editor's JSON into PORTRAIT_GENDER.
 *
 * `npm run gender:apply < answers.json`, or paste and Ctrl-D. Only names already
 * in the catalogue are accepted; anything else is reported rather than written,
 * since a typo here would silently give somebody the wrong pronouns.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { PORTRAITS } from '@dnd/content'

const PATH = 'packages/content/src/portraits.ts'
const answers = JSON.parse(readFileSync(0, 'utf8')) as Record<string, unknown>

let source = readFileSync(PATH, 'utf8')
let written = 0
const skipped: string[] = []

for (const [name, value] of Object.entries(answers)) {
  if (!(name in PORTRAITS)) {
    skipped.push(`${name} (not in the catalogue)`)
    continue
  }
  if (value !== 'male' && value !== 'female' && value !== null) {
    skipped.push(`${name} (${JSON.stringify(value)})`)
    continue
  }
  const literal = value === null ? 'null' : `'${value}'`
  // Only inside PORTRAIT_GENDER: the same key appears in PORTRAITS above with a
  // description after it, and a blind replace would rewrite that instead.
  const line = new RegExp(`(PORTRAIT_GENDER[\\s\\S]*?\\n  '${name}': )(?:'male'|'female'|null)(,)`)
  if (!line.test(source)) {
    skipped.push(`${name} (no line to replace)`)
    continue
  }
  source = source.replace(line, `$1${literal}$2`)
  written += 1
}

writeFileSync(PATH, source)
console.error(`portraits: ${written} gendered`)
if (skipped.length > 0) console.error(`ignored: ${skipped.join(', ')}`)
