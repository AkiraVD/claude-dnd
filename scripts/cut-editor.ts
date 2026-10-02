/**
 * Cut a master sheet with scissors: move the lines, not the boxes.
 *
 * The first version gave every cell its own rectangle, which is more freedom
 * than a sheet actually has. A sheet is a grid — the cells share their edges —
 * so twenty-five boxes meant adjusting the same boundary twenty-five times and
 * getting it slightly different each time. There are only cols+1 vertical cuts
 * and rows+1 horizontal ones, and moving one moves everything that touches it.
 *
 * Every line also has a number box. Dragging is for finding the cut; typing is
 * for landing on it, and a seam is usually a specific pixel rather than roughly
 * there.
 *
 * The sheet is inlined as a data URI. The masters live outside the repo, and a
 * generated page that depends on a path in someone's home directory is a page
 * that works once.
 *
 *   SHEET=~/art/classes.png npm run cut
 *   SHEET=~/art/npc3.png GRID=5x5 NAMES=names3.txt PAGE=cut-npc3 npm run cut
 *
 * Then open the page, cut, copy, and `npm run cut:apply`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { SETUP_TABS } from '../packages/web/src/setup.js'

const sheetPath = process.env['SHEET']
if (sheetPath === undefined || !existsSync(sheetPath)) {
  throw new Error(`set SHEET to the master sheet; got ${sheetPath ?? '(unset)'}`)
}

const [COLS, ROWS] = (process.env['GRID'] ?? '4x3').split('x').map(Number) as [number, number]
if (!Number.isInteger(COLS) || !Number.isInteger(ROWS)) throw new Error('GRID must look like 5x5')

const page = process.env['PAGE'] ?? 'cut'
const title = process.env['TITLE'] ?? page

/**
 * The roster, in reading order — which is the whole reason a sheet is sliceable.
 * From a file of one name per line, or from the class deck when none is given.
 *
 * A line of `-` marks a cell that must not be cut: a sheet can hold a picture
 * that was superseded by a later regeneration, and cutting it again would put
 * the rejected version back. Those cells are drawn but never leave the page.
 */
