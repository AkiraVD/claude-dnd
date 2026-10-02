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

  // Adventurers rather than townsfolk: the archetypes a player character
  // actually lands on, so a rolled character has a face that does not look
  // like it came to fix the roof.
  'human-mercenary-scarred': 'Woman, mail, scarred jaw, a captain’s indifference',
  'human-warpriest-bloodied': 'Man, bloodied vestments over a breastplate, sunburst',
  'human-courtmage-inked': 'Woman, high collar, ink on her fingers, measuring you',
  'human-outrider-windburnt': 'Man, hood down, windburnt and days unshaven',
  'human-charlatan-easy': 'Woman, fine coat worn badly, a very easy smile',
  'dwarf-shieldbreaker-ringed': 'Man, flat nose, beard plaited through iron rings',
  'dwarf-forgepriest-sooted': 'Woman, soot to the elbows, a hammer pendant',
  'dwarf-runecarver-chalked': 'Old man, spectacles pushed up, chalk and a cut rune',
  'dwarf-pathfinder-furred': 'Woman, furs, a snow-burnt face, red braids',
  'dwarf-dicesharp-gilded': 'Man, a ring on every finger, watching your hands',
  'elf-bladedancer-lacquered': 'Woman, lacquered half-armour, white hair, cold',
  'elf-grovepriest-antlered': 'Man, antler circlet, serene, green and grey',
  'elf-highmage-circleted': 'Woman, silver circlet, pale, remote and unhurried',
  'elf-longstrider-hooded': 'Man, green hood down, a bow stave at his shoulder',
  'elf-silvertongue-cool': 'Woman, dark hair, half a smile and nothing behind it',
  'halfling-bulwark-cheerful': 'Man, a shield far too big for him, entirely cheerful',
  'halfling-hearthpriest-lantern': 'Woman, plain robes, a lit lantern, kind',
  'halfling-hedgemage-singed': 'Man, singed sleeves, a flame in his palm, pleased',
  'halfling-trailwise-muddy': 'Woman, muddy cloak, sharp-eyed, a sprig at her collar',
  'halfling-cardsharp-waistcoated': 'Man, waistcoat, a fan of cards, friendly and lying',
  'half-elf-sellsword-tired': 'Woman, brigandine, tired in a way sleep will not fix',
  'half-elf-wanderingpriest-dusty': 'Man, road dust on a holy symbol, patient',
  'half-elf-hedgewitch-charmed': 'Woman, charms and feathers braided into her hair',
  'half-elf-scout-listening': 'Man, half-cloak, arrows at his shoulder, listening',
  'half-elf-grifter-borrowed': 'Woman, borrowed finery, pearls, delighted with herself',

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


  // Sheet two: the four races the first sheet did not reach, plus the holes it
  // left in the five it did. Between them every class now has a face of every
  // race that is not a baker standing in for a warlock.
  'half-orc-shieldbreaker-notched': 'Man, lower tusks, a notched pauldron, flat stare',
  'half-orc-wanderingpriest-roped': 'Woman, rope belt, a holy symbol cut from bone',
  'half-orc-runecarver-ashen': 'Man, ash-grey skin, runes inked up his throat',
  'half-orc-trailwise-scarred': 'Woman, cropped hair, a hunting scar across her brow',
  'half-orc-charlatan-velvet': 'Man, velvet too fine for him, enjoying it enormously',
  'gnome-bulwark-braced': 'Woman, a tower shield twice her height, braced and calm',
  'gnome-hearthpriest-bearded': 'Old man, white beard, a small lamp, kind eyes',
  'gnome-hedgemage-sparking': 'Woman, goggles pushed up, sparks caught in her hair',
  'gnome-pathfinder-mossy': 'Man, moss-green cloak, a walking stave, weathered',
  'gnome-cardsharp-cuffed': 'Woman, embroidered cuffs, a fan of cards, dangerous',
  'dragonborn-mercenary-brazen': 'Brass scales, one broken horn, mail',
  'dragonborn-wanderingpriest-white': 'White scales, a travelling shrine on her back',
  'dragonborn-highmage-violet': 'Violet scales, a staff, serene and remote',
  'dragonborn-trailwise-copper': 'Copper scales, a bow, reading the ground',
  'dragonborn-silvertongue-black': 'Black scales, gold at the throat, amused',
  'tiefling-sellsword-chipped': 'Woman, red skin, one chipped horn, brigandine',
  'tiefling-hearthpriest-candle': 'Man, blue skin, a lit candle cupped in his hand, gentle',
  'tiefling-runecarver-scribed': 'Woman, purple skin, a scribed slate, absorbed',
  'tiefling-pathfinder-ragged': 'Man, ragged cloak, long horns swept back, watchful',
  'tiefling-grifter-silvered': 'Woman, silver that is not hers, delighted with herself',
  'human-hedgewitch-wreathed': 'Woman, dried herbs wreathed at her shoulder, knowing',
  'human-bladedancer-shorn': 'Man, shorn head, wrapped hands, completely still',
  'dwarf-bladedancer-knuckled': 'Man, wrapped knuckles, beard bound short, balanced',
  'elf-warpriest-plated': 'Woman, gilt-edged plate, a sunburst, unsmiling',
  'half-elf-courtmage-quilled': 'Man, a quill behind his ear, court robes, tired and sharp',

  // Sheet three: the working town the first two sheets had no room for.
  // Trades, not adventurers — the people a walk-on part is cast from.
  'half-elf-warpriest-grim': 'Woman, gilt-edged breastplate, a sunburst, grim and tired',
  'human-ferryman-lined': 'Man in his fifties, river-weathered, a coiled line',
  'dwarf-ratcatcher-caged': 'Woman, a wire cage and a terrier, cheerfully filthy',
  'gnome-bonesetter-splinted': 'Man, spectacles, splints and linen at his belt',
  'half-orc-cartwright-sawdust': 'Woman, sawdust in her hair, a spoke-shave in hand',
  'elf-falconer-gauntleted': 'Man, a hooded hawk on his gauntlet, patient',
  'halfling-chandler-waxed': 'Woman, wax-spattered apron, a bundle of tapers',
  'human-cooper-staved': 'Man, barrel staves under one arm, forearms like cables',
  'dwarf-miner-lamped': 'Man, lamp on his helm, coal dust in every crease',
  'human-shepherd-weathered': 'Woman in her sixties, crook, a face made of weather',
  'tiefling-weaver-threaded': 'Woman, blue skin, thread wound round her fingers',
  'half-orc-tanner-stained': 'Man, leather apron, stained to the elbow, resigned',
  'gnome-glassblower-glowing': 'Woman, goggles, a glowing gather on the pipe',
  'half-elf-bookbinder-awled': 'Man, thread and awl, ink under his nails',
  'halfling-beekeeper-veiled': 'Man, veil pushed back, smoker in hand, calm',
  'human-ropemaker-fibred': 'Woman, hemp fibres caught on her sleeves',
  'dwarf-midwife-steady': 'Woman in her fifties, sleeves rolled, steady hands',
  'human-tollkeeper-ledgered': 'Man, a ledger and a cudgel, bored and unbribable',
  'dragonborn-horsetrader-bridled': 'Green scales, a bridle over his shoulder',
  'half-orc-pitboss-counting': 'Woman, arms crossed, counting the house',
  'tiefling-undertaker-courteous': 'Man, red skin, black coat, courteous',
  'elf-bellringer-ropeburnt': 'Woman, rope-burned palms, hair tied back',
  'human-charcoalburner-sooted': 'Man, soot-black face, white eyes, exhausted',
  'halfling-miller-floured': 'Woman, flour to the elbows, a sack on her hip',
  // The one that fits when nothing fits. Race-neutral, gender-neutral and
  // faceless by construction, so it can never contradict what the DM has
  // already said out loud.
  'unknown-figure-hooded': 'A hooded figure, face lost in the shadow of the cowl',
} as const

