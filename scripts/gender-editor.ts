/**
 * Say which portraits are of a man and which of a woman, by looking at them.
 *
 * The catalogue's gender was derived from the descriptions, which works where
 * the description opens "Man," or "Woman," and not at all where it opens "Brass
 * scales". Nine of the eleven dragonborn came out unspecified for exactly that
 * reason — and unspecified is a real answer, but it should be the answer because
 * the picture does not say, not because the sentence did not happen to.
 *
 * So: the pictures, big, with three buttons. The point is to look.
 *
 * PREFIX=dragonborn- npm run gender, then open /gender.html.
 * Paste the JSON back and `npm run gender:apply` writes it into the catalogue.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BESTIARY, PORTRAITS, genderOfPortrait } from '@dnd/content'
import { portraitFor } from '../packages/web/src/art.js'

const prefix = process.env['PREFIX'] ?? 'dragonborn-'
const rows = Object.entries(PORTRAITS)
  .filter(([name]) => !(name in BESTIARY) && name.startsWith(prefix))
  .map(([name, looks]) => ({ name, looks, src: portraitFor(name)!, now: genderOfPortrait(name) }))

if (rows.length === 0) throw new Error(`no portraits start with ${prefix}`)

const STORE = `dice-tower-gender:${prefix}`

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dice Tower — man or woman</title>
<style>
  :root { --bg:#0e1013; --panel:#15181d; --line:#272c33; --text:#d7d3cc; --dim:#8b9099;
    --faint:#5b646f; --accent:#d9a441; --male:#6ea8d8; --female:#d88ab0; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace; }
  img { -webkit-user-drag:none; user-drag:none; user-select:none; }
  header { position:sticky; top:0; z-index:5; background:var(--bg); border-bottom:1px solid var(--line);
    padding:12px 18px; display:flex; gap:14px; align-items:center; flex-wrap:wrap; }
  h1 { margin:0; font-size:14px; letter-spacing:.08em; text-transform:uppercase; color:var(--accent); }
  .hint { color:var(--faint); }
  button { font:inherit; padding:6px 11px; border:1px solid var(--line); border-radius:6px;
    background:var(--panel); color:var(--text); cursor:pointer; }
  button:hover { border-color:var(--accent); color:var(--accent); }
  #count { margin-left:auto; color:var(--dim); }
  textarea#out { display:none; width:calc(100% - 28px); height:180px; margin:0 14px 10px; padding:10px;
    font:12px/1.5 ui-monospace,monospace; border:1px solid var(--accent); border-radius:6px;
    background:#0d0f12; color:#c9d1d9; resize:vertical; }
  main { display:grid; grid-template-columns:repeat(auto-fill,minmax(230px,1fr)); gap:16px; padding:16px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow:hidden; }
  /* The square is reserved before the picture arrives, or a card that has not
     loaded collapses to its buttons and the grid jumps about under the cursor. */
  .card img { display:block; width:100%; aspect-ratio:1/1; object-fit:cover; background:#0d0f12; }
  .pick { display:flex; gap:6px; padding:9px; }
  .pick button { flex:1; padding:7px 4px; }
  .pick button.on[data-g="male"] { border-color:var(--male); color:var(--male); }
  .pick button.on[data-g="female"] { border-color:var(--female); color:var(--female); }
  .pick button.on[data-g="null"] { border-color:var(--accent); color:var(--accent); }
  .meta { padding:0 10px 11px; display:flex; flex-direction:column; gap:1px; }
  .meta b { color:var(--text); font-weight:normal; }
  .meta span { color:var(--dim); }
  .meta .was { color:var(--faint); }
</style></head>
<body>
<header>
  <h1>Man or woman</h1>
  <span class="hint">${rows.length} portraits starting ${prefix} &middot; unspecified is a real answer</span>
  <span id="count">0 set</span>
  <button id="reset">reset</button>
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

var grid = document.getElementById('grid');
ROWS.forEach(function (row) {
  var all = saved();
  var value = row.name in all ? all[row.name] : row.now;

  var card = document.createElement('div');
  card.className = 'card';
  card.innerHTML =
    // Eleven pictures. Lazy loading buys nothing and costs a reflow per card.
    '<img src="' + row.src + '" alt="" draggable="false">' +
    '<div class="pick">' +
      '<button data-g="male">man</button>' +
      '<button data-g="female">woman</button>' +
      '<button data-g="null">neither</button>' +
    '</div>' +
    '<div class="meta"><b>' + row.name + '</b><span>' + row.looks + '</span>' +
      '<span class="was"></span></div>';
  grid.appendChild(card);

  var buttons = [].slice.call(card.querySelectorAll('.pick button'));
  var was = card.querySelector('.was');

  function paint() {
    buttons.forEach(function (b) {
      var g = b.dataset.g === 'null' ? null : b.dataset.g;
      b.classList.toggle('on', g === value);
    });
    var now = row.now === null ? 'neither' : row.now === 'male' ? 'man' : 'woman';
    was.textContent = value === row.now ? 'unchanged \\u2014 ' + now : 'was ' + now;
  }

  buttons.forEach(function (b) {
    b.onclick = function () {
      value = b.dataset.g === 'null' ? null : b.dataset.g;
      var all = saved();
      // Only the changes are kept, so a pass that touches three cards says three.
      if (value === row.now) { delete all[row.name] } else { all[row.name] = value }
      store(all); paint(); tally();
    };
  });
  paint();
});

function tally() {
  document.getElementById('count').textContent = Object.keys(saved()).length + ' changed';
}
tally();

document.getElementById('reset').onclick = function () {
  if (!confirm('Throw away these answers?')) return;
  localStorage.removeItem(STORE);
  location.reload();
};

document.getElementById('copy').onclick = function () {
  // Every row, not only the changed ones: the file is the whole answer, and a
  // partial paste would leave the rest at whatever they happened to be.
  var all = saved();
  var out = {};
  ROWS.forEach(function (row) {
    out[row.name] = row.name in all ? all[row.name] : row.now;
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

addEventListener('dragstart', function (e) { e.preventDefault() });
</script>
</body></html>
`

for (const root of ['packages/web/public', 'packages/web/dist']) {
  try {
    writeFileSync(join(root, 'gender.html'), html)
  } catch {
    // dist may not exist yet; public is the one that matters.
  }
}
console.error(`gender editor: ${rows.length} portraits starting ${prefix} -> /gender.html`)
