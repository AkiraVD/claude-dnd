# Playtest 2 — the drowned town of Hallowmere

**Date:** 2026-10-01 · **Covers:** money, the cast, the backbone, the browser tools
**Harness:** headless `claude -p`, `--input-format stream-json` with 7 scripted player
turns, `--append-system-prompt-file .claude/dm-prompt.md`, `--tools ""`,
`--allowedTools mcp__dnd`
**Seed:** `DND_SEED=20261001` · **Session:** `pt2601` · **Result:** 29 tool calls, 1 error,
30 turns, $1.64, 240s

A disgraced half-elf temple guard arrives in a town built in a drained lakebed, asks the
innkeeper for work, and buys rope and a lantern. The seven player turns were written to
force the systems added since playtest 1 rather than to tell a story.

## What worked

- **The setup brief was honoured, not re-asked.** Turn 1 was exactly what the browser form
  sends. The DM took the race, class, adventure, difficulty and tone from it and went
  straight to building the character. `SKILL.md`'s "do not re-ask what it already answers"
  held.
- **Coin arithmetic was exact.** Vesper started on 9 gp, bought rope (1 gp) and a lantern
  (5 gp), and finished on 3 gp. Adela went from 60 gp to 66 gp. Nothing drifted, and
  nothing had to be remembered.
- **The commoner fallback was used as intended.** Adela Fenn was registered with no scores,
  no HP and no AC, and came out 4/4, AC 10. Recording a named NPC cost a name.
- **A vendor's stock is her inventory.** `give_item` with prices built the shelf, `buy`
  moved rope and lantern across, and her remaining stock went down. The shop is real.
- **The portrait was chosen to fit the prose, not the reverse.** The DM described a
  grey-haired dwarf behind the bar and then picked `dwarf-innkeeper-grey` from
  `get_portraits` — the match the catalogue is for.
- **Attitude moved during play.** Adela started neutral and was set to `unfriendly` after a
  failed Insight read, which is exactly the drift the field exists to capture.
- **`offer_choice` produced five genuinely distinct options**, including one the player
  would have had to invent otherwise ("Put the three letters on the bar and say Ilma's name
  out loud").
- **`set_scene` passed `backdrop: "tavern"`** without being prompted.
- **Session stamping works.** Every step in the database carries `pt2601`, from the
  `DND_SESSION` override.

## Findings

### 1. The DM narrates a secret and does not reveal it — **bug · the important one**

Adela says this out loud, to the player:

> "Four out of the cut since the thaw — four bodies, I mean, in four months — and they've
> stopped pretending it's drink."

That is the content of a note stored as `revealed: false`. **`reveal_note` was never called
— not once in the session.** Both notes written about Adela are still hidden.

The consequence is not cosmetic. The player's character panel and journal are built from
revealed notes only, so a player who just had the central hook explained to them would open
the panel and see nothing recorded about Adela at all. The engine's memory and the player's
memory have already diverged, in the first conversation.

This was the predicted failure when the flag was designed — it is the one piece of
bookkeeping with no safety net, because nothing else can infer it. The prompt says to call
it "in the same turn you narrate it", and that was not enough.

Worth trying, in order of how much they change: make `add_note` take the revealing moment
directly; have `recap` report the count of unrevealed notes on NPCs the player has spoken
to, so the gap is visible; or accept that it needs a stronger rule than a sentence in a
section the DM read once.

### 2. No beat was ever marked reached — **same root cause**

All seven story beats are still `ahead`, and `beat` was never called. The session did not
clearly reach one, so this is less damning than finding 1, but it is the same shape: the
backbone is written once and then not advanced, so the journal would stay empty across a
whole campaign.

### 3. `set_story` failed on a 2,596-byte payload — **bug**

```
InputValidationError: mcp__dnd__set_story was called with input that could not be
parsed as JSON. You sent (first 200 of 2596 bytes): {"premise"
```

The DM retried with a smaller payload and succeeded, so the session was not lost. But the
backbone is the one call most likely to be long — premise, question, truth and seven beats
— and it is made once, at the start, when failing silently would be worst. Needs a look at
whether this is a size limit, a streaming truncation, or an escaping problem in the beat
text.

## Not covered

No combat, no rests, no spellcasting, no levelling — playtest 1 covers those and nothing in
this change touched them. `sell`, `restock`, `take_item`, `earn_money`, `spend_money` and
`amend_story` were never exercised. The browser was not involved at all: `open_shop` and
`offer_choice` were verified as tool calls with correct payloads, not as rendered UI.
