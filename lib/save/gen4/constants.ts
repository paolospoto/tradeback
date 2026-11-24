/**
 * Save format constants for the Generation IV games (DS): Diamond/Pearl,
 * Platinum and HeartGold/SoulSilver.
 *
 * Every value cites its source. Two independent references were used and
 * cross-checked (see docs/formats/gen4.md for the full notes):
 *
 * - PKHeX (github.com/kwsch/PKHeX, commit 6c95838, 2026-11-16; Diamond/Pearl and
 *   HeartGold/SoulSilver values re-read on `master`, 2026-11-23), read as
 *   documentation only. No code was copied (GPLv3).
 * - pret decompilations (github.com/pret/pokeplatinum, pret/pokediamond,
 *   pret/pokeheartgold, 2026-11), which show what the games themselves do.
 *   Read as documentation only.
 *
 * All multi-byte values are little-endian.
 */

/** Raw DS save size: 512 KiB. Source: PKHeX SaveUtil.cs `SIZE_G4RAW = 0x80000`. */
export const SAVE_SIZE = 0x80000;

/**
 * Offset of the second save partition. Source: PKHeX SAV4.cs `PartitionSize = 0x40000`;
 * pret include/constants/savedata/savedata.h `BACKUP_SECTOR_START 64` x `SAVE_SECTOR_SIZE 0x1000`.
 */
export const PARTITION_SIZE = 0x40000;

/** Number of partitions (primary at 0, backup at {@link PARTITION_SIZE}). */
export const PARTITION_COUNT = 2;

/**
 * DeSmuME appends a 0x7A-byte footer ending in this marker to raw saves.
 * Source: PKHeX Saves/Util/Recognition/SaveHandlerDeSmuME.cs.
 */
export const DESMUME_FOOTER_SIZE = 0x7a;
export const DESMUME_FOOTER_MARKER = "|-DESMUME SAVE-|";

/** Size of the general ("normal") block. Source: PKHeX SAV4Pt.cs `GeneralSize = 0xCF2C`. */
export const PT_GENERAL_SIZE = 0xcf2c;

/**
 * Offset of the storage (PC boxes) block inside a partition: right after the
 * general block. Source: PKHeX SAV4Pt.cs constructor (`sStart = GeneralSize`) and
 * the comment `StorageSize = 0x121E4; // Start 0xCF2C`.
 */
export const PT_STORAGE_OFFSET = 0xcf2c;

/** Size of the storage block. Source: PKHeX SAV4Pt.cs `StorageSize = 0x121E4`. */
export const PT_STORAGE_SIZE = 0x121e4;

/**
 * Diamond/Pearl blocks. Source: PKHeX SAV4DP.cs `GeneralSize = 0xC100`,
 * `StorageSize = 0x121E0 // Start 0xC100` (storage right after the general block).
 * Confirmed on tests/fixtures/third-party/saves/gen4/diamond.sav (footer sizes and CRCs).
 */
export const DP_GENERAL_SIZE = 0xc100;
export const DP_STORAGE_OFFSET = 0xc100;
export const DP_STORAGE_SIZE = 0x121e0;

/**
 * HeartGold/SoulSilver blocks. Source: PKHeX SAV4HGSS.cs `GeneralSize = 0xF628`,
 * `GeneralGap = 0xD8` (storage at 0xF628 + 0xD8 = 0xF700), `StorageSize = 0x12310`;
 * pret/pokeheartgold src/save.c `SaveData_InitSlotSpecs` (each slot is rounded up to
 * the next 0x100 bytes, so the storage slot starts at 0xF700).
 * Confirmed on tests/fixtures/third-party/saves/gen4/soulsilver.sav.
 */
export const HGSS_GENERAL_SIZE = 0xf628;
export const HGSS_STORAGE_OFFSET = 0xf700;
export const HGSS_STORAGE_SIZE = 0x12310;

/**
 * Block footer, the last 0x14 bytes of each Diamond/Pearl/Platinum block.
 * Source: pret include/savedata.h `SaveBlockFooter` { u32 saveCounter; u32 blockCounter;
 * u32 size; u32 signature; u8 saveBlockID; u16 checksum; } (pret/pokediamond
 * include/save.h `SaveChunkFooter` has the same layout) and PKHeX SAV4Sinnoh.cs
 * `FooterSize => 0x14`. Offsets below are relative to the footer start.
 * HeartGold/SoulSilver use a shorter footer: see {@link HGSS_FOOTER}.
 */
