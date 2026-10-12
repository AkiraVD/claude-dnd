# D&D with Claude as DM — Implementation Plan

Solo play (one PC, DM-run NPCs). Single-page web app. Runs on a Claude subscription by
driving the Claude Code CLI; the DM is whatever model the session runs.

## Core principle

**The engine is authoritative; Claude only narrates.**

Claude never states a roll result, an HP total, or a hit/miss from imagination. Every
mechanical outcome comes back from a tool call, and the tool result is the truth. This is
the single decision that makes the project work — an LLM asked to "roll a d20" will
happily produce whatever number fits the story it wants to tell, and will quietly forget
you are at 4 HP. Wiring the rules as real tools removes that failure mode entirely.

Corollaries:
- The engine **validates legality** and rejects illegal actions — no 3rd-level spell with
  zero slots. Claude adapts to the rejection.
- Every roll is logged with notation, seed and inputs, so "why am I at 3 HP?" has an
  auditable answer.
- The DM gets **no filesystem and no shell** — only the game tools (see launch flags).

---

## Architecture

```
 ┌──────────────────────── browser, one page ────────────────────────┐
 │  ┌─────────────────────────────┐  ┌────────────────────────────┐  │
 │  │  console                    │  │  character sheet           │  │
 │  │  ─────────                  │  │  HP ▓▓▓▓▓▓▓░░░ 21/29       │  │
 │  │  > I kick the door in       │  │  AC 16   Prof +2           │  │
 │  │                             │  │  ── conditions ──          │  │
 │  │  The hinges give …          │  │  concentrating: bless      │  │
 │  │  ┌──────────────────────┐   │  │  ── slots ──               │  │
 │  │  │ ⚄ ATTACK  d20 → 18   │   │  │  L1 ●●○  L2 ●○             │  │
 │  │  │   +5 = 23 vs AC 15   │   │  ├────────────────────────────┤  │
 │  │  │   HIT · 7 slashing   │   │  │  initiative                │  │
 │  │  └──────────────────────┘   │  │  ▸ you  18                 │  │
 │  │  The goblin staggers…       │  │    goblin A  12            │  │
 │  │  > _                        │  │    goblin B  9             │  │
 │  └─────────────────────────────┘  └────────────────────────────┘  │
 └───────────────────────────┬───────────────────────────────────────┘
                             │ WebSocket
 ┌───────────────────────────▼───────────────────────────────────────┐
 │  Node server (one process)                                        │
 │    ├─ child: `claude -p --input-format stream-json …`  ◄──┐       │
 │    │     turns in on stdin · events out on stdout        │ MCP    │
 │    ├─ dnd MCP server (http://localhost:7777/mcp) ────────┘ (http) │
 │    │     └─ engine (pure TS) + SQLite event log                   │
 │    └─ serves the React app, WS for console, SSE for state         │
 └───────────────────────────────────────────────────────────────────┘
```

One long-lived `claude` child process per campaign. You type in the browser, the server
writes a JSON line to its stdin, and structured events stream back out — token deltas,
tool calls, tool results. No respawn per turn, so no startup cost between turns.

The MCP server runs **inside the web server over HTTP**, not as a stdio child of `claude`.
That way it survives across `claude` restarts and can push state straight to the browser
panels over SSE as the engine mutates.

> **Not what shipped.** The HTTP transport was dropped once campaigns were in SQLite, and
> `@dnd/mcp` became its own package running as a stdio child. See *Two plan changes worth
> recording* below. The diagram above is kept as the plan it was, not as a map of the code.

### The launch command

What `packages/server/src/claude-session.ts` actually assembles:

```bash
claude -p \
  --input-format stream-json --output-format stream-json \
  --verbose --include-partial-messages --replay-user-messages \
  --append-system-prompt-file <the dm prompt> \
  --mcp-config <the mcp config> \
  --tools "" \
  --allowedTools "mcp__dnd__*" \
  --permission-mode dontAsk \
  [--resume <session id>]
```

Each flag is load-bearing:

