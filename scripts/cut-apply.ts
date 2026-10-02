/**
 * Cut pictures out of a master sheet.
 *
 * Takes the cut editor's JSON on stdin — `{ "paladin": [x, y, w, h], ... }` in
 * source pixels — and writes one webp each straight from the master, so nothing
 * is resampled twice. A three-number box is read as a square, which is what the
 * editor emitted before the cut could be oblong.
 *
 * The masters are not in the repo; the shipped art is. Point at one with SHEET
 * and say where the results go:
 *
 *   SHEET=~/art/classes.png npm run cut:apply < cuts.json
 *   SHEET=~/art/npc3.png OUT=packages/web/public/npcs SIZE=256 QUALITY=72 \
 *     npm run cut:apply < cuts.json
 *
 * Names are not checked against a catalogue: a sheet may hold things that are
 * not in one yet, and refusing them would mean cataloguing before cutting.
 * Anything that is not a plain name is still refused.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const sheet = process.env['SHEET']
if (sheet === undefined || !existsSync(sheet)) {
  throw new Error(`set SHEET to the master sheet; got ${sheet ?? '(unset)'}`)
}
const out = process.env['OUT'] ?? 'packages/web/public/classes'
const size = Number(process.env['SIZE'] ?? 300)
const quality = process.env['QUALITY'] ?? '82'
if (!existsSync(out)) throw new Error(`no such directory: ${out}`)

const cuts = JSON.parse(readFileSync(0, 'utf8')) as Record<string, number[]>

let cut = 0
const skipped: string[] = []
for (const [name, box] of Object.entries(cuts)) {
  if (name === '_') continue
  if (!/^[a-z0-9-]+$/.test(name) || !Array.isArray(box) || box.length < 3) {
    skipped.push(name)
    continue
  }
  // [x, y, w, h], or [x, y, side] from before the cut could be oblong.
  const [x, y, w, h] = [box[0]!, box[1]!, box[2]!, box[3] ?? box[2]!].map((n) => Math.round(n))
  // SIZE is the long side. A cut that is not square stays that shape rather
  // than being squeezed into one — squeezing is the one thing a crop should
  // never do, and the square boxes in the UI crop with object-fit anyway.
  const outW = w >= h ? size : Math.round((size * w) / h)
  const outH = h >= w ? size : Math.round((size * h) / w)
  execFileSync(
    'ffmpeg',
    ['-nostdin', '-y', '-loglevel', 'error', '-i', sheet,
     '-vf', `crop=${w}:${h}:${x}:${y},scale=${outW}:${outH}:flags=lanczos`,
     '-c:v', 'libwebp', '-quality', quality,
     `${out}/${name}.webp`],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  )
  cut += 1
}

console.error(`${out}: ${cut} cut from ${sheet} at ${size}px`)
if (skipped.length > 0) console.error(`ignored: ${skipped.join(', ')}`)
