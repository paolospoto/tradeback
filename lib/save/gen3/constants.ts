/**
 * Save format constants for the Generation III games (GBA): Ruby/Sapphire, Emerald and
 * FireRed/LeafGreen.
 *
 * Sources: pret/pokeemerald, pret/pokefirered and pret/pokeruby (`src/save.c`,
 * `include/save.h`, `include/global.h`, `src/pokemon.c`, `src/evolution_scene.c`), which
 * show what the games do, and PKHeX `SAV3*.cs`, `PK3.cs`, `SaveUtil.cs` (master, 2026-11-24),
 * read as documentation only; no code was copied (GPLv3). Offsets were confirmed on the real
 * saves in tests/fixtures/third-party/saves/gen3/. All multi-byte values are little-endian.
 */
import type { GameId } from "../types";

/** Raw GBA save: 128 KiB. Source: PKHeX SaveUtil.cs `SIZE_G3RAW = 0x20000`. */
export const SAVE_SIZE = 0x20000;
/** Half-size files (64 KiB) exist (one Ruby save in the fixtures); they are refused. Source: PKHeX `SIZE_G3RAWHALF`. */
export const SAVE_SIZE_HALF = 0x10000;
/** mGBA appends the cartridge's real-time clock (16 bytes) to saves of games that have one. Source: docs/formats/gen3.md. */
export const RTC_TRAILER_SIZE = 0x10;

/** A save slot is 14 sectors of 0x1000 bytes; there are two slots. Source: pret include/save.h `NUM_SECTORS_PER_SLOT 14`. */
export const SECTOR_SIZE = 0x1000;
export const SECTORS_PER_SLOT = 14;
export const SLOT_SIZE = SECTOR_SIZE * SECTORS_PER_SLOT;
/** Bytes of data per sector. Source: pret include/save.h `SECTOR_DATA_SIZE 3968`. */
export const SECTOR_DATA_SIZE = 0xf80;

/** Sector footer. Source: pret include/save.h `struct SaveSector` { data[3968]; unused[116]; u16 id; u16 checksum; u32 signature; u32 counter; }. */
export const FOOTER_ID = 0xff4;
export const FOOTER_CHECKSUM = 0xff6;
export const FOOTER_SIGNATURE = 0xff8;
export const FOOTER_COUNTER = 0xffc;
/** Source: pret include/save.h `SECTOR_SIGNATURE 0x8012025`. */
export const SECTOR_SIGNATURE = 0x08012025;

/** Sector ids. Source: pret include/save.h `SECTOR_ID_*`. */
export const SECTOR_SAVEBLOCK2 = 0;
export const SECTOR_SAVEBLOCK1_START = 1;
export const SECTOR_SAVEBLOCK1_END = 4;
export const SECTOR_STORAGE_START = 5;
export const SECTOR_STORAGE_END = 13;

export interface Gen3Layout {
  game: Extract<GameId, "ruby-sapphire" | "emerald" | "firered-leafgreen">;
  /** Checksummed bytes of sector 0 (size of SaveBlock2). Source: pret `// sizeof` comments in global.h. */
  saveBlock2Size: number;
  /** Offset in SaveBlock2 of the Pokédex `nationalMagic` byte and its value (0xDA RSE, 0xB9 FRLG). Source: pret `struct Pokedex`. */
  nationalMagic: { offset: number; value: number };
  /** SaveBlock1 offsets of the party count, the party and the two extra copies of the "seen" bits. Source: pret `struct SaveBlock1`. */
  partyCount: number;
  party: number;
  seenCopies: readonly number[];
  /** FireRed/LeafGreen only: the National Pokédex also needs a flag and a variable. Source: pret/pokefirered src/event_data.c `IsNationalPokedexEnabled`. */
  nationalDexFlagsRequired: boolean;
}

/** SaveBlock2 starts with the trainer: name[8], gender, warp flags, trainer id[4]. Source: pret `struct SaveBlock2`. */
export const TRAINER_NAME = 0x00;
export const TRAINER_ID = 0x0a;
/** `struct Pokedex` sits at 0x18 of SaveBlock2: owned at +0x10, seen at +0x44 (49 bytes each, one bit per national number - 1). */
export const POKEDEX = 0x18;
export const DEX_OWNED = POKEDEX + 0x10;
export const DEX_SEEN = POKEDEX + 0x44;
export const DEX_FLAG_BYTES = 49;
export const DEX_SPECIES_MAX = 386;