| Flag | Why |
|---|---|
| `--input-format stream-json` | Feed many turns into one process. The whole reason this design works |
| `--include-partial-messages` | Token deltas, so narration types out live |
| `--replay-user-messages` | Server gets its own turns echoed back, for ordering the log |
| `--resume <id>` | Pick the conversation back up after a restart |
| `--tools ""` | Removes **every** built-in tool. The DM cannot read, write, or run anything |
| `--allowedTools "mcp__dnd__*"` | Game tools never prompt — a dice roll must not block on approval |
| `--permission-mode dontAsk` | Anything not allowlisted is denied instead of hanging |
| no `--bare` | Bare mode ignores the subscription login and demands an API key. Do not use it |

**`--session-id` is not passed, though the plan said it would be.** The idea was that the
campaign id *would be* the conversation id, one identifier for both. In practice the id is
read off the `system/init` event the CLI emits and stored, and a restart passes it back as
`--resume`. The conversation and the campaign turn out to want separate lifetimes anyway:
`/clear` ends one and not the other, which is why `reset_campaign` exists.

One more flag to avoid, found the hard way and not in the plan: **`--system-prompt` hangs
forever on a subscription login**, the same trap as `--bare`. Only the `--append-` form
works, which is why the DM's contract is appended rather than replacing the system prompt.

`--tools ""` plus `dontAsk` is what makes an unsupervised DM safe: it has exactly the game
tools and nothing else, so there is no blast radius to worry about.

### Why a console, not xterm.js

"Terminal in the web app" has two readings, and the structured one is better.

Because `stream-json` hands you typed events, you can render a `mcp__dnd__attack_roll`
result as a **dice card** — the d20 face, the modifier, the AC it beat — and an
`apply_damage` result as an HP bar that animates down, both inline in the log. An xterm.js
VT emulator would give you Claude Code's own TUI chrome instead, and everything would be
terminal text you cannot style or lay out.

So: keep the *aesthetic* if you want it (monospace, a blinking caret, a `>` prompt), but
drive it from structured events, not a pty. Same look, far better rendering. A real
xterm.js pane is still worth adding later as a collapsible debug drawer.

---

## Session bootstrap: `/play-dnd`

User-invoked skills work in `-p` mode — the first line written to stdin is just
`/play-dnd`. Split responsibilities:

- **`.claude/dm-prompt.md`** (via `--append-system-prompt-file`) — the standing rules that
  must hold on every turn: never invent a mechanical result, always call the tool; never
  decide the player character's actions; describe consequences, not dice; when to call for
  a check and at what DC; scene framing, pacing, tone.
- **`.claude/skills/play-dnd/SKILL.md`** — one-time bootstrap: load or create the
  campaign, recap "previously…" from the event log, open the scene. On a fresh campaign it
  runs character creation conversationally, calling engine tools for `4d6kh3` stat rolls.

Standing rules belong in the system prompt, not the skill, because a skill's instructions
drift out of attention over a long session while the system prompt does not.

> **Gotcha that will cost you an hour.** Claude Code records the system prompt on the
> conversation's *first* request and reuses it on resume until the conversation compacts.
> While you are iterating on `dm-prompt.md`, pass `--system-prompt-snapshot off` or your
> edits will appear to do nothing.

---

## Engine design

80% of the work, and the only genuinely hard part. Pure TypeScript, no I/O, seeded — so
it is exhaustively unit-testable.

### Event-sourced state

State is a pure reduction over an append-only log:

```ts
type GameEvent =
  | { t: "roll";       id: string; notation: string; rolls: number[]; total: number; seed: number }
  | { t: "damage";     target: string; amount: number; dtype: DamageType; mitigated: number }
  | { t: "heal";       target: string; amount: number }
  | { t: "condition";  target: string; condition: Condition; op: "add" | "remove" }
  | { t: "slot_spent"; caster: string; level: number }
  | { t: "turn";       actor: string; round: number }
  /* ... */

function reduce(state: GameState, e: GameEvent): GameState   // pure
```

Save/load is the log; undoing a bad ruling is truncating it; the audit trail is free; the
browser panels update by replaying appended events over SSE; and the `/play-dnd` recap is
generated from it.

