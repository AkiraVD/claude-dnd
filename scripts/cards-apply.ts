/**
 * Write the card cropper's JSON into crops.json.
 *
 * Pipe it in: `npm run cards:apply < adjusted.json`, or paste and Ctrl-D.
 * Only names the class deck knows are accepted, so a stray key is reported
 * rather than silently written into a file nothing reads.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { SETUP_TABS } from '../packages/web/src/setup.js'

const PATH = 'packages/web/public/classes/crops.json'

const tab = SETUP_TABS.find((t) => t.key === 'class')
if (tab === undefined) throw new Error('no class tab')
const known = new Set(tab.options.map(([label]) => label.toLowerCase().replace(/\s+/g, '-')))

const incoming = JSON.parse(readFileSync(0, 'utf8')) as Record<string, unknown>
const current = JSON.parse(readFileSync(PATH, 'utf8')) as Record<string, unknown>

let written = 0
const skipped: string[] = []
for (const [name, value] of Object.entries(incoming)) {
  if (name === '_') continue
  if (!known.has(name)) {
    skipped.push(name)
    continue
  }
  if (!Array.isArray(value) || value.length < 2 || value.some((n) => typeof n !== 'number')) {
    skipped.push(name)
    continue
  }
  const [x, y, zoom] = value as number[]
  current[name] = [x, y, zoom ?? 1]
  written += 1
}

writeFileSync(PATH, `${JSON.stringify(current, null, 1)}\n`)
console.error(`classes: ${written} updated`)
if (skipped.length > 0) console.error(`ignored: ${skipped.join(', ')}`)
