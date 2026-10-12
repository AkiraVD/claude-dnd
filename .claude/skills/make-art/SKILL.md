---
name: make-art
description: How Dice Tower's art is made and wired in — the decks and their shared prompt blocks, the sizes each set is stored at, the catalogues and tests a new picture has to be registered in, and the focal-point editors. Use when asked to make or redo class, race, adventure, menu, scenery, monster or NPC portrait art, or any new card deck for the setup modal. Defers the browser-driving and sheet-slicing to the global chatgpt-image-gen skill.
---

# Making art for the table

Every set in `packages/web/public/` was made this way. The method matters more than the
prompts: what keeps a deck looking like a deck is that it is generated **in one
conversation off one shared block**, with only the subject swapped between images.

The generating itself lives in the global **`chatgpt-image-gen`** skill. This file is the
half that is about *this* project: which decks exist and what each one is, the size each set
is stored at, the catalogue and the test every new picture has to pass, and how to put the
result in front of the user.

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

- **people** — the twelve class cards, and the folk portraits
- **places** — the seven adventure cards
- **scenes with people** — the eleven difficulty, tone and rules cards
- **creatures** — the bestiary, which is its own thing: framed whole, not chest-up

Still life was tried for the abstract tabs and replaced; it held together but read quieter
than everything beside it. If a tone or a mood needs illustrating, a scene with figures at
middle distance beats both a portrait and an arrangement of objects.

**The nine race cards are retired.** They are still in `public/races/` and still credited,
but nothing reaches them: the race tab became a portrait picker, and the chosen face already
says what a card showing a man and a woman of that people was there to say. Worth knowing
before making a tenth — the deck it would join is not on screen any more.

## 2. Generate it

The global **`chatgpt-image-gen`** skill drives this: loading the browser tools in one
call, the page helpers that collapse a generation to three tool calls, the send loop and
its failure modes, the sheet-grid arithmetic, and `slice.py` for cutting a sheet up. Use it
rather than the notes that used to live here — they were the first draft of it, and
duplicating them only lets the two drift.

Two things it will not know, because they are about this project:

**Downloads land in `~/Downloads`** and are read from there directly, because Chrome runs
on this machine. The sheets are large; keep them in the scratchpad rather than the repo.

**One conversation per deck.** A set holds together because one block of text is identical
across every prompt in it. An old thread drags in its own style, so a new deck means a new
conversation — and a card added to an existing deck months later will not match no matter
how carefully the block is copied, which is the argument for generating a spare at the time.

## 3. Convert and wire

`ffmpeg` only — there is no `sharp` and no native dependency in this project.

**Pass `-nostdin` when slicing in a loop.** `ffmpeg` reads stdin even when it has no use
for it, so inside `while read -r name; do ... done < names.txt` it swallows one byte per
iteration and every filename after the first loses its leading character — `gnome-…`
becomes `nome-…`. The crops themselves are still correct and in order, which is what makes
it easy to miss. `-nostdin`, or `< /dev/null` on the ffmpeg call.

```bash
ffmpeg -i in.png -vf "scale=300:200" -c:v libwebp -quality 82 out.webp   # cards
ffmpeg -i in.png -vf "crop=250:250:X:Y,scale=256:256" -c:v libwebp -quality 72 out.webp  # folk
ffmpeg -i in.png -vf "crop=418:418:X:Y,scale=416:416" -c:v libwebp -quality 80 out.webp  # creatures
```

**What each set is stored at**, and why they differ: folk at 256px, chest-up, because the
face is the whole picture and 256 is plenty for a head. Creatures at 416px, framed whole,
because the silhouette is what identifies them and the crop then has to zoom a long way
into a full-body figure to find a face. Nothing in the code assumes a uniform size —
`faces.json` works in percentages and `faceTransform` in multiples, so a set can be restored
at a different size without touching anything else.

A setup tab needs `imageFor` and `artAspect` in `packages/web/src/setup.ts`. The test that
every tab declaring art has an explicit aspect, and that every option's file exists, is in
`setup.test.ts` and covers a new deck automatically.