const namesFile = process.env['NAMES']
const names: Array<{ name: string; label: string }> = namesFile
  ? readFileSync(namesFile, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((name) => (name === '-' ? { name: '', label: 'skip' } : { name, label: name }))
  : (() => {
      const tab = SETUP_TABS.find((t) => t.key === 'class')
      if (tab === undefined) throw new Error('no class tab')
      return tab.options.map(([label]) => ({
        name: label.toLowerCase().replace(/\s+/g, '-'),
        label,
      }))
    })()

if (names.length !== COLS * ROWS) {
  throw new Error(`${names.length} names for a ${COLS}x${ROWS} grid of ${COLS * ROWS}`)
}

/**
 * Where the sheet is actually divided.
 *
 * The even division is a guess, and on more than one of these masters it is a
 * wrong one — adventurer sheet 1 has rows of 253, 249, 251, 231 and 270. A seam
 * between two paintings is a step in brightness across the whole width, which
 * nothing inside a single painting produces, so it can be found rather than
 * assumed.
 *
 * Each division is searched only near where it ought to be: a quarter of a cell
 * either side of the even position. Without that the brightest step in the sheet
 * wins every time, and that is usually a shoulder.
 *
 * The cut goes one pixel past the step, which is what excludes the seam itself
 * rather than baking it into the top of the picture below.
 */
function seams(path: string, n: number, axis: 'x' | 'y'): number[] {
  const probe = execFileSync(
    'ffmpeg',
    ['-nostdin', '-v', 'error', '-i', path, '-vf', 'format=gray', '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 28 },
  )
  const size = execFileSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height',
     '-of', 'csv=p=0', path],
    { encoding: 'utf8' },
  ).trim()
  const [W, H] = size.split(',').map(Number) as [number, number]
  const total = axis === 'x' ? W : H
  const across = axis === 'x' ? H : W

  const mean = (i: number): number => {
    let sum = 0
    let count = 0
    for (let j = 0; j < across; j += 3) {
      sum += probe[axis === 'x' ? j * W + i : i * W + j] ?? 0
      count += 1
    }
    return sum / count
  }
  const line: number[] = []
  for (let i = 0; i < total; i += 1) line.push(mean(i))

  const cut = [0]
  const cell = total / n
  for (let k = 1; k < n; k += 1) {
    const centre = Math.round(k * cell)
    // Narrow on purpose. A real seam sits within a few pixels of the even
    // division — adventurer sheet 1, the most uneven of these, is out by 21 at
    // its worst — while a quarter-cell window is wide enough to reach the next
    // painting's shoulder and prefer it.
    const span = Math.max(6, Math.round(cell / 10))
    // Weighted toward where the division ought to be. Picking the strongest step
    // outright found a shoulder more than once — a painted edge inside a cell can
    // beat the seam — and most of these sheets are evenly divided anyway, so a
    // candidate has to be noticeably better to be believed further out.
    let best = centre
    let bestScore = -1
    for (let i = Math.max(1, centre - span); i < Math.min(total, centre + span); i += 1) {
      const step = Math.abs(line[i]! - line[i - 1]!)
      const score = step * (1 - (0.75 * Math.abs(i - centre)) / span)
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    cut.push(Math.min(total, best + 1))
  }
  cut.push(total)
  return cut
}

const seamX = seams(sheetPath, COLS, 'x')
const seamY = seams(sheetPath, ROWS, 'y')

const dataUri = `data:image/png;base64,${readFileSync(sheetPath).toString('base64')}`
const STORE = `dice-tower-cuts:${page}`

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dice Tower — cut ${title}</title>
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
  .bar { padding:9px 16px; border-bottom:1px solid var(--line); background:var(--panel);
    display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start; }
  .bar h2 { margin:0 8px 0 0; font-size:11px; letter-spacing:.07em; text-transform:uppercase;
    color:var(--dim); align-self:center; }
  .nums { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .nums input { width:62px; font:inherit; padding:4px 6px; border:1px solid var(--line);
    border-radius:5px; background:var(--bg); color:var(--text); text-align:right; }
  .nums input:focus { outline:none; border-color:var(--accent); }
  .nums input.edge { color:var(--faint); }
  textarea#out { display:none; width:calc(100% - 24px); height:190px; margin:10px 12px; padding:10px;
    font:12px/1.5 ui-monospace,monospace; border:1px solid var(--accent); border-radius:6px;
    background:#0d0f12; color:#c9d1d9; resize:vertical; }
  .wrap { display:flex; gap:14px; padding:12px; align-items:flex-start; }
  .sheetbox { position:relative; flex:1; min-width:0; user-select:none; }
  .sheetbox img { display:block; width:100%; }
  /* The cuts. Wide invisible grab area, thin visible line. */
  .ln { position:absolute; z-index:3; }
  .ln i { position:absolute; background:var(--accent); box-shadow:0 0 0 1px #000a; }
  .ln.v { top:0; bottom:0; width:13px; margin-left:-6px; cursor:ew-resize; touch-action:none; }
  .ln.v i { top:0; bottom:0; left:6px; width:1px; }
  .ln.h { left:0; right:0; height:13px; margin-top:-6px; cursor:ns-resize; touch-action:none; }
  .ln.h i { left:0; right:0; top:6px; height:1px; }
  .ln:hover i, .ln.live i { background:#6cc08a; box-shadow:0 0 0 1px #000, 0 0 7px #6cc08a; }
  .cell { position:absolute; z-index:1; border:0; pointer-events:none;
    font:11px/1.3 ui-monospace,monospace; color:#fff; text-shadow:0 1px 2px #000; padding:2px 3px; }
  .cell.skip { background:rgba(0,0,0,.55); }
  aside { width:300px; flex:none; position:sticky; top:96px; max-height:84vh; overflow:auto; }
  aside h2 { margin:0 0 7px; font-size:12px; letter-spacing:.07em; text-transform:uppercase; color:var(--dim); }
  .previews { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
  .pv { border:1px solid var(--line); border-radius:5px; overflow:hidden; background:var(--panel); }
  .pv .win { position:relative; width:100%; overflow:hidden; }
  .pv .win img { position:absolute; transform-origin:0 0; }
  .pv span { display:block; padding:3px 5px; color:var(--dim); font-size:11px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pv.skip { opacity:.3; }
</style></head>
<body>
<header>
  <h1>Cut ${title}</h1>
  <span class="hint">lines start on the detected seams &middot; drag one, or type the pixel &middot; every cell sharing it follows</span>
  <span id="count">unmoved</span>
  <button id="seams">find the seams</button>
  <button id="even">space evenly</button>
  <button id="reset">reset</button>
  <button id="copy">copy json</button>
</header>
<div class="bar">
  <h2>vertical cuts &mdash; x</h2><div class="nums" id="xnums"></div>
  <h2>horizontal cuts &mdash; y</h2><div class="nums" id="ynums"></div>
</div>
<textarea id="out" spellcheck="false" readonly></textarea>
<div class="wrap">
  <div class="sheetbox" id="sheetbox"><img id="sheet" src="${dataUri}" alt=""></div>
  <aside><h2>each file</h2><div class="previews" id="previews"></div></aside>
</div>
<script>
var STORE = ${JSON.stringify(STORE)};
var NAMES = ${JSON.stringify(names)};
var COLS = ${COLS}, ROWS = ${ROWS};
// Found by looking for the step in brightness across the sheet, not assumed.
var SEAM_X = ${JSON.stringify(seamX)}, SEAM_Y = ${JSON.stringify(seamY)};

var sheet = document.getElementById('sheet');
var box = document.getElementById('sheetbox');
var SW = 0, SH = 0;
var xs = [], ys = [];
var pvs = [];

function scale() { return sheet.clientWidth / SW }
function evenly(n, total) {
  var out = [];
  for (var i = 0; i <= n; i++) out.push(Math.round((i * total) / n));
  return out;
}
function save() { localStorage.setItem(STORE, JSON.stringify({ xs: xs, ys: ys })) }
// Fill in place, never reassign. Each line holds a reference to the array it
// edits, so swapping xs for a new one leaves every drag writing to an array
// nothing reads any more — the line simply stops moving, which is exactly how
// this presented.
function fill(target, values) {
  for (var i = 0; i < values.length; i++) target[i] = values[i];
  target.length = values.length;
}
function load() {
  try {
    var v = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (v && v.xs && v.xs.length === COLS + 1 && v.ys && v.ys.length === ROWS + 1) return v;
  } catch (e) {}
  return null;
}

function build() {
  SW = sheet.naturalWidth; SH = sheet.naturalHeight;
  var saved = load();
  fill(xs, saved ? saved.xs : SEAM_X);
  fill(ys, saved ? saved.ys : SEAM_Y);

  // Cells first, so the lines sit over them and stay grabbable.
  NAMES.forEach(function (row, i) {
    var el = document.createElement('div');
    el.className = 'cell' + (row.name === '' ? ' skip' : '');
    el.textContent = row.label;
    box.appendChild(el);

    var pv = document.createElement('div');
    pv.className = 'pv' + (row.name === '' ? ' skip' : '');
    pv.innerHTML = '<div class="win"><img src="' + sheet.src + '" alt=""></div><span>' + row.label + '</span>';
    document.getElementById('previews').appendChild(pv);
    pvs.push({ el: el, pv: pv, img: pv.querySelector('img'), win: pv.querySelector('.win') });
  });

  makeLines('v', xs, 'xnums');
  makeLines('h', ys, 'ynums');
  draw();
}

function makeLines(kind, arr, numsId) {
  var nums = document.getElementById(numsId);
  arr.forEach(function (_, i) {
    var ln = document.createElement('div');
    ln.className = 'ln ' + kind;
    ln.innerHTML = '<i></i>';
    box.appendChild(ln);

    var input = document.createElement('input');
    input.type = 'number';
    input.step = '1';
    // The outer edges are the sheet's own edges. Movable, because a sheet can
    // have a margin, but marked so they read as the frame rather than a cut.
    if (i === 0 || i === arr.length - 1) input.className = 'edge';
    nums.appendChild(input);

    function set(v) {
      var lo = i === 0 ? 0 : arr[i - 1] + 20;
      var hi = i === arr.length - 1 ? (kind === 'v' ? SW : SH) : arr[i + 1] - 20;
      arr[i] = Math.round(Math.max(lo, Math.min(hi, v)));
      save(); draw();
    }

    input.addEventListener('input', function () {
      if (input.value !== '') set(Number(input.value));
    });

    var dragging = false;
    ln.addEventListener('pointerdown', function (e) {
      // Flag first. setPointerCapture throws if the pointer is not live, and
      // doing it the other way round means one exception leaves the line
      // permanently unmovable with nothing on screen to say why.
      dragging = true;
      ln.classList.add('live');
      try { ln.setPointerCapture(e.pointerId) } catch (err) {}
    });
    ln.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var r = box.getBoundingClientRect();
      set(((kind === 'v' ? e.clientX - r.left : e.clientY - r.top)) / scale());
    });
    ln.addEventListener('pointerup', function () { dragging = false; ln.classList.remove('live') });

    (kind === 'v' ? vLines : hLines).push({ ln: ln, input: input });
  });
}
var vLines = [], hLines = [];

function draw() {
  var k = scale();
  vLines.forEach(function (o, i) { o.ln.style.left = xs[i] * k + 'px'; o.input.value = xs[i] });
  hLines.forEach(function (o, i) { o.ln.style.top = ys[i] * k + 'px'; o.input.value = ys[i] });

  NAMES.forEach(function (row, i) {
    var c = i % COLS, r = Math.floor(i / COLS);
    var x = xs[c], y = ys[r], w = xs[c + 1] - xs[c], h = ys[r + 1] - ys[r];
    var p = pvs[i];
    p.el.style.left = x * k + 'px';
    p.el.style.top = y * k + 'px';
    p.el.style.width = w * k + 'px';
    p.el.style.height = h * k + 'px';
    // The preview keeps the cut's own shape, so a tall crop previews tall
    // rather than being flattered by a square window.
    p.win.style.aspectRatio = w + ' / ' + h;
    var ww = p.win.clientWidth || 70;
    var z = ww / w;
    p.img.style.width = SW * z + 'px';
    p.img.style.left = -x * z + 'px';
    p.img.style.top = -y * z + 'px';
  });

  var atSeams = SEAM_X.join() === xs.join() && SEAM_Y.join() === ys.join();
  document.getElementById('count').textContent = atSeams ? 'at the seams' : 'adjusted';
}

document.getElementById('even').onclick = function () {
  fill(xs, evenly(COLS, SW)); fill(ys, evenly(ROWS, SH)); save(); draw();
};
document.getElementById('seams').onclick = function () {
  fill(xs, SEAM_X); fill(ys, SEAM_Y); save(); draw();
};
document.getElementById('reset').onclick = function () {
  if (!confirm('Throw away these cuts?')) return;
  localStorage.removeItem(STORE);
  fill(xs, SEAM_X); fill(ys, SEAM_Y); draw();
};

document.getElementById('copy').onclick = function () {
  var out = {};
  NAMES.forEach(function (row, i) {
    if (row.name === '') return;
    var c = i % COLS, r = Math.floor(i / COLS);
    out[row.name] = [xs[c], ys[r], xs[c + 1] - xs[c], ys[r + 1] - ys[r]];
  });
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

addEventListener('resize', draw);
if (sheet.complete) build(); else sheet.addEventListener('load', build);
</script>
</body></html>
`

for (const root of ['packages/web/public', 'packages/web/dist']) {
  try {
    writeFileSync(join(root, `${page}.html`), html)
  } catch {
    // dist may not exist yet; public is the one that matters.
  }
}
console.error(`cut editor: ${COLS}x${ROWS} from ${sheetPath} -> /${page}.html`)
