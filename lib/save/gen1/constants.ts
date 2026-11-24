/**
 * Save format constants for generation I (Red, Blue, Yellow; Western versions), a 32 KiB SRAM image.
 *
 * Sources: pret/pokered and pret/pokeyellow (`ram/sram.asm`, `ram/wram.asm`, `engine/menus/save.asm`,
 * `engine/pokemon/evos_moves.asm`), and PKHeX `SaveUtil.cs` / `SAV1.cs` (offsets and game detection),
 * read as documentation only; no code was copied (GPLv3). Offsets were confirmed on the real saves in
 * tests/fixtures/third-party/saves/gen1/ (Red, Yellow and a Delta export of Red).
 */
export const SAVE_SIZE = 0x8000;

/** Bank 1 (file offset 0x2000): sGameData starts after 0x598 unused bytes. Source: pret ram/sram.asm "Save Data". */
export const PLAYER_NAME = 0x2598;
export const NAME_LENGTH = 11;
/** sMainData starts right after the player name and begins with the Pokédex. Source: pret ram/wram.asm `wMainDataStart` = `wPokedexOwned`. */
export const DEX_OWNED = 0x25a3;
export const DEX_FLAG_BYTES = 19;
export const DEX_SEEN = DEX_OWNED + DEX_FLAG_BYTES;
export const PLAYER_ID = 0x2605;
/** `wCurrentBoxNum`: bit 7 set once the player changed boxes (before that the SRAM boxes are uninitialised). Source: pret save.asm `BIT_HAS_CHANGED_BOXES`. */
export const CURRENT_BOX_NUM = 0x284c;
export const BOX_NUM_MASK = 0x7f;
export const BOX_CHANGED_BIT = 0x80;
export const PARTY = 0x2f2c;
export const CUR_BOX = 0x30c0;
/** The checksum covers sGameData (the player name) up to sGameDataEnd and is stored right after. */
export const CHECKSUM_START = PLAYER_NAME;
export const CHECKSUM_OFFSET = 0x3523;

/** Yellow tells itself by the starter and Pikachu friendship bytes. Source: PKHeX SAV1.cs `IsYellowINT`. */
export const STARTER = 0x29c3;
export const PIKACHU_FRIENDSHIP = 0x271c;
export const STARTER_PIKACHU = 0x54;

export const PARTY_SLOTS = 6;
export const BOX_SLOTS = 20;
export const BOX_COUNT = 12;
/** Struct sizes. Source: pret ram/wram.asm `box_struct` (33), `party_struct` (44). */
export const BOX_MON_SIZE = 33;
export const PARTY_MON_SIZE = 44;

/** Layout of a stored list: count, species list (slots + terminator), the Pokémon, OT names, nicknames. */
export const LIST_COUNT = 0;
export const LIST_SPECIES = 1;
export const PARTY_MONS = LIST_SPECIES + PARTY_SLOTS + 1;
export const PARTY_OT = PARTY_MONS + PARTY_SLOTS * PARTY_MON_SIZE;
export const PARTY_NICKS = PARTY_OT + PARTY_SLOTS * NAME_LENGTH;
export const BOX_MONS = LIST_SPECIES + BOX_SLOTS + 1;
export const BOX_OT = BOX_MONS + BOX_SLOTS * BOX_MON_SIZE;
export const BOX_NICKS = BOX_OT + BOX_SLOTS * NAME_LENGTH;
/** Size of one box. Source: pret ram/sram.asm `wBoxDataEnd - wBoxDataStart`. */
export const BOX_SIZE = BOX_NICKS + BOX_SLOTS * NAME_LENGTH;

/** Boxes 1-6 in bank 2 (0x4000) and 7-12 in bank 3 (0x6000); each bank ends with a checksum of all six boxes and one per box. Source: pret ram/sram.asm "Saved Boxes". */
export const BOX_BANKS = [0x4000, 0x6000] as const;
export const BOXES_PER_BANK = 6;
export const BANK_ALL_CHECKSUM = BOXES_PER_BANK * BOX_SIZE;
export const BANK_BOX_CHECKSUMS = BANK_ALL_CHECKSUM + 1;

// Offsets inside a Pokémon structure (pret `red_box_struct` / `red_party_struct`; PKHeX PK1.cs).
export const MON_SPECIES = 0;
export const MON_HP = 1;
export const MON_BOX_LEVEL = 3;
export const MON_TYPE1 = 5;
export const MON_OT_ID = 12;
export const MON_EXP = 14;
export const MON_STAT_EXP = 17;
export const MON_DVS = 27;
export const MON_LEVEL = 33;
export const MON_MAX_HP = 34;
/** Atk, Def, Spd, Spc follow the max HP, 2 bytes each. */
export const MON_STATS = 34;
