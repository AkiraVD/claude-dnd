/**
 * Cut class cards out of the master sheet.
 *
 * Takes the cut editor's JSON on stdin — `{ "paladin": [x, y, size], ... }` in
 * source pixels — and writes a 300x300 webp per class straight from the master,
 * so nothing is resampled twice.
 *
 * The master is not in the repo; the shipped art is. Pass it with SHEET=, e.g.
 *   SHEET=~/art/classes.png npm run cards:cut < cuts.json
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { SETUP_TABS } from '../packages/web/src/setup.js'

const sheet = process.env['SHEET']
if (sheet === undefined || !existsSync(sheet)) {
  throw new Error(`set SHEET to the master sheet; got ${sheet ?? '(unset)'}`)
}

const tab = SETUP_TABS.find((t) => t.key === 'class')
if (tab === undefined) throw new Error('no class tab')
const known = new Set(tab.options.map(([label]) => label.toLowerCase().replace(/\s+/g, '-')))

const cuts = JSON.parse(readFileSync(0, 'utf8')) as Record<string, number[]>

let cut = 0
const skipped: string[] = []
for (const [name, box] of Object.entries(cuts)) {
  if (name === '_') continue
  if (!known.has(name) || !Array.isArray(box) || box.length < 3) {
    skipped.push(name)
    continue
  }
  const [x, y, size] = box.map((n) => Math.round(n))
  execFileSync(
    'ffmpeg',
    ['-nostdin', '-y', '-loglevel', 'error', '-i', sheet,
     '-vf', `crop=${size}:${size}:${x}:${y},scale=300:300:flags=lanczos`,
     '-c:v', 'libwebp', '-quality', '82',
     `packages/web/public/classes/${name}.webp`],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  )
  cut += 1
}

console.error(`classes: ${cut} cut from ${sheet}`)
if (skipped.length > 0) console.error(`ignored: ${skipped.join(', ')}`)
