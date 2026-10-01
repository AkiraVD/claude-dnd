# Portrait grids — what GPT Image will actually do in one picture

Asked for the same thing at rising density, in one conversation, and compared. Every
output came back 1254×1254 whatever was asked for, so the cell size is just the grid
divided into that.

| Grid | Portraits | Cell | Result |
|---|---|---|---|
| 3×3 | 9 | 418 px | Excellent |
| 4×4 | 16 | 313 px | Excellent |
| 5×5 | 25 | 250 px | Excellent, and lands on the 256 px the library stores |
| 6×6 | 36 | 209 px | Still good, needs a small upscale |
| 8×8 | 64 | — | **Refused.** Returned the 6×6 image again, byte-identical |

So 36 is the ceiling and **25 is the sweet spot**: the cells come out at 250 px, which is
the store size, so nothing is upscaled and nothing is thrown away.

## What made it usable

Specifying the roster **in reading order** — "1 human man late fifties, baker, flour in
his beard. 2 dwarf woman, silversmith, loupe on her brow…" — and it followed the list
cell for cell, both times. That is the difference between a sheet of nice faces and a
sheet you can cut up and name without looking at every one and guessing.

The rest of the prompt is about making the cut clean: even spacing, no outer border,
identical framing and eye line, one plain dark background behind every head, no text or
name plates anywhere. With that, slicing is `crop` at a fixed 250 px stride and nothing
bleeds between cells.

## Still mismatched

The sixteen original portraits came from a different generator and sit noticeably flatter
and more cartoonish beside the fifty new ones — different backgrounds, different
lighting, one of them on cream rather than dark. The library works, but it does not look
like one set. Regenerating the original sixteen as a third 5×5 would fix it.
