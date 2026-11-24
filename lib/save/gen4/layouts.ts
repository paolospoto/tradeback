/**
 * Per-game layouts of the Generation IV saves. Everything that differs between
 * Diamond/Pearl, Platinum and HeartGold/SoulSilver lives here, so the loader,
 * the evolution code and the checks work on any of them.
 *
 * Sources: PKHeX SAV4DP.cs, SAV4Pt.cs, SAV4HGSS.cs, SAV4Sinnoh.cs, Zukan4.cs
 * (master, 2026-11-23), read as documentation only. Each offset was also
 * confirmed on the real saves in tests/fixtures/third-party/saves/gen4/.
 */
import type { GameId } from "../types";
import {
  BOX_COUNT,
  BOX_DATA,
  BOX_NAME_LENGTH,
  BOX_SLOTS,
  DP_GENERAL_SIZE,
  DP_STORAGE_OFFSET,
  DP_STORAGE_SIZE,
  HGSS_FOOTER,
  HGSS_GENERAL_SIZE,
  HGSS_STORAGE_OFFSET,
  HGSS_STORAGE_SIZE,
  PK4_STORED_SIZE,
  PT_GENERAL_SIZE,
  PT_PARTY,
  PT_POKEDEX,
  PT_STORAGE_OFFSET,
  PT_STORAGE_SIZE,
  PT_TRAINER,
  SINNOH_FOOTER,
  type FooterLayout,
} from "./constants";

export interface Gen4Layout {
  game: Extract<GameId, "diamond-pearl" | "platinum" | "heartgold-soulsilver">;
  generalSize: number;
  /** Offset of the storage block inside a partition. */
  storageOffset: number;
  storageSize: number;
  footer: FooterLayout;
  /** Trainer data start (name, IDs, language) in the general block. */
  trainer: number;
  /** First party slot; the party count byte sits 4 bytes before it. Source: PKHeX SAV4.cs `PartyCount => General[Party - 4]`. */
  party: number;
  pokedex: number;
  /**
   * Offset, relative to the Pokédex, of the one-byte-per-species language flags
   * (index = species). Source: PKHeX Zukan4.cs `OFS_FORM1 + (HGSS ? 0x3C : 0x20)`
   * with `OFS_FORM1 = 0x108`. Diamond/Pearl keep these flags only for 14 species
   * (23, 25, 54, 77, 120, 129, 202, 214, 215, 216, 228, 278, 287, 315, `DPLangSpecies`),
   * none of which is a trade-evolution target, so it is undefined there.
   */
  dexLanguages: number | undefined;
  /** Offset of a box's first slot, relative to the storage block. */
  boxOffset(box: number): number;
  /** Offset of the first box name, relative to the storage block. */
  boxNames: number;
}

/** Diamond/Pearl and Platinum: boxes follow each other without padding. Source: PKHeX SAV4Sinnoh.cs `GetBoxOffset`, `BOX_NAME`. */
const sinnohBoxOffset = (box: number) => BOX_DATA + box * BOX_SLOTS * PK4_STORED_SIZE;
const SINNOH_BOX_NAMES = BOX_DATA + BOX_COUNT * BOX_SLOTS * PK4_STORED_SIZE;

export const PLATINUM_LAYOUT: Gen4Layout = {
  game: "platinum",
  generalSize: PT_GENERAL_SIZE,
  storageOffset: PT_STORAGE_OFFSET,
  storageSize: PT_STORAGE_SIZE,
  footer: SINNOH_FOOTER,
  trainer: PT_TRAINER,
  party: PT_PARTY,
  pokedex: PT_POKEDEX,
  dexLanguages: 0x128,
  boxOffset: sinnohBoxOffset,
  boxNames: SINNOH_BOX_NAMES,
};

export const DIAMOND_PEARL_LAYOUT: Gen4Layout = {
  game: "diamond-pearl",
  generalSize: DP_GENERAL_SIZE,
  storageOffset: DP_STORAGE_OFFSET,
  storageSize: DP_STORAGE_SIZE,
  footer: SINNOH_FOOTER,
  // Source: PKHeX SAV4DP.cs `Trainer1 = 0x64`, `Party = 0x98`, `PokeDex = 0x12DC`.
  trainer: 0x64,
  party: 0x98,
  pokedex: 0x12dc,
  dexLanguages: undefined,
  boxOffset: sinnohBoxOffset,
  boxNames: SINNOH_BOX_NAMES,
};

/** HeartGold/SoulSilver: each box is padded to 0x1000 bytes. Source: PKHeX SAV4HGSS.cs `GetBoxOffset(box) => box * 0x1000`, `BOX_NAME = 0x12008`. */
export const HGSS_LAYOUT: Gen4Layout = {
  game: "heartgold-soulsilver",
  generalSize: HGSS_GENERAL_SIZE,
  storageOffset: HGSS_STORAGE_OFFSET,
  storageSize: HGSS_STORAGE_SIZE,
  footer: HGSS_FOOTER,
  // Source: PKHeX SAV4HGSS.cs `Trainer1 = 0x64`, `Party = 0x98`, `PokeDex = 0x12B8`.
  trainer: 0x64,
  party: 0x98,
  pokedex: 0x12b8,
  dexLanguages: 0x144,
  boxOffset: (box) => box * 0x1000,
  boxNames: 0x12008,
};

/** Detection order; the general block sizes are all different. */
export const GEN4_LAYOUTS: readonly Gen4Layout[] = [PLATINUM_LAYOUT, DIAMOND_PEARL_LAYOUT, HGSS_LAYOUT];

/** Length in bytes of the box name field. */
export { BOX_NAME_LENGTH };
