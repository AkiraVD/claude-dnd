---
name: make-art
description: Generate art assets for Dice Tower with GPT Image through the browser, then slice, convert and wire them in. Use when asked to make or redo class, race, adventure, menu, scenery or NPC portrait art, or any new card deck for the setup modal.
---

# Making art for the table

Every set in `packages/web/public/` was made this way. The method matters more than the
prompts: what keeps a deck looking like a deck is that it is generated **in one
conversation off one shared block**, with only the subject swapped between images.

## 1. Decide the deck before generating anything

Write the spec first — the shared block and one line per card — and show it to the user.
They have asked for this explicitly and more than once: design first, build after.

The shared block fixes what must not vary. The one that works:

> Painterly fantasy illustration, visible brushwork, not photographic and not a 3D render.
> 3:2 landscape. One warm light source low in frame, everything else falling into shadow.
> Deep muted palette, no neon. The card carries white text over it at thumbnail size, so
> keep the upper-left third quiet and low in contrast. No text, lettering, signage,
> watermark, border or frame.

Then say what the subject is, and be honest about which kind it is, because mixing them
in one deck is what makes a set look wrong:

- **people** — class and race cards
- **places** — adventure cards
- **scenes with people** — difficulty, tone and rules cards

Still life was tried for the abstract tabs and replaced; it held together but read quieter
than everything beside it. If a tone or a mood needs illustrating, a scene with figures at
middle distance beats both a portrait and an arrangement of objects.

## 2. Drive ChatGPT

`chatgpt.com` in the browser. Typing with `computer` works until it suddenly does not —
synthetic keystrokes stop reaching the page part-way through a long session. The reliable
way:

```js
const el = document.querySelector('#prompt-textarea') || document.querySelector('[contenteditable="true"]')
el.focus()
const s = getSelection(); s.removeAllRanges()
const r = document.createRange(); r.selectNodeContents(el); s.addRange(r)
document.execCommand('insertText', false, text)
// wait ~600ms, THEN find the button: it only exists once there is text
const b = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === 'Send')
```

Click that button with a real `computer` click at `rect * (1568 / innerWidth)` — the tool's
coordinate frame is scaled against the viewport, which is why clicks drift after a resize.

Generation takes 40–70 s. Send the next prompt only when the composer is empty and
`[data-testid="stop-button"]` is gone; a prompt typed while it is busy is silently lost.

**Verify a send by the composer emptying, never by searching the page for the prompt
text** — the composer's own contents are part of `document.body.innerText`, so an unsent
message looks exactly like a sent one.

## 3. Get the files

Chrome runs on this machine, so downloads land in `~/Downloads` where they can be read
directly. This needs Chrome's *ask where to save each file* turned **off** — with it on,
every download blocks behind a native dialog the extension cannot see. Check with
`wmctrl -l | grep "wants to save"` and close with `wmctrl -i -c <id>`; the bytes are
already written to a `.org.chromium.Chromium.*` temp file either way.

The message list is virtualised, so only a few images are mounted at once. Scroll in steps
and pull what is newly mounted. **De-duplicate by checksum, not by filename** — reloading
the page resets any in-page `seen` set and the same images come down again under new
names. The very first turn of a long conversation often refuses to mount at all;
regenerating that one card at the bottom is faster than fighting it.

## 4. Convert and wire

`ffmpeg` only — there is no `sharp` and no native dependency in this project.

```bash
ffmpeg -i in.png -vf "scale=300:200" -c:v libwebp -quality 82 out.webp   # cards
ffmpeg -i in.png -vf "crop=250:250:X:Y,scale=256:256" -c:v libwebp -quality 72 out.webp  # portraits
```

A setup tab needs `imageFor` and `artAspect` in `packages/web/src/setup.ts`; the test that
every tab declaring art has an explicit aspect, and that every option's file exists, is in
`setup.test.ts` and covers new decks automatically. Portraits additionally need an entry
in `packages/content/src/portraits.ts` — that catalogue is deliberate, not a directory
listing, and `portraits.test.ts` fails if a name has no file.