export const FOOTER_SIZE = 0x14;
export const FOOTER_SAVE_COUNTER = 0x00;
export const FOOTER_BLOCK_COUNTER = 0x04;
export const FOOTER_BLOCK_SIZE = 0x08;
export const FOOTER_SIGNATURE = 0x0c;
export const FOOTER_BLOCK_ID = 0x10;
export const FOOTER_CHECKSUM = 0x12;

/**
 * Footer signature for Japanese/international games and for Korean games.
 * Source: pret constants/savedata/savedata.h `SECTOR_SIGNATURE 0x20060623`;
 * PKHeX SAV4.cs `MAGIC_JAPAN_INTL = 0x20060623`, `MAGIC_KOREAN = 0x20070903`.
 */
export const SIGNATURE_INTL = 0x20060623;
export const SIGNATURE_KOREAN = 0x20070903;

/** Footer block ids. Source: pret include/constants/savedata/save_table.h `SAVE_BLOCK_ID_NORMAL = 0, SAVE_BLOCK_ID_BOXES`. */
export const BLOCK_ID_GENERAL = 0;
export const BLOCK_ID_STORAGE = 1;

/** Where each footer field sits, relative to the footer start. */
export interface FooterLayout {
  size: number;
  saveCounter: number;
  /** Diamond/Pearl/Platinum only: a second counter used to order copies with the same save counter. */
  blockCounter?: number;
  blockSize: number;
  signature: number;
  blockId: number;
  /** Width of the block id field: u8 (followed by a padding byte) or u16. */
  blockIdBytes: 1 | 2;
  checksum: number;
}

/** Diamond/Pearl/Platinum footer (see the constants above). */
export const SINNOH_FOOTER: FooterLayout = {
  size: FOOTER_SIZE,
  saveCounter: FOOTER_SAVE_COUNTER,
  blockCounter: FOOTER_BLOCK_COUNTER,
  blockSize: FOOTER_BLOCK_SIZE,
  signature: FOOTER_SIGNATURE,
  blockId: FOOTER_BLOCK_ID,
  blockIdBytes: 1,
  checksum: FOOTER_CHECKSUM,
};

/**
 * HeartGold/SoulSilver footer, the last 0x10 bytes of each block: u32 save counter,
 * u32 size, u32 signature, u16 block id, u16 CRC (no second counter).
 * Source: pret/pokeheartgold include/save.h `SaveChunkFooter` { u32 count; u32 size;
 * u32 magic; u16 slot; u16 crc; } and src/save.c `ValidateSaveSectorFooter`; PKHeX
 * SAV4HGSS.cs `FooterSize => 0x10` and SaveUtil.cs `IsValidGeneralFooter2` (size at
 * end - 0xC, signature at end - 0x8, the same place as in the 0x14-byte footer).
 */
export const HGSS_FOOTER: FooterLayout = {
  size: 0x10,
  saveCounter: 0x00,
  blockSize: 0x04,
  signature: 0x08,
  blockId: 0x0c,
  blockIdBytes: 2,
  checksum: 0x0e,
};

// General block layout (offsets relative to the general block start)

/** Trainer data start. Source: PKHeX SAV4Pt.cs `Trainer1 = 0x68`. */
export const PT_TRAINER = 0x68;
/** Trainer name, 8 u16 (7 chars + terminator). Source: PKHeX SAV4.cs `OriginalTrainerTrash => General.Slice(Trainer1, 16)`. */
export const PT_TRAINER_NAME = PT_TRAINER + 0x00;
/** Trainer ID (u16) and secret ID (u16). Source: PKHeX SAV4.cs `TID16 @ Trainer1 + 0x10`, `SID16 @ Trainer1 + 0x12`. */
export const PT_TRAINER_TID = PT_TRAINER + 0x10;
export const PT_TRAINER_SID = PT_TRAINER + 0x12;
/** Game language (u8). Source: PKHeX SAV4.cs `Language => General[Trainer1 + 0x19]`. */
export const PT_TRAINER_LANGUAGE = PT_TRAINER + 0x19;

/** Party: count (u8) 4 bytes before the first slot. Source: PKHeX SAV4Pt.cs `Party = 0xA0`, SAV4.cs `PartyCount => General[Party - 4]`. */
export const PT_PARTY = 0xa0;
export const PT_PARTY_COUNT = PT_PARTY - 4;
/** Maximum party size. */
export const PARTY_SLOTS = 6;

