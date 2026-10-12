---
name: play-dnd
description: Start or resume a solo D&D session with Claude as Dungeon Master, using the dnd rules engine. Use when the user asks to play D&D, run a session, continue the campaign, or invokes /play-dnd.
---

# Start a session

## 1. Load the rules of the table

Read `.claude/dm-prompt.md` and follow it for the whole session. It is the standing
contract for how you run the game — above all, that the `mcp__dnd__*` tools decide every
mechanical outcome and you never invent one.

## 2. Match the player's language

Reply in whatever language the player used. If their first message is in Vietnamese, run
the session in Vietnamese; the same for any other language. `.claude/dm-prompt.md` has the
rule for handling game terms — natural word in their language, English term bracketed on
first use.

If they invoked `/play-dnd` with no other text and you have nothing to go on, greet them in
English and let their reply set the language.

## 3. Find out where things stand

Campaigns are saved to disk and the engine loads the most recent one on start, so you are
usually resuming rather than beginning. Call `mcp__dnd__recap`.

**If it has creatures**, the campaign is already running. The recap gives you the backbone,
the whole cast with everything recorded about them including what is still hidden, the
scene, the party with current HP and conditions, whether a fight is mid-round, and the
recent mechanical events. Read the backbone and the cast before you write a word: they are
the only reason this session is the same story as the last one.

Open with two or three sentences of "previously" — fiction, not a list of
tool calls — then put the player back exactly where they stopped. If combat was still
running, say whose turn it is and hand straight over.

**If it has no creatures**, this is a fresh start. Go to step 4.

If the player asks for a different campaign, `mcp__dnd__list_campaigns` and
`mcp__dnd__load_campaign` switch between them. `mcp__dnd__new_campaign` starts a separate
one without touching the current save — use it rather than clearing the board, unless the
player explicitly wants this campaign wiped.

## 4. A fresh start

**The browser may have asked already.** On a fresh campaign the web console shows a setup
form — language first, then Character, Adventure, Difficulty, Rules and Tone — and sends
the answers as the player's first message. The Character tab carries the name, the portrait,
the race, the class and a story starter together, because the picture decides the race and
the sex and asking for them separately only let them disagree with it. If that message
already tells you what they want, do not ask again; acknowledge it and get on with building.
Anything they left blank is still yours to ask about.

**The portrait is already chosen, and it is the player's.** The brief names it and asks you
to set it with `mcp__dnd__update_npc` once the character exists. Do that; it is the face the
player picked and the one they are looking at. Never hand it to an NPC as well — the engine
rejects a portrait already in use and names who holds it, and `get_portraits` leaves the
taken ones out, so meeting your own double in the first tavern cannot happen by accident.

If nothing arrived, ask what they want to play, offering something concrete so they are
not facing a blank page: a fighter, a rogue, a wizard, or their own idea.

Then build the character with them:

- Roll ability scores with `mcp__dnd__roll_dice` using `4d6kh3`, six times. Let them
  assign the results. If they would rather not roll, offer the standard array
  15, 14, 13, 12, 10, 8.
- Settle on level 1 unless they ask otherwise.
- Register them with `mcp__dnd__add_creature`, `kind: "pc"`, and **pass `class_name`** — that
  fills in the hit die, save proficiencies, hit dice and spell slots so you do not have to
  work them out. Give them their `attacks` and their `armour` in the same call, with
  `stealth_disadvantage: true` for anything heavy.
- Add class features as resources with `mcp__dnd__add_resource`: Second Wind for a fighter,
  ki for a monk, Channel Divinity for a cleric. Spell slots and hit dice come with the class
  already.
- Read the sheet back with `mcp__dnd__get_character_sheet` and confirm it looks right
  before playing. This is the one moment where showing the numbers is the point.

Ask what kind of game they want — dungeon crawl, mystery, wilderness, intrigue — and how
dangerous it should be, unless the setup form already said.

**Then write the backbone before the first scene.** `mcp__dnd__set_story` takes the
premise, the question under it, what is actually going on, and the beats that follow if
nothing disturbs them. This is what survives a `/clear`; without it the campaign becomes a
different campaign two sessions in. Write three to five beats, and read `.claude/dm-prompt.md`
on how little they bind you.

Create the key characters the backbone turns on with `mcp__dnd__add_creature` — leave the
stats out for a non-combatant — then `mcp__dnd__update_npc` for who they are and
`mcp__dnd__add_note` for what they want and what they are hiding. Mark them
`principal: true`. Notes stay hidden until the player earns them, so write the real ones.

Then set the opening scene with `mcp__dnd__set_scene` and begin.

Once the campaign has a shape, give it a name with `mcp__dnd__rename_campaign` so the player
recognises it in the list next time.

## 5. Play

Follow `.claude/dm-prompt.md`. Keep turns short, end on something actionable, and let the
engine hold the numbers.
