/**
 * Builds the asset gallery: every picture the game can actually reach, on one page.
 *
 * Generated rather than hand-written, and generated from the same catalogues the
 * game reads, so it cannot quietly disagree with what is shipped. A portrait is
 * shown twice — whole, and cropped the way the cast list crops it — because the
 * second is the only way to see whether its recorded face is right.
 *
 * `npm run gallery`, then open /gallery.html on the table's own port.
 */
import { writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { BESTIARY, BESTIARY_LIST, PORTRAITS, PORTRAIT_LIST } from '@dnd/content'
import { faceOf, faceTransform, portraitFor } from '../packages/web/src/art.js'
import { SETUP_TABS } from '../packages/web/src/setup.js'

const PUBLIC = join(import.meta.dirname, '../packages/web/public')

const escape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A missing file is the thing this page exists to catch, so it is loud. */
function card(src: string, title: string, note: string, extra = ''): string {
  const here = existsSync(join(PUBLIC, src.replace(/^\//, '')))
  return `<figure class="card${here ? '' : ' missing'}">
    ${extra || `<img src="${src}" alt="" loading="lazy">`}
    <figcaption><b>${escape(title)}</b><span>${escape(note)}</span>
    <code>${escape(src)}</code>${here ? '' : '<em class="warn">file missing</em>'}</figcaption>
  </figure>`
}

const menu = SETUP_TABS.filter((tab) => tab.imageFor !== undefined)
  .map((tab) => {
    const cards = tab.options
      .map(([label, description]) =>
        card(tab.imageFor!(label), label, description),
      )
      .join('\n')
    return `<section><h2>${escape(tab.label)}<small>${tab.options.length} cards · ${escape(tab.artAspect ?? '')}</small></h2>
      <div class="grid wide">${cards}</div></section>`
  })
  .join('\n')

/** Whole image beside the circle the cast list actually shows. */
function portraitCard(name: string, looks: string): string {
  const src = portraitFor(name)!
  const face = faceOf(name)
  const pair = `<div class="pair">
      <img src="${src}" alt="" loading="lazy">
      <span class="dot"><img src="${src}" alt="" loading="lazy"
        style="transform:${faceTransform(name)}"></span>
      <i class="pin" style="left:${face.x}%;top:${face.y}%"></i>
    </div>`
  return card(src, name, looks, pair)
}

const folk = `<section><h2>Folk<small>${PORTRAIT_LIST.length} portraits · /npcs</small></h2>
  <div class="grid">${PORTRAIT_LIST.map((n) => portraitCard(n, PORTRAITS[n])).join('\n')}</div></section>`

const beasts = `<section><h2>Bestiary<small>${BESTIARY_LIST.length} creatures · /monsters</small></h2>
  <div class="grid">${BESTIARY_LIST.map((n) => portraitCard(n, BESTIARY[n])).join('\n')}</div></section>`

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dice Tower — art in use</title>
<style>
  :root { --bg:#0e1013; --panel:#15181d; --line:#272c33; --text:#d7d3cc; --dim:#8b9099; --faint:#5b646f; --accent:#d9a441; --bad:#d4736a; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font:14px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
  header { position:sticky; top:0; z-index:2; background:var(--bg); border-bottom:1px solid var(--line);
    padding:14px 20px; display:flex; gap:16px; align-items:baseline; flex-wrap:wrap; }
  h1 { margin:0; font-size:15px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); }
  header nav a { color:var(--dim); text-decoration:none; margin-right:12px; }
  header nav a:hover { color:var(--text); }
  main { padding:20px; max-width:1500px; margin:0 auto; }
  h2 { font-size:12px; letter-spacing:.09em; text-transform:uppercase; color:var(--accent);
    margin:30px 0 12px; display:flex; gap:10px; align-items:baseline; }
  h2 small { color:var(--faint); text-transform:none; letter-spacing:0; font-size:11px; }
  .grid { display:grid; gap:10px; grid-template-columns:repeat(auto-fill,minmax(168px,1fr)); }
  .grid.wide { grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); }
  .card { margin:0; background:var(--panel); border:1px solid var(--line); border-radius:7px; overflow:hidden; }
  .card.missing { border-color:var(--bad); }
  .card > img { width:100%; display:block; }
  figcaption { padding:7px 9px 9px; display:flex; flex-direction:column; gap:2px; }
  figcaption b { font-weight:600; font-size:12.5px; }
  figcaption span { color:var(--dim); font-size:11px; }
  figcaption code { color:var(--faint); font-size:10px; }
  .warn { color:var(--bad); font-style:normal; font-size:11px; }
  /* The whole picture, the circle the game shows, and a pin on the recorded face. */
  .pair { position:relative; display:flex; align-items:flex-start; gap:8px; padding:8px 8px 0; }
  .pair > img { width:100%; display:block; border-radius:4px; }
  .dot { position:absolute; right:12px; bottom:4px; width:56px; height:56px; flex:none;
    border-radius:50%; overflow:hidden; border:2px solid var(--panel); box-shadow:0 0 0 1px var(--line); }
  .dot img { width:100%; height:100%; object-fit:cover; display:block; }
  .pin { position:absolute; width:9px; height:9px; margin:-4px 0 0 -4px; border-radius:50%;
    border:1.5px solid var(--accent); pointer-events:none; }
</style></head>
<body>
<header>
  <h1>Art in use</h1>
  <nav><a href="#menu">Menu cards</a><a href="#folk">Folk</a><a href="#bestiary">Bestiary</a></nav>
  <span style="color:var(--faint)">circle = what the cast list shows · ring = recorded face</span>
</header>
<main>
  <a id="menu"></a>${menu}
  <a id="folk"></a>${folk}
  <a id="bestiary"></a>${beasts}
</main>
</body></html>
`

const out = join(PUBLIC, 'gallery.html')
writeFileSync(out, html)
const cards = SETUP_TABS.filter((t) => t.imageFor !== undefined).reduce((n, t) => n + t.options.length, 0)
console.error(
  `gallery: ${cards} menu cards, ${PORTRAIT_LIST.length} folk, ${BESTIARY_LIST.length} creatures -> ${out}`,
)