/** Pokédex structure start. Source: PKHeX SAV4Pt.cs `PokeDex = 0x1328`. */
export const PT_POKEDEX = 0x1328;

// Pokédex layout (offsets relative to PT_POKEDEX)
// Source: pret include/pokedex.h `struct Pokedex` and PKHeX Zukan4.cs (identical).

/** Pokédex magic number. Source: pret include/pokedex.h `MAGIC_NUMBER 0xBEEFCAFE`. */
export const DEX_MAGIC = 0xbeefcafe;
/** Size of each species bit array: 16 u32 = 0x40 bytes. Source: pret `DEX_SIZE_U32`, PKHeX `SIZE_REGION = 0x40`. */
export const DEX_REGION_SIZE = 0x40;
/** `caughtPokemon` bit array. Bit index = species - 1, LSB first. */
export const DEX_CAUGHT = 0x04;
/** `seenPokemon` bit array. */
export const DEX_SEEN = DEX_CAUGHT + DEX_REGION_SIZE;
/** `recordedGenders[0]`: gender shown first (0 male/genderless, 1 female). */
export const DEX_GENDER_FIRST = DEX_SEEN + DEX_REGION_SIZE;
/** `recordedGenders[1]`: second gender seen. */
export const DEX_GENDER_SECOND = DEX_GENDER_FIRST + DEX_REGION_SIZE;
/**
 * `recordedLanguages[species]`, one byte per species (index = species).
 * Source: pret pokedex.h (after spinda u32, 4 form bytes and 28 Unown bytes = 0x128);
 * PKHeX Zukan4.cs `OFS_FORM1 + 0x20` for Platinum.
 */
export const DEX_LANGUAGES = 0x128;

/**
 * Language bit used in `recordedLanguages`, by game language id.
 * Source: pret src/pokedex_language.c `languageArray` = { JA, EN, FR, DE, IT, ES };
 * Korean and other values are not recorded (`PokedexLanguage_LanguageToIndex` returns NUM_LANGUAGES).
 * PKHeX Zukan4.cs `GetGen4LanguageBitIndex` maps Spanish to bit 0; we follow the game.
 */
export const DEX_LANGUAGE_BIT: Readonly<Record<number, number>> = { 1: 0, 2: 1, 3: 2, 5: 3, 4: 4, 7: 5 };

// Storage block layout (offsets relative to the storage block start)
// Source: PKHeX SAV4Sinnoh.cs (`u32 currentBox; box{pk4[30][18]}; g4str[18] boxNames; byte[18] wallpapers`).

export const BOX_COUNT = 18;
export const BOX_SLOTS = 30;
/** Box data start: after the u32 current box. Source: PKHeX SAV4Sinnoh.cs `GetBoxOffset(box) => 4 + box * BOX_DATA_LEN`. */
export const BOX_DATA = 4;
/** Box names: 20 u16 each, after all box data. Source: PKHeX SAV4Sinnoh.cs `BOX_NAME = 4 + BOX_END`, `BOX_NAME_LEN = 40`. */
export const BOX_NAME_LENGTH = 40;

// Source: PKHeX PK4.cs / G4PKM.cs / PokeCrypto.cs; pret include/struct_defs/pokemon.h.
// Offsets are in the decrypted, unshuffled structure.

/** Stored (box) size. Source: PKHeX PokeCrypto.cs `SIZE_4STORED = 136`. */
export const PK4_STORED_SIZE = 0x88;
/** Party size (stored + battle stats). Source: PKHeX PokeCrypto.cs `SIZE_4PARTY = 236`. */
export const PK4_PARTY_SIZE = 0xec;
/** Size of each of the 4 shuffled blocks. Source: PKHeX PokeCrypto.cs `SIZE_4BLOCK = 32`. */
export const PK4_BLOCK_SIZE = 0x20;
/** Encrypted/shuffled area starts after PID, flags and checksum. */
export const PK4_BLOCKS_START = 0x08;

