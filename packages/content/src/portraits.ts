/**
 * The stock portrait library.
 *
 * Pre-rendered art for NPCs nobody will remember the name of — a guard, a
 * barkeep, the third fence in a row. Named `race-role-description` so the DM can
 * pick one close to what it has already said out loud, rather than the art
 * contradicting the prose.
 *
 * Deliberately a catalogue rather than a directory listing: the MCP server and
 * the browser are different processes with different working directories, and a
 * name that exists in one and not the other should fail a test, not a session.
 * `portraits.test.ts` in `@dnd/web` checks every entry has a file.
 */
export const PORTRAITS = {
  'human-guard-scarred': 'Middle-aged man, scar across one cheek, mail coif, bored',
  'human-merchant-stout': 'Stout woman, fur-trimmed coat, shrewd, heavy rings',
  'human-farmer-weathered': 'Sun-browned man, patched smock, straw hat',
  'human-priest-gaunt': 'Gaunt priest, shaved head, grey habit, tired',
  'dwarf-smith-broad': 'Broad man, soot-streaked beard, leather apron, burn scars',
  'dwarf-innkeeper-grey': 'Grey-haired woman, apron, arms folded, unimpressed',
  'elf-scholar-cold': 'Man, long pale hair, high collar, cold and distant',
  'elf-scout-lean': 'Lean woman, cropped dark hair, green hood down, watchful',
  'halfling-cook-round': 'Round-faced woman, flour on her hands, laugh lines',
  'halfling-thief-quick': 'Young man, quick eyes, dark scarf, half-smile',
  'half-orc-guard-tusked': 'Man, lower tusks, shaved scalp, studded leather',
  'half-orc-labourer-huge': 'Huge woman, broad shoulders, coiled rope, calm',
  'tiefling-fence-horned': 'Man, curling horns, red skin, worn velvet, sly',
  'gnome-tinker-spectacled': 'Man, brass spectacles, wild white hair, soot',
  'half-elf-sailor-tanned': 'Woman, salt-bleached hair, gold earring, oilskin',
  'dragonborn-soldier-scaled': 'Bronze scales, soldier’s harness, stoic',
} as const

export type PortraitName = keyof typeof PORTRAITS

export const PORTRAIT_LIST = Object.keys(PORTRAITS) as PortraitName[]

export function isPortrait(value: string): value is PortraitName {
  return value in PORTRAITS
}
