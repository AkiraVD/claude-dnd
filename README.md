# Dice Tower

Solo D&D 5e with Claude as Dungeon Master, in the browser.

The rules live in a real engine. Claude narrates; it does not decide what the dice say.

```
┌──────────────── browser ────────────────┐
│  console (prose + dice cards)  │ panels │
└────────────────┬───────────────┴────────┘
                 │ WebSocket
┌────────────────▼────────────────────────┐
│  @dnd/server — one long-lived `claude`  │
│  child, stream-json in and out          │
└────────────────┬────────────────────────┘
                 │ stdio MCP
┌────────────────▼────────────────────────┐
│  @dnd/mcp — 44 tools over @dnd/engine   │
│  campaigns in SQLite                    │
└─────────────────────────────────────────┘
```

## Running it

Requires Node 22+ and Claude Code signed in (`claude auth status`). It runs on your
Claude subscription — there is no API key anywhere in this project.

```bash
npm install
npm run play          # builds the UI, then serves at http://localhost:5173
```

Then open the page and say hello, in any language. The DM follows whatever you write in.

To play in the terminal instead, run `claude` in this directory, approve the `dnd` server
once, and type `/play-dnd`.

| Command | What it does |
|---|---|
| `npm run play` | Build the UI and start the table |
| `npm run server` | Start the table without rebuilding |
| `npm run dev:web` | Vite dev server for UI work (run `npm run server` alongside) |
| `npm test` | 339 tests |
| `npm run typecheck` | Strict TypeScript across every package |

| Variable | Default | Purpose |
|---|---|---|
| `DND_DB` | `./campaign.db` | Where campaigns live |
| `DND_SEED` | clock | Pin the dice for a reproducible campaign |
| `DND_CAMPAIGN` | most recent | Load a specific campaign id |
| `PORT` | `5173` | Web port |

## Packages

| Package | What it is |
|---|---|
| `@dnd/engine` | The rules. Pure, seeded, no I/O. Dice, checks, combat, damage, rests, spells, levelling |
| `@dnd/content` | SRD 5.1 data: abilities, skills, conditions, damage types, the 12 classes, spell slot tables |
| `@dnd/mcp` | The engine as 44 MCP tools, with campaigns persisted to SQLite |
| `@dnd/server` | Runs the DM as a child process and bridges it to the browser |
| `@dnd/web` | React console and panels |

## The design decision everything rests on

**The engine is authoritative; Claude only narrates.**

An LLM asked to roll a d20 produces whatever number the story wants, and quietly forgets
you are at 4 hit points. So every mechanical outcome comes back from a tool call, the tool
result is the truth, and the engine rejects illegal actions — no third-level spell with no
slots left, no Second Wind twice in one fight. Claude gets the result and a one-line hint,
and turns that into prose.

Two consequences worth knowing:

- **The DM has no filesystem and no shell.** The child process runs with `--tools ""`, so
  it holds the game tools and nothing else. There is no blast radius to reason about.
- **Every change is a persisted step.** Quit mid-combat and come back to the same round.
  `undo` reverts the last change, which falls out of storing a snapshot per step rather
  than replaying events.

## Development notes

- `PLAN.md` — the build plan and what each phase covered.
- `playtests/` — real sessions, with what the engine got wrong. Findings from the first one
  drove most of the engine's depth.
- `.claude/dm-prompt.md` — the standing contract for how the DM behaves. As load-bearing as
  any source file; changes here change the game more than most code does.

Content is SRD 5.1 under CC-BY-4.0. See `packages/content/ATTRIBUTION.md`. Do not add
Player's Handbook text.
