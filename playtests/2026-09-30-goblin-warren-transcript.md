I'll register Brann and set the scene.

---

---

The warren entrance is a wound in the hillside — a lintel of cracked stone half-swallowed by bramble, and behind it a shaft going straight down into standing black water. Twelve feet, maybe. The water at the bottom is skinned with scum and it does not move. The air coming up out of it is cold and smells like a thing left in a bucket.

**Brann listens at the tunnel mouth.** *(Perception, DC 12)*

He gets more than he came for. Under the slow drip of seep-water he picks out voices — two of them, small and nasal, somewhere off to the left where the shaft bottom opens into a passage. Not sentries. They're arguing, bored, the way you argue when you've been standing in cold water for hours. He hears sloshing as one of them shifts its weight, and the wet scrape of a blade being dragged idly along stone. Two, close, distracted, and *no one else* — no third voice, no answering call from deeper in. Whatever else lives down there is elsewhere right now.

He also hears how the sound carries. The shaft is a chimney. Anything he does in it, they'll hear.

---

**Brann climbs down the shaft, as quietly as he can.** *(Stealth, DC 15 — chain mail in a stone chimney over still water)*

---

The stone is slick with algae and the chain mail is a bag of coins strapped to his chest. Twelve feet down, six feet from the water, his boot skates off a wet knob of rock and he drops the rest of the way — not far, not hurt, but he lands *loud*, both feet into thigh-deep water, and the shaft throws the splash up and down its whole length like a struck bell.

The voices stop.

Then they start again, fast and sharp and coming closer, and there's the sound of two bodies pushing water hard.

---

**Two goblins come wading around the bend. Brann charges the nearest.**

---

**Round 1 — Goblin A** is fastest, splashing in low and quick with a notched scimitar.

---

It comes in under his guard, and the blade skates off the chain skirt at his hip with a sound like a shovel on gravel. Water sprays. Brann doesn't even rock back.

**Round 1 — Brann.** The charge is already happening; he just finishes it, driving forward off his back foot at the goblin in front of him.

---

The longsword comes down across the collarbone, through mail scraps and into the meat. The goblin folds sideways without a sound and goes under, face-down, its scimitar sinking beside it. It doesn't come back up — but it isn't finished either; one hand still spasms against the surface.

**Round 1 — Goblin B.** It sees its friend drop and it does not run. It comes in wide instead, around Brann's shield side, trying to get behind him where the shaft wall pins him.

---

Its footing betrays it. The water drags at the swing, the scimitar comes around slow and wide, and it buries the tip in the shaft wall an arm's length from Brann's ribs.

**Round 2 — Goblin A**, face-down in the water, is still dying.

---

A gout of bubbles breaks the surface beside Brann's boot. The thing is still alive down there, just barely, and it's drowning.

**Round 2 — Brann**, with the second goblin still swinging at him, presses the attack.

---

The goblin drops flat under the cut — just *sits down* in the water — and the longsword goes over its head and rings off stone. It comes up spitting, an arm's length closer than it was.

**Round 2 — Goblin B**, inside his reach now, stabs up at the gap under his arm.

---

That one finds a seam. The scimitar goes in under the arm where the mail is laced, and comes out red. Brann grunts and the water around his boots goes cloudy.

**Round 3 — Goblin A** is still under.

---

Its lungs give out. The spasming hand goes still and the bubbles stop. One more failure and it's gone.

**Round 3 — Brann.** He gets his shield between them and swings for the second one properly this time.

---

The blade takes it across the throat on the backswing. It sits down in the water like its strings were cut, and the black surface closes over it.

Both of them are down. Nothing else is moving in the tunnel.

---

---

**Brann searches the bodies and catches his breath.**

The second one is dead — he finds that out by turning it over, and the water has already gone out of its eyes. The first one is *not*. He hauls it up by the belt expecting a corpse and it coughs, a thin wet bark, and keeps breathing. Unconscious, ruined at the shoulder, but stubbornly alive. He rolls it onto a ledge of dry stone above the waterline, and it lies there with its chest going up and down, and now it's a decision he has to make later.

Between the two of them: ten silver, loose in a leather pouch and a knotted rag. Two scimitars, one still somewhere at the bottom of the pool. A half-eaten strip of something he chooses not to identify. And — pushed down inside the dead one's boot, dry — a brass key on a cord, too big and too well-made to be goblin work.

He leans back against the cold shaft wall and lets his breathing come down. The cut under his arm has stopped soaking and started stinging. **He's taken a real wound — 20 of 28 — but nothing that won't hold.** Deeper in, the passage runs on, and somewhere down it water is dripping into water at a steady, patient rate.

You have a brass key, a live prisoner, and eight hit points of damage on you. Brann's Second Wind is untouched, and this is a clean moment for a short rest if you want one — or you can leave it banked and keep moving. What does he do?

---

## PLAYTEST NOTES

Blunt list of engine friction, in the order it bit me.

