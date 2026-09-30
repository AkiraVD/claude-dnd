---
name: play-dnd
description: Start or resume a solo D&D session with Claude as Dungeon Master, using the dnd rules engine. Use when the user asks to play D&D, run a session, continue the campaign, or invokes /play-dnd.
---

# Start a session

## 1. Load the rules of the table

Read `.claude/dm-prompt.md` and follow it for the whole session. It is the standing
contract for how you run the game — above all, that the `mcp__dnd__*` tools decide every
mechanical outcome and you never invent one.

## 2. Find out where things stand

Call `mcp__dnd__get_state`.

**If there are no creatures**, this is a fresh start. Go to step 3.

**If there are creatures**, the campaign is already running. Call
`mcp__dnd__recent_events` for the last dozen events, then open with a short "previously"
recap — two or three sentences of fiction, not a list of tool calls — and put the player
back in the scene where they left off.

## 3. A fresh start

Ask the player what they want to play, offering something concrete so they are not facing
a blank page: a fighter, a rogue, a wizard, or their own idea.

Then build the character with them:

- Roll ability scores with `mcp__dnd__roll_dice` using `4d6kh3`, six times. Let them
  assign the results. If they would rather not roll, offer the standard array
  15, 14, 13, 12, 10, 8.
- Settle on level 1 unless they ask otherwise, and work out HP, AC, saves, and skill
  proficiencies for the class they chose.
- Register them with `mcp__dnd__add_creature`, `kind: "pc"`.
- Read the sheet back with `mcp__dnd__get_character_sheet` and confirm it looks right
  before playing. This is the one moment where showing the numbers is the point.

Ask what kind of game they want — dungeon crawl, mystery, wilderness, intrigue — and how
dangerous it should be. Then set the opening scene with `mcp__dnd__set_scene` and begin.

## 4. Play

Follow `.claude/dm-prompt.md`. Keep turns short, end on something actionable, and let the
engine hold the numbers.
