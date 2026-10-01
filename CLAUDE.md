# Working on Dice Tower

> **If you are running a game, stop here.** `.claude/dm-prompt.md` governs a session and
> this file does not apply to it. Everything below is for working *on* the project.
>
> This file is loaded into every session in this directory, the DM's included — the server
> does not pass `--bare`, because bare mode ignores the subscription login. So keep it
> short: every line here is also context the DM is carrying.

Solo D&D 5e with Claude as DM, in the browser. Runs on a Claude subscription; there is no
API key anywhere in this project, and there should never be one.

## The principle everything follows from

**The engine is authoritative; Claude only narrates.**

An LLM asked to roll a d20 produces whatever number the story wants and forgets you are at
4 HP. So every mechanical outcome comes from a tool call, the tool result is the truth, and
the engine *rejects* illegal actions rather than letting them slide. When adding a rule, ask
whether a DM could quietly get it wrong across three hours — if so, it belongs in the
engine, not the prompt.

## Layout

| Package | What it is |
|---|---|
| `@dnd/engine` | The rules. Pure, seeded, zero I/O. Every function returns new state plus `GameEvent[]` |
| `@dnd/content` | SRD 5.1 data: abilities, skills, conditions, damage types, 12 classes, slot tables |
| `@dnd/mcp` | The engine as 65 MCP tools, campaigns in SQLite |
| `@dnd/server` | Runs `claude` as a child process, bridges stream-json to a WebSocket |
| `@dnd/web` | React console and panels |

Data flow: browser ⇄ WebSocket ⇄ `@dnd/server` ⇄ stdin/stdout ⇄ `claude` ⇄ stdio MCP ⇄
`@dnd/mcp` ⇄ SQLite.

## Commands

```bash
npm run play        # build the UI and serve at localhost:5173
npm run server      # serve without rebuilding
npm run dev:web     # Vite dev server for UI work, alongside npm run server
npm test            # 580 tests
npm run typecheck   # strict TS across every package
```

## Conventions

- **Source-first packages.** No build step between packages; `exports` points at `src/*.ts`
  and both Vitest and tsc resolve it. Only `@dnd/web` builds, for the browser.
- **Strict TypeScript**, including `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes`. That last one is why optional fields are spread
  conditionally (`...(x === undefined ? {} : { x })`) rather than assigned undefined.
- **No native dependencies.** SQLite is `node:sqlite`. Keep it that way; a node-gyp build is
  a bad trade for a game you want to clone onto another machine.
- **Tests use scripted dice.** `scriptedRng([14, 5])` in `@dnd/engine/testing.ts` returns the
  faces you hand it, so tests assert exact outcomes instead of hunting for a seed. It throws
  if a value is out of range, so a rule that starts drawing a different number of dice fails
  loudly.
- **Secrets are stripped at the server, not in React.** `packages/server/src/table.ts` is
  the only spoiler boundary: an unrevealed profile note or story beat is never serialised,
  so no rendering bug can leak one. `table.test.ts` asserts the negatives.
- **Engine functions are pure and return events.** Mutating tools call `store.put(...)` then
  `store.commit(label, events)`. Forgetting `commit` loses the change on restart —
  `persistence.test.ts` enumerates every mutating tool and fails if one does not write
  through. Add new tools to that list.

## Storage model

State snapshots are the source of truth; events are an append-only journal beside them.

This is a deliberate departure from the original plan, which called for deriving state by
replaying events. A reducer would be a second implementation of the rules, and the two would
drift until every bug became "which one is right?". A campaign is a few kilobytes of JSON, so
snapshotting per step is cheap — and it gives `undo` for free, since reverting is restoring
the snapshot before.

## Gotchas that will cost you an hour

- **Never write to stdout in `@dnd/mcp`.** That is the MCP protocol channel; one
  `console.log` corrupts the stream and breaks the game in a way no unit test sees. Use
  `console.error`. `stdio.test.ts` spawns the real process partly to catch this.
- **The system prompt is snapshotted on a conversation's first request.** While iterating on
  `.claude/dm-prompt.md`, pass `--system-prompt-snapshot off` or your edits appear to do
  nothing.
- **Never pass `--bare`.** It ignores the subscription login and demands an API key.
- **Tests must set `DND_DB`.** The server and MCP entry points default to `./campaign.db`, so
  a test that spawns them without an override writes into the repo and leaks state between
  runs.
- **`/clear` does not reset the game.** The conversation resets, the engine does not, so
  `add_creature` then fails with "already exists". `reset_campaign` is the fix.

## Non-code files that matter

- `.claude/dm-prompt.md` — the standing contract for DM behaviour. As load-bearing as any
  source file; a change here alters the game more than most code does.
- `.claude/skills/play-dnd/SKILL.md` — session bootstrap: resume or create, character
  creation.
- `.claude/skills/make-art/SKILL.md` — how every asset in `packages/web/public/` was made:
  one conversation, one shared prompt block, and how to slice and wire the result.
- `PLAN.md` — the build plan, what each phase covered, and what was deliberately skipped.
- `playtests/` — real sessions with findings. The first one drove most of the engine's depth.
  **Run a playtest after changing rules or the prompt**, and write the findings down; they
  are worth more than another unit test at this point.

## Deliberately not built

Positioning (no grid, cover, flanking or reach), multiattack enforcement, and a spell
catalogue — `cast_spell` spends the slot and gives the save DC, and what the spell does is
the DM's to adjudicate. `PLAN.md` says why for each. Don't add them casually; each is a
project.

Content is SRD 5.1 under CC-BY-4.0. Never add Player's Handbook text.