A portrait or a creature additionally needs an entry in `packages/content/src/portraits.ts`
— that catalogue is deliberate, not a directory listing, which is what lets the DM pick a
face from descriptions without looking at the pictures. `packages/web/src/art.test.ts` is
the file that holds you to it, and it checks more than existence: a file for every name in
both catalogues, a description for every entry, a recorded face for every one of them, the
two libraries kept apart by name *and* directory, and every crop inside its frame. Add the
name and the file together or the suite says which half is missing.

Rebuild with `npm run build --workspace @dnd/web` and restart the server, or the browser
keeps serving the old bundle.

## 4. What the grid costs, for this library

The arithmetic is in the global skill's `references/sheets.md`; what matters here is the
decision it drove twice.

The folk sheets are 5×5 and 4×4 — a 250px cell, which lands on the 256px stored, and
chest-up framing means that cell is almost all face. That was right and still is.

The bestiary was generated the same way and was wrong. Full-body framing in a 250px cell
leaves a head of about sixty pixels, so the cast-list circle was sampling a smear; the five
worst needed 5× zoom to read at all. The fix was fewer cells per sheet (3×3 and 3×2, a
418px cell) **and sheets grouped by SRD creature size** — on a mixed sheet the model scales
every subject to its neighbours, so a kobold beside a hill giant comes out small and so does
the hill giant. Grouping was the larger win of the two. The ten ancient dragons get a whole
1254px frame each, because at Gargantuan a cell is the wrong unit.

So: **pick the framing from what identifies the subject, then pick the grid from the
framing.** A face can live in a small cell. A silhouette cannot.

## 5. Aiming the small circles

Each portrait's face is recorded in `faces.json` beside the pictures, as
`[x, y]` or `[x, y, zoom]` percentages, and `faceOf` / `faceTransform` in `art.ts` read it.
`npm run faces` builds the editor that aims them and `npm run faces:apply` writes the
result back; there are three more editors beside it (`cut`, `cards`, `gender`), all working
the same way — a page you drag, and an apply half that takes the JSON it prints.

Two things are easy to get wrong here and both were:

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
metadata will save it — `slice.py` flags cells whose subject reaches the top edge, but it
flags contact rather than damage, so the flagged ones have to be looked at. Regenerate a
genuine clip rather than recropping: a 2×2 is plenty, and the instruction that works is that
the *entire* creature including the top of its head must sit inside its own cell with clear
space above it, framing smaller if that is what it takes.

**Zoom is per portrait too**, stored as an optional third number in `faces.json`
(`[x, y, zoom]`, defaulting to 2). A head-and-shoulders portrait is already most of its
frame and wants almost none; a whole-body creature is a small shape in a big picture and
wants a lot. The editor has a slider for it.

**The zoom ceiling, and how it was raised.** A zoom of `z` on a portrait stored at `s`
samples `s / z` real pixels, and the cast list draws a 34px circle. At 256px a 5× zoom
sampled 51px — about 1:1, visibly soft on a retina panel — and `ogre` and `hill-giant` sit
at exactly 5× because they were drawn large in their cell. Re-slicing the bestiary at 416px
is what fixed it: the same 5× now samples 83px, with room to spare. The sheets are 1254px,
so if a future set needs more the pixels are there; store bigger rather than zooming harder.

**Clamp the translate.** Scaling by `z` leaves `(z - 1)` of overflow, half on each side, and
the translate is scaled too — so the shift cannot exceed `(z - 1) / 2z`. Past that the image
edge comes inside the box and the circle gets a bite of background taken out of it. Most of
these faces sit high enough to hit that limit, so they ride high in the circle rather than
centred, which is correct and is what the rendered check shows.

## 6. Show the work

Browser screenshots render only on Claude's side. To put anything in front of the user,
save it (`save_to_disk`) and send it with `SendUserFile` — and for menu art, screenshot the
real modal rather than the source images.

The setup modal only appears for a fresh campaign, so preview it on a throwaway server
rather than the real table:

```bash
PORT=7788 DND_DB=$SCRATCH/preview.db npm run server
```

Stop it and delete the scratch DB afterwards.
