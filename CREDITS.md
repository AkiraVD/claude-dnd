# Credits

## Item icons

`packages/web/public/items/*.svg` come from [game-icons.net](https://game-icons.net),
used under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).

Each file was modified in two ways: the opaque black backing square was removed, and
the glyph's `fill` was changed to `currentColor` so it takes the page's text colour.

By artist:

- **carl-olsen** (1) — crossbow
- **caro-asercion** (1) — potion-healing
- **delapouite** (17) — antitoxin, bedroll, caltrops, crowbar, gold-coins, handaxe, healers-kit, oil-flask, quarterstaff, quiver, rope, spellbook, thieves-tools, tinderbox, torch, warhammer, waterskin
- **lorc** (23) — chain-shirt, chest, component-pouch, crown, dagger, gem, grappling-hook, greataxe, helm, holy-symbol, lantern, leather-armour, longsword, mace, manacles, orb, potion-poison, rapier, rations, scroll, shortbow, spear, wand
- **lucasms** (1) — silver-locket
- **sbed** (1) — key
- **skoll** (1) — shortsword
- **willdabeast** (1) — shield

## Everything else

Scenery and the setup background were generated locally with Stable Diffusion (SDXL) and
are not third-party work.

The sixty-six NPC portraits and the fifty-creature bestiary came from OpenAI's GPT Image, cut out of three generated
sheets — four of twenty-five and one of sixteen. Each sheet was asked for as an evenly
spaced grid on one plain dark background with a roster given in reading order, so the
cells could be sliced at a fixed stride and named without guessing. The sixteen that were
originally made locally were regenerated this way so the library reads as one set.

The twelve class cards, the nine race cards, the seven adventure cards and the eleven
difficulty, tone and rules cards were generated
with OpenAI's GPT Image from a shared prompt: one fixed block for framing, light and style,
with only the subject clause changed per card. Each set was produced in a single
conversation so that block stayed in context. That block is what gives a set its common
look — there is no seed to pin, so the consistency comes from the prompt.

The twelve class cards are each a different person — a different face, race and gender —
so the picker never implies a class belongs to one kind of people. The pairings are the
classic ones: half-orc barbarian, half-elf bard, human cleric, elf druid, human fighter,
human monk, dragonborn paladin, elf ranger, halfling rogue, dragonborn sorcerer, tiefling
warlock, human wizard. Six are women and six are men, and where a race appears twice it
appears as one of each.

The race cards each show a man and a woman of that people in traditional dress, so the
card shows a people rather than a person and the picker implies nothing about gender.

The adventure cards are places rather than people, and carry no figure close enough to
read a face — the card describes the kind of game, not who you are in it.

The difficulty, tone and rules cards are scenes with people in them, figures held at
middle distance so the scene is the subject rather than any one face. They describe
abstractions, so the thing shown is what the abstraction costs somebody: a hand out of a
stream, a bandage at a campfire, a bench gone over in a taproom.

Game content is SRD 5.1, CC BY 4.0. See the note in CLAUDE.md.
