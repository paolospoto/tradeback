/**
 * Save format constants for generation II (Gold, Silver, Crystal; Western versions), a 32 KiB SRAM image.
 *
 * Sources: pret/pokegold and pret/pokecrystal (`ram/sram.asm`, `ram/wram.asm`, `macros/ram.asm`,
 * `engine/menus/save.asm`, `engine/pokemon/evolve.asm`, `constants/item_constants.asm`) and PKHeX `SaveUtil.cs`
 * (offsets used to recognise the games), read as documentation only; no code was copied (GPLv3). Every offset
 * was confirmed on the real saves in tests/fixtures/third-party/saves/gen2/ (Gold and Crystal; Silver is built from
 * the same source as Gold). Crystal and Gold/Silver differ only in the offsets below.
 */
import type { GameId } from "../types";

export const SAVE_SIZE = 0x8000;
/**
 * Emulators append the real-time clock after the 32 KiB: 44 bytes (the Crystal fixture) or 48. Kept and written back.
 * Source: docs/formats/gen1-2.md and the fixture.
 */
export const RTC_TRAILER_SIZES = [44, 48] as const;

/** `SAVE_CHECK_VALUE_1` and `_2`, stored around the game data and checked on load. Source: pret save.asm; the fixtures hold 99 and 127. */
export const CHECK_VALUE_1 = 99;
export const CHECK_VALUE_2 = 127;
export const GAME_START = 0x2009;

export interface Gen2Layout {
  game: Extract<GameId, "gold-silver" | "crystal">;
  /** End of sGameData: the 16-bit checksum follows (Gold/Silver) or sits 0x18A bytes later (Crystal). Source: pret ram/sram.asm "Save". */
  gameEnd: number;
  checksum: number;
  checkValue2: number;
  /** `wPartyCount`; the party and the Pokédex follow. */
  party: number;
  /** The active (current) box in bank 1. */
  activeBox: number;
  /** `wCurBox` (0-13). */
  curBox: number;
}

export const CRYSTAL_LAYOUT: Gen2Layout = {
  game: "crystal",
  gameEnd: 0x2b83,
  checksum: 0x2d0d,
  checkValue2: 0x2d0f,
  party: 0x2865,
  activeBox: 0x2d10,
  curBox: 0x2702,
};
export const GOLD_LAYOUT: Gen2Layout = {
  game: "gold-silver",
  gameEnd: 0x2d69,
  checksum: 0x2d69,
  checkValue2: 0x2d6b,
  party: 0x288a,
  activeBox: 0x2d6c,
  curBox: 0x2726,
};
export const GEN2_LAYOUTS: readonly Gen2Layout[] = [CRYSTAL_LAYOUT, GOLD_LAYOUT];

/** `wPlayerData` begins with the trainer ID (big-endian) then the player name. Source: pret ram/wram.asm. */
export const PLAYER_ID = 0x2009;
export const PLAYER_NAME = 0x200b;
export const NAME_LENGTH = 11;

export const PARTY_SLOTS = 6;
export const BOX_SLOTS = 20;
export const BOX_COUNT = 14;
/** `box_struct` is 32 bytes, `party_struct` 48. Source: pret macros/ram.asm. */
export const BOX_MON_SIZE = 32;
export const PARTY_MON_SIZE = 48;

/** Party from `wPartyCount`: count, 6 species + terminator, the structs, OT names, nicknames, 22 padding bytes, then the Pokédex. */
export const PARTY_MONS = 1 + PARTY_SLOTS + 1;
export const PARTY_OT = PARTY_MONS + PARTY_SLOTS * PARTY_MON_SIZE;
export const PARTY_NICKS = PARTY_OT + PARTY_SLOTS * NAME_LENGTH;
export const DEX_CAUGHT_FROM_PARTY = PARTY_NICKS + PARTY_SLOTS * NAME_LENGTH + 22;
export const DEX_FLAG_BYTES = 32;

/** `box` macro: count, 20 species + terminator, 20 structs, 20 OT names, 20 nicknames, 2 padding bytes = 0x450. Source: pret macros/ram.asm. */
export const BOX_MONS = 1 + BOX_SLOTS + 1;
export const BOX_OT = BOX_MONS + BOX_SLOTS * BOX_MON_SIZE;
export const BOX_NICKS = BOX_OT + BOX_SLOTS * NAME_LENGTH;
export const BOX_SIZE = BOX_NICKS + BOX_SLOTS * NAME_LENGTH + 2;
/** Boxes 1-7 in bank 2 (0x4000), 8-14 in bank 3 (0x6000). Source: pret ram/sram.asm "Boxes 1-7", "Boxes 8-14". Boxes have no checksum. */
export const BOX_BANKS = [0x4000, 0x6000] as const;
export const BOXES_PER_BANK = 7;

// box_struct offsets (pret macros/ram.asm)
export const MON_SPECIES = 0;
export const MON_ITEM = 1;
export const MON_ID = 6;
export const MON_EXP = 8;
export const MON_STAT_EXP = 11;
export const MON_DVS = 21;
export const MON_LEVEL = 31;
// party_struct extras
export const MON_HP = 34;
export const MON_MAX_HP = 36;
/** Atk, Def, Spe, SpA, SpD, 2 bytes each, after the max HP. */
export const MON_STATS = 38;

/** The egg "species" in lists and structures. Source: pret constants/pokemon_constants.asm `EGG`. */
export const SPECIES_EGG = 0xfd;

/** Item ids (identical in Gold/Silver and Crystal). Source: pret constants/item_constants.asm. */
export const GEN2_ITEMS = {
  EVERSTONE: 0x70,
  KINGS_ROCK: 0x52,
  METAL_COAT: 0x8f,
  DRAGON_SCALE: 0x97,
  UP_GRADE: 0xac,
} as const;
