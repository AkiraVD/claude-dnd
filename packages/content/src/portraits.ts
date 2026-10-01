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

  // The working town — trades, counters and the people behind them.
  'human-baker-floured': 'Man in his late fifties, flour in his beard, linen cap',
  'dwarf-silversmith-loupe': 'Woman, jeweller’s loupe pushed up on her brow, rings',
  'elf-apothecary-spectacled': 'Narrow spectacles, pale braid, phials at the shoulder',
  'halfling-server-braided': 'Young woman, braid pinned up, tankards, quick smile',
  'half-orc-butcher-aproned': 'Man, heavy jaw, leather apron, forearms like hams',
  'tiefling-moneylender-swept': 'Woman, dark red skin, horns swept back, gold at the ear',
  'gnome-clockmaker-white': 'Old man, wild white hair, loupes on a headband, a key',
  'dragonborn-dockmaster-green': 'Green scales, coil of rope on the shoulder, unhurried',
  'half-elf-scribe-inked': 'Young man, ink-stained fingers, quill, dark curls',
  'human-herbalist-kerchief': 'Woman in her sixties, kerchief, an armful of cut herbs',
  'dwarf-brewer-young': 'Young man, red beard in rings, sleeves soaked to the elbow',
  'elf-draper-cold': 'Woman, pale braid, fine collar, cold and measuring',
  'halfling-cheesemonger-round': 'Round man, apron, a wheel of cheese under one arm',
  'half-orc-blacksmith-grey': 'Woman in her fifties, grey streak, burn scars, hammer',
  'tiefling-pawnbroker-blue': 'Young man, blue skin, small horns, a pocket watch, sly',
  'gnome-lensgrinder-goggled': 'Woman, goggles pushed up, a lens held to the light',
  'dragonborn-caravan-bronze': 'Bronze scales, travelling harness, patient and stoic',
  'half-elf-innkeeper-unimpressed': 'Woman in her forties, grey at the temple, unimpressed',
  'human-stablehand-straw': 'Young man, straw in his hair, pitchfork, sunburnt',
  'dwarf-moneychanger-shrewd': 'Old woman, spectacles, scales and coin, shrewd',
  'elf-lamplighter-sooty': 'Young man, soot on his cuffs, lantern on a pole',
  'halfling-laundress-strong': 'Old woman, headscarf, strong forearms, wrung linen',
  'half-orc-quarryman-dusted': 'Man in his forties, stone dust in his hair and beard',
  'tiefling-fortuneteller-white': 'Old woman, white horns, many rings, a fan of cards',
  'human-fishwife-salted': 'Woman in her thirties, salt-bleached hair, oilskin',

  // The road, the temple, and the people you would rather avoid.
  'human-sergeant-broken': 'Man in his forties, mail coif, broken nose, watch badge',
  'dwarf-warden-plaited': 'Old man, long white plaits, temple staff, gold fittings',
  'elf-priestess-circlet': 'Woman, plain circlet, pale hair, severe and composed',
  'halfling-pickpocket-sharp': 'Young man, very quick eyes, scarf, hands out of sight',
  'half-orc-mercenary-shaven': 'Woman, shaved head, lower tusks, scarred, captain’s rings',
  'tiefling-inquisitor-black': 'Man in his fifties, black horns, severe high collar',
  'gnome-hedgewitch-tangled': 'Old woman, tangled grey hair, twigs and charms in it',
  'dragonborn-pitfighter-red': 'Red scales, scarred snout, harness, nothing to prove',
  'half-elf-courier-windburnt': 'Young woman, hood down, windburnt, road-dust',
  'human-abbess-wimple': 'Woman in her fifties, plain wimple, level gaze',
  'dwarf-sapper-sooted': 'Woman, soot-black face, red hair, powder horn',
  'elf-archivist-severe': 'Old man, spectacles, thin, an armful of scrolls',
  'halfling-poisoner-pleasant': 'Woman in her forties, pleasant smile, a green phial',
  'half-orc-veteran-oneeyed': 'Old man, one eye gone, white stubble, old harness',
  'tiefling-preacher-fervent': 'Young woman, curling horns, fervent, a sun medallion',
  'gnome-forger-loupe': 'Man in his thirties, loupe, ink on his hands, a document',
  'dragonborn-oracle-white': 'White scales, milky eyes, gold chains, still',
  'half-elf-spymaster-grey': 'Man in his fifties, grey at the temples, pleasant, unreadable',
  'human-novice-shaven': 'Young man, shaved head, saffron robe, hands together',
  'dwarf-gaoler-keys': 'Man in his forties, red beard, a heavy ring of keys',
  'elf-duellist-scarred': 'Young woman, a scar across one cheek, blade at her shoulder',
  'halfling-sexton-spade': 'Old man, flat cap, spade over his shoulder',
  'half-orc-drummer-painted': 'Young woman, red war paint, braids, a war drum',
  'tiefling-gravekeeper-ash': 'Old man, ash-grey skin, curling horns, a skull-topped staff',
  'human-bounty-hooded': 'Woman in her forties, leather hood, dark braid, watchful',
} as const

export type PortraitName = keyof typeof PORTRAITS

export const PORTRAIT_LIST = Object.keys(PORTRAITS) as PortraitName[]

export function isPortrait(value: string): value is PortraitName {
  return value in PORTRAITS
}
