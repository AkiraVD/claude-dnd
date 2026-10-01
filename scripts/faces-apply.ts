/**
 * Writes the editor's adjustments into the faces.json files beside the pictures.
 *
 * Takes the overrides as JSON on stdin — `{"goblin":[57,17], ...}` — which is
 * what the editor keeps in localStorage and what its "copy json" button yields.
 * Only the names present are touched; everything else keeps the value it had.
 *
 * echo '{"goblin":[57,17]}' | npm run faces:apply
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BESTIARY, PORTRAITS } from '@dnd/content'

const PUBLIC = join(import.meta.dirname, '../packages/web/public')

const input = readFileSync(0, 'utf8').trim()
if (input === '') {
  console.error('nothing on stdin')
  process.exit(1)
}

const overrides = JSON.parse(input) as Record<string, [number, number]>

const unknown = Object.keys(overrides).filter((n) => !(n in PORTRAITS) && !(n in BESTIARY))
if (unknown.length > 0) {
  console.error(`not a portrait: ${unknown.join(', ')}`)
  process.exit(1)
}

const bad = Object.entries(overrides).filter(
  ([, xy]) =>
    !Array.isArray(xy) ||
    xy.length !== 2 ||
    xy.some((n) => typeof n !== 'number' || n < 0 || n > 100),
)
if (bad.length > 0) {
  console.error(`out of range: ${bad.map(([n]) => n).join(', ')}`)
  process.exit(1)
}

for (const [dir, catalogue] of [
  ['npcs', PORTRAITS],
  ['monsters', BESTIARY],
] as const) {
  const path = join(PUBLIC, dir, 'faces.json')
  const faces = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  const mine = Object.entries(overrides).filter(([name]) => name in catalogue)
  if (mine.length === 0) continue
  for (const [name, xy] of mine) faces[name] = xy
  const sorted: Record<string, unknown> = { _: faces['_'] }
  for (const key of Object.keys(faces).sort()) if (key !== '_') sorted[key] = faces[key]
  writeFileSync(path, `${JSON.stringify(sorted, null, 1)}\n`)
  console.error(`${dir}: ${mine.length} updated`)
}
