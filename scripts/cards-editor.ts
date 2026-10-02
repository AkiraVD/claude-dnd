/**
 * The class-card cropper: drag a ring onto the subject, watch the card follow.
 *
 * Same loop as the faces editor and for the same reason. These were generated
 * as square cells and the subject is often high and off to one side, so shown
 * whole the card is half dead space and the face is small. Reading the offsets
 * off a grid by eye was tried and was wrong often enough not to trust.
 *
 * The preview is the real card: the same box, the same aspect, the same CSS
 * transform the app applies. What you aim is what ships.
 *
 * Edits live in localStorage until applied, so a half-finished pass leaves the
 * repo alone. `npm run cards`, then open /cards.html.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SETUP_TABS } from '../packages/web/src/setup.js'
import crops from '../packages/web/public/classes/crops.json' with { type: 'json' }

const tab = SETUP_TABS.find((t) => t.key === 'class')
if (tab?.imageFor === undefined) throw new Error('no class tab with art')

const stored = crops as Record<string, unknown>
const rows = tab.options.map(([label, description]) => {
  const name = label.toLowerCase().replace(/\s+/g, '-')
  const v = Array.isArray(stored[name]) ? (stored[name] as number[]) : [50, 50, 1]
  return { name, label, description, src: tab.imageFor!(label), x: v[0] ?? 50, y: v[1] ?? 50, z: v[2] ?? 1 }
})

const STORE = 'dice-tower-cards'
const ASPECT = tab.artAspect ?? '4 / 5'

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dice Tower — aim the cards</title>
<style>
  :root { --bg:#0e1013; --panel:#15181d; --line:#272c33; --text:#d7d3cc; --dim:#8b9099;
    --faint:#5b646f; --accent:#d9a441; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
  header { position:sticky; top:0; z-index:5; background:var(--bg); border-bottom:1px solid var(--line);
    padding:12px 18px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  h1 { margin:0; font-size:14px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); }
  .hint { color:var(--faint); }
  button { font:inherit; padding:6px 11px; border:1px solid var(--line); border-radius:6px;
    background:var(--panel); color:var(--text); cursor:pointer; }
  button:hover { border-color:var(--accent); color:var(--accent); }
  #count { margin-left:auto; color:var(--dim); }
  textarea#out { display:none; width:calc(100% - 28px); height:200px; margin:0 14px 10px; padding:10px;
    font:12px/1.5 ui-monospace,monospace; border:1px solid var(--accent); border-radius:6px;
    background:#0d0f12; color:#c9d1d9; resize:vertical; }
  main { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px; padding:16px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  .card.changed { border-color:var(--accent); }
  .work { display:flex; gap:10px; padding:10px; }
  /* Left: the whole picture, where you aim. Right: the card as it will ship. */
  .stage { position:relative; flex:1; cursor:crosshair; touch-action:none; border:1px solid var(--line); }
  .stage img { display:block; width:100%; }
  .ring { position:absolute; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%;
    border:2px solid var(--accent); box-shadow:0 0 0 1px #000a; pointer-events:none; }
  .shot { width:118px; flex:none; aspect-ratio:${ASPECT}; overflow:hidden; position:relative;
    border:1px solid var(--line); border-radius:4px; }
  .shot img { display:block; width:100%; height:100%; object-fit:cover; }
  .zoomrow { display:flex; gap:9px; align-items:center; padding:0 10px 8px; }
  .zoom { flex:1; }
  .zval { width:38px; color:var(--dim); text-align:right; }
  .meta { padding:0 10px 10px; display:flex; flex-direction:column; gap:1px; }
  .meta b { color:var(--text); }
  .meta span { color:var(--dim); }
  .xy { color:var(--faint) !important; }
  .xy em { color:var(--accent); font-style:normal; }
</style></head>
<body>
<header>
  <h1>Aim the cards</h1>
  <span class="hint">click or drag on the left to aim &middot; slider to zoom &middot; the right is the card</span>
  <span id="count">0 changed</span>
  <button id="reset">reset all</button>
  <button id="copy">copy json</button>
</header>
<textarea id="out" spellcheck="false" readonly></textarea>
<main id="grid"></main>
<script>
var STORE = ${JSON.stringify(STORE)};
var ROWS = ${JSON.stringify(rows)};

function saved() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') } catch (e) { return {} }
}
function store(all) { localStorage.setItem(STORE, JSON.stringify(all)) }

// The same maths as cardTransform in art.ts, clamp included: scaling by z leaves
// (z - 1) of overflow, half each side, and the translate is scaled with it.
function transform(x, y, z) {
  if (z === 1 && x === 50 && y === 50) return '';
  var limit = ((z - 1) / (2 * z)) * 100;
  var dx = Math.max(-limit, Math.min(limit, 50 - x));
  var dy = Math.max(-limit, Math.min(limit, 50 - y));
  return 'scale(' + z + ') translate(' + dx + '%, ' + dy + '%)';
}

