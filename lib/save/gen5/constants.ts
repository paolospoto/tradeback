/**
 * Save format constants for the Generation V games (DS): Black/White and
 * Black 2/White 2.
 *
 * Sources: PKHeX SAV5.cs, SAV5BW.cs, SAV5B2W2.cs, SaveBlockAccessor5*.cs, PK5.cs,
 * PokeCrypto.cs, Zukan5.cs, BoxLayout5.cs, PlayerData5.cs, SaveUtil.cs (master,
 * 2026-11-24), read as documentation only; no code was copied (GPLv3).
 * Every value was confirmed on the real saves in tests/fixtures/third-party/saves/gen5/.
 * All multi-byte values are little-endian.
 */
import type { GameId } from "../types";
import { B2W2_BLOCKS, BW_BLOCKS } from "./blocks";

/** Raw DS save size. Source: PKHeX SaveUtil.cs `SIZE_G5RAW = 0x80000`. */
export const SAVE_SIZE = 0x80000;

export interface Gen5Layout {
  game: Extract<GameId, "black-white" | "black2-white2">;
  /** Size of one copy of the save: the main copy starts at 0, the backup right after. Source: PKHeX SaveUtil.cs `SIZE_G5BW`, `SIZE_G5B2W2`. */
  copySize: number;
  /** Length of the checksum block data (CRC at checksumBlock + length + 0xE). Source: PKHeX SaveUtil.cs `IsG5BW(.., 0x8C)`, `IsG5B2W2(.., 0x94)`. */
  checksumInfoLength: number;
  /** [offset, length] of every block, the checksum block last. */
  blocks: readonly (readonly [number, number])[];
  /** Index of the Pokédex block. Source: SaveBlockAccessor5BW `Zukan => Block(sav, 55)`, B2W2 `Block(sav, 54)`. */
  dexBlock: number;
  /** Bytes of form flags per region (Zukan5BW 9, Zukan5B2W2 11). */
  dexFormLength: number;
}

export const BW_LAYOUT: Gen5Layout = {
  game: "black-white",
  copySize: 0x24000,
  checksumInfoLength: 0x8c,
  blocks: BW_BLOCKS,
  dexBlock: 55,
  dexFormLength: 9,
};

export const B2W2_LAYOUT: Gen5Layout = {
  game: "black2-white2",
  copySize: 0x26000,
  checksumInfoLength: 0x94,
  blocks: B2W2_BLOCKS,
  dexBlock: 54,
  dexFormLength: 11,
};

export const GEN5_LAYOUTS: readonly Gen5Layout[] = [BW_LAYOUT, B2W2_LAYOUT];

/** Block indexes shared by both games. Source: SaveBlockAccessor5BW/B2W2 (`BoxLayout 0`, `Party 26`, `PlayerData 27`; boxes are blocks 1-24). */
export const BLOCK_BOX_NAMES = 0;
export const BLOCK_FIRST_BOX = 1;
export const BLOCK_PARTY = 26;
export const BLOCK_TRAINER = 27;

export const BOX_COUNT = 24;
export const BOX_SLOTS = 30;
/** Box names: 0x28 bytes apart from offset 4 of block 0, 0x14 bytes used. Source: PKHeX BoxLayout5.cs. */
export const BOX_NAME_START = 4;
export const BOX_NAME_STRIDE = 0x28;
export const BOX_NAME_LENGTH = 10;

/** Party block: count (u8) at +4, slots from +8. Source: PKHeX SAV5.cs `PartyCount => Data[Party + 4]`, `GetPartyOffset => Party + 8 + SIZE_PARTY * slot`. */
export const PARTY_COUNT_OFFSET = 4;
export const PARTY_START = 8;
export const PARTY_SLOTS = 6;

/** Trainer data block. Source: PKHeX PlayerData5.cs. */
export const TRAINER_NAME = 0x04; // 8 x u16
export const TRAINER_ID = 0x14; // u16 TID, u16 SID
export const TRAINER_LANGUAGE = 0x1e;
export const TRAINER_GAME = 0x1f;
/** Game version byte in the trainer data (and in each PK5). Source: PKHeX GameVersion enum (White 20, Black 21, White 2 22, Black 2 23); confirmed on the 4 real saves. */
export const GAME_WHITE = 20;
export const GAME_BLACK = 21;
export const GAME_WHITE2 = 22;
export const GAME_BLACK2 = 23;

/** Source: PKHeX PokeCrypto.cs `SIZE_5STORED = 136`, `SIZE_5PARTY = 220`. */
export const PK5_STORED_SIZE = 0x88;
export const PK5_PARTY_SIZE = 0xdc;
/** Nature byte (stored, not derived from the PID as in generation IV). Source: PKHeX PK5.cs `Nature => Data[0x41]`. */
export const PK5_NATURE = 0x41;
/** Bit 0 = hidden ability. Source: PKHeX PK5.cs `HiddenAbility => (Data[0x42] & 1) == 1`. */
export const PK5_HIDDEN_ABILITY = 0x42;

// Pokédex (offsets relative to the Pokédex block)
// Source: PKHeX Zukan5.cs.

export const DEX_MAGIC = 0xbeefcafe;
/** Packed flags (u32): bit 0 = National Pokédex unlocked. */
export const DEX_PACKED = 0x04;
export const DEX_REGION_SIZE = 0x54;
export const DEX_CAUGHT = 0x08;
/** Four seen regions: male, female, shiny male, shiny female. */
export const DEX_SEEN = DEX_CAUGHT + DEX_REGION_SIZE;
/** Four displayed regions, same order. */
export const DEX_DISPLAYED = DEX_SEEN + DEX_REGION_SIZE * 4;
export const DEX_FORMS = DEX_DISPLAYED + DEX_REGION_SIZE * 4;
/** Language flags: 7 bits per species (1-493) from the end of the form flags. */
export const DEX_LANGUAGE_BITS = 7;
export const DEX_LANGUAGE_MAX_SPECIES = 493;
/**
 * Language bit index by game language id (JA 0, EN 1, FR 2, IT 3, DE 4, ES 5; Korean none).
 * Source: PKHeX Zukan5.cs `GetLanguageIndex`.
 */
export const DEX_LANGUAGE_INDEX: Readonly<Record<number, number>> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 7: 5 };
