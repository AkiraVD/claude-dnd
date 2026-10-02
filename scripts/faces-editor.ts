/**
 * The focal-point editor: drag a ring onto each face, watch the crop follow.
 *
 * Reading face positions off a grid by eye got nine of 116 wrong, and every one
 * only showed up once the crop was rendered. This closes that loop — the crop is
 * right there, updating as the ring moves, so a bad placement is obvious while
 * you are making it rather than two steps later.
 *
 * Edits live in localStorage, not on disk: the page cannot write to the repo, and
 * a half-finished pass should not leave the catalogue in a strange state. When
 * the pass is done the values are read out of the browser and written to the
 * faces.json files beside the pictures.
 *
 * `npm run faces`, then open /faces.html.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { BESTIARY, BESTIARY_LIST, PORTRAITS, PORTRAIT_LIST } from '@dnd/content'
import { faceOf, portraitFor } from '../packages/web/src/art.js'

/**
 * Batches, so a pass over the newest fifty does not mean scrolling past 191.
 *
 * Each is a file of names, one per line — the same roster handed to the cutter,
 * so the grouping is whatever was actually drawn together rather than a guess
 * made afterwards. Named by the file, minus its extension.
 *
 *   BATCHES=~/art/names4.txt,~/art/names5.txt npm run faces
 */
const batches = (process.env['BATCHES'] ?? '')
  .split(',')
  .map((path) => path.trim())
  .filter((path) => path !== '')
  .map((path) => ({
    id: basename(path).replace(/\.[^.]+$/, ''),
    names: readFileSync(path, 'utf8').split('\n').map((n) => n.trim()).filter((n) => n !== '' && n !== '-'),
  }))

const batchOf = new Map<string, string>()
for (const batch of batches) for (const name of batch.names) batchOf.set(name, batch.id)

const rows = [
  ...PORTRAIT_LIST.map((name) => ({ name, looks: PORTRAITS[name], src: portraitFor(name)!, kind: 'folk' })),
  ...BESTIARY_LIST.map((name) => ({ name, looks: BESTIARY[name], src: portraitFor(name)!, kind: 'monster' })),
].map((row) => ({ ...row, face: faceOf(row.name), batch: batchOf.get(row.name) ?? '' }))

