import {
  ABILITIES,
  CONDITION_LIST,
  DAMAGE_TYPES,
  SKILL_LIST,
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
  type D20TestResult,
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
        '1-30 values; modifiers, saves, and skill bonuses are derived from them.',
      inputSchema: {
        id: z.string().describe('Short stable id, e.g. "brann" or "goblin-a"'),
        name: z.string(),
        kind: z.enum(['pc', 'npc']).optional().describe('Defaults to npc'),
        level: z.number().int().min(1).max(20).optional().describe('Defaults to 1'),
        str: z.number().int().min(1).max(30),
        dex: z.number().int().min(1).max(30),
        con: z.number().int().min(1).max(30),
        int: z.number().int().min(1).max(30),
        wis: z.number().int().min(1).max(30),
        cha: z.number().int().min(1).max(30),
        max_hp: z.number().int().min(1),
        hp: z.number().int().min(0).optional().describe('Current HP; defaults to max'),
        ac: z.number().int().min(0),
        speed: z.number().int().min(0).optional().describe('Defaults to 30'),
        save_proficiencies: z.array(abilityEnum).optional(),
        skill_proficiencies: z.array(skillEnum).optional(),
        expertise: z.array(skillEnum).optional().describe('Must also appear in skill_proficiencies'),
        resistances: z.array(damageTypeEnum).optional(),
        vulnerabilities: z.array(damageTypeEnum).optional(),
        immunities: z.array(damageTypeEnum).optional(),
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
          scores: {
            str: args.str,
            dex: args.dex,
            con: args.con,
            int: args.int,
            wis: args.wis,
            cha: args.cha,
          },
          maxHp: args.max_hp,
          ...(args.hp === undefined ? {} : { hp: args.hp }),
          ac: args.ac,
          ...(args.speed === undefined ? {} : { speed: args.speed }),
          proficiencies: {
            saves: args.save_proficiencies ?? [],
            skills: args.skill_proficiencies ?? [],
            expertise: args.expertise ?? [],
          },
          defenses: {
            resistances: args.resistances ?? [],
            vulnerabilities: args.vulnerabilities ?? [],
            immunities: args.immunities ?? [],
          },
          ...(args.dies_at_zero === undefined ? {} : { diesAtZero: args.dies_at_zero }),
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
      description: 'Record where the party is and what is happening, for the state panel and recaps.',
      inputSchema: { scene: z.string() },
    },
    ({ scene }) =>
      guard(() => {
        store.setScene(scene)
        store.commit('set_scene', [{ t: 'scene', scene }])
        return ok('Scene set', { scene })
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
        const test = skillCheck({
          skill,
          scores: creature.scores,
          profBonus: profBonus(creature),
          proficient: creature.proficiencies.skills.includes(skill),
          expertise: creature.proficiencies.expertise.includes(skill),
          ...(bonus === undefined ? {} : { bonus }),
          ...(advantage === undefined ? {} : { advantage }),
          ...(dc === undefined ? {} : { dc }),
          rng: store.rng,
        })
        commitTest(store, 'skill_check', creature.id, `${skill} check`, test)
        return ok(describeTest(`${creature.name} ${skill} check`, test), { test })
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
        ability: abilityEnum.describe('str for a longsword, dex for a bow or finesse weapon'),
        damage: z.string().describe('Damage dice only, e.g. "1d8". The flat bonus goes in damage_bonus'),
        damage_type: damageTypeEnum,
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
        const outcome = attack({
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

        store.put(outcome.target)
        store.commit('attack_roll', outcome.events)

        return ok(`${attacker.name} → ${target.name}: ${outcome.narrationHint}`, {
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
        })
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
      inputSchema: { id: z.string() },
    },
    ({ id }) =>
      guard(() => {
        const outcome = deathSave(store.creature(id), store.rng)
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
