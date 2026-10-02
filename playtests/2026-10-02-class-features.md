# Class features, 2026-10-02 — Second Wind that was never spent

Not a playtest. A finding from a test battle (session `wkhem5`, a throwaway
campaign) that the player brought back, and the fix for it.

## What happened

A fighter 3 was in a fight the DM narrated using Second Wind and Action Surge.
The question asked was whether the engine had handled it. Reading the journal
for that session — 26 steps — the answer was half and half:

- Both resources existed. The DM had called `add_resource` twice, with sensible
  labels and the right `short-rest` recharge, so the engine knew about them.
- Neither was ever spent. No `spend_resource` in any of the 26 steps, and no
  `heal` either. Both counters still read 1 of 1 at the end of the battle, and
  the hit points Second Wind describes were never applied.

So the prose said one thing and the sheet said another, and nothing in the system
disagreed with either.

## Finding 1 — class features existed only if the DM remembered them (fixed)

The engine counted anything with uses and refused to spend past empty, which is
the hard part and it already worked. What it did not have was any idea *which*
abilities a class has. `classes.ts` carried the hit die, saves, caster type and
skills; `createCreature` granted hit dice and spell slots. Everything else —
Second Wind, Rage, ki, Channel Divinity — arrived only when a DM thought to call
`add_resource`.

That is the test in CLAUDE.md almost word for word: a DM gets it right twice and
forgets at hour three, and then nothing stops a fighter using Second Wind in
every round of a fight, because as far as the engine is concerned there is no
such thing.

Fixed with `CLASS_FEATURES` in `@dnd/content`: every base-class feature that has
a counter, by level, SRD 5.1. `createCreature` grants them and `levelUp` grows
them, the way spell slots already worked. A maximum that depends on the character
rather than the level — Bardic Inspiration is a Charisma modifier, Lay on Hands
is five hit points a level — stays symbolic in the data and is resolved in the
engine, where the ability-modifier rule already lives.

Only counters. Fighting Style, Extra Attack and Sneak Attack are real rules with
nothing to track, and the engine has no opinion about them.

## Finding 2 — the prompt already said to spend it

Worth recording, because it is the argument for the whole change. The DM prompt
has said **"Limited abilities are `spend_resource`"** — naming Second Wind and
Action Surge specifically — since the section was written. The DM in `wkhem5` had
that instruction and narrated around it anyway.

A rule that lives only in the prompt is a rule that holds until the model is busy.
The prompt now also says plainly that narrating one without spending it is the
failure mode, and that Second Wind heals so `heal` has to follow — but the reason
to expect improvement is the engine owning the counter, not the extra paragraph.

## Deliberately left alone

Characters already in play. A saved snapshot is not rewritten on load, so Brann
keeps exactly the sheet that was saved; `levelUp` rebuilds from the table, so the
features appear at the next level, and `add_resource` still tops one up by hand.
The alternative — granting on load — would have fixed every live campaign at once
and changed a saved sheet without anyone asking. That trade went to predictability.

## Still open

Level 20 Barbarian is unlimited rages, and there is no number for that, so the
table stops at six. Subclass features are out of scope entirely. Divine
Intervention recharges on a seven-day clock the engine has no concept of.