### Modules

**`dice.ts`** — notation parser over a **seeded PRNG**, not `Math.random`, so sessions
replay and tests are deterministic. `2d6+3`, `4d6kh3`, advantage/disadvantage, reroll-1s.
Advantage is *two d20s, keep the higher* — model it that way, not as a flat `+5`.

**`checks.ts`** — ability checks, skills, saves vs DC. Proficiency from level
(`2 + floor((level-1)/4)`), expertise doubling, passive scores (`10 + mod`).

**`combat.ts`** — the part homebrew usually gets wrong:
- Initiative order, rounds, turn advancement.
- Attack vs AC. **Nat 20 auto-hits and doubles the dice, not the modifier**; nat 1 misses.
- Damage in the correct order: resistance halves → vulnerability doubles → immunity
  zeroes → temp HP absorbs → real HP.
- 0 HP: unconscious, death saves (3 successes stabilise, 3 failures die, nat 20 up at 1);
  instant death when overkill ≥ max HP.
- Concentration at DC 10 or half damage taken, whichever is higher.

**`character.ts`** — ability scores, AC, HP by hit die, spell slot tables, prepared
spells, conditions, inventory and equipment, XP thresholds, level-up.

Solo play keeps combat state simple: one player-controlled creature, everything else
DM-run. No turn-ownership model.

---

## MCP tool surface

Sixty-five tools as built. The plan sketched about thirty; the growth is almost all in the
groups it named last — story, cast and shop — because those are what a session actually
spends its calls on once the combat maths works.

| Group | Tools |
|---|---|
| Dice | `roll_dice` |
| Resolution | `ability_check`, `skill_check`, `saving_throw`, `attack_roll` |
| HP | `apply_damage`, `heal`, `apply_temp_hp`, `death_save`, `stabilise`, `kill` |
| Combat | `start_combat`, `next_turn`, `remove_from_combat`, `end_combat` |
| Status | `apply_condition`, `remove_condition`, `set_exhaustion`, `start_concentration`, `concentration_save` |
| Magic | `cast_spell` (spends the slot, computes save DC), `learn_spell` |
| Resources | `list_resources`, `add_resource`, `spend_resource`, `spend_hit_die` |
| Rest/growth | `short_rest`, `long_rest`, `award_xp`, `level_up` |
| Money and goods | `get_purse`, `earn_money`, `spend_money`, `give_item`, `take_item`, `buy`, `sell`, `open_shop` |
| Cast | `add_creature`, `remove_creature`, `update_npc`, `get_cast`, `get_portraits`, `add_note`, `reveal_note` |
| Campaign | `list_campaigns`, `new_campaign`, `load_campaign`, `rename_campaign`, `reset_campaign`, `delete_campaign`, `recap`, `undo`, `set_rules` |
| Read-only | `get_character_sheet`, `get_state`, `get_combat_state`, `get_story`, `recent_events` — Claude checks facts instead of recalling |
| Narrative | `set_scene`, `set_story`, `amend_story`, `beat`, `offer_choice`, `offer_actions` |

Four groups the plan had are gone or changed shape. `contested_check` and
`concentration_check` became `concentration_save` and ordinary opposed checks;
`list_spells` never arrived because there is no spell catalogue; `equip` and `use_item`
collapsed into `give_item`/`take_item` plus the armour and attacks passed to
`add_creature`; and `update_quest_log` became the story backbone — `set_story`, `beat` and
`amend_story` — which is a stronger thing than a log, because it is what survives a
`/clear`.

Each returns a structured payload the UI renders as a card, **plus** a `narration_hint`
(`"18 vs AC 15 — hit, 7 slashing, target at 12/29"`). Claude turns the hint into prose. It
never picks the number.

---

## Layout

As built — five packages rather than four, because the MCP server became its own:

