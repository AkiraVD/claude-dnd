/**
 * What the DM is doing, in words, while it does it.
 *
 * A tool call reaches the browser only once it is complete, and assembling one
 * is where the time goes: `set_story` writes the premise, the question and the
 * beats into a single argument, which took 24 seconds in the session that
 * prompted this against 2 to 4 for an ordinary call. Three dots for 24 seconds
 * reads as a hang, and the player's next move is to reload — which, before the
 * transcript survived that, lost the lot.
 *
 * Phrased as what is happening at the table rather than as the tool's name. The
 * player did not install an MCP server; they are waiting on a dungeon master.
 */
const DOING: Record<string, string> = {
  set_story: 'writing the backbone of the story',
  amend_story: 'revising the story',
  beat: 'moving the story on',
  set_scene: 'setting the scene',
  add_creature: 'bringing someone in',
  update_npc: 'writing someone down',
  add_note: 'making a note',
  reveal_note: 'letting something slip',
  remove_creature: 'clearing the board',

  roll_dice: 'rolling',
  attack_roll: 'resolving the attack',
  ability_check: 'working out the check',
  skill_check: 'working out the check',
  saving_throw: 'calling for a save',
  death_save: 'counting the death save',
  concentration_save: 'testing concentration',
  apply_damage: 'applying the damage',
  heal: 'patching you up',
  kill: 'finishing it',
  stabilise: 'stabilising',
  apply_condition: 'applying the condition',
  remove_condition: 'lifting the condition',
  set_exhaustion: 'counting the exhaustion',
  apply_temp_hp: 'adding temporary hit points',

  start_combat: 'rolling initiative',
  next_turn: 'passing the turn',
  end_combat: 'ending the fight',
  remove_from_combat: 'taking them out of the order',

  cast_spell: 'spending the slot',
  learn_spell: 'writing the spell down',
  spend_resource: 'spending it',
  add_resource: 'writing it on the sheet',
  list_resources: 'checking what is left',
  short_rest: 'taking a short rest',
  long_rest: 'taking a long rest',
  spend_hit_die: 'spending a hit die',
  level_up: 'levelling you up',
  award_xp: 'awarding experience',

  give_item: 'handing it over',
  take_item: 'taking it',
  buy: 'ringing it up',
  sell: 'buying it off you',
  open_shop: 'opening the counter',
  earn_money: 'counting out the coin',
  spend_money: 'taking the coin',
  get_purse: 'counting your purse',

  offer_choice: 'offering you the options',
  offer_actions: 'laying out your options',
  recap: 'reading back over it',
  get_state: 'looking at the table',
  get_cast: 'reading the cast',
  get_story: 'reading the backbone',
  get_character_sheet: 'reading your sheet',
  get_combat_state: 'checking the order',
  recent_events: 'reading what just happened',
  get_portraits: 'looking through the faces',

  new_campaign: 'opening a new campaign',
  load_campaign: 'loading the campaign',
  reset_campaign: 'clearing the table',
  rename_campaign: 'renaming the campaign',
  list_campaigns: 'looking at the saves',
  undo: 'taking that back',
}

/**
 * A phrase for the tool, or a readable fallback.
 *
 * The fallback matters: there are 65 tools and this list will fall behind one
 * of them. `add_creature` reading as "add creature" is worse than the phrase and
 * much better than three dots.
 */
export function doingLabel(name: string | null): string | null {
  if (name === null || name.trim() === '') return null
  const known = DOING[name]
  if (known !== undefined) return known
  return name.replace(/^mcp__dnd__/, '').replace(/_/g, ' ')
}