export const PK4_PID = 0x00; // u32
/** u16 flags; non-zero means "bad egg"/decryption state bits. Source: PKHeX PK4.cs `Sanity @ 0x04`, G4PKM.cs `Valid => Sanity == 0 && ChecksumValid`. */
export const PK4_SANITY = 0x04;
export const PK4_CHECKSUM = 0x06; // u16
export const PK4_SPECIES = 0x08; // u16
export const PK4_HELD_ITEM = 0x0a; // u16
export const PK4_TID = 0x0c; // u16
export const PK4_SID = 0x0e; // u16
export const PK4_EXP = 0x10; // u32
export const PK4_FRIENDSHIP = 0x14; // u8
export const PK4_ABILITY = 0x15; // u8
export const PK4_LANGUAGE = 0x17; // u8
/** EVs, one byte each in order HP, Atk, Def, Spe, SpA, SpD. Source: PKHeX PK4.cs `EV_HP @ 0x18 .. EV_SPD @ 0x1D`. */
export const PK4_EVS = 0x18;
/**
 * IV word: 5 bits per IV in order HP, Atk, Def, Spe, SpA, SpD; bit 30 = egg, bit 31 = nicknamed.
 * Source: PKHeX PK4.cs `IV32 @ 0x38`, `IsEgg`, `IsNicknamed`.
 */
export const PK4_IV32 = 0x38;
export const PK4_IV_EGG_BIT = 30;
export const PK4_IV_NICKNAMED_BIT = 31;
/** Byte with fateful encounter (bit 0), gender (bits 1-2), form (bits 3-7). Source: PKHeX PK4.cs `Data[0x40]`. */
export const PK4_GENDER_FORM = 0x40;
/** Nickname: 11 u16 (10 chars + 0xFFFF terminator). Source: PKHeX G4PKM.cs `NicknameTrash => Data.Slice(0x48, 22)`. */
export const PK4_NICKNAME = 0x48;
export const PK4_NICKNAME_LENGTH = 11;
/** Original trainer name, 8 u16. Source: PKHeX G4PKM.cs `OriginalTrainerTrash => Data.Slice(0x68, 16)`. */
export const PK4_OT_NAME = 0x68;

// Party-only battle stats (encrypted with the PID as seed). Source: PKHeX PK4.cs.
export const PK4_STATUS = 0x88; // u32
export const PK4_LEVEL = 0x8c; // u8
export const PK4_HP_CURRENT = 0x8e; // u16
/** Max HP, Atk, Def, Spe, SpA, SpD: six consecutive u16. Source: PKHeX PK4.cs `Stat_HPMax @ 0x90 .. Stat_SPD @ 0x9A`. */
export const PK4_STATS = 0x90;

/**
 * Block order for each shuffle value `sv = (PID >> 13) & 31` (rows 24-31 repeat rows 0-7,
 * which equals `% 24`). Row `sv` gives, for logical blocks A, B, C, D, the position
 * where each one is stored.
 * Source: PKHeX PokeCrypto.cs `BlockPosition` (same 32 rows, values checked one by one).
 */
export const BLOCK_POSITION: readonly (readonly [number, number, number, number])[] = [
  [0, 1, 2, 3],
  [0, 1, 3, 2],
  [0, 2, 1, 3],
  [0, 3, 1, 2],
  [0, 2, 3, 1],
  [0, 3, 2, 1],
  [1, 0, 2, 3],
  [1, 0, 3, 2],
  [2, 0, 1, 3],
  [3, 0, 1, 2],
  [2, 0, 3, 1],
  [3, 0, 2, 1],
  [1, 2, 0, 3],
  [1, 3, 0, 2],
  [2, 1, 0, 3],
  [3, 1, 0, 2],
  [2, 3, 0, 1],
  [3, 2, 0, 1],
  [1, 2, 3, 0],
  [1, 3, 2, 0],
  [2, 1, 3, 0],
  [3, 1, 2, 0],
  [2, 3, 1, 0],
  [3, 2, 1, 0],
];

export { LCRNG_ADD, LCRNG_MULT } from "../prng";

/** Text terminator in Generation IV strings. Source: PKHeX StringConverter4.cs `Terminator = 0xFFFF`. */
export const STRING_TERMINATOR = 0xffff;

/**
 * Everstone item index. Source: pret generated/items.txt (ITEM_EVERSTONE = 229);
 * PokéAPI item_game_indices.csv (generation 4, game_index 229 = everstone).
 */
export const ITEM_EVERSTONE = 229;

/** Kadabra national dex number; exempt from the Everstone check in Generation IV (see trade-evolutions.ts). */
export const SPECIES_KADABRA = 64;

/** Gender values. Source: PKHeX PK4.cs `Gender` (bits 1-2 of 0x40), pret `GENDER_MALE/FEMALE/NONE`. */
export const GENDER_MALE = 0;
export const GENDER_FEMALE = 1;
export const GENDER_NONE = 2;