```
claude-dnd/
├─ packages/
│  ├─ engine/          # dice, checks, combat, character, progression, story — pure, seeded
│  ├─ content/         # SRD 5.1 data: classes, races, conditions, items, art catalogues
│  ├─ mcp/             # the engine as 65 stdio tools + SQLite campaigns
│  ├─ server/          # claude child process + WS + static files
│  └─ web/             # React + Vite: console, sheet, initiative, slots, setup, shop
│     └─ public/       # every picture the game can reach, pre-rendered
├─ .mcp.json           # { "dnd": { "type": "stdio", "command": "npx", ... } }
├─ scripts/            # the asset editors: gallery, faces, cut, cards, gender
├─ .claude/
│  ├─ dm-prompt.md     # standing DM rules (--append-system-prompt-file)
│  └─ skills/          # play-dnd (session bootstrap), make-art (how the art is made)
├─ playtests/          # real sessions, with findings
└─ campaign.db         # SQLite: a state snapshot per step, events journalled beside them
```

---

## Phases

| # | Deliverable | Status |
|---|---|---|
| 0 | Monorepo scaffold, SRD subset, vitest | **done** |
| 1 | `dice.ts` + `checks.ts`, seeded | **done** |
| 2 | `character.ts` + `combat.ts` | **done** — acceptance test runs a full goblin ambush |
| 3 | MCP server + stdio config, played in the Claude Code terminal | **done** — first playable |
| 4 | SQLite persistence, campaigns, recap | **done** — plus `undo`, which snapshots gave for free |
| 5 | Server: `claude` child process, stream-json ↔ WebSocket | **done** |
| 6 | `/play-dnd` skill + character creation flow | **done** |
| 7 | Rich rendering: dice cards, HP bars, sheet, initiative, slots | **done** |
| 8 | Classes, weapons, resources, rests, spells, levelling | **done** |
| 9 | Polish | **partial** — dice land with an animation and HP bars tween; no encounter builder, no xterm drawer |

Three more phases happened that the plan never named. They are listed here because the plan
stopping at nine makes it look as though the project did:

| # | Deliverable | Status |
|---|---|---|
| 10 | A story backbone, a persistent cast, money and shops | **done** — `set_story`, `beat`, `amend_story`, hidden notes, `open_shop` |
| 11 | The setup form and the art library | **done** — menu cards, 191 folk, a 60-creature bestiary, and four editors to aim them |
| 12 | Character creation by portrait | **done** — the picture decides race and sex, one owner per face, roll or choose |

Phase 10 is the one the plan had no idea was coming, and it extends the core principle
somewhere the plan never pointed it. The engine was built to stop the DM inventing a
mechanical result. A campaign with nothing written down has the same failure in the
narrative: what the DM remembers is whatever is still in context, so two sessions on it is a
different campaign. `set_story` puts the premise, the truth under it and the beats on disk,
where a `/clear` cannot reach them — the only thing in the engine that defends against the
model rather than against the rules.

Playtest 2 then found the obvious gap: the backbone gets written once and never advanced.
`beat` was not called all session and all seven beats were still `ahead` at the end. Written
state that nothing updates is just a longer prompt, so that one is worth a look.

Two plan changes worth recording, both decided against the plan as written:

**Phase 4 did not become pure event sourcing.** The plan said state would be a reduction
over the event log. Deriving state by replaying events through a reducer means writing the
rules twice — once in the engine, once in the reducer — and they drift until every bug is
"which one is right?". State snapshots are the source of truth instead, with events as a
journal beside them. Since a campaign is a few kilobytes of JSON, snapshotting per step is
cheap and gives undo for nothing.

**Phase 5 did not need MCP over HTTP.** The plan moved the MCP server to HTTP so it would
outlive the model process. Once campaigns were in SQLite that stopped mattering: the stdio
server can die with `claude` and reload from disk, and the web server reads the same file
directly to hydrate a page. One fewer transport, one fewer thing to get wrong.

## Art still owed

Everything in `packages/web/public/` is pre-rendered and shipped — there is no API key here
and nothing generates an image at run time — so a gap in the library is a gap until someone
sits down and makes the picture.

**The library stands at 191 folk and 60 creatures.** The folk were cut from sheets of
twenty-five and sixteen and are stored at 256px, chest-up, because a face is what identifies
a person. All 108 race-class pairings a rolled character can land on get a face, and the
roller falls back rather than refusing when the exact one is missing.

