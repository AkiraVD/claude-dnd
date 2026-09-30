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

### The launch command

```bash
claude -p \
  --input-format stream-json --output-format stream-json \
  --verbose --include-partial-messages --replay-user-messages \
  --session-id "$CAMPAIGN_UUID" \
  --append-system-prompt-file .claude/dm-prompt.md \
  --tools "" \
  --allowedTools "mcp__dnd__*" \
  --permission-mode dontAsk \
  --mcp-config .mcp.json
```

Each flag is load-bearing:

| Flag | Why |
|---|---|
| `--input-format stream-json` | Feed many turns into one process. The whole reason this design works |
| `--include-partial-messages` | Token deltas, so narration types out live |
| `--replay-user-messages` | Server gets its own turns echoed back, for ordering the log |
| `--session-id <uuid>` | Your campaign id *is* the session id. Crash? `--resume` the same uuid |
| `--tools ""` | Removes **every** built-in tool. The DM cannot read, write, or run anything |
| `--allowedTools "mcp__dnd__*"` | Game tools never prompt — a dice roll must not block on approval |
| `--permission-mode dontAsk` | Anything not allowlisted is denied instead of hanging |
| no `--bare` | Bare mode ignores the subscription login and demands an API key. Do not use it |

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

| Group | Tools |
|---|---|
| Dice | `roll_dice` |
| Resolution | `ability_check`, `saving_throw`, `attack_roll`, `contested_check` |
| HP | `apply_damage`, `heal`, `apply_temp_hp`, `death_save` |
| Combat | `start_combat`, `next_turn`, `end_combat` |
| Status | `apply_condition`, `remove_condition`, `concentration_check` |
| Magic | `cast_spell` (spends the slot, computes save DC), `list_spells` |
| Rest/growth | `short_rest`, `long_rest`, `award_xp`, `level_up` |
| Items | `add_item`, `remove_item`, `equip`, `use_item` |
| Campaign | `new_campaign`, `load_campaign`, `recap` |
| Read-only | `get_character_sheet`, `get_combat_state` — Claude checks facts instead of recalling |
| Narrative | `set_scene`, `update_quest_log` |

Each returns a structured payload the UI renders as a card, **plus** a `narration_hint`
(`"18 vs AC 15 — hit, 7 slashing, target at 12/29"`). Claude turns the hint into prose. It
never picks the number.

---

## Layout

```
dnd-claude/
├─ packages/
│  ├─ engine/          # dice, checks, combat, character, progression — pure, seeded
│  ├─ content/         # SRD 5.1 JSON: classes, spells, monsters, items, conditions
│  ├─ server/          # MCP over http + claude child process + WS/SSE + static
│  └─ web/             # React + Vite: console, sheet, initiative, slots
├─ .mcp.json           # { "dnd": { "type": "http", "url": "http://localhost:7777/mcp" } }
├─ .claude/
│  ├─ dm-prompt.md     # standing DM rules (--append-system-prompt-file)
│  └─ skills/play-dnd/ # session bootstrap
└─ campaign.db         # SQLite event log
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
