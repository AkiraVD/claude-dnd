import {
  ABILITIES,
  CLASS_LIST,
  BESTIARY,
  BESTIARY_LIST,
  PORTRAITS,
  PORTRAIT_LIST,
  CONDITION_LIST,
  DAMAGE_TYPES,
  SKILL_LIST,
  type ClassName,
  type Condition,
  type Skill,
} from '@dnd/content'
import {
  DiceError,
  RulesError,
  abilityCheck,
  addCondition,
  applyDamage,
  applyTempHp,
  attack,
  concentrationSave,
  createCreature,
  currentActor,
  deathSave,
  endCombat,
  formatDiceResult,
  heal,
  lifeStatus,
  nextTurn,
  profBonus,
  removeCondition,
  removeFromCombat,
  rollDice,
  savingThrow,
  setExhaustion,
  skillCheck,
  stabilise,
  startCombat,
  startConcentration,
  attackWith,
  availableSlots,
  awardXp,
  castSpell,
  learnSpell,
  combineAdvantage,
  kill,
  levelUp,
  longRest,
  shortRest,
  skillConditionAdvantage,
  spellcasting,
  spendHitDie,
  spendResource,
  COMMONER,
  abandonBeat,
  addBeat,
  addNote,
  amendStory,
  beatsAhead,
  buy,
  createStory,
  earn,
  formatCoin,
  giveItem,
  reachBeat,
  revealBeat,
  revealNote,
  sell,
  setPresence,
  spend,
  stockFor,
  takeItem,
  updateProfile,
  type Advantage,
  type D20TestResult,
  type Creature,
  type GameEvent,
} from '@dnd/engine'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { brief, describeTest, sheet, signed, stateSummary } from './format.js'
import type { GameStore } from './store.js'

// CONDITION_LIST and SKILL_LIST come from Object.keys, which loses tuple-ness;
// z.enum needs a non-empty tuple. The lists are never empty.
const conditionEnum = z.enum(CONDITION_LIST as [Condition, ...Condition[]])
const skillEnum = z.enum(SKILL_LIST as [Skill, ...Skill[]])
const abilityEnum = z.enum(ABILITIES)
const damageTypeEnum = z.enum(DAMAGE_TYPES)
const advantageEnum = z.enum(['none', 'advantage', 'disadvantage'])
const classEnum = z.enum(CLASS_LIST as [ClassName, ...ClassName[]])
const attitudeEnum = z.enum(['hostile', 'unfriendly', 'indifferent', 'friendly', 'helpful'])

/** Coin and goods, with the copper total spelled out so nobody has to divide. */
function purseView(creature: Creature) {
  return {
    purse: formatCoin(creature.purse),
    purseCopper: creature.purse,
    items: creature.items.map((item) => ({
      name: item.name,
      qty: item.qty,
      ...(item.notes === undefined ? {} : { notes: item.notes }),
      ...(item.price === undefined ? {} : { price: formatCoin(item.price), forSale: true }),
    })),
  }
}

/** The whole profile, hidden notes included. Only the DM ever calls this. */
function profileView(creature: Creature) {
  const { notes, ...rest } = creature.profile
  return {
    ...rest,
    presence: creature.presence,
    known: notes.filter((note) => note.revealed).map((note) => note.text),
    hidden: notes.filter((note) => !note.revealed).map((note) => note.text),
  }
}

function ok(narration: string, data: Record<string, unknown> = {}): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ narration, ...data }, null, 2) }],
  }
}