**1. NPCs go "dying" instead of dead, with no way to opt out.**
This is the biggest one. A 7 HP goblin dropped to 0 entered `status: "dying"` with `unconscious`, and then I was obligated to roll `death_save` for it every round of a three-round fight. Standard 5e is that monsters die at 0 unless the attacker chooses non-lethal. The engine reverses the default and gives me no override. Consequences:

- It burned a turn slot per round on a creature that could never act.
- `end_combat` left me with two dying creatures and no clean way to resolve them, so I rolled their death saves out in narrative time — a judgment call the engine should have made for me.
- It genuinely changed the story: Goblin A *stabilised on a natural sequence of saves* and is now a live prisoner. That's a great scene, but I got it by accident, not by design, and a DM who wanted two dead goblins had no button to press.

What I wanted: a `lethal: true/false` flag on `attack_roll`/`apply_damage`, or a `dies_at_zero` property on `add_creature` defaulting to true for `kind: "npc"`.

**2. There is no `kill` / `set_status` tool.**
Related to the above. When fiction says a thing is dead — coup de grâce, drowned, thrown off a cliff — I have no way to say so. My only lever is `apply_damage` at a creature already on 0, which is a hack. I nearly fudged a drowning by calling it bludgeoning damage before deciding not to.

**3. Death saves at 0 HP underwater are nonsense and the engine can't know that.**
Both goblins were face-down in standing water. A submerged unconscious creature should not be making DC 10 flat saves. That's fine — it's a ruling — but there's no way to record "these saves are made at disadvantage / auto-fail" so the log now contains a sequence that contradicts the fiction I narrated around it. Even an optional `bonus` or `advantage` parameter on `death_save` would have let me be honest.

**4. `attack_roll` has no weapon concept, so I retype the weapon every call.**
Every swing meant re-specifying `1d8` / `str` / `+3` / `slashing` / `proficient`. Six calls, six chances to typo a damage bonus, and nothing would have caught it if I had. The goblins' scimitars were the same. Attacks should be definable on the creature and referenced by name.

**5. No multiattack / Extra Attack awareness.**
Brann is a level 3 fighter, so this didn't matter here, but the engine has no notion of a creature making two attacks on its turn — it's just two calls, with nothing checking that I'm entitled to them. At level 5 I'd be entirely on the honour system.

**6. No class resources at all.**
Second Wind, Hit Dice, spell slots, short and long rests. Brann finished the fight at 20/28 and the single most likely next player action — "I use Second Wind" — has no tool behind it. I'd have to `roll_dice("1d10+3")` and then `heal`, and nothing would stop the player doing it four times in a row. Same for Hit Dice on a short rest. `short_rest` / `long_rest` tools that actually gate the resources would carry a lot of weight.

**7. No positioning, and it showed.**
I wrote "it comes around your shield side", "the shaft wall pins you", "it's inside your reach now" — all of it pure decoration, none of it mechanical. Cover, flanking, reach, and opportunity attacks don't exist. I also had two combatants in thigh-deep water and no way to express difficult terrain except by not expressing it. I chose not to hand out ad-hoc disadvantage because it would have been invisible in the log; a `terrain` or generic per-creature modifier would have let me make the water matter.

**8. `skill_check` accepted `stealth` for a character who isn't proficient — correct, but silent about it.**
The result read `[4] +2 = 6` and I had to infer that the +2 was bare DEX with no proficiency. It's right, but the narration should say whether proficiency applied. When I'm checking the engine's work — which the DM brief tells me to do rather than trust my memory — "+2" alone doesn't distinguish "unproficient DEX" from "I typo'd something".

**9. Armour and shields are a flat number with no provenance.**
AC 16 went in as an integer. Nothing knows Brann is in chain mail, so nothing can apply the stealth disadvantage that chain mail imposes in 5e. I narrated the noise of the armour and rolled a straight check, which is mechanically wrong for the equipment described in the character brief. That's a real rules error the engine had no way to prevent.

**10. Minor: no tool reports whose turn it is without advancing it.**
`get_combat_state` does exist and I used none of it because `next_turn` echoes the actor. That's fine. But `next_turn` is the only way to move the marker, and there's no `undo` — if I advance past a player who hadn't finished their turn, I can't go back.

**11. One thing the engine got exactly right, worth keeping:**
`attack_roll` resolving to-hit, damage, HP application, and `droppedToZero` in a single call is the correct shape. The `narration` string is genuinely usable, and `droppedToZero` / `instantDeath` / `concentrationDc` being separate booleans in the payload meant I never had to parse prose to know what happened next. Whatever else changes, don't split that back into three calls.

**12. Scope note, not an engine issue:** the brief said to run the fight to a finish but also not to decide anything Brann does beyond the listed actions. Those conflict from round 2 onward. I read "I charge the nearest one" as a standing intent to keep fighting the engaged enemy and kept swinging. If you'd rather I stop and ask on every player turn, say so and I'll run it that way.