export const RS_LAYOUT: Gen3Layout = {
  game: "ruby-sapphire",
  saveBlock2Size: 0x890,
  nationalMagic: { offset: POKEDEX + 2, value: 0xda },
  partyCount: 0x234,
  party: 0x238,
  seenCopies: [0x938, 0x3a8c],
  nationalDexFlagsRequired: false,
};

export const EMERALD_LAYOUT: Gen3Layout = {
  game: "emerald",
  saveBlock2Size: 0xf2c,
  nationalMagic: { offset: POKEDEX + 2, value: 0xda },
  partyCount: 0x234,
  party: 0x238,
  seenCopies: [0x988, 0x3b24],
  nationalDexFlagsRequired: false,
};

export const FRLG_LAYOUT: Gen3Layout = {
  game: "firered-leafgreen",
  saveBlock2Size: 0xf24,
  nationalMagic: { offset: POKEDEX + 3, value: 0xb9 },
  partyCount: 0x34,
  party: 0x38,
  seenCopies: [0x5f8, 0x3a18],
  nationalDexFlagsRequired: true,
};

/** FireRed/LeafGreen: flags array at SaveBlock1 + 0xEE0 (FLAG_SYS_NATIONAL_DEX = 0x840), vars at + 0x1000 (VAR_NATIONAL_DEX = index 0x4E, value 0x6258). */
export const FRLG_FLAGS = 0xee0;
export const FRLG_FLAG_NATIONAL_DEX = 0x840;
export const FRLG_VARS = 0x1000;
export const FRLG_VAR_NATIONAL_DEX = 0x4e;
export const FRLG_VAR_NATIONAL_DEX_VALUE = 0x6258;

// PokemonStorage (sectors 5-13 concatenated): u32 current box, 14 boxes x 30 x 80 bytes, names...
// Source: pret `struct PokemonStorage`; PKHeX SAV3.cs `GetBoxOffset(box) => 4 + 80 * box * 30`.

export const BOX_COUNT = 14;
export const BOX_SLOTS = 30;
export const STORAGE_BOXES = 4;
/** Box names follow the 420 Pokémon: 14 x 9 bytes. Source: pret `struct PokemonStorage` { currentBox; boxes[14]; boxNames[14][9]; boxWallpapers[14]; }. */
export const BOX_NAMES_OFFSET = 4 + BOX_COUNT * BOX_SLOTS * 80;
export const BOX_NAME_BYTES = 9;
export const BOX_NAME_CHARS = 8;

// PK3 (offsets in the decrypted, unshuffled structure)
// Source: PKHeX PK3.cs, PokeCrypto.cs `Decrypt3`; pret include/pokemon.h.

export const PK3_STORED_SIZE = 80;
export const PK3_PARTY_SIZE = 100;
export const PK3_BLOCK_SIZE = 12;
/** The four 12-byte substructures (growth, attacks, EVs, misc) start here and are shuffled and XOR-encrypted. */
export const PK3_BLOCKS_START = 0x20;
export const PK3_BLOCKS_END = 0x50;

export const PK3_PID = 0x00;
export const PK3_TID = 0x04;
export const PK3_SID = 0x06;
/** Nickname: 10 bytes. OT name: 7 bytes. */
export const PK3_NICKNAME = 0x08;
export const PK3_NICKNAME_BYTES = 10;
export const PK3_LANGUAGE = 0x12;
/** Bit 0 bad egg, bit 1 has species, bit 2 egg. */
export const PK3_FLAGS = 0x13;
export const PK3_OT_NAME = 0x14;
export const PK3_CHECKSUM = 0x1c;
export const PK3_SANITY = 0x1e;
export const PK3_SPECIES = 0x20;
export const PK3_HELD_ITEM = 0x22;
export const PK3_EXP = 0x24;
export const PK3_EVS = 0x38;
/** IV word: 6 x 5 bits; bit 30 egg, bit 31 ability slot. */
export const PK3_IV32 = 0x48;
// Party-only (not encrypted).
export const PK3_STATUS = 0x50;
export const PK3_LEVEL = 0x54;
export const PK3_HP_CURRENT = 0x56;
/** Max HP, Atk, Def, Spe, SpA, SpD. */
export const PK3_STATS = 0x58;

/** Language ids of the Pokémon (same values as later generations). Source: PKHeX LanguageID. */
export const GEN3_LANGUAGE = { JA: 1, EN: 2, FR: 3, IT: 4, DE: 5, ES: 7 } as const;
