/**
 * Cut the class cards out of the master sheet, by hand, on the sheet itself.
 *
 * The earlier cropper aimed a transform at the shipped 300px files. This one
 * works a step upstream: the master is on screen, you drag a square over each
 * subject, and the cut is made from the master at full resolution — so moving a
 * boundary costs nothing in quality, and the card is a new file rather than an
 * old one squeezed.
 *
 * The sheet is inlined as a data URI. It lives outside the repo with the rest of
 * the masters, and a generated page that depends on a path in someone's home
 * directory is a page that works once.
 *
 * SHEET=/path/to/classes.png npm run cards:cut-editor, then open /cut.html.
 * Paste the JSON back and `npm run cards:cut` writes the files.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SETUP_TABS } from '../packages/web/src/setup.js'

const sheetPath = process.env['SHEET']
if (sheetPath === undefined || !existsSync(sheetPath)) {
  throw new Error(`set SHEET to the master sheet; got ${sheetPath ?? '(unset)'}`)
}

const tab = SETUP_TABS.find((t) => t.key === 'class')
if (tab === undefined) throw new Error('no class tab')

const COLS = 4
const ROWS = 3
const names = tab.options.map(([label, description]) => ({
  name: label.toLowerCase().replace(/\s+/g, '-'),
  label,
  description,
}))

const dataUri = `data:image/png;base64,${readFileSync(sheetPath).toString('base64')}`
const STORE = 'dice-tower-cuts'

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dice Tower — cut the cards</title>
<style>
  :root { --bg:#0e1013; --panel:#15181d; --line:#272c33; --text:#d7d3cc; --dim:#8b9099;
    --faint:#5b646f; --accent:#d9a441; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
  header { position:sticky; top:0; z-index:9; background:var(--bg); border-bottom:1px solid var(--line);
    padding:10px 16px; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  h1 { margin:0; font-size:14px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); }
  .hint { color:var(--faint); }
  button { font:inherit; padding:6px 11px; border:1px solid var(--line); border-radius:6px;
    background:var(--panel); color:var(--text); cursor:pointer; }
  button:hover { border-color:var(--accent); color:var(--accent); }
  #count { margin-left:auto; color:var(--dim); }
  .bar { display:flex; gap:14px; align-items:center; flex-wrap:wrap; padding:9px 16px;
    border-bottom:1px solid var(--line); background:var(--panel); }
  .bar strong { color:var(--accent); font-weight:normal; letter-spacing:.06em; text-transform:uppercase; }
  .row { display:flex; gap:8px; align-items:center; min-width:210px; flex:1; }
  .row label { width:40px; color:var(--faint); }
  .row input { flex:1; }
  .row output { width:52px; color:var(--dim); text-align:right; }
  textarea#out { display:none; width:calc(100% - 24px); height:190px; margin:10px 12px; padding:10px;
    font:12px/1.5 ui-monospace,monospace; border:1px solid var(--accent); border-radius:6px;
    background:#0d0f12; color:#c9d1d9; resize:vertical; }
  .wrap { display:flex; gap:14px; padding:12px; align-items:flex-start; }
  .sheetbox { position:relative; flex:1; min-width:0; user-select:none; }
  .sheetbox img { display:block; width:100%; }
  /* Border only. A spotlight shadow is the obvious thing to reach for and it is
     wrong here: twelve boxes means twelve full-page overlays stacked, and the
     sheet underneath goes black. */
  .cut { position:absolute; border:2px solid var(--accent); box-shadow:0 0 0 1px #000a;
    cursor:move; touch-action:none; background:rgba(217,164,65,.06); }
  .cut.on { border-color:#6cc08a; z-index:2; }
  .cut b { position:absolute; left:3px; top:2px; font:11px/1.3 ui-monospace,monospace;
    color:#fff; text-shadow:0 1px 2px #000; font-weight:normal; pointer-events:none; }
  .grip { position:absolute; right:-7px; bottom:-7px; width:14px; height:14px; background:var(--accent);
    border:1px solid #000; cursor:nwse-resize; touch-action:none; }
  aside { width:280px; flex:none; position:sticky; top:96px; }
  aside h2 { margin:0 0 7px; font-size:12px; letter-spacing:.07em; text-transform:uppercase; color:var(--dim); }
  .previews { display:grid; grid-template-columns:repeat(3,1fr); gap:7px; }
  .pv { border:1px solid var(--line); border-radius:5px; overflow:hidden; background:var(--panel); }
  .pv .win { position:relative; width:100%; aspect-ratio:1/1; overflow:hidden; }
  .pv .win img { position:absolute; transform-origin:0 0; }
  .pv span { display:block; padding:3px 5px; color:var(--dim); font-size:11px; }
  .pv.on { border-color:#6cc08a; }
</style></head>
<body>
<header>
  <h1>Cut the cards</h1>
  <span class="hint">drag a box to move it &middot; corner to resize &middot; the panel is what each card becomes</span>
  <span id="count">0 moved</span>
  <button id="reset">reset all</button>
  <button id="copy">copy json</button>
</header>
<div class="bar">
  <strong>all twelve</strong>
  <span class="row"><label for="gx">across</label><input id="gx" type="range" min="-120" max="120" step="1" value="0"><output id="gxv">0</output></span>
  <span class="row"><label for="gy">down</label><input id="gy" type="range" min="-120" max="120" step="1" value="0"><output id="gyv">0</output></span>
  <span class="row"><label for="gs">size</label><input id="gs" type="range" min="140" max="362" step="2" value="362"><output id="gsv">362</output></span>
</div>
<textarea id="out" spellcheck="false" readonly></textarea>
<div class="wrap">
  <div class="sheetbox" id="sheetbox"><img id="sheet" src="${dataUri}" alt=""></div>
  <aside><h2>each card</h2><div class="previews" id="previews"></div></aside>
</div>
<script>
var STORE = ${JSON.stringify(STORE)};
var NAMES = ${JSON.stringify(names)};
var COLS = ${COLS}, ROWS = ${ROWS};

var sheet = document.getElementById('sheet');
var box = document.getElementById('sheetbox');
var SW = 0, SH = 0, CW = 0, CH = 0;

function saved() {
  try { return JSON.parse(localStorage.getItem(STORE) || '{}') } catch (e) { return {} }
}
function store(all) { localStorage.setItem(STORE, JSON.stringify(all)) }
function scale() { return sheet.clientWidth / SW; }

var cells = {};

function build() {
  SW = sheet.naturalWidth; SH = sheet.naturalHeight;
  CW = SW / COLS; CH = SH / ROWS;
  var all = saved();

  NAMES.forEach(function (row, i) {
    var c = i % COLS, r = Math.floor(i / COLS);
    var base = [Math.round(c * CW), Math.round(r * CH), Math.round(Math.min(CW, CH))];
    var v = all[row.name] || base;

    var el = document.createElement('div');
    el.className = 'cut';
    el.innerHTML = '<b>' + row.label + '</b><i class="grip"></i>';
    box.appendChild(el);

    var pv = document.createElement('div');
    pv.className = 'pv';
    pv.innerHTML = '<div class="win"><img src="' + sheet.src + '" alt=""></div><span>' + row.label + '</span>';
    document.getElementById('previews').appendChild(pv);

    cells[row.name] = {
      base: base, x: v[0], y: v[1], s: v[2], el: el, pv: pv,
      img: pv.querySelector('img'),
      paint: paint, nudge: nudge, resize: resize, reset: function () {
        this.x = base[0]; this.y = base[1]; this.s = base[2]; paint(this);
      },
    };

    function paint(cell) { draw(cell); }
    function nudge(cell, dx, dy) { place(cell, cell.base[0] + dx, cell.base[1] + dy, cell.s); }
    function resize(cell, s) { place(cell, cell.x, cell.y, s); }

    wire(cells[row.name]);
    draw(cells[row.name]);
  });
  tally();
}

function clampCell(cell) {
  cell.s = Math.max(40, Math.min(Math.min(CW, CH) * 1.4, cell.s));
  cell.x = Math.max(0, Math.min(SW - cell.s, cell.x));
  cell.y = Math.max(0, Math.min(SH - cell.s, cell.y));
}

function place(cell, x, y, s) {
  cell.x = Math.round(x); cell.y = Math.round(y); cell.s = Math.round(s);
  clampCell(cell);
  remember(cell);
}

function draw(cell) {
  var k = scale();
  cell.el.style.left = cell.x * k + 'px';
  cell.el.style.top = cell.y * k + 'px';
  cell.el.style.width = cell.s * k + 'px';
  cell.el.style.height = cell.s * k + 'px';
  // The preview is the crop itself: the master, scaled so the chosen square
  // exactly fills a square window.
  var w = cell.pv.querySelector('.win').clientWidth || 84;
  var z = w / cell.s;
  cell.img.style.width = SW * z + 'px';
  cell.img.style.left = -cell.x * z + 'px';
  cell.img.style.top = -cell.y * z + 'px';
  var moved = cell.x !== cell.base[0] || cell.y !== cell.base[1] || cell.s !== cell.base[2];
  cell.el.classList.toggle('on', moved);
  cell.pv.classList.toggle('on', moved);
}

function remember(cell) {
  var all = saved();
  var moved = cell.x !== cell.base[0] || cell.y !== cell.base[1] || cell.s !== cell.base[2];
  var name = Object.keys(cells).find(function (n) { return cells[n] === cell });
  if (moved) { all[name] = [cell.x, cell.y, cell.s] } else { delete all[name] }
  store(all); draw(cell); tally();
}

function wire(cell) {
  var grip = cell.el.querySelector('.grip');
  var drag = null;

  cell.el.addEventListener('pointerdown', function (e) {
    if (e.target === grip) return;
    cell.el.setPointerCapture(e.pointerId);
    drag = { mode: 'move', px: e.clientX, py: e.clientY, x: cell.x, y: cell.y };
  });
  grip.addEventListener('pointerdown', function (e) {
    e.stopPropagation();
    grip.setPointerCapture(e.pointerId);
    drag = { mode: 'size', px: e.clientX, py: e.clientY, s: cell.s };
  });
  function move(e) {
    if (drag === null) return;
    var k = scale();
    if (drag.mode === 'move') {
      place(cell, drag.x + (e.clientX - drag.px) / k, drag.y + (e.clientY - drag.py) / k, cell.s);
    } else {
      place(cell, cell.x, cell.y, drag.s + (e.clientX - drag.px) / k);
    }
  }
  cell.el.addEventListener('pointermove', move);
  grip.addEventListener('pointermove', move);
  function up() { drag = null }
  cell.el.addEventListener('pointerup', up);
  grip.addEventListener('pointerup', up);
}

function tally() {
  document.getElementById('count').textContent = Object.keys(saved()).length + ' moved';
}

// The batch row works off each cell's own starting point, so one sheet framed
// the same way wrong for every cell is one slider, once.
function batch() {
  var dx = Number(document.getElementById('gx').value);
  var dy = Number(document.getElementById('gy').value);
  var s = Number(document.getElementById('gs').value);
  Object.keys(cells).forEach(function (n) {
    var cell = cells[n];
    place(cell, cell.base[0] + dx, cell.base[1] + dy, s);
  });
}
['gx', 'gy', 'gs'].forEach(function (id) {
  document.getElementById(id).addEventListener('input', function () {
    document.getElementById(id + 'v').textContent = document.getElementById(id).value;
    batch();
  });
});

document.getElementById('reset').onclick = function () {
  if (!confirm('Throw away every cut on this page?')) return;
  localStorage.removeItem(STORE);
  ['gx', 'gy'].forEach(function (id) { document.getElementById(id).value = 0; document.getElementById(id + 'v').textContent = '0' });
  document.getElementById('gs').value = Math.round(Math.min(CW, CH));
  document.getElementById('gsv').textContent = Math.round(Math.min(CW, CH));
  Object.keys(cells).forEach(function (n) { cells[n].reset() });
  tally();
};

document.getElementById('copy').onclick = function () {
  var out = {};
  Object.keys(cells).forEach(function (n) { out[n] = [cells[n].x, cells[n].y, cells[n].s] });
  var text = JSON.stringify(out, null, 1);
  var btn = this, area = document.getElementById('out');
  area.value = text; area.style.display = 'block'; area.focus(); area.select();
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

addEventListener('resize', function () {
  Object.keys(cells).forEach(function (n) { draw(cells[n]) });
});

if (sheet.complete) build(); else sheet.addEventListener('load', build);
</script>
</body></html>
`

for (const root of ['packages/web/public', 'packages/web/dist']) {
  try {
    writeFileSync(join(root, 'cut.html'), html)
  } catch {
    // dist may not exist yet; public is the one that matters.
  }
}
console.error(`cut editor: ${names.length} cells from ${sheetPath} -> /cut.html`)