function fail(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/**
 * Every handler runs inside this. A rules violation or bad dice notation comes
 * back as a failed tool result carrying the reason, so the DM can adapt instead
 * of seeing a stack trace — anything else is a real bug and should surface.
 */
/**
 * Record a d20 test: the journal entry plus the snapshot that carries the dice
 * position forward.
 *
 * Any tool that consumes randomness has to commit, even a "read-only" check —
 * otherwise the roll happens, the generator advances, and a restart replays the
 * same dice.
 */
function commitTest(
  store: GameStore,
  tool: string,
  actor: string,
  label: string,
  test: D20TestResult,
): void {
  store.commit(tool, [
    {
      t: 'check',
      actor,
      label,
      natural: test.natural,
      total: test.total,
      ...(test.dc === undefined ? {} : { dc: test.dc }),
      ...(test.success === undefined ? {} : { success: test.success }),
    },
  ])
}

function guard(run: () => CallToolResult): CallToolResult {
  try {
    return run()
  } catch (error) {
    if (error instanceof RulesError || error instanceof DiceError) return fail(error.message)
    throw error
  }
}

export function registerTools(server: McpServer, store: GameStore): void {
  // ── dice ─────────────────────────────────────────────────────────────────────

  server.registerTool(
    'roll_dice',
    {
      title: 'Roll dice',
      description:
        'Roll dice notation and return the faces and total. Supports 2d6+3, 4d6kh3 (keep highest 3), ' +
        '2d20kh1 (advantage), 2d20kl1 (disadvantage), 1d6r1 (reroll 1s once), 1d6! (exploding). ' +
        'Use this for any roll that is not already covered by a more specific tool.',
      inputSchema: {
        notation: z.string().describe('Dice notation, e.g. "2d6+3"'),
        purpose: z.string().optional().describe('What the roll is for, recorded in the log'),
      },
    },
    ({ notation, purpose }) =>
      guard(() => {
        const result = rollDice(notation, store.rng)
        store.commit('roll_dice', [
          {
            t: 'roll',
            notation,
            total: result.total,
            ...(purpose === undefined ? {} : { purpose }),
          },
        ])
        return ok(formatDiceResult(result), {
          total: result.total,
          ...(purpose === undefined ? {} : { purpose }),
        })
      }),
  )

  // ── creatures ────────────────────────────────────────────────────────────────

  server.registerTool(
    'add_creature',
    {
      title: 'Add a creature',
      description:
        'Put a player character, NPC, or monster into the scene. Ability scores are the raw ' +
        '1-30 values; modifiers, saves, and skill bonuses are derived from them. Leave the ' +
        'scores, HP and AC out for a non-combatant and they get the SRD commoner block \u2014 ' +
        'record the innkeeper, it costs you a name.',
      inputSchema: {
        id: z.string().describe('Short stable id, e.g. "brann" or "goblin-a"'),
        name: z.string(),
        kind: z.enum(['pc', 'npc']).optional().describe('Defaults to npc'),
        level: z.number().int().min(1).max(20).optional().describe('Defaults to 1'),
        str: z.number().int().min(1).max(30).optional(),
        dex: z.number().int().min(1).max(30).optional(),
        con: z.number().int().min(1).max(30).optional(),
        int: z.number().int().min(1).max(30).optional(),
        wis: z.number().int().min(1).max(30).optional(),
        cha: z.number().int().min(1).max(30).optional(),
        max_hp: z.number().int().min(1).optional(),
        hp: z.number().int().min(0).optional().describe('Current HP; defaults to max'),
        ac: z.number().int().min(0).optional(),
        speed: z.number().int().min(0).optional().describe('Defaults to 30'),
        save_proficiencies: z.array(abilityEnum).optional(),
        skill_proficiencies: z.array(skillEnum).optional(),
        expertise: z.array(skillEnum).optional().describe('Must also appear in skill_proficiencies'),
        resistances: z.array(damageTypeEnum).optional(),
        vulnerabilities: z.array(damageTypeEnum).optional(),
        immunities: z.array(damageTypeEnum).optional(),
        class_name: classEnum
          .optional()
          .describe(
            'Fills in hit die, save proficiencies, hit dice, and spell slots for the level. ' +
              'Anything you pass explicitly wins over the class default.',
          ),
        xp: z.number().int().min(0).optional(),
        purse: z.string().optional().describe('Coin carried, e.g. "8 gp 4 sp"'),
        race: z.string().optional(),
        pronouns: z
          .string()
          .optional()
          .describe(
            'e.g. "he/him". Filled from the portrait when you leave it out, since the picture ' +
              'is what the player can see; pass it to override, or for a portrait that commits ' +
              'to nothing.',
          ),
        role: z.string().optional().describe('e.g. "quartermaster"'),
        attitude: attitudeEnum.optional(),

        armour: z
          .object({
            name: z.string(),
            stealth_disadvantage: z
              .boolean()
              .optional()
              .describe('True for heavy armour. Applied automatically to stealth checks.'),
          })
          .optional(),
        attacks: z
          .array(
            z.object({
              name: z.string().describe('What the player calls it, e.g. "longsword"'),
              ability: abilityEnum,
              damage: z.string().describe('Dice only, e.g. "1d8"'),
              damage_type: damageTypeEnum,
              proficient: z.boolean().optional().describe('Defaults to true'),
              damage_bonus: z
                .number()
                .int()
                .optional()
                .describe('Defaults to the ability modifier, which is the usual rule'),
              attack_bonus: z.number().int().optional().describe('Magic weapon bonus'),
              range: z.enum(['melee', 'ranged']).optional(),
              crit_on: z.number().int().min(2).max(20).optional(),
              notes: z.string().optional().describe('Informational, e.g. "finesse, versatile (1d10)"'),
            }),
          )
          .optional()
          .describe(
            'Define weapons once here, then use them by name with attack_roll. Far less error ' +
              'prone than retyping the dice and bonus on every swing.',
          ),
        spells: z
          .array(
            z.object({
              name: z.string(),
              level: z.number().int().min(0).max(9).describe("The spell's own level; 0 for a cantrip"),
              effect: z
                .string()
                .max(160)
                .optional()
                .describe('One line on what it does, in your words — shown to the player'),
            }),
          )
          .optional()
          .describe(
            'Spells this creature knows, each with a line on what it does. Write these down ' +
              'when you build a caster: the player sees them in their options panel with your ' +
              'description, instead of having to remember. Nothing is enforced — casting is ' +
              'gated on the slot, not on this list.',
          ),
        dies_at_zero: z
          .boolean()
          .optional()
          .describe(
            'Whether 0 HP kills outright. Defaults to true for npc and false for pc. ' +
              'Death saving throws are a player-character rule; monsters just die. Set false ' +
              'for a named villain or an NPC ally who should get death saves.',
          ),
      },
    },
    (args) =>
      guard(() => {
        const creature = createCreature({
          id: args.id,
          name: args.name,
          ...(args.kind === undefined ? {} : { kind: args.kind }),
          ...(args.level === undefined ? {} : { level: args.level }),
          // Anything left out falls back to the SRD commoner, so writing down an
          // innkeeper costs a name rather than six invented ability scores.
          scores: {
            str: args.str ?? COMMONER.scores.str,
            dex: args.dex ?? COMMONER.scores.dex,
            con: args.con ?? COMMONER.scores.con,
            int: args.int ?? COMMONER.scores.int,
            wis: args.wis ?? COMMONER.scores.wis,
            cha: args.cha ?? COMMONER.scores.cha,
          },
          maxHp: args.max_hp ?? COMMONER.maxHp,
          ...(args.hp === undefined ? {} : { hp: args.hp }),
          ac: args.ac ?? COMMONER.ac,
          ...(args.speed === undefined ? {} : { speed: args.speed }),
          // Spread conditionally rather than defaulting to []: createCreature
          // fills saves in from the class only when the field is *undefined*,
          // and an empty array is a caller saying "none", which silently threw
          // away a fighter's STR/CON proficiencies.
          proficiencies: {
            ...(args.save_proficiencies === undefined
              ? {}
              : { saves: args.save_proficiencies }),
            ...(args.skill_proficiencies === undefined
              ? {}
              : { skills: args.skill_proficiencies }),
            ...(args.expertise === undefined ? {} : { expertise: args.expertise }),
          },
          defenses: {
            resistances: args.resistances ?? [],
            vulnerabilities: args.vulnerabilities ?? [],
            immunities: args.immunities ?? [],
          },
          ...(args.dies_at_zero === undefined ? {} : { diesAtZero: args.dies_at_zero }),
          ...(args.class_name === undefined ? {} : { className: args.class_name }),
          ...(args.xp === undefined ? {} : { xp: args.xp }),
          ...(args.purse === undefined ? {} : { purse: args.purse }),
          profile: {
            ...(args.race === undefined ? {} : { race: args.race }),
            ...(args.pronouns === undefined ? {} : { pronouns: args.pronouns }),
            ...(args.role === undefined ? {} : { role: args.role }),
            ...(args.attitude === undefined ? {} : { attitude: args.attitude }),
          },
          ...(args.armour === undefined
            ? {}
            : {
                armour: {
                  name: args.armour.name,
                  ...(args.armour.stealth_disadvantage === undefined
                    ? {}
                    : { stealthDisadvantage: args.armour.stealth_disadvantage }),
                },
              }),
          ...(args.spells === undefined
            ? {}
            : {
                spells: args.spells.map((sp) => ({
                  name: sp.name,
                  level: sp.level,
                  ...(sp.effect === undefined ? {} : { effect: sp.effect }),
                })),
              }),
          attacks: (args.attacks ?? []).map((a) => ({
            name: a.name,
            ability: a.ability,
            damage: a.damage,
            damageType: a.damage_type,
            ...(a.proficient === undefined ? {} : { proficient: a.proficient }),
            ...(a.damage_bonus === undefined ? {} : { damageBonus: a.damage_bonus }),
            ...(a.attack_bonus === undefined ? {} : { attackBonus: a.attack_bonus }),
            ...(a.range === undefined ? {} : { range: a.range }),
            ...(a.crit_on === undefined ? {} : { critOn: a.crit_on }),
            ...(a.notes === undefined ? {} : { notes: a.notes }),
          })),
        })
        store.add(creature)
        store.commit('add_creature', [
          { t: 'creature-added', id: creature.id, name: creature.name, kind: creature.kind },
        ])
        return ok(`${creature.name} added at ${creature.hp.current}/${creature.hp.max} HP, AC ${creature.ac}`, {
          sheet: sheet(creature),
        })
      }),
  )

  server.registerTool(
    'remove_creature',
    {
      title: 'Remove a creature',
      description: 'Delete a creature from the scene entirely. Use for cleanup between encounters.',
      inputSchema: { id: z.string() },
    },
    ({ id }) =>
      guard(() => {
        const name = store.creature(id).name
        store.remove(id)
        store.commit('remove_creature', [{ t: 'creature-removed', id, name }])
        return ok(`${name} removed from the scene`)
      }),
  )

  server.registerTool(
    'get_character_sheet',
    {
      title: 'Read a character sheet',
      description:
        'The full sheet: HP, AC, ability scores with derived modifiers and saves, proficient ' +
        'skills, conditions, defenses, and death saves when dying. Read this instead of ' +
        'recalling numbers from earlier in the conversation.',
      inputSchema: { id: z.string() },
    },
    ({ id }) => guard(() => ok(`Sheet for ${store.creature(id).name}`, { sheet: sheet(store.creature(id)) })),
  )

  server.registerTool(
    'get_state',
    {
      title: 'Read the whole scene',
      description:
        'The current scene description, every creature with HP and conditions, and the combat ' +
        'round and turn order if a fight is running.',
      inputSchema: {},
    },
    () => guard(() => ok('Current state', stateSummary(store))),
  )

  server.registerTool(
    'set_scene',
    {
      title: 'Set the scene',
      description:
        'Record where the party is, in a sentence or two. Pass `backdrop` to change the art ' +
        'behind it in the browser \u2014 the player sees one of several pre-rendered images for ' +
        'that kind of place, picked from the scene text so it stays put while the scene does.',
      inputSchema: {
        scene: z.string(),
        backdrop: z
          .enum(['tavern', 'dungeon', 'road', 'city', 'ruins'])
          .nullable()
          .optional()
          .describe('The kind of place. Null clears the art. Omit to leave it as it was.'),
      },
    },
    ({ scene, backdrop }) =>
      guard(() => {
        store.setScene(scene, backdrop)
        store.commit('set_scene', [{ t: 'scene', scene }])
        return ok(`Scene set: ${scene}`, {
          scene,
          backdrop: store.backdrop,
        })
      }),
  )

  // ── checks and saves ─────────────────────────────────────────────────────────

  server.registerTool(
    'ability_check',
    {
      title: 'Roll an ability check',
      description:
        'A raw ability check, e.g. Strength to force a door. For anything covered by a skill, ' +
        'use skill_check instead so proficiency is applied.',
      inputSchema: {
        id: z.string(),
        ability: abilityEnum,
        dc: z.number().int().optional().describe('Omit to roll without setting a DC yet'),
        advantage: advantageEnum.optional(),
        bonus: z.number().int().optional().describe('Situational bonus or penalty'),
      },
    },
    ({ id, ability, dc, advantage, bonus }) =>
      guard(() => {
        const creature = store.creature(id)
        const test = abilityCheck({
          score: creature.scores[ability],
          ...(bonus === undefined ? {} : { bonus }),
          ...(advantage === undefined ? {} : { advantage }),
          ...(dc === undefined ? {} : { dc }),
          rng: store.rng,
        })
        commitTest(store, 'ability_check', creature.id, `${ability.toUpperCase()} check`, test)
        return ok(describeTest(`${creature.name} ${ability.toUpperCase()} check`, test), { test })
      }),
  )

  server.registerTool(
    'skill_check',
    {
      title: 'Roll a skill check',
      description:
        "Rolls the skill using the creature's own proficiency and expertise. Do not add " +
        'proficiency yourself — it comes off the sheet.',
      inputSchema: {
        id: z.string(),
        skill: skillEnum,
        dc: z.number().int().optional(),
        advantage: advantageEnum.optional(),
        bonus: z.number().int().optional(),
      },
    },
    ({ id, skill, dc, advantage, bonus }) =>
      guard(() => {
        const creature = store.creature(id)
        const proficient = creature.proficiencies.skills.includes(skill)
        const expertise = creature.proficiencies.expertise.includes(skill)

        // Heavy armour on stealth, exhaustion, poisoned — things the creature
        // carries with it. The playtest narrated chain mail and then rolled a
        // straight check, because nothing knew what it was wearing.
        const fromCreature = skillConditionAdvantage(creature, skill)
        const effective = combineAdvantage([
          ...(advantage === undefined ? [] : [advantage as Advantage]),
          ...fromCreature,
        ])

        const test = skillCheck({
          skill,
          scores: creature.scores,
          profBonus: profBonus(creature),
          proficient,
          expertise,
          ...(bonus === undefined ? {} : { bonus }),
          advantage: effective,
          ...(dc === undefined ? {} : { dc }),
          rng: store.rng,
        })
        commitTest(store, 'skill_check', creature.id, `${skill} check`, test)

        // Spell out where the modifier came from: "+2" alone does not tell the DM
        // whether proficiency applied or whether something was mistyped.
        const source = expertise
          ? 'ability + double proficiency (expertise)'
          : proficient
            ? 'ability + proficiency'
            : 'ability only, not proficient'

        return ok(describeTest(`${creature.name} ${skill} check`, test), {
          test,
          proficient,
          expertise,
          modifierFrom: source,
          ...(fromCreature.length > 0
            ? { advantageFromCreature: fromCreature, armour: creature.armour?.name ?? null }
            : {}),
        })
      }),
  )

  server.registerTool(
    'saving_throw',
    {
      title: 'Roll a saving throw',
      description:
        "Rolls the save using the creature's own save proficiency. Do not add proficiency yourself.",
      inputSchema: {
        id: z.string(),
        ability: abilityEnum,
        dc: z.number().int(),
        advantage: advantageEnum.optional(),
        bonus: z.number().int().optional(),
      },
    },
    ({ id, ability, dc, advantage, bonus }) =>
      guard(() => {
        const creature = store.creature(id)
        const test = savingThrow({
          score: creature.scores[ability],
          profBonus: profBonus(creature),
          proficient: creature.proficiencies.saves.includes(ability),
          ...(bonus === undefined ? {} : { bonus }),
          ...(advantage === undefined ? {} : { advantage }),
          dc,
          rng: store.rng,
        })
        commitTest(store, 'saving_throw', creature.id, `${ability.toUpperCase()} save`, test)
        return ok(describeTest(`${creature.name} ${ability.toUpperCase()} save`, test), { test })
      }),
  )

  // ── attacks ──────────────────────────────────────────────────────────────────

  server.registerTool(
    'attack_roll',
    {
      title: 'Resolve an attack',
      description:
        'Rolls to hit against the target AC and, on a hit, rolls damage and applies it. Handles ' +
        'critical hits (doubling the dice, never the flat bonus), natural 20 and 1, advantage ' +
        'from conditions, resistance, temporary HP, and knocking the target out. One call ' +
        'resolves the whole attack — do not also call apply_damage.',
      inputSchema: {
        attacker: z.string(),
        target: z.string(),
        weapon: z
          .string()
          .optional()
          .describe(
            'Name of an attack defined on the attacker. Prefer this: it takes the dice, ' +
              'ability, proficiency and bonus off the sheet. Omit only for an improvised ' +
              'attack, and then pass ability, damage and damage_type instead.',
          ),
        ability: abilityEnum
          .optional()
          .describe('str for a longsword, dex for a bow or finesse weapon. Ignored when weapon is given'),
        damage: z
          .string()
          .optional()
          .describe('Damage dice only, e.g. "1d8". The flat bonus goes in damage_bonus'),
        damage_type: damageTypeEnum.optional(),
        proficient: z.boolean().optional().describe('Defaults to false; true for a weapon the attacker is trained in'),
        attack_bonus: z.number().int().optional().describe('Magic weapon bonus etc.'),
        damage_bonus: z.number().int().optional().describe('Usually the ability modifier. Never doubled on a crit'),
        range: z.enum(['melee', 'ranged']).optional().describe('Defaults to melee. Affects prone targets and auto-crits'),
        advantage: advantageEnum.optional().describe('Circumstantial only; conditions are applied automatically'),
        crit_on: z.number().int().min(2).max(20).optional().describe('Defaults to 20; 19 for a Champion fighter'),
        lethal: z
          .boolean()
          .optional()
          .describe(
            'Defaults to true. Pass false to pull the blow: a target reduced to 0 falls ' +
              'unconscious instead of dying, even if it would normally die at 0 HP.',
          ),
      },
    },
    (args) =>
      guard(() => {
        const attacker = store.creature(args.attacker)
        const target = store.creature(args.target)

        const outcome =
          args.weapon !== undefined
            ? attackWith(attacker, target, args.weapon, store.rng, {
                ...(args.advantage === undefined ? {} : { advantage: args.advantage }),
                ...(args.range === undefined ? {} : { range: args.range }),
                ...(args.lethal === undefined ? {} : { lethal: args.lethal }),
              })
            : (() => {
                if (args.ability === undefined || args.damage === undefined || args.damage_type === undefined) {
                  throw new RulesError(
                    'pass either weapon (the name of an attack on the attacker) or all of ' +
                      'ability, damage and damage_type',
                  )
                }
                return attack({
                  attacker,
                  target,
                  ability: args.ability,
                  damage: args.damage,
                  damageType: args.damage_type,
                  ...(args.proficient === undefined ? {} : { proficient: args.proficient }),
                  ...(args.attack_bonus === undefined ? {} : { attackBonus: args.attack_bonus }),
                  ...(args.damage_bonus === undefined ? {} : { damageBonus: args.damage_bonus }),
                  ...(args.range === undefined ? {} : { range: args.range }),
                  ...(args.advantage === undefined ? {} : { advantage: args.advantage }),
                  ...(args.crit_on === undefined ? {} : { critOn: args.crit_on }),
                  ...(args.lethal === undefined ? {} : { lethal: args.lethal }),
                  rng: store.rng,
                })
              })()

        store.put(outcome.target)
        store.commit('attack_roll', outcome.events)

        return ok(
          `${attacker.name}${outcome.attackName === null ? '' : ` (${outcome.attackName})`}` +
            ` → ${target.name}: ${outcome.narrationHint}`,
          {
          weapon: outcome.attackName,
          attackRoll: {
            natural: outcome.roll.natural,
            modifier: signed(outcome.roll.modifier),
            total: outcome.roll.total,
            ac: outcome.ac,
            advantage: outcome.advantage,
          },
          hit: outcome.hit,
          critical: outcome.critical,
          reason: outcome.reason,
          ...(outcome.damageRoll ? { damage: formatDiceResult(outcome.damageRoll) } : {}),
          ...(outcome.damage
            ? {
                damageApplied: outcome.damage.hpLost,
                mitigation: outcome.damage.mitigation,
                droppedToZero: outcome.damage.droppedToZero,
                died: outcome.damage.died,
                instantDeath: outcome.damage.instantDeath,
                concentrationDc: outcome.damage.concentrationDc,
              }
            : {}),
          target: brief(outcome.target),
          },
        )
      }),
  )

  // ── hit points ───────────────────────────────────────────────────────────────

  server.registerTool(
    'apply_damage',
    {
      title: 'Apply damage',
      description:
        'Damage from something other than a weapon attack: a trap, a fall, poison, a failed save. ' +
        'Applies resistance, vulnerability, immunity, and temporary HP, and handles going down. ' +
        'For weapon attacks use attack_roll, which already applies damage.',
      inputSchema: {
        id: z.string(),
        amount: z.number().int().min(0),
        damage_type: damageTypeEnum,
        critical: z.boolean().optional().describe('Costs two death saves instead of one if already at 0 HP'),
        lethal: z
          .boolean()
          .optional()
          .describe('Defaults to true. False knocks the target unconscious instead of killing it.'),
      },
    },
    ({ id, amount, damage_type, critical, lethal }) =>
      guard(() => {
        const outcome = applyDamage(store.creature(id), {
          amount,
          damageType: damage_type,
          ...(critical === undefined ? {} : { critical }),
          ...(lethal === undefined ? {} : { lethal }),
        })
        store.put(outcome.creature)
        store.commit('apply_damage', outcome.events)

        const parts = [`${outcome.creature.name} takes ${outcome.hpLost} ${damage_type}`]
        if (outcome.mitigation !== 'none') parts.push(outcome.mitigation)
        if (outcome.absorbedByTempHp > 0) parts.push(`${outcome.absorbedByTempHp} soaked by temp HP`)
        if (outcome.instantDeath) parts.push('killed outright by massive damage')
        else if (outcome.died) parts.push('killed')
        else if (outcome.droppedToZero) parts.push('knocked unconscious and dying')

        return ok(parts.join(' · '), {
          effective: outcome.effective,
          hpLost: outcome.hpLost,
          mitigation: outcome.mitigation,
          droppedToZero: outcome.droppedToZero,
          died: outcome.died,
          instantDeath: outcome.instantDeath,
          deathSaveFailures: outcome.deathSaveFailures,
          concentrationDc: outcome.concentrationDc,
          creature: brief(outcome.creature),
        })
      }),
  )

  server.registerTool(
    'heal',
    {
      title: 'Heal',
      description:
        'Restore hit points, capped at maximum. Brings a dying creature back to consciousness and ' +
        'clears its death saves. Cannot revive the dead.',
      inputSchema: { id: z.string(), amount: z.number().int().min(0) },
    },
    ({ id, amount }) =>
      guard(() => {
        const outcome = heal(store.creature(id), amount)
        store.put(outcome.creature)
        store.commit('heal', outcome.events)
        return ok(
          `${outcome.creature.name} regains ${outcome.healed} HP${outcome.revived ? ' and is conscious again' : ''}`,
          { healed: outcome.healed, revived: outcome.revived, creature: brief(outcome.creature) },
        )
      }),
  )

  server.registerTool(
    'apply_temp_hp',
    {
      title: 'Grant temporary HP',
      description: 'Temporary HP never stacks: the larger pool wins and the other is discarded.',
      inputSchema: { id: z.string(), amount: z.number().int().min(0) },
    },
    ({ id, amount }) =>
      guard(() => {
        const outcome = applyTempHp(store.creature(id), amount)
        store.put(outcome.creature)
        store.commit('apply_temp_hp', outcome.events)
        return ok(
          outcome.replaced
            ? `${outcome.creature.name} gains ${amount} temporary HP`
            : `${outcome.creature.name} keeps the larger existing pool of ${outcome.creature.hp.temp}`,
          { replaced: outcome.replaced, creature: brief(outcome.creature) },
        )
      }),
  )

  server.registerTool(
    'death_save',
    {
      title: 'Roll a death saving throw',
      description:
        'A flat d20 against DC 10 for a creature at 0 HP. Three successes stabilise; three ' +
        'failures kill. A natural 20 brings them up at 1 HP; a natural 1 counts as two failures.',
      inputSchema: {
        id: z.string(),
        advantage: advantageEnum
          .optional()
          .describe(
            'For a ruling the engine cannot see: drowning while unconscious, a healer at ' +
              'their side, a hostile aura. Records the ruling instead of leaving the log at ' +
              'odds with the fiction.',
          ),
        bonus: z.number().int().optional(),
      },
    },
    ({ id, advantage, bonus }) =>
      guard(() => {
        const outcome = deathSave(store.creature(id), store.rng, {
          ...(advantage === undefined ? {} : { advantage }),
          ...(bonus === undefined ? {} : { bonus }),
        })
        store.put(outcome.creature)
        store.commit('death_save', outcome.events)
        return ok(
          `${outcome.creature.name} death save: rolled ${outcome.roll.natural} — ${outcome.outcome}`,
          {
            outcome: outcome.outcome,
            successes: outcome.creature.death.successes,
            failures: outcome.creature.death.failures,
            creature: brief(outcome.creature),
          },
        )
      }),
  )

  server.registerTool(
    'stabilise',
    {
      title: 'Stabilise a dying creature',
      description:
        'Stop the death saves without healing — a successful Medicine check or a healer\'s kit. ' +
        'The creature stays at 0 HP and unconscious.',
      inputSchema: { id: z.string() },
    },
    ({ id }) =>
      guard(() => {
        const outcome = stabilise(store.creature(id))
        store.put(outcome.creature)
        store.commit('stabilise', outcome.events)
        return ok(`${outcome.creature.name} is stable at 0 HP`, { creature: brief(outcome.creature) })
      }),
  )

  // ── conditions and concentration ─────────────────────────────────────────────

  server.registerTool(
    'apply_condition',
    {
      title: 'Apply a condition',
      description:
        'Add a condition. Conditions automatically affect attack rolls made by and against the ' +
        'creature, so do not also pass advantage by hand. Use set_exhaustion for exhaustion.',
      inputSchema: {
        id: z.string(),
        condition: conditionEnum.describe('Use set_exhaustion for exhaustion, which has levels'),
      },
    },
    ({ id, condition }) =>
      guard(() => {
        if (condition === 'exhaustion') {
          return fail('exhaustion has levels — use set_exhaustion instead')
        }
        const creature = addCondition(store.creature(id), condition)
        store.put(creature)
        store.commit('apply_condition', [{ t: 'condition', target: id, condition, op: 'add' }])
        return ok(`${creature.name} is now ${condition}`, { creature: brief(creature) })
      }),
  )

  server.registerTool(
    'remove_condition',
    {
      title: 'Remove a condition',
      description: 'Clear a condition.',
      inputSchema: { id: z.string(), condition: conditionEnum },
    },
    ({ id, condition }) =>
      guard(() => {
        if (condition === 'exhaustion') {
          return fail('exhaustion has levels — use set_exhaustion with a lower level instead')
        }
        const creature = removeCondition(store.creature(id), condition)
        store.put(creature)
        store.commit('remove_condition', [{ t: 'condition', target: id, condition, op: 'remove' }])
        return ok(`${creature.name} is no longer ${condition}`, { creature: brief(creature) })
      }),
  )

  server.registerTool(
    'set_exhaustion',
    {
      title: 'Set exhaustion level',
      description: 'Exhaustion runs 0 to 6. Level 6 is death.',
      inputSchema: { id: z.string(), level: z.number().int().min(0).max(6) },
    },
    ({ id, level }) =>
      guard(() => {
        const creature = setExhaustion(store.creature(id), level)
        store.put(creature)
        store.commit('set_exhaustion', [{ t: 'exhaustion', target: id, level }])
        return ok(
          level === 6
            ? `${creature.name} dies of exhaustion`
            : `${creature.name} is at exhaustion level ${level}`,
          { creature: brief(creature), status: lifeStatus(creature) },
        )
      }),
  )

  server.registerTool(
    'start_concentration',
    {
      title: 'Begin concentrating',
      description:
        'Mark a caster as concentrating on a spell. Starting a second spell drops the first.',
      inputSchema: { id: z.string(), spell: z.string() },
    },
    ({ id, spell }) =>
      guard(() => {
        const outcome = startConcentration(store.creature(id), spell)
        store.put(outcome.creature)
        store.commit('start_concentration', outcome.events)
        return ok(`${outcome.creature.name} is concentrating on ${spell}`, {
          creature: brief(outcome.creature),
        })
      }),
  )

  server.registerTool(
    'concentration_save',
    {
      title: 'Roll to keep concentrating',
      description:
        'A Constitution save after taking damage, at DC 10 or half the damage taken, whichever is ' +
        'higher. attack_roll and apply_damage report the DC when one is needed.',
      inputSchema: { id: z.string(), damage_taken: z.number().int().min(0) },
    },
    ({ id, damage_taken }) =>
      guard(() => {
        const outcome = concentrationSave(store.creature(id), damage_taken, store.rng)
        store.put(outcome.creature)
        store.commit('concentration_save', outcome.events)
        return ok(
          describeTest(`${outcome.creature.name} concentration save`, outcome.roll) +
            (outcome.maintained ? ' — spell holds' : ' — concentration broken'),
          { maintained: outcome.maintained, creature: brief(outcome.creature) },
        )
      }),
  )

  // ── combat ───────────────────────────────────────────────────────────────────

  server.registerTool(
    'start_combat',
    {
      title: 'Roll initiative and start combat',
      description:
        'Rolls initiative for every named creature and builds the turn order. Ties break on ' +
        'Dexterity modifier, then on the order given here.',
      inputSchema: { ids: z.array(z.string()).min(1) },
    },
    ({ ids }) =>
      guard(() => {
        const creatures = ids.map((id) => store.creature(id))
        const outcome = startCombat(creatures, store.rng)
        store.setCombat(outcome.state)
        store.commit('start_combat', outcome.events)
        return ok(
          `Initiative: ${outcome.state.order.map((c) => `${c.name} ${c.initiative}`).join(', ')}. ` +
            `Round 1, ${outcome.state.order[0]!.name} acts first.`,
          {
            round: 1,
            order: outcome.state.order.map((c) => ({ id: c.id, name: c.name, initiative: c.initiative })),
            rolls: outcome.rolls.map((r) => describeTest(`${r.name} initiative`, r.roll)),
          },
        )
      }),
  )

  server.registerTool(
    'next_turn',
    {
      title: 'Advance to the next turn',
      description: 'Move the turn marker on, rolling into a new round when the order wraps.',
      inputSchema: {},
    },
    () =>
      guard(() => {
        const outcome = nextTurn(store.requireCombat())
        store.setCombat(outcome.state)
        store.commit('next_turn', outcome.events)
        return ok(
          `${outcome.newRound ? `Round ${outcome.state.round}. ` : ''}${outcome.actor.name}'s turn.`,
          {
            round: outcome.state.round,
            newRound: outcome.newRound,
            actor: outcome.actor.name,
            actorId: outcome.actor.id,
            actorStatus: brief(store.creature(outcome.actor.id)),
          },
        )
      }),
  )

  server.registerTool(
    'remove_from_combat',
    {
      title: 'Drop a combatant from the order',
      description:
        'Take a dead or fled creature out of the turn order without skipping whoever is acting.',
      inputSchema: { id: z.string() },
    },
    ({ id }) =>
      guard(() => {
        const name = store.creature(id).name
        const state = removeFromCombat(store.requireCombat(), id)
        store.setCombat(state)
        store.commit('remove_from_combat')
        return ok(
          state.active
            ? `${name} leaves the fight. Still up: ${state.order.map((c) => c.name).join(', ')}`
            : `${name} leaves the fight and combat ends`,
          { active: state.active, order: state.order.map((c) => c.name) },
        )
      }),
  )

  server.registerTool(
    'end_combat',
    {
      title: 'End combat',
      description: 'Close out the fight and clear the turn order.',
      inputSchema: {},
    },
    () =>
      guard(() => {
        const outcome = endCombat(store.requireCombat())
        store.setCombat(outcome.state)
        store.commit('end_combat', outcome.events)
        return ok(`Combat ends after ${outcome.state.round} round(s).`)
      }),
  )

  server.registerTool(
    'get_combat_state',
    {
      title: 'Read the combat state',
      description: 'The round, whose turn it is, and the full turn order with HP and conditions.',
      inputSchema: {},
    },
    () =>
      guard(() => {
        const combat = store.combat
        if (!combat?.active) return ok('No combat in progress.', { active: false })
        const actor = currentActor(combat)
        return ok(`Round ${combat.round}, ${actor.name}'s turn.`, {
          active: true,
          round: combat.round,
          turn: actor.name,
          order: combat.order.map((c) => ({
            ...brief(store.creature(c.id)),
            initiative: c.initiative,
          })),
        })
      }),
  )

  // ── log ──────────────────────────────────────────────────────────────────────

  server.registerTool(
    'recent_events',
    {
      title: 'Read the event log',
      description:
        'The most recent mechanical events, newest last. Use this to answer "how did I get to ' +
        '3 HP" rather than reconstructing it from memory.',
      inputSchema: { limit: z.number().int().min(1).max(200).optional().describe('Defaults to 20') },
    },
    ({ limit }) =>
      guard(() =>
        ok(`Last ${limit ?? 20} of ${store.eventCount} events`, {
          events: store.recentEvents(limit ?? 20),
        }),
      ),
  )
}

/**
 * Campaign management: create, switch, recap, undo, reset, delete.
 *
 * Kept separate from the rules tools because it is bookkeeping rather than
 * mechanics, and because the destructive ones need their own care.
 */
export function registerCampaignTools(server: McpServer, store: GameStore): void {
  server.registerTool(
    'list_campaigns',
    {
      title: 'List saved campaigns',
      description:
        'Every campaign on disk, most recently played first, with how many steps each has. ' +
        'The one currently loaded is marked.',
      inputSchema: {},
    },
    () =>
      guard(() => {
        const current = store.campaign.id
        const campaigns = store.listCampaigns()
        return ok(
          campaigns.length === 0
            ? 'No saved campaigns.'
            : `${campaigns.length} campaign(s). Currently loaded: ${current}.`,
          {
            current,
            campaigns: campaigns.map((c) => ({
              id: c.id,
              name: c.name,
              steps: c.steps,
              lastPlayed: c.updatedAt,
              loaded: c.id === current,
            })),
          },
        )
      }),
  )

  server.registerTool(
    'new_campaign',
    {
      title: 'Start a new campaign',
      description:
        'Create a fresh campaign and switch to it. The one in play is left untouched on ' +
        'disk and can be returned to with load_campaign.',
      inputSchema: {
        name: z.string().describe('Something you can recognise it by later'),
        seed: z.number().int().optional().describe('Pin the dice for a reproducible campaign'),
      },
    },
    ({ name, seed }) =>
      guard(() => {
        const campaign = store.startCampaign(name, seed)
        store.commit('new_campaign')
        return ok(`Started campaign ${campaign.id}: "${campaign.name}"`, {
          campaign: { id: campaign.id, name: campaign.name, seed: campaign.seed },
        })
      }),
  )

  server.registerTool(
    'load_campaign',
    {
      title: 'Load a saved campaign',
      description:
        'Switch to a saved campaign, restoring its creatures, scene, combat, and dice ' +
        'position exactly as they were. Use list_campaigns to find the id.',
      inputSchema: { id: z.number().int() },
    },
    ({ id }) =>
      guard(() => {
        const campaign = store.switchCampaign(id)
        const combat = store.combat
        return ok(
          `Loaded "${campaign.name}" — ${store.all().length} creature(s), ${campaign.steps} step(s)` +
            (combat?.active ? `, mid-combat on round ${combat.round}` : ''),
          { campaign: { id: campaign.id, name: campaign.name }, state: stateSummary(store) },
        )
      }),
  )

  server.registerTool(
    'rename_campaign',
    {
      title: 'Rename the current campaign',
      description: 'Give the loaded campaign a better name once you know what it is about.',
      inputSchema: { name: z.string() },
    },
    ({ name }) =>
      guard(() => {
        store.renameCampaign(name)
        return ok(`Renamed to "${name}"`)
      }),
  )

  server.registerTool(
    'recap',
    {
      title: 'Recap the story so far',
      description:
        'The scene, the party, and what recently happened mechanically. Read this when ' +
        'resuming a campaign, and narrate a "previously" from it rather than listing events.',
      inputSchema: {
        limit: z.number().int().min(1).max(200).optional().describe('Events to include; defaults to 30'),
      },
    },
    ({ limit }) =>
      guard(() => {
        const campaign = store.campaign
        return ok(
          `"${campaign.name}" — ${campaign.steps} step(s), last played ${campaign.updatedAt}`,
          {
            campaign: { id: campaign.id, name: campaign.name },
            // The backbone and the full cast, hidden notes included. This is the
            // whole point of recap: after a /clear it is the only thing that
            // stops the story becoming a different story.
            story: store.story,
            ahead: store.story === null ? [] : beatsAhead(store.story),
            cast: store.all().map((creature) => ({
              id: creature.id,
              name: creature.name,
              kind: creature.kind,
              ...profileView(creature),
            })),
            ...stateSummary(store),
            events: store.recentEvents(limit ?? 30),
          },
        )
      }),
  )

  server.registerTool(
    'undo',
    {
      title: 'Undo the last step',
      description:
        'Revert the most recent change — a misapplied damage roll, a turn advanced too ' +
        'early, a condition on the wrong creature. Restores the state from just before it.',
      inputSchema: {},
    },
    () =>
      guard(() => {
        const undone = store.undo()
        if (undone === null) return fail('nothing to undo — this campaign has no steps yet')
        return ok(`Undid "${undone}"`, { undone, state: stateSummary(store) })
      }),
  )

  server.registerTool(
    'reset_campaign',
    {
      title: 'Clear the board',
      description:
        'Remove every creature, end any combat, and clear the scene, keeping the campaign ' +
        'and its journal. Reversible with undo. Use this after a conversation reset has ' +
        'left you out of step with the engine.',
      inputSchema: {
        confirm: z.literal(true).describe('Must be true — this clears the whole board'),
      },
    },
    () =>
      guard(() => {
        store.reset()
        return ok('Board cleared. The campaign and its history are intact; undo will bring it back.')
      }),
  )

  server.registerTool(
    'delete_campaign',
    {
      title: 'Delete a campaign permanently',
      description:
        'Erase a campaign and its entire history from disk. This cannot be undone. Ask the ' +
        'player to confirm before calling it — never delete a campaign on your own initiative.',
      inputSchema: {
        id: z.number().int(),
        confirm: z.literal(true).describe('Must be true — this is permanent'),
      },
    },
    ({ id }) =>
      guard(() => {
        const deleted = store.deleteCampaign(id)
        return ok(`Deleted campaign ${deleted.id} "${deleted.name}" permanently.`, {
          nowLoaded: store.campaign.id,
        })
      }),
  )
}

/**
 * Rests, spell slots, limited-use abilities, and levelling.
 *
 * These are what the first playtest missed most: a fighter finished a fight at
 * 20/28 and the likeliest next action — "I use Second Wind" — had no tool behind
 * it, so nothing would have stopped them doing it four times running.
 */
export function registerProgressionTools(server: McpServer, store: GameStore): void {
  server.registerTool(
    'list_resources',
    {
      title: 'List limited-use abilities',
      description:
        'Spell slots, hit dice, Second Wind, ki, Channel Divinity — everything with uses and a ' +
        'recharge. Read this before telling the player what they can still do.',
      inputSchema: { id: z.string() },
    },
    ({ id }) =>
      guard(() => {
        const creature = store.creature(id)
        const casting = spellcasting(creature)
        return ok(
          creature.resources.length === 0
            ? `${creature.name} has no limited-use abilities`
            : creature.resources
                .map((r) => `${r.label} ${r.current}/${r.max}`)
                .join(' · '),
          {
            resources: creature.resources.map((r) => ({
              name: r.name,
              label: r.label,
              remaining: r.current,
              max: r.max,
              recharge: r.recharge,
            })),
            spellSlots: availableSlots(creature),
            ...(casting === null
              ? {}
              : { spellSaveDc: casting.saveDc, spellAttackBonus: casting.attackBonus }),
          },
        )
      }),
  )

  server.registerTool(
    'add_resource',
    {
      title: 'Define a limited-use ability',
      description:
        'Give a creature something with uses and a recharge that the class table does not ' +
        'already know about: three charges of a wand, two doses in a pouch, a boon from a ' +
        'patron. Hit dice, spell slots and the class features that have uses — Second Wind, ' +
        'Rage, ki, Channel Divinity — all arrive with the character from its class and grow at ' +
        'level_up, so adding one of those here makes a second pool beside the real one and the ' +
        'player can spend both. Casting, though, is gated on the slot existing and not on the ' +
        'class, so a ring, a boon or a subclass taken later can grant one here: name it ' +
        '"spell-slot-N" and that creature can cast at level N, whatever it is. Label it after ' +
        'the thing that granted it.',
      inputSchema: {
        id: z.string(),
        name: z.string().describe('Stable id, e.g. "wand-charges"'),
        label: z.string().describe('What the player sees, e.g. "Charges (wand of magic missiles)"'),
        max: z.number().int().min(1),
        recharge: z.enum(['short-rest', 'long-rest', 'dawn', 'never']),
      },
    },
    ({ id, name, label, max, recharge }) =>
      guard(() => {
        const creature = store.creature(id)
        if (creature.resources.some((r) => r.name === name)) {
          return fail(`${creature.name} already has a resource called "${name}"`)
        }
        const updated = {
          ...creature,
          resources: [...creature.resources, { name, label, max, current: max, recharge }],
        }
        store.put(updated)
        store.commit('add_resource')
        return ok(`${creature.name} gains ${label} (${max} use(s), back on ${recharge})`, {
          resources: updated.resources.map((r) => `${r.label} ${r.current}/${r.max}`),
        })
      }),
  )

  server.registerTool(
    'spend_resource',
    {
      title: 'Spend a limited-use ability',
      description:
        'Use one up. Fails when there are none left, which is the point — nothing else stops a ' +
        'player using Second Wind twice in a fight.',
      inputSchema: {
        id: z.string(),
        resource: z.string().describe('The resource name, from list_resources'),
        amount: z.number().int().min(1).optional().describe('Defaults to 1'),
      },
    },
    ({ id, resource, amount }) =>
      guard(() => {
        const outcome = spendResource(store.creature(id), resource, amount ?? 1)
        store.put(outcome.creature)
        store.commit('spend_resource', outcome.events)
        return ok(
          `${outcome.creature.name} spends ${resource} — ${outcome.resource.current}/${outcome.resource.max} left`,
          { remaining: outcome.resource.current, max: outcome.resource.max },
        )
      }),
  )

  server.registerTool(
    'cast_spell',
    {
      title: 'Cast a spell',
      description:
        'Spend the slot and get the save DC. The engine does not know what any spell does — ' +
        'that is yours to adjudicate — but it does enforce that the slot existed and is now ' +
        'gone, which is the part nobody can track across three hours. Roll damage with ' +
        'roll_dice and apply it with apply_damage or saving_throw as the spell requires. ' +
        'Cantrips are level 0 and cost nothing.',
      inputSchema: {
        id: z.string(),
        spell: z.string(),
        level: z.number().int().min(0).max(9).describe("The spell's own level; 0 for a cantrip"),
        effect: z
          .string()
          .max(160)
          .optional()
          .describe(
            'One line on what it does, in your words — "marks a target: +1d6 damage from you, ' +
              'concentration". Not stored as a rule and never enforced; it is shown to the ' +
              'player as a reminder next time they reach for the same spell. Worth writing the ' +
              'first time each spell is cast.',
          ),
        slot_level: z
          .number()
          .int()
          .min(0)
          .max(9)
          .optional()
          .describe('Upcast by spending a higher slot. Defaults to the spell level'),
      },
    },
    ({ id, spell, level, slot_level, effect }) =>
      guard(() => {
        const outcome = castSpell(store.creature(id), {
          spell,
          level,
          ...(slot_level === undefined ? {} : { slotLevel: slot_level }),
          ...(effect === undefined ? {} : { effect }),
          // The table's own choice, made when the campaign started.
          ...(store.rules.strictSpells ? { requireKnown: true } : {}),
        })
        store.put(outcome.creature)
        store.commit('cast_spell', outcome.events)

        const parts = [`${outcome.creature.name} casts ${spell}`]
        if (!outcome.known) {
          parts.push(`NOT on ${store.creature(id).name}'s sheet — yours to allow or refuse`)
        }
        if (outcome.slotLevel === null) parts.push('cantrip, no slot spent')
        else parts.push(`level ${outcome.slotLevel} slot spent`)
        if (outcome.saveDc !== null) parts.push(`spell save DC ${outcome.saveDc}`)

        return ok(parts.join(' · '), {
          slotLevel: outcome.slotLevel,
          known: outcome.known,
          saveDc: outcome.saveDc,
          spellAttackBonus: outcome.spellAttackBonus,
          slotsRemaining: outcome.slotsRemaining,
        })
      }),
  )

  server.registerTool(
    'spend_hit_die',
    {
      title: 'Spend a hit die',
      description:
        'Heal during a short rest: roll one hit die and add the Constitution modifier. One die ' +
        'per call, so the player chooses how many to burn. Hit dice come back at half rate on a ' +
        'long rest.',
      inputSchema: { id: z.string() },
    },
    ({ id }) =>
      guard(() => {
        const outcome = spendHitDie(store.creature(id), store.rng)
        store.put(outcome.creature)
        store.commit('spend_hit_die', outcome.events)
        return ok(
          `${outcome.creature.name} spends a hit die: ${formatDiceResult(outcome.roll)} + CON, ` +
            `heals ${outcome.healed} to ${outcome.creature.hp.current}/${outcome.creature.hp.max} ` +
            `(${outcome.remaining} hit dice left)`,
          {
            healed: outcome.healed,
            hitDiceRemaining: outcome.remaining,
            creature: brief(outcome.creature),
          },
        )
      }),
  )

  server.registerTool(
    'short_rest',
    {
      title: 'Take a short rest',
      description:
        'An hour. Abilities that recharge on a short rest come back. Hit points do NOT — the ' +
        'player spends hit dice for those, with spend_hit_die, as many as they choose.',
      inputSchema: { id: z.string() },
    },
    ({ id }) =>
      guard(() => {
        const outcome = shortRest(store.creature(id))
        store.put(outcome.creature)
        store.commit('short_rest', outcome.events)
        return ok(
          outcome.restored.length === 0
            ? `${outcome.creature.name} rests an hour. Nothing to recover.`
            : `${outcome.creature.name} rests an hour and recovers ` +
              outcome.restored.map((r) => `${r.label} (${r.to}/${r.max})`).join(', '),
          { restored: outcome.restored, creature: brief(outcome.creature) },
        )
      }),
  )

  server.registerTool(
    'long_rest',
    {
      title: 'Take a long rest',
      description:
        'Eight hours. Hit points to full, hit dice back at half rate, one level of exhaustion ' +
        'lifted, everything else recharged. A creature at 0 HP must be stabilised or healed first.',
      inputSchema: { id: z.string() },
    },
    ({ id }) =>
      guard(() => {
        const outcome = longRest(store.creature(id))
        store.put(outcome.creature)
        store.commit('long_rest', outcome.events)
        return ok(
          `${outcome.creature.name} sleeps eight hours: ` +
            `${outcome.hpRestored} HP back to full` +
            (outcome.restored.length > 0
              ? `, ${outcome.restored.map((r) => `${r.label} (${r.to}/${r.max})`).join(', ')}`
              : ''),
          {
            hpRestored: outcome.hpRestored,
            restored: outcome.restored,
            creature: brief(outcome.creature),
          },
        )
      }),
  )

  server.registerTool(
    'award_xp',
    {
      title: 'Award experience',
      description:
        'Give XP and find out whether it crossed a level threshold. It does not level the ' +
        'character up — call level_up for that, so the player is part of it.',
      inputSchema: { id: z.string(), amount: z.number().int().min(0) },
    },
    ({ id, amount }) =>
      guard(() => {
        const outcome = awardXp(store.creature(id), amount)
        store.put(outcome.creature)
        store.commit('award_xp', outcome.events)
        return ok(
          `${outcome.creature.name} gains ${amount} XP (${outcome.total} total)` +
            (outcome.levelledUp
              ? ` — enough for level ${outcome.level}!`
              : outcome.toNextLevel === null
                ? ''
                : `, ${outcome.toNextLevel} to the next level`),
          {
            total: outcome.total,
            levelForXp: outcome.level,
            currentLevel: outcome.creature.level,
            readyToLevel: outcome.levelledUp,
            toNextLevel: outcome.toNextLevel,
          },
        )
      }),
  )

  server.registerTool(
    'level_up',
    {
      title: 'Level up',
      description:
        'Advance one level: hit points, a bigger hit dice pool, and the spell slots the level ' +
        'brings. Slots already spent stay spent. Proficiency bonus follows from level ' +
        'automatically. Omit hp_gained to take the fixed average, which most tables use.',
      inputSchema: {
        id: z.string(),
        hp_gained: z
          .number()
          .int()
          .optional()
          .describe('Rolled HP. Omit for the average: half the hit die plus one, plus CON'),
      },
    },
    ({ id, hp_gained }) =>
      guard(() => {
        const outcome = levelUp(store.creature(id), {
          ...(hp_gained === undefined ? {} : { hpGained: hp_gained }),
        })
        store.put(outcome.creature)
        store.commit('level_up', outcome.events)
        return ok(
          `${outcome.creature.name} reaches level ${outcome.level}: +${outcome.hpGained} HP ` +
            `(${outcome.creature.hp.current}/${outcome.creature.hp.max})` +
            (outcome.gained.length > 0
              ? `, gains ${outcome.gained.map((g) => `${g.label} (${g.max})`).join(', ')}`
              : ''),
          {
            level: outcome.level,
            hpGained: outcome.hpGained,
            gained: outcome.gained,
            sheet: sheet(outcome.creature),
          },
        )
      }),
  )

  server.registerTool(
    'kill',
    {
      title: 'Declare a creature dead',
      description:
        'For when the fiction settles it and no damage roll would be honest: drowned while ' +
        'unconscious, thrown off a cliff, executed, disintegrated. Records the reason in the ' +
        'log. Do not use it in place of a fair attack roll.',
      inputSchema: {
        id: z.string(),
        reason: z.string().describe('What killed them, for the log'),
      },
    },
    ({ id, reason }) =>
      guard(() => {
        const outcome = kill(store.creature(id), reason)
        store.put(outcome.creature)
        store.commit('kill', outcome.events)
        return ok(`${outcome.creature.name} dies: ${reason}`, {
          creature: brief(outcome.creature),
        })
      }),
  )

  // ── coin and goods ───────────────────────────────────────────────────────────

  server.registerTool(
    'get_purse',
    {
      title: 'Read a purse and pack',
      description:
        'What someone is carrying: coin, and every item in their pack with the price on ' +
        'anything they will sell. Read this instead of recalling a total from earlier in the ' +
        'conversation — money is the first thing a session loses track of.',
      inputSchema: { id: z.string() },
    },
    ({ id }) =>
      guard(() => {
        const creature = store.creature(id)
        return ok(
          `${creature.name} is carrying ${formatCoin(creature.purse)}`,
          purseView(creature),
        )
      }),
  )

  server.registerTool(
    'earn_money',
    {
      title: 'Give coin',
      description:
        'Add coin to a purse: payment, a reward, loot counted out. Amounts read as "12 gp 4 sp", ' +
        '"5 gold", or a plain number of copper.',
      inputSchema: {
        id: z.string(),
        amount: z.string().describe('e.g. "12 gp 4 sp" or "250" (copper)'),
        reason: z.string().optional().describe('Recorded in the log'),
      },
    },
    ({ id, amount, reason }) =>
      guard(() => {
        const outcome = earn(store.creature(id), amount, reason)
        store.put(outcome.creature)
        store.commit('earn_money', outcome.events)
        return ok(
          `${outcome.creature.name} gains ${formatCoin(outcome.delta)} — now ${formatCoin(outcome.balance)}`,
          purseView(outcome.creature),
        )
      }),
  )

  server.registerTool(
    'spend_money',
    {
      title: 'Take coin',
      description:
        'Remove coin from a purse: a bribe, a toll, a night at the inn. Refuses if the purse ' +
        'is short, which is the point — do not narrate a payment this rejects.',
      inputSchema: {
        id: z.string(),
        amount: z.string(),
        reason: z.string().optional(),
      },
    },
    ({ id, amount, reason }) =>
      guard(() => {
        const outcome = spend(store.creature(id), amount, reason)
        store.put(outcome.creature)
        store.commit('spend_money', outcome.events)
        return ok(
          `${outcome.creature.name} pays ${formatCoin(-outcome.delta)} — ${formatCoin(outcome.balance)} left`,
          purseView(outcome.creature),
        )
      }),
  )

  server.registerTool(
    'give_item',
    {
      title: 'Put something in a pack',
      description:
        'Add an item to someone’s inventory, stacking onto a matching name. Setting a price ' +
        'marks it as stock the holder will sell, which is how a vendor’s shelf is built. ' +
        'Inventory is a ledger, not equipment: this does not create an attack.',
      inputSchema: {
        id: z.string(),
        name: z.string(),
        qty: z.number().int().min(1).optional().describe('Defaults to 1'),
        notes: z.string().optional(),
        price: z.string().optional().describe('What they sell it for, e.g. "1 gp". Omit if not for sale.'),
      },
    },
    ({ id, name, qty, notes, price }) =>
      guard(() => {
        const outcome = giveItem(store.creature(id), {
          name,
          ...(qty === undefined ? {} : { qty }),
          ...(notes === undefined ? {} : { notes }),
          ...(price === undefined ? {} : { price }),
        })
        store.put(outcome.creature)
        store.commit('give_item', outcome.events)
        return ok(
          `${outcome.creature.name} now has ${outcome.item.qty} × ${outcome.item.name}`,
          purseView(outcome.creature),
        )
      }),
  )

  server.registerTool(
    'take_item',
    {
      title: 'Take something out of a pack',
      description:
        'Remove an item: used up, stolen, given away, broken. Refuses if they are not carrying ' +
        'it or do not have that many.',
      inputSchema: {
        id: z.string(),
        name: z.string(),
        qty: z.number().int().min(1).optional().describe('Defaults to 1'),
      },
    },
    ({ id, name, qty }) =>
      guard(() => {
        const outcome = takeItem(store.creature(id), name, qty ?? 1)
        store.put(outcome.creature)
        store.commit('take_item', outcome.events)
        return ok(`${outcome.creature.name}: ${name} removed`, purseView(outcome.creature))
      }),
  )

  server.registerTool(
    'buy',
    {
      title: 'Buy from a vendor',
      description:
        'Move a whole basket at once: goods one way, coin the other. Checked before anything ' +
        'moves, so a purchase can never half-happen. Omit unit_price to use what the vendor has ' +
        'listed; pass it to record a haggled price. Omit vendor_id for an untracked shopkeeper.',
      inputSchema: {
        buyer_id: z.string(),
        vendor_id: z.string().optional(),
        lines: z
          .array(
            z.object({
              name: z.string(),
              qty: z.number().int().min(1).optional(),
              unit_price: z.string().optional().describe('Per unit, e.g. "1 gp"'),
            }),
          )
          .min(1),
      },
    },
    ({ buyer_id, vendor_id, lines }) =>
      guard(() => {
        const vendor = vendor_id === undefined ? null : store.creature(vendor_id)
        const outcome = buy(
          store.creature(buyer_id),
          vendor,
          lines.map((line) => ({
            name: line.name,
            ...(line.qty === undefined ? {} : { qty: line.qty }),
            ...(line.unit_price === undefined ? {} : { unitPrice: line.unit_price }),
          })),
        )
        store.put(outcome.buyer)
        if (outcome.vendor !== null) store.put(outcome.vendor)
        store.commit('buy', outcome.events)
        return ok(
          `${outcome.buyer.name} pays ${formatCoin(outcome.total)}, ${formatCoin(outcome.buyer.purse)} left`,
          purseView(outcome.buyer),
        )
      }),
  )

  server.registerTool(
    'sell',
    {
      title: 'Sell to a vendor',
      description:
        'The same counter from the other side: goods out of the pack, coin in. unit_price is ' +
        'what the vendor pays, not what they would charge. Refuses if the vendor cannot cover it.',
      inputSchema: {
        seller_id: z.string(),
        vendor_id: z.string().optional(),
        lines: z
          .array(
            z.object({
              name: z.string(),
              qty: z.number().int().min(1).optional(),
              unit_price: z.string().describe('What the vendor pays, per unit'),
            }),
          )
          .min(1),
      },
    },
    ({ seller_id, vendor_id, lines }) =>
      guard(() => {
        const vendor = vendor_id === undefined ? null : store.creature(vendor_id)
        const outcome = sell(
          store.creature(seller_id),
          vendor,
          lines.map((line) => ({
            name: line.name,
            ...(line.qty === undefined ? {} : { qty: line.qty }),
            unitPrice: line.unit_price,
          })),
        )
        store.put(outcome.buyer)
        if (outcome.vendor !== null) store.put(outcome.vendor)
        store.commit('sell', outcome.events)
        return ok(
          `${outcome.buyer.name} takes ${formatCoin(outcome.total)} — now ${formatCoin(outcome.buyer.purse)}`,
          purseView(outcome.buyer),
        )
      }),
  )

  // ── who people are ───────────────────────────────────────────────────────────

  server.registerTool(
    'update_npc',
    {
      title: 'Record who someone is',
      description:
        'Write down race, manner, attitude and the rest, so they are the same person next time ' +
        'and still exist after a /clear. Everything is optional and nothing is wiped by leaving ' +
        'it out. `want` is yours alone and never reaches the player.',
      inputSchema: {
        id: z.string(),
        race: z.string().optional(),
        pronouns: z
          .string()
          .optional()
          .describe(
            'e.g. "he/him". Filled from the portrait when you leave it out, since the picture ' +
              'is what the player can see; pass it to override, or for a portrait that commits ' +
              'to nothing.',
          ),
        role: z.string().optional().describe('e.g. "quartermaster", "priest of the Hollow"'),
        appearance: z.string().optional(),
        manner: z.string().optional().describe('How they talk and carry themselves'),
        location: z.string().optional().describe('Where they are usually found'),
        attitude: attitudeEnum.optional().describe('Toward the party. Changes with events.'),
        principal: z
          .boolean()
          .optional()
          .describe(
            'A key character in the backbone. Never shown to the player: telling them who ' +
              'matters is a spoiler.',
          ),
        want: z.string().optional().describe('What they are after. DM-only, always.'),
        portrait: z
          .string()
          .nullable()
          .optional()
          .describe(
            'A stock portrait from the browser\u2019s library, named race-role-description, e.g. ' +
              '"dwarf-smith-broad" or "half-orc-guard-tusked". Pick the closest to how you have ' +
              'described them. get_portraits lists what exists. Pre-rendered, so the same NPC ' +
              'shows the same face every session.',
          ),
        presence: z
          .enum(['present', 'offscreen'])
          .optional()
          .describe('Whether they are in the scene. The cast persists either way.'),
      },
    },
    (input) =>
      guard(() => {
        const { id, presence, ...fields } = input
        const patch = Object.fromEntries(
          Object.entries(fields).filter(([, value]) => value !== undefined),
        )

        let outcome = updateProfile(store.creature(id), patch)
        const events = [...outcome.events]

        if (presence !== undefined) {
          const moved = setPresence(outcome.creature, presence)
          outcome = moved
          events.push(...moved.events)
        }

        store.put(outcome.creature)
        store.commit('update_npc', events)
        return ok(`${outcome.creature.name} recorded`, { profile: profileView(outcome.creature) })
      }),
  )

  server.registerTool(
    'add_note',
    {
      title: 'Write something down about someone',
      description:
        'One true thing about an NPC: what they know, what they are hiding, what they let slip. ' +
        'Hidden by default. A hidden note is never sent to the browser at all, so write freely ' +
        'and reveal it with reveal_note when it comes out in play.',
      inputSchema: {
        id: z.string(),
        note: z.string(),
        revealed: z
          .boolean()
          .optional()
          .describe('True only if the player already knows it. Defaults to false.'),
      },
    },
    ({ id, note, revealed }) =>
      guard(() => {
        const outcome = addNote(store.creature(id), note, revealed ?? false)
        store.put(outcome.creature)
        store.commit('add_note', outcome.events)
        return ok(
          `Noted on ${outcome.creature.name}${revealed === true ? '' : ' (hidden)'}`,
          { profile: profileView(outcome.creature) },
        )
      }),
  )

  server.registerTool(
    'reveal_note',
    {
      title: 'The player has learned this',
      description:
        'Mark a hidden note as known, once it has actually come out in play. Call this in the ' +
        'same turn you narrate it — the player’s character panel is built from these, and if ' +
        'you forget, their journal silently stops growing. Match on any distinctive part of the ' +
        'text; an ambiguous match is refused rather than guessed.',
      inputSchema: {
        id: z.string(),
        match: z.string().describe('Any distinctive phrase from the note'),
      },
    },
    ({ id, match }) =>
      guard(() => {
        const outcome = revealNote(store.creature(id), match)
        store.put(outcome.creature)
        store.commit('reveal_note', outcome.events)
        return ok(`Revealed on ${outcome.creature.name}`, {
          profile: profileView(outcome.creature),
        })
      }),
  )

  server.registerTool(
    'get_portraits',
    {
      title: 'The stock portrait library',
      description:
        'Pre-rendered art the browser already has. Pass a name to update_npc as `portrait`. ' +
        'Two libraries: `folk` are people, named race-role-description, for anyone the player ' +
        'might talk to; `monster` are creatures, named plainly — goblin, owlbear, beholder — ' +
        'for anything on the other side of a fight. Ask for the one you need rather than both. ' +
        'For a walk-on part pick the closest match to what you have already described, rather ' +
        'than describing them to fit the art. `unknown-figure-hooded` is the one to use when ' +
        'the player has not seen a face yet — not when the library merely lacks a good match, ' +
        'which is what leaving the portrait unset is for.',
      inputSchema: {
        kind: z
          .enum(['folk', 'monster'])
          .optional()
          .describe('Which library. Omit for both, which is a long list.'),
      },
    },
    ({ kind }) => {
      const folk = PORTRAIT_LIST.map((name) => ({ name, looks: PORTRAITS[name] }))
      const monsters = BESTIARY_LIST.map((name) => ({ name, looks: BESTIARY[name] }))
      const picked =
        kind === 'folk' ? folk : kind === 'monster' ? monsters : [...folk, ...monsters]
      return ok(`${picked.length} portraits`, { portraits: picked })
    },
  )

  server.registerTool(
    'get_cast',
    {
      title: 'Everyone this campaign remembers',
      description:
        'The full cast with everything recorded about them, hidden notes included. Read this ' +
        'before speaking as anyone you have met before, and always at the start of a session.',
      inputSchema: {},
    },
    () =>
      guard(() =>
        ok(`${store.all().length} in the cast`, {
          cast: store.all().map((creature) => ({
            id: creature.id,
            name: creature.name,
            kind: creature.kind,
            ...profileView(creature),
          })),
        }),
      ),
  )

  // ── the backbone ─────────────────────────────────────────────────────────────

  server.registerTool(
    'set_story',
    {
      title: 'Write the campaign backbone',
      description:
        'Before the first scene: the premise, the question under it, what is actually going on, ' +
        'and the beats that happen if nothing disturbs them. This is what stops the story ' +
        'wandering after a /clear — recap reads it back every session. Beats are not a rail: ' +
        'when the player goes elsewhere, abandon_beat and rewrite the rest.',
      inputSchema: {
        premise: z.string().describe('A sentence or two the player knows from the first scene'),
        question: z.string().describe('The question the campaign is asking'),
        truth: z.string().optional().describe('What is actually going on. Yours alone, always.'),
        beats: z
          .array(z.string())
          .optional()
          .describe('What happens if nothing disturbs it, in rough order. Hidden by default.'),
      },
    },
    ({ premise, question, truth, beats }) =>
      guard(() => {
        const outcome = createStory({
          premise,
          question,
          ...(truth === undefined ? {} : { truth }),
          ...(beats === undefined ? {} : { beats }),
        })
        store.setStory(outcome.story)
        store.commit('set_story', outcome.events)
        return ok('Backbone written', { story: outcome.story })
      }),
  )

  server.registerTool(
    'get_story',
    {
      title: 'Read the backbone',
      description:
        'The whole backbone including the truth and every unrevealed beat. Read it whenever you ' +
        'are deciding where the scene goes, and before dropping a hint.',
      inputSchema: {},
    },
    () =>
      guard(() => {
        const story = store.requireStory()
        return ok(story.premise, { story, ahead: beatsAhead(story) })
      }),
  )

  server.registerTool(
    'amend_story',
    {
      title: 'Rewrite part of the backbone',
      description:
        'The story moved. Change the premise, the question, or the truth, or add a beat the ' +
        'campaign grew. Expected to happen often — the beats were a guess about a story the ' +
        'player had not walked through yet.',
      inputSchema: {
        premise: z.string().optional(),
        question: z.string().optional(),
        truth: z.string().optional(),
        add_beat: z.string().optional(),
      },
    },
    ({ premise, question, truth, add_beat }) =>
      guard(() => {
        let story = store.requireStory()
        const events: GameEvent[] = []

        const patch = {
          ...(premise === undefined ? {} : { premise }),
          ...(question === undefined ? {} : { question }),
          ...(truth === undefined ? {} : { truth }),
        }
        if (Object.keys(patch).length > 0) {
          const outcome = amendStory(story, patch)
          story = outcome.story
          events.push(...outcome.events)
        }
        if (add_beat !== undefined) {
          const outcome = addBeat(story, add_beat)
          story = outcome.story
          events.push(...outcome.events)
        }

        store.setStory(story)
        store.commit('amend_story', events)
        return ok('Backbone amended', { story })
      }),
  )

  server.registerTool(
    'beat',
    {
      title: 'Move a beat',
      description:
        'reached: it happened, and the player was there, so it becomes part of their journal. ' +
        'revealed: they have learned it is coming without reaching it. abandoned: they went ' +
        'somewhere else and it never will — kept rather than deleted, so you can see what the ' +
        'story was going to be while you rewrite the rest.',
      inputSchema: {
        match: z.string().describe('Any distinctive phrase from the beat'),
        op: z.enum(['reached', 'revealed', 'abandoned']),
      },
    },
    ({ match, op }) =>
      guard(() => {
        const story = store.requireStory()
        const outcome =
          op === 'reached'
            ? reachBeat(story, match)
            : op === 'revealed'
              ? revealBeat(story, match)
              : abandonBeat(story, match)

        store.setStory(outcome.story)
        store.commit('beat', outcome.events)
        return ok(`Beat ${op}`, { story: outcome.story, ahead: beatsAhead(outcome.story) })
      }),
  )

  // ── asking the browser ───────────────────────────────────────────────────────

  server.registerTool(
    'offer_choice',
    {
      title: 'Offer the player some options',
      description:
        'Puts a row of options above the composer in the browser. The player can click one or ' +
        'ignore it and type anything else, so this is a shortcut and never a cage — offer ' +
        'obvious options only, and keep narrating as if they might do something else entirely. ' +
        'Do not use it for every fork; use it where the options are genuinely discrete.',
      inputSchema: {
        prompt: z.string().describe('The question, one short line'),
        options: z.array(z.string()).min(2).max(6).describe('What they might do, in their words'),
      },
    },
    ({ prompt, options }) => ok(prompt, { choice: { prompt, options } }),
  )

  server.registerTool(
    'set_rules',
    {
      title: 'How strictly to hold the table',
      description:
        'Set at the start of a campaign, from what the player asked for in their opening ' +
        'brief. `strict_spells` makes the sheet a rule rather than a reminder: cast_spell ' +
        'then refuses anything not written down with learn_spell, no slot is spent, and the ' +
        'refusal lists what they do know. Leave it off and an unknown spell still casts, with ' +
        'the result telling you it was not on the sheet so you can rule on it yourself. ' +
        'Changeable later if the player asks.',
      inputSchema: {
        strict_spells: z
          .boolean()
          .optional()
          .describe('Refuse a cast of anything not on the caster’s sheet. Defaults to off.'),
      },
    },
    ({ strict_spells }) =>
      guard(() => {
        const rules = store.setRules(
          strict_spells === undefined ? {} : { strictSpells: strict_spells },
        )
        store.commit('set_rules', [])
        return ok(
          rules.strictSpells
            ? 'Spells must be on the sheet before they can be cast'
            : 'Spells off the sheet still cast; you will be told when they are',
          { rules },
        )
      }),
  )

  server.registerTool(
    'learn_spell',
    {
      title: 'Write a spell onto a sheet',
      description:
        'Record that a creature knows a spell, with one line on what it does. The player sees ' +
        'it in their options panel with your description, so they do not have to remember. ' +
        'Nothing is enforced and casting is gated on the slot rather than this list — writing ' +
        'it down is for the player\u2019s benefit, not the engine\u2019s. Calling it again updates ' +
        'the entry instead of duplicating it.',
      inputSchema: {
        id: z.string(),
        name: z.string(),
        level: z.number().int().min(0).max(9).describe("The spell's own level; 0 for a cantrip"),
        effect: z
          .string()
          .max(160)
          .optional()
          .describe('What it does, in your words — "marks a target: +1d6 from you, concentration"'),
      },
    },
    ({ id, name, level, effect }) =>
      guard(() => {
        const outcome = learnSpell(store.creature(id), {
          name,
          level,
          ...(effect === undefined ? {} : { effect }),
        })
        store.put(outcome.creature)
        store.commit('learn_spell', outcome.events)
        return ok(`${outcome.creature.name} knows ${outcome.spell.name}`, {
          spells: outcome.creature.spells,
        })
      }),
  )

  server.registerTool(
    'offer_actions',
    {
      title: 'Open the player’s options',
      description:
        'Opens a panel in the browser listing that creature’s weapons, its remaining spell ' +
        'slots and everyone it could target, with a box for anything else. The player picks ' +
        'and the sentence lands in their composer for them to edit and send, so it comes back ' +
        'as an ordinary message. Worth calling at the top of their turn in a fight. The panel ' +
        'is also theirs to open whenever they like, so not calling it costs them nothing — and ' +
        'the names it hands you come straight off the sheet, which is the point.',
      inputSchema: {
        id: z.string().describe('Whose turn it is — usually the player character'),
      },
    },
    ({ id }) =>
      guard(() => {
        // Reading the creature is the whole validation: the browser already has
        // the sheet, so the payload only has to say who, and say it exists.
        const creature = store.creature(id)
        return ok(`${creature.name}’s options`, { actions: { actorId: creature.id } })
      }),
  )

  server.registerTool(
    'open_shop',
    {
      title: 'Open a shop, tavern or trade',
      description:
        'Shows the vendor’s stock in the browser with the player’s purse beside it. Stock is ' +
        'the vendor’s own inventory — add it with give_item and a price, and it stays sold ' +
        'when they buy it. The player picks, and their choice comes back as an ordinary message ' +
        'for you to put through buy or sell.',
      inputSchema: {
        vendor_id: z.string(),
        buyer_id: z.string(),
        can_trade_in: z
          .boolean()
          .optional()
          .describe('Whether the vendor will take goods as well as coin. Defaults to true.'),
      },
    },
    ({ vendor_id, buyer_id, can_trade_in }) =>
      guard(() => {
        const vendor = store.creature(vendor_id)
        const buyer = store.creature(buyer_id)
        const stock = stockFor(vendor)

        if (stock.length === 0) {
          throw new RulesError(
            `${vendor.name} has nothing priced for sale — give_item with a price first`,
          )
        }

        return ok(`${vendor.name} opens up shop`, {
          shop: {
            vendor: {
              id: vendor.id,
              name: vendor.name,
              race: vendor.profile.race,
              role: vendor.profile.role,
              location: vendor.profile.location,
              attitude: vendor.profile.attitude,
            },
            buyer: { id: buyer.id, name: buyer.name, purse: buyer.purse },
            stock: stock.map((item) => ({
              name: item.name,
              qty: item.qty,
              price: item.price ?? 0,
              ...(item.notes === undefined ? {} : { notes: item.notes }),
            })),
            pack: buyer.items.map((item) => ({ name: item.name, qty: item.qty })),
            canTradeIn: can_trade_in ?? true,
          },
        })
      }),
  )
}