const STORE = 'dice-tower-faces'

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dice Tower — aim the faces</title>
<style>
  :root { --bg:#0e1013; --panel:#15181d; --line:#272c33; --text:#d7d3cc; --dim:#8b9099;
    --faint:#5b646f; --accent:#d9a441; --good:#6cc08a; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
  header { position:sticky; top:0; z-index:5; background:var(--bg); border-bottom:1px solid var(--line);
    padding:12px 18px; display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
  h1 { margin:0; font-size:14px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); }
  .hint { color:var(--faint); }
  button { font:inherit; padding:6px 11px; border:1px solid var(--line); border-radius:6px;
    background:var(--panel); color:var(--text); cursor:pointer; }
  button:hover { border-color:var(--accent); color:var(--accent); }
  button.on { border-color:var(--accent); color:var(--accent); }
  /* The way out when the clipboard is not available: the text, selected, ready
     for a plain ctrl-C. Hidden until asked for. */
  textarea#out { display:none; width:calc(100% - 28px); height:180px; margin:0 14px 10px;
    padding:10px; font:12px/1.5 var(--mono,monospace); border:1px solid var(--accent);
    border-radius:6px; background:#0d0f12; color:#c9d1d9; resize:vertical; }
  #count { color:var(--good); }
  main { padding:18px; display:grid; gap:12px;
    grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); max-width:1600px; margin:0 auto; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  .card.changed { border-color:var(--good); }
  .stage { position:relative; cursor:crosshair; touch-action:none; user-select:none; }
  /* An <img> is draggable by default, so a press on it starts an HTML5 image
     drag and the pointer events stop arriving — which reads as the ring simply
     refusing to be held. Three guards because browsers differ on which one
     they honour. */
  img { -webkit-user-drag:none; user-drag:none; user-select:none; }
  .stage img { width:100%; display:block; }
  .ring { position:absolute; width:26px; height:26px; margin:-13px 0 0 -13px; border-radius:50%;
    border:2px solid var(--accent); box-shadow:0 0 0 1px #000a, inset 0 0 0 1px #000a; pointer-events:none; }
  .ring::after { content:''; position:absolute; inset:11px; background:var(--accent); border-radius:50%; }
  .peek { position:absolute; right:8px; bottom:8px; display:flex; gap:6px; align-items:flex-end; }
  .circle { border-radius:50%; overflow:hidden; border:2px solid var(--panel);
    box-shadow:0 0 0 1px var(--line); flex:none; background:#000; }
  .circle img { width:100%; height:100%; object-fit:cover; display:block; }
  .big { width:64px; height:64px; }
  .small { width:34px; height:34px; }
  .meta { padding:7px 9px 9px; display:flex; flex-direction:column; gap:2px; }
  .meta b { font-size:12px; }
  .meta span { color:var(--dim); font-size:10.5px; }
  .meta .xy { color:var(--accent); font-size:11px; }
  .meta .xy em { color:var(--faint); font-style:normal; }
  .zoomrow { display:flex; align-items:center; gap:8px; padding:7px 9px 0; }
  .zoomrow input { flex:1; accent-color:var(--accent); }
  .zval { color:var(--accent); font-size:11px; min-width:30px; text-align:right; }
</style></head>
<body>
<header>
  <h1>Aim the faces</h1>
  <span class="hint">click or drag to aim · slider to zoom — the circles follow</span>
  <button id="f-all" class="on">all</button>
  <button id="f-folk">folk</button>
  <button id="f-mon">monsters</button>
  <button id="f-chg">changed</button>
  ${batches.map((b) => `<button class="f-batch" data-batch="${b.id}">${b.id}</button>`).join('')}
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

// Same maths as faceTransform in art.ts, clamp included: scaling by z leaves
// (z - 1) of overflow, half each side, and the translate is scaled too.
function transform(x, y, zoom) {
  var limit = ((zoom - 1) / (2 * zoom)) * 100;
  var dx = Math.max(-limit, Math.min(limit, 50 - x));
  var dy = Math.max(-limit, Math.min(limit, 50 - y));
  return 'scale(' + zoom + ') translate(' + dx + '%, ' + dy + '%)';
}

// Belt and braces with the draggable attribute: some builds still raise
// dragstart from a child, and one of those cancels the pointer stream mid-drag.
addEventListener('dragstart', function (e) { e.preventDefault() });

var grid = document.getElementById('grid');
var cards = {};

ROWS.forEach(function (row) {
  var over = saved()[row.name];
  var x = over ? over[0] : row.face.x;
  var y = over ? over[1] : row.face.y;
  var z = over && over.length > 2 ? over[2] : row.face.zoom;

  var card = document.createElement('div');
  card.className = 'card';
  card.dataset.kind = row.kind;
  card.dataset.batch = row.batch;
  card.dataset.name = row.name;
  card.innerHTML =
    '<div class="stage"><img src="' + row.src + '" alt="" draggable="false" loading="lazy">' +
      '<i class="ring"></i>' +
      '<div class="peek">' +
        '<span class="circle small"><img src="' + row.src + '" alt="" draggable="false"></span>' +
        '<span class="circle big"><img src="' + row.src + '" alt="" draggable="false"></span>' +
      '</div>' +
    '</div>' +
    '<div class="zoomrow"><input type="range" class="zoom" min="1" max="5" step="0.1" value="' + z + '">' +
      '<span class="zval"></span></div>' +
    '<div class="meta"><b>' + row.name + '</b><span>' + row.looks + '</span>' +
      '<span class="xy"></span></div>';
  grid.appendChild(card);

  var stage = card.querySelector('.stage');
  var ring = card.querySelector('.ring');
  var bigImg = card.querySelector('.big img');
  var smallImg = card.querySelector('.small img');
  var xy = card.querySelector('.xy');
  var zoom = card.querySelector('.zoom');
  var zval = card.querySelector('.zval');

  function paint() {
    ring.style.left = x + '%';
    ring.style.top = y + '%';
    bigImg.style.transform = transform(x, y, z);
    smallImg.style.transform = transform(x, y, z);
    zoom.value = z;
    zval.textContent = z.toFixed(1) + '\u00d7';
    var orig = row.face;
    var moved = x !== orig.x || y !== orig.y || z !== orig.zoom;
    card.classList.toggle('changed', moved);
    xy.innerHTML = x + ', ' + y + ' @' + z.toFixed(1) + '\u00d7' +
      (moved ? ' <em>was ' + orig.x + ', ' + orig.y + ' @' + orig.zoom.toFixed(1) + '\u00d7</em>' : '');
  }

  function put(event) {
    var box = stage.getBoundingClientRect();
    x = Math.round(Math.max(0, Math.min(100, ((event.clientX - box.left) / box.width) * 100)));
    y = Math.round(Math.max(0, Math.min(100, ((event.clientY - box.top) / box.height) * 100)));
    remember();
  }

  function remember() {
    var all = saved();
    if (x === row.face.x && y === row.face.y && z === row.face.zoom) { delete all[row.name] }
    else { all[row.name] = [x, y, Math.round(z * 10) / 10] }
    store(all);
    paint();
    tally();
  }

  zoom.addEventListener('input', function () { z = Number(zoom.value); remember() });

  stage.addEventListener('pointerdown', function (event) {
    stage.setPointerCapture(event.pointerId);
    put(event);
  });
  stage.addEventListener('pointermove', function (event) {
    if (event.buttons === 1) put(event);
  });

  cards[row.name] = { card: card, reset: function () { x = row.face.x; y = row.face.y; z = row.face.zoom; paint() } };
  paint();
});

function tally() {
  var n = Object.keys(saved()).length;
  document.getElementById('count').textContent = n + ' changed';
}
tally();

function filter(kind, batch) {
  var all = saved();
  var shown = 0;
  Object.keys(cards).forEach(function (name) {
    var card = cards[name].card;
    var show =
      batch ? card.dataset.batch === batch
      : kind === 'all' ? true
      : kind === 'changed' ? all[name] !== undefined
      : card.dataset.kind === kind;
    card.style.display = show ? '' : 'none';
    if (show) shown += 1;
  });
  [].slice.call(document.querySelectorAll('header button')).forEach(function (b) {
    b.classList.remove('on');
  });
  var active = batch
    ? document.querySelector('.f-batch[data-batch="' + batch + '"]')
    : document.getElementById(
        kind === 'all' ? 'f-all' : kind === 'folk' ? 'f-folk' : kind === 'monster' ? 'f-mon' : 'f-chg',
      );
  if (active) active.classList.add('on');
  document.getElementById('count').textContent =
    Object.keys(saved()).length + ' changed \u00b7 ' + shown + ' shown';
}
document.getElementById('f-all').onclick = function () { filter('all') };
document.getElementById('f-folk').onclick = function () { filter('folk') };
document.getElementById('f-mon').onclick = function () { filter('monster') };
document.getElementById('f-chg').onclick = function () { filter('changed') };
[].slice.call(document.querySelectorAll('.f-batch')).forEach(function (b) {
  b.onclick = function () { filter(null, b.dataset.batch) };
});

document.getElementById('reset').onclick = function () {
  if (!confirm('Throw away every change on this page?')) return;
  localStorage.removeItem(STORE);
  Object.keys(cards).forEach(function (name) { cards[name].reset() });
  tally();
};
document.getElementById('copy').onclick = function () {
  var text = JSON.stringify(saved(), null, 1);
  var btn = document.getElementById('copy');
  var box = document.getElementById('out');

  // Show it either way. navigator.clipboard exists only in a secure context, so
  // over plain http on a LAN address it is undefined and this button used to do
  // nothing at all, silently — the edits were safe in localStorage, but there
  // was no way to get them out of the page.
  box.value = text;
  box.style.display = 'block';
  box.focus();
  box.select();

  var copied = false;
  try { copied = document.execCommand('copy') } catch (e) { copied = false }

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
function writeAlsoToDist(contents: string): void {
  const dist = join(import.meta.dirname, '../packages/web/dist')
  if (existsSync(dist)) writeFileSync(join(dist, 'faces.html'), contents)
}

const out = join(import.meta.dirname, '../packages/web/public/faces.html')
writeFileSync(out, html)
// public/ only reaches dist/ during a build, so a page generated after one
// would be served stale. Writing both ends removes the ordering trap.
writeAlsoToDist(html)
console.error(`faces editor: ${rows.length} portraits -> ${out}`)