export type PortraitName = keyof typeof PORTRAITS

export const PORTRAIT_LIST = Object.keys(PORTRAITS) as PortraitName[]

export function isPortrait(value: string): value is PortraitName {
  return value in PORTRAITS
}

/**
 * The bestiary.
 *
 * Kept apart from PORTRAITS for two reasons. The DM asks for these by the
 * creature's own name rather than by race and role, and lumping them together
 * would hand it a hundred-odd entries every time it wanted a face for a barkeep.
 *
 * Framed whole rather than head-and-shoulders: a displacer beast or a
 * will-o'-wisp has no head worth cropping to. The browser leans the crop upward
 * for these so a standing figure still shows its face in a small circle.
 */
export const BESTIARY = {
  'goblin': 'Small, wiry, notched ear, crude spear',
  'hobgoblin': 'Disciplined, orange-skinned, lamellar armour',
  'bugbear': 'Hulking, matted fur, morningstar',
  'orc': 'Tusked, war paint, heavy axe',
  'kobold': 'Small, rust-red scales, sling',
  'gnoll': 'Hyena-headed, strings of teeth, stooped',
  'bandit': 'Hooded, shortbow, road-worn leathers',
  'cultist': 'Robed and hooded, curved dagger',
  'skeleton': 'Bare bones, rusted helm and shield',
  'zombie': 'Slack-jawed, grey, dragging one leg',
  'ghoul': 'Crouched, gaunt, long claws and teeth',
  'wolf': 'Grey, lean, head low',
  'dire-wolf': 'Huge and black, shoulders at a man’s chest',
  'giant-spider': 'Legs splayed, eight eyes, bristled',
  'giant-rat': 'Wet fur, yellow teeth, long tail',
  'ogre': 'Vast belly, dull-eyed, club over the shoulder',
  'troll': 'Long-limbed, green, rubbery, hunched',
  'harpy': 'Perched, ragged feathers, a woman’s face',
  'lizardfolk': 'Green scales, flat eyes, bone spear',
  'owlbear': 'Reared up, beak and matted brown fur',
  'wight': 'Old armour, cold light where the eyes were',
  'bandit-captain': 'Scimitar, red cloak, better armour than his men',
  'hill-giant': 'Massive, filthy, a tree trunk for a club',
  'minotaur': 'Bull-headed, horned, greataxe',
  'drow-raider': 'White hair, dark skin, hand crossbow, crouched',
  'vampire-spawn': 'Pale, crouched, bloodied mouth, claws out',
  'mummy': 'Wrapped and trailing bandages, arms reaching',
  'ghost': 'Translucent, drifting, mouth open in a wail',
  'banshee': 'Tattered grey, screaming, hair streaming',
  'doppelganger': 'Mid-shift, grey, a blank and featureless face',
  'mind-flayer': 'Tentacled mouth, dark robes, long fingers',
  'beholder': 'Floating sphere, one great eye, many eyestalks',
  'medusa': 'Snakes for hair, bow drawn, green-skinned',
  'hell-hound': 'Burning maw, smoking hide, embers in the fur',
  'imp': 'Small, red, barbed tail, bat wings',
  'werewolf': 'Caught mid-change, half man, half wolf',
  'wererat': 'Hunched, long snout, patchy fur, quick',
  'sahuagin': 'Shark-like, finned, trident',
  'yuan-ti': 'Snake-bodied from the waist, bow in hand',
  'kuo-toa': 'Bulging fish eyes, slick grey skin, net',
  'duergar': 'Grey dwarf, dour, war hammer',
  'drow-priestess': 'Dark elf, spider motifs worked into her armour',
  'death-knight': 'Black plate, greatsword, light in the visor',
  'lich': 'Skeletal, crowned, staff, cold blue fire',
  'red-wyrmling': 'Young red dragon, wings spread, snarling',
  'green-dragon': 'Young green dragon, coiled, horned frill',
  'gargoyle': 'Stone, perched and hunched, wings folded',
  'animated-armour': 'Empty plate standing on its own, sword raised',
  'will-o-wisp': 'A pale drifting light with the faintest shape in it',
  'displacer-beast': 'Black panther, two barbed tentacles from its shoulders',
} as const