var grid = document.getElementById('grid');
var cards = {};

ROWS.forEach(function (row) {
  var over = saved()[row.name];
  var x = over ? over[0] : row.x;
  var y = over ? over[1] : row.y;
  var z = over && over.length > 2 ? over[2] : row.z;

  var card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
    '<div class="work">' +
      '<div class="stage"><img src="' + row.src + '" alt=""><i class="ring"></i></div>' +
      '<div class="shot"><img src="' + row.src + '" alt=""></div>' +
    '</div>' +
    '<div class="zoomrow"><input type="range" class="zoom" min="1" max="3" step="0.05" value="' + z + '">' +
      '<span class="zval"></span></div>' +
    '<div class="meta"><b>' + row.label + '</b><span>' + row.description + '</span>' +
      '<span class="xy"></span></div>';
  grid.appendChild(card);

  var stage = card.querySelector('.stage');
  var ring = card.querySelector('.ring');
  var shot = card.querySelector('.shot img');
  var zoom = card.querySelector('.zoom');
  var zval = card.querySelector('.zval');
  var xy = card.querySelector('.xy');

  function paint() {
    ring.style.left = x + '%';
    ring.style.top = y + '%';
    shot.style.transform = transform(x, y, z);
    zoom.value = z;
    zval.textContent = z.toFixed(2) + '\\u00d7';
    var moved = x !== row.x || y !== row.y || z !== row.z;
    card.classList.toggle('changed', moved);
    xy.innerHTML = x + ', ' + y + ' @' + z.toFixed(2) + '\\u00d7' +
      (moved ? ' <em>was ' + row.x + ', ' + row.y + ' @' + Number(row.z).toFixed(2) + '\\u00d7</em>' : '');
  }

  function remember() {
    var all = saved();
    if (x === row.x && y === row.y && z === row.z) { delete all[row.name] }
    else { all[row.name] = [x, y, Math.round(z * 100) / 100] }
    store(all); paint(); tally();
  }

  function put(event) {
    var box = stage.getBoundingClientRect();
    x = Math.round(Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)));
    y = Math.round(Math.max(0, Math.min(100, ((event.clientY - box.top) / box.height) * 100)));
    remember();
  }

  zoom.addEventListener('input', function () { z = Number(zoom.value); remember() });
  stage.addEventListener('pointerdown', function (e) { stage.setPointerCapture(e.pointerId); put(e) });
  stage.addEventListener('pointermove', function (e) { if (e.buttons === 1) put(e) });

  cards[row.name] = { reset: function () { x = row.x; y = row.y; z = row.z; paint() } };
  paint();
});

function tally() {
  document.getElementById('count').textContent = Object.keys(saved()).length + ' changed';
}
tally();

document.getElementById('reset').onclick = function () {
  if (!confirm('Throw away every change on this page?')) return;
  localStorage.removeItem(STORE);
  Object.keys(cards).forEach(function (n) { cards[n].reset() });
  tally();
};

document.getElementById('copy').onclick = function () {
  // Every card, not only the changed ones: the file is the whole set, and a
  // partial paste would leave the rest at whatever they happened to be.
  var all = saved();
  var out = {};
  ROWS.forEach(function (row) {
    var v = all[row.name];
    out[row.name] = v ? v : [row.x, row.y, row.z];
  });
  var text = JSON.stringify(out, null, 1);
  var btn = document.getElementById('copy');
  var box = document.getElementById('out');
  box.value = text; box.style.display = 'block'; box.focus(); box.select();
  var copied = false;
  try { copied = document.execCommand('copy') } catch (e) { copied = false }
  // navigator.clipboard exists only in a secure context, so over plain http on
  // a LAN address it is undefined; execCommand has no such requirement.
  if (!copied && navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function () {
      btn.textContent = 'copied';
      setTimeout(function () { btn.textContent = 'copy json' }, 1400);
    }, function () {});
    return;
  }
  btn.textContent = copied ? 'copied' : 'select it and copy';
  setTimeout(function () { btn.textContent = 'copy json' }, 1800);
};
</script>
</body></html>
`

/** public/ only reaches dist/ on a build; write both so order cannot bite. */
const roots = ['packages/web/public', 'packages/web/dist']
for (const root of roots) {
  try {
    writeFileSync(join(root, 'cards.html'), html)
  } catch {
    // dist may not exist yet; public is the one that matters.
  }
}
console.error(`cards editor: ${rows.length} cards -> ${join(roots[0]!, 'cards.html')}`)