Rebuild with `npm run build --workspace @dnd/web` and restart the server, or the browser
keeps serving the old bundle.

## 5. Portrait sheets: 25 to a picture

Measured, and written up in `playtests/2026-10-01-portrait-grids.md`. Output is always
1254×1254 whatever is asked for, so the cell is that divided by the grid:

| Grid | Portraits | Cell | Verdict |
|---|---|---|---|
| 4×4 | 16 | 313 px | Excellent |
| 5×5 | 25 | 250 px | Best — lands on the 256 px stored |
| 6×6 | 36 | 209 px | Usable, slight upscale |
| 8×8 | 64 | — | Refused; returns the 6×6 again, byte-identical |

The thing that makes a sheet usable rather than merely pretty: **give the roster in reading
order** — "1 human man late fifties, baker, flour in his beard. 2 dwarf woman, silversmith,
loupe on her brow…" — and it is followed cell for cell. Then slicing at a fixed stride
yields known people instead of faces to identify afterwards. Ask also for even spacing, no
outer border, one identical dark background, and no name plates, or the cut will not be
clean.

## 6. Aiming the small circles

Each portrait's face is recorded in `faces.json` beside the pictures, as `[x, y]`
percentages, and `faceOf` / `faceTransform` in `art.ts` read it. Two things are easy to
get wrong here and both were:

**`object-position` does nothing.** The images are square and so are the boxes, so
`object-fit: cover` scales them exactly and leaves no overflow to shift — the whole
creature just gets small. Legibility at 22px needs a *zoom*, which is a `transform:
scale()` on an image inside a wrapper that clips, aimed by translating the face to the
middle.

**Measure by eye, then check by rendering.** Reading positions off the source sheet with a
10% grid overlaid (`drawgrid`, plus `eq=brightness` because the sheets are dark) gets most
of them. It got nine wrong out of 116, and every one only showed up when the crop was
actually rendered and tiled — a four-legged creature carries its head low, which is the
opposite of the assumption that a standing figure's head is near the top. Always do the
render-and-tile pass; it takes one command and catches what the eye missed.

If a creature comes out taller than its cell, its head is simply not in the picture and no
metadata will save it. Regenerate those: a 2×2 is plenty, and the instruction that works is
that the *entire* creature including the top of its head must sit inside its own cell with
clear space above it, framing smaller if that is what it takes.

**Zoom is per portrait too**, stored as an optional third number in `faces.json`
(`[x, y, zoom]`, defaulting to 2). A head-and-shoulders portrait is already most of its
frame and wants almost none; a whole-body creature is a small shape in a big picture and
wants a lot. The editor has a slider for it.

**Known limit, not yet worth fixing.** Portraits are stored at 256px, so a 5× zoom samples
about a 51px region — roughly 1:1 against the 34px the cast list draws, and visibly soft on
a retina panel. Five creatures sit at that ceiling because they were drawn large in their
cell: `ogre`, `wight`, `bandit-captain`, `hill-giant`, `drow-raider`. Regenerating bought
back enough headroom to aim them properly but not enough resolution to zoom that far
cleanly. The fix, if it ever grates in play, is to re-slice those few at 512px from the
source sheets — the sheets are 1254px so the pixels exist — and let the rest stay at 256.
Nothing in the code assumes a uniform size.

**Clamp the translate.** Scaling by `z` leaves `(z - 1)` of overflow, half on each side, and
the translate is scaled too — so the shift cannot exceed `(z - 1) / 2z`. Past that the image
edge comes inside the box and the circle gets a bite of background taken out of it. Most of
these faces sit high enough to hit that limit, so they ride high in the circle rather than
centred, which is correct and is what the rendered check shows.

## 7. Show the work

Browser screenshots render only on Claude's side. To put anything in front of the user,
save it (`save_to_disk`) and send it with `SendUserFile` — and for menu art, screenshot the
real modal rather than the source images.

The setup modal only appears for a fresh campaign, so preview it on a throwaway server
rather than the real table:

```bash
PORT=7788 DND_DB=$SCRATCH/preview.db npm run server
```

Stop it and delete the scratch DB afterwards.