export type BeastName = keyof typeof BESTIARY

export const BESTIARY_LIST = Object.keys(BESTIARY) as BeastName[]

export function isBeast(value: string): value is BeastName {
  return value in BESTIARY
}

/** Either library, for anything that just needs to resolve a name to a file. */
export function portraitKind(value: string): 'folk' | 'monster' | null {
  if (value in PORTRAITS) return 'folk'
  if (value in BESTIARY) return 'monster'
  return null
}

/**
 * The portrait for someone the library has no face for.
 *
 * Better than no picture: an empty avatar reads as a bug, and a face of the
 * wrong race reads as the DM contradicting itself. A hood is neither — it is a
 * person whose face you have not seen yet, which is true.
 */
/**
 * Whether each portrait is of a man or a woman, where the picture says.
 *
 * It is written down rather than read out of the description, because the
 * description is prose and prose is not a schema: "herbalist" contains her,
 * "human" contains man, and a regex that gets those right today gets the next
 * entry wrong. Derived from the descriptions once and checked by eye; a new
 * portrait adds a line here, and `portraits.test.ts` fails if one is missing.
 *
 * Null where the picture genuinely does not say — the dragonborn are scales and
 * harness, and the hooded figure is faceless on purpose. Null is an answer, not
 * a gap: it means the portrait constrains nothing.
 *
 * What this is for: a character whose name reads female to an English speaker
 * and whose portrait is a bearded man is a contradiction the DM has to resolve,
 * and in a language that marks gender on every verb it has to resolve it in the
 * first sentence. This is how the engine knows which of the two to believe.
 */