**The bestiary was regenerated once the first version proved too small.** Full-body framing
in a 250px cell leaves a head of about sixty pixels, so a creature cropped to its face was
a smear. The fix was fewer cells per sheet and sheets grouped by SRD creature size — a
mixed sheet makes the model scale everything to its neighbours, so the small subject and
the large one both come out small. Fifty creatures now store at 416px off 3×3 and 3×2
sheets, and the ten ancient dragons get a whole 1254px frame each, since at Gargantuan a
cell is the wrong unit.

**Focal points are measured, not guessed.** All but one of the 251 have been through
`/faces.html`, which is the whole reason the editor exists — the measured crops are visibly
better framed than the seeded ones were. The exception is `ancient-white-dragon`, still on
a placeholder `[50, 40, 1.5]`: it came back as an A/B pair and got missed in the pass.

**Still owed.**

- `red-wyrmling` contradicts itself: named a wyrmling, described as "Young red dragon".
  Those are two different SRD age categories, and it reads oddly now that ten explicitly
  aged ancients sit beside it. Whichever way it goes, the description and the key should
  agree.
- `public/races/*.webp` — nine painted race cards, each showing a man and a woman of that
  people. Unreferenced since the race tab became a portrait picker, and the only art in
  `public/` that nothing can reach. Keep or delete, but not both.
- Three spare poses are generated and uncut: a second lich, a second goblin, and the `white-b`
  dragon.
- **Eighteen pairings exist in one gender only**, so asking for the other gets the face the
  library has. `roll-character.test.ts` pins the list rather than a count, so it shrinks
  visibly as portraits are added. Druid and monk dominate it, and that was a measuring
  mistake rather than a drawing one: their role lists are their own — grovepriest,
  bladedancer, novice — and the sheets were planned against five broader clusters that do
  not reach them.

**Open question: unset portraits in the cast list.** An NPC the DM never gave art to renders
with no avatar at all — the hood is the fallback in the setup form but not in the panel.
Whether the cast column should hood them too is a judgement about how it reads when half of
it is hooded strangers, and is not decided here.

## Not built, deliberately

- **Positioning.** No grid, cover, flanking, reach or opportunity attacks. Theatre of the
  mind, and the DM can hand out advantage for circumstance. The first playtest noted that
  terrain ended up purely decorative; making it mechanical means committing to a spatial
  model, which is a different project.
- **Multiattack enforcement.** Two attacks on a turn is two calls with nothing checking
  entitlement. Honour system from level 5.
- **A spell catalogue.** `cast_spell` spends the slot and gives the save DC; what the spell
  does is the DM's to adjudicate. Several hundred spell descriptions is its own undertaking.
- **An encounter builder and an xterm debug drawer.** Phase 9 leftovers, both convenience.

---

## Known trade-offs and gotchas

- **System prompt is snapshotted on first request.** Use `--system-prompt-snapshot off`
  while iterating on `dm-prompt.md`. Easily an hour lost otherwise.
- **Usage counts against your Claude subscription limits.** A long session with a large
  context is real usage; a campaign is not free in rate-limit terms even though there is
  no per-token bill.
- **Nothing is cryptographically hidden.** Tool results reach the browser, so a DM-only
  stealth roll is visible if you open devtools. Mitigation: those tools return only the
  outcome and keep numbers in the event log for post-session review.
- **Claude Code is the runtime dependency.** Version bumps can change flag behaviour;
  `--input-format stream-json`, `--replay-user-messages` and `--session-id` are the three
  the design leans on hardest. Pin a known-good version and check `system/init` events.
- **If you ever want to ship this to other people**, it needs the Messages API and an API
  key — Anthropic does not permit third-party products to offer claude.ai login. The
  `engine/` and `content/` packages port over unchanged; `server/` swaps the child process
  for the SDK tool runner. Personal single-user play is not affected.
- **Licensing:** SRD 5.1 only (CC-BY-4.0). No PHB text in `content/`.
