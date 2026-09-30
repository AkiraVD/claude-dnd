# Playtest 1 — the flooded goblin warren

**Date:** 2026-09-30 · **Phase:** 3 (MCP server, in-memory state)
**Harness:** headless `claude -p` with `--mcp-config`, `--append-system-prompt-file
.claude/dm-prompt.md`, `--tools ""`, `--allowedTools mcp__dnd`
**Seed:** `DND_SEED=20260930` · **Result:** 30 tool calls, 0 errors, 31 turns, $1.60

A level 3 fighter listens at a tunnel mouth, climbs down a shaft, and fights two goblins
in thigh-deep water. Four scripted player actions, a real initiative order, goblins acting
on their own turns.

## What worked

- **Zero tool errors across 30 calls.** Every schema, every id, every enum first time.
- **No invented mechanics.** The DM called a tool for every roll and read the sheet back
  with `get_character_sheet` before quoting HP, rather than recalling it.
- **`attack_roll` was never followed by `apply_damage`.** The tool description warning
  against double-applying damage held.
- **Player agency held.** It stopped at the end and asked, and did not invent actions
  beyond the four given.
- **The narration is genuinely good.** Failures produced complications rather than "nothing
  happens": a botched stealth check became a loud landing that brought the goblins running.

## Findings, as the DM reported them

### 1. NPCs go dying instead of dead, with no way to opt out — **bug · FIXED**

A 7 HP goblin at 0 entered `status: "dying"` with `unconscious`, so the DM was obliged to
roll `death_save` for it every round. Standard 5e is that monsters die at 0 unless the
attacker chooses to knock out; the engine reverses the default and offers no override.

It burned a turn slot per round on a creature that could not act, left `end_combat` with
two dying creatures and no clean way to resolve them, and changed the story by accident —
Goblin A stabilised on a run of saves and became a live prisoner. A fine scene, but the DM
never chose it, and a DM who wanted two corpses had no button to press.

Wanted: `dies_at_zero` on `add_creature`, defaulting true for `kind: "npc"` and false for
`pc`, plus a `lethal` flag for deliberate non-lethal knockouts.

**Fixed as asked.** `diesAtZero` is now a creature property, defaulting from `kind`, and
`lethal: false` on `attack_roll` / `apply_damage` pulls the blow so a target falls
unconscious instead of dying — even past the massive-damage threshold, since an attacker
choosing to spare someone should not be defeated by arithmetic. Damage results now carry
`died` alongside `droppedToZero` and `instantDeath`, and the DM brief says which is which.

### 2. No way to say something is dead — **gap**

Coup de grâce, drowning, thrown off a cliff. The only lever is `apply_damage` against a
creature already at 0, which is a hack. The DM nearly fudged a drowning as bludgeoning
damage before deciding against it.

### 3. `death_save` takes no advantage or bonus — **gap**

Both goblins were face-down in standing water. A submerged unconscious creature should not
be making flat DC 10 saves, but there was no way to record the ruling, so the log now
contradicts the narrated fiction.

### 4. `attack_roll` has no weapon concept — **ergonomics, with a correctness edge**

Six swings meant retyping `1d8` / `str` / `+3` / `slashing` / `proficient` six times, with
six chances to typo a damage bonus and nothing to catch it. Attacks should live on the
creature and be referenced by name.

### 5. No multiattack awareness

Two attacks on a turn is just two calls with nothing checking entitlement. Irrelevant at
level 3, pure honour system from level 5.

### 6. No class resources or rests

Second Wind, Hit Dice, spell slots. The single likeliest next player action after the fight
— "I use Second Wind" — has no tool behind it, and nothing would stop a player doing it
four times running.

### 7. No positioning, and it showed

"Around your shield side", "the shaft wall pins you", "inside your reach now" — all
decoration. The DM declined to hand out ad-hoc disadvantage for the water because there was
no way to record *why* in the log, so the terrain never mattered mechanically.

### 8. `skill_check` is silent about whether proficiency applied — **small, real**

A result of `[4] +2 = 6` leaves the DM unable to tell bare DEX from a typo. The DM brief
tells it to verify against the engine rather than trust memory; this defeats that.

### 9. Armour is a flat number with no provenance

AC 16 went in as an integer, so nothing knows Brann wears chain mail, so nothing applies
chain mail's stealth disadvantage. The DM narrated the noise of the armour and rolled a
straight check — a real rules error the engine could not prevent.

### 10. No undo — **FIXED in phase 4**

`next_turn` is the only way to move the marker. Advance past a player who had not finished
and there is no way back.

**Fixed.** Every change is now a persisted step, and `undo` reverts the last one — which
falls out of storing a state snapshot per step rather than replaying events.

### 11. Keep `attack_roll` as one call

> "Whatever else changes, don't split that back into three calls."

To-hit, damage, HP application and the `droppedToZero` / `instantDeath` / `concentrationDc`
booleans in one payload meant the DM never had to parse prose to know what happened next.

## Harness note

The playtest prompt told the DM both to run the fight to a finish and not to decide
anything the player does — which conflict from round 2. It read "I charge the nearest one"
as a standing intent and kept swinging. Future playtests should say which they want.

## Full transcript

See `playtests/2026-09-30-goblin-warren-transcript.md`.