export const PORTRAIT_GENDER: Record<PortraitName, 'male' | 'female' | null> = {
  'human-guard-scarred': 'male',
  'human-merchant-stout': 'female',
  'human-farmer-weathered': 'male',
  'human-priest-gaunt': null,
  'dwarf-smith-broad': 'male',
  'dwarf-innkeeper-grey': 'female',
  'elf-scholar-cold': 'male',
  'elf-scout-lean': 'female',
  'halfling-cook-round': 'female',
  'halfling-thief-quick': 'male',
  'half-orc-guard-tusked': 'male',
  'half-orc-labourer-huge': 'female',
  'tiefling-fence-horned': 'male',
  'gnome-tinker-spectacled': 'male',
  'half-elf-sailor-tanned': 'female',
  'dragonborn-soldier-scaled': 'male',
  'human-baker-floured': 'male',
  'dwarf-silversmith-loupe': 'female',
  'elf-apothecary-spectacled': null,
  'halfling-server-braided': 'female',
  'half-orc-butcher-aproned': 'male',
  'tiefling-moneylender-swept': 'female',
  'gnome-clockmaker-white': 'male',
  'dragonborn-dockmaster-green': 'male',
  'half-elf-scribe-inked': 'male',
  'human-herbalist-kerchief': 'female',
  'dwarf-brewer-young': 'male',
  'elf-draper-cold': 'female',
  'halfling-cheesemonger-round': 'male',
  'half-orc-blacksmith-grey': 'female',
  'tiefling-pawnbroker-blue': 'male',
  'gnome-lensgrinder-goggled': 'female',
  'dragonborn-caravan-bronze': 'male',
  'half-elf-innkeeper-unimpressed': 'female',
  'human-stablehand-straw': 'male',
  'dwarf-moneychanger-shrewd': 'female',
  'elf-lamplighter-sooty': 'male',
  'halfling-laundress-strong': 'female',
  'half-orc-quarryman-dusted': 'male',
  'tiefling-fortuneteller-white': 'female',
  'human-fishwife-salted': 'female',
  'human-mercenary-scarred': 'female',
  'human-warpriest-bloodied': 'male',
  'human-courtmage-inked': 'female',
  'human-outrider-windburnt': 'male',
  'human-charlatan-easy': 'female',
  'dwarf-shieldbreaker-ringed': 'male',
  'dwarf-forgepriest-sooted': 'female',
  'dwarf-runecarver-chalked': 'male',
  'dwarf-pathfinder-furred': 'female',
  'dwarf-dicesharp-gilded': 'male',
  'elf-bladedancer-lacquered': 'female',
  'elf-grovepriest-antlered': 'male',
  'elf-highmage-circleted': 'female',
  'elf-longstrider-hooded': 'male',
  'elf-silvertongue-cool': 'female',
  'halfling-bulwark-cheerful': 'male',
  'halfling-hearthpriest-lantern': 'female',
  'halfling-hedgemage-singed': 'male',
  'halfling-trailwise-muddy': 'female',
  'halfling-cardsharp-waistcoated': 'male',
  'half-elf-sellsword-tired': 'female',
  'half-elf-wanderingpriest-dusty': 'male',
  'half-elf-hedgewitch-charmed': 'female',
  'half-elf-scout-listening': 'male',
  'half-elf-grifter-borrowed': 'female',
  'human-sergeant-broken': 'male',
  'dwarf-warden-plaited': 'male',
  'elf-priestess-circlet': 'female',
  'halfling-pickpocket-sharp': 'male',
  'half-orc-mercenary-shaven': 'female',
  'tiefling-inquisitor-black': 'male',
  'gnome-hedgewitch-tangled': 'female',
  'dragonborn-pitfighter-red': 'male',
  'half-elf-courier-windburnt': 'female',
  'human-abbess-wimple': 'female',
  'dwarf-sapper-sooted': 'female',
  'elf-archivist-severe': 'male',
  'halfling-poisoner-pleasant': 'female',
  'half-orc-veteran-oneeyed': 'male',
  'tiefling-preacher-fervent': 'female',
  'gnome-forger-loupe': 'male',
  'dragonborn-oracle-white': 'male',
  'half-elf-spymaster-grey': 'male',
  'human-novice-shaven': 'male',
  'dwarf-gaoler-keys': 'male',
  'elf-duellist-scarred': 'female',
  'halfling-sexton-spade': 'male',
  'half-orc-drummer-painted': 'female',
  'tiefling-gravekeeper-ash': 'male',
  'human-bounty-hooded': 'female',
  'half-orc-shieldbreaker-notched': 'male',
  'half-orc-wanderingpriest-roped': 'female',
  'half-orc-runecarver-ashen': 'male',
  'half-orc-trailwise-scarred': 'female',
  'half-orc-charlatan-velvet': 'male',
  'gnome-bulwark-braced': 'female',
  'gnome-hearthpriest-bearded': 'male',
  'gnome-hedgemage-sparking': 'female',
  'gnome-pathfinder-mossy': 'male',
  'gnome-cardsharp-cuffed': 'female',
  'dragonborn-mercenary-brazen': 'male',
  'dragonborn-wanderingpriest-white': 'female',
  'dragonborn-highmage-violet': 'male',
  'dragonborn-trailwise-copper': 'female',
  'dragonborn-silvertongue-black': 'male',
  'tiefling-sellsword-chipped': 'female',
  'tiefling-hearthpriest-candle': 'male',
  'tiefling-runecarver-scribed': 'female',
  'tiefling-pathfinder-ragged': 'male',
  'tiefling-grifter-silvered': 'female',
  'human-hedgewitch-wreathed': 'female',
  'human-bladedancer-shorn': 'male',
  'dwarf-bladedancer-knuckled': 'male',
  'elf-warpriest-plated': 'female',
  'half-elf-courtmage-quilled': 'male',
  'half-elf-warpriest-grim': 'female',
  'human-ferryman-lined': 'male',
  'dwarf-ratcatcher-caged': 'female',
  'gnome-bonesetter-splinted': 'male',
  'half-orc-cartwright-sawdust': 'female',
  'elf-falconer-gauntleted': 'male',
  'halfling-chandler-waxed': 'female',
  'human-cooper-staved': 'male',
  'dwarf-miner-lamped': 'male',
  'human-shepherd-weathered': 'female',
  'tiefling-weaver-threaded': 'female',
  'half-orc-tanner-stained': 'male',
  'gnome-glassblower-glowing': 'female',
  'half-elf-bookbinder-awled': 'male',
  'halfling-beekeeper-veiled': 'male',
  'human-ropemaker-fibred': 'female',
  'dwarf-midwife-steady': 'female',
  'human-tollkeeper-ledgered': 'male',
  'dragonborn-horsetrader-bridled': 'male',
  'half-orc-pitboss-counting': 'female',
  'tiefling-undertaker-courteous': 'male',
  'elf-bellringer-ropeburnt': 'female',
  'human-charcoalburner-sooted': 'male',
  'halfling-miller-floured': 'female',
  'unknown-figure-hooded': null,
}

export type Gender = 'male' | 'female'

/** The gender a portrait commits to, or null where it commits to none. */
export function genderOfPortrait(name: string): Gender | null {
  return (PORTRAIT_GENDER as Record<string, Gender | null>)[name] ?? null
}

/** The pronouns the DM should use for a portrait, or null to leave it open. */
export function pronounsForPortrait(name: string): string | null {
  const gender = genderOfPortrait(name)
  if (gender === null) return null
  return gender === 'male' ? 'he/him' : 'she/her'
}

export const UNKNOWN_PORTRAIT: PortraitName = 'unknown-figure-hooded'
