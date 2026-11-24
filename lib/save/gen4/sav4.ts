import { getGen4Species, MAX_SPECIES_GEN4 } from "../../data/gen4-species";
import { readU32, writeU16 } from "../bytes";
import { decodeGen4String } from "./charset";
import {
  BLOCK_ID_GENERAL,
  BLOCK_ID_STORAGE,
  BOX_COUNT,
  BOX_NAME_LENGTH,
  BOX_SLOTS,
  DESMUME_FOOTER_MARKER,
  DESMUME_FOOTER_SIZE,
  DEX_MAGIC,
  PARTITION_COUNT,
  PARTITION_SIZE,
  PARTY_SLOTS,
  PK4_PARTY_SIZE,
  PK4_STORED_SIZE,
  SAVE_SIZE,
  SIGNATURE_INTL,
  SIGNATURE_KOREAN,
  SINNOH_FOOTER,
  type FooterLayout,
} from "./constants";
import { GEN4_LAYOUTS, type Gen4Layout } from "./layouts";
import { crc16Ccitt } from "../crc16";
import { SaveError, type SlotRef } from "../types";
import { classifySlot, readPk4, type Pk4Info } from "./pk4";
import { levelFromExp } from "../stats";

export { SaveError, slotKey, type SlotRef } from "../types";

/** Decoded block footer plus validity, following pret src/savedata.c `SaveBlockFooter_Validate`. */
export interface FooterInfo {
  saveCounter: number;
  blockCounter: number;
  size: number;
  signature: number;
  blockId: number;
  checksum: number;
  /** CRC computed over the block, footer excluded. */
  computedChecksum: number;
  valid: boolean;
}

/** One save block (general or storage) located in the file. */
export interface BlockRef {
  id: typeof BLOCK_ID_GENERAL | typeof BLOCK_ID_STORAGE;
  partition: 0 | 1;
  /** Absolute offset of the block in the 512 KiB image. */
  offset: number;
  size: number;
  footer: FooterLayout;
}

/** A Pokémon found in the save. */
export interface PokemonEntry {
  ref: SlotRef;
  /** Absolute offset of the encrypted structure in the 512 KiB image. */
  offset: number;
  size: typeof PK4_STORED_SIZE | typeof PK4_PARTY_SIZE;
  info: Pk4Info;
  /** Party: stored level. Box: level computed from experience. */
  level: number;
}

export interface BoxInfo {
  name: string;
  slots: (PokemonEntry | null)[];
}

/** A Generation IV save that passed validation. */
export interface LoadedSave {
  layout: Gen4Layout;
  /** Private copy of the 512 KiB image (the input is never modified). */
  image: Uint8Array;
  /** Bytes after the image (emulator footer), restored on export. */
  trailer: Uint8Array;
  general: BlockRef;
  storage: BlockRef;
  /** Game language (trainer data). */
  language: number;
  korean: boolean;
  trainerName: string;
  trainerId: number;
  party: PokemonEntry[];
  boxes: BoxInfo[];
  /** Slots holding data the game itself would reject (bad checksum or flags); never touched. */
  unreadable: SlotRef[];
}

/**
 * Reads and validates a block footer.
 * @param image 512 KiB image.
 * @param blockStart Absolute block offset.
 * @param size Expected block size.
 * @param id Expected block id.
 * @param layout Footer layout of the game.
 */
export function readFooter(
  image: Uint8Array,
  blockStart: number,
  size: number,
  id: number,
  layout: FooterLayout = SINNOH_FOOTER,
): FooterInfo {
  const f = blockStart + size - layout.size;
  const idBytes =
    layout.blockIdBytes === 2
      ? image[f + layout.blockId]! | (image[f + layout.blockId + 1]! << 8)
      : image[f + layout.blockId]!;
  const info = {
    saveCounter: readU32(image, f + layout.saveCounter),
    blockCounter: layout.blockCounter === undefined ? 0 : readU32(image, f + layout.blockCounter),
    size: readU32(image, f + layout.blockSize),
    signature: readU32(image, f + layout.signature),
    blockId: idBytes,
    checksum: image[f + layout.checksum]! | (image[f + layout.checksum + 1]! << 8),
    computedChecksum: crc16Ccitt(image.subarray(blockStart, f)),
  };
  const valid =
    info.size === size &&
    (info.signature === SIGNATURE_INTL || info.signature === SIGNATURE_KOREAN) &&
    info.blockId === id &&
    info.checksum === info.computedChecksum;
  return { ...info, valid };
}

/**
 * Recomputes and stores the CRC of a block. Counters, size and signature are not touched.
 */
export function writeBlockChecksum(image: Uint8Array, block: BlockRef): void {
  const f = block.offset + block.size - block.footer.size;
  writeU16(image, f + block.footer.checksum, crc16Ccitt(image.subarray(block.offset, f)));
}

/** Counter comparison of pret src/savedata.c `SaveCheckInfo_CompareCounters` (handles the 0xFFFFFFFF -> 0 wrap). */
function compareCounters(a: number, b: number): number {
  if (a === 0xffffffff && b === 0) return -1;
  if (a === 0 && b === 0xffffffff) return 1;
  return a > b ? 1 : a < b ? -1 : 0;
}

type SectorResult = { result: "valid" | "partial" | "invalid"; current: 0 | 1; stale: 0 | 1 | -1 };

/** Mirrors pret src/savedata.c `SaveCheckInfo_CompareSectors`. */
function compareSectors(p: FooterInfo, b: FooterInfo): SectorResult {
  if (p.valid && b.valid) {
    const g = compareCounters(p.saveCounter, b.saveCounter);
    const k = compareCounters(p.blockCounter, b.blockCounter);
    const backupNewer = g < 0 || (g === 0 && k < 0);
    return backupNewer
      ? { result: "valid", current: 1, stale: 0 }
      : { result: "valid", current: 0, stale: 1 };
  }
  if (p.valid) return { result: "partial", current: 0, stale: -1 };
  if (b.valid) return { result: "partial", current: 1, stale: -1 };
  return { result: "invalid", current: 0, stale: -1 };
}

/** True when a block footer of this layout has the right size and signature, valid or not. */
function looksLikeLayout(image: Uint8Array, layout: Gen4Layout): boolean {
  for (let p = 0; p < PARTITION_COUNT; p++) {
    for (const [start, size] of [
      [p * PARTITION_SIZE, layout.generalSize],
      [p * PARTITION_SIZE + layout.storageOffset, layout.storageSize],
    ] as const) {
      const f = start + size - layout.footer.size;
      const sig = readU32(image, f + layout.footer.signature);
      if (
        readU32(image, f + layout.footer.blockSize) === size &&
        (sig === SIGNATURE_INTL || sig === SIGNATURE_KOREAN)
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Picks the general and storage blocks the game would load, and refuses every
 * state the game itself reports as corrupt.
 *
 * Mirrors pret src/savedata.c `SaveData_LoadCheck`: both blocks must come from
 * saves with the same global counter for a clean load (LOAD_RESULT_OK).
 * The game is recognised by the size and signature in its block footers.
 * @throws SaveError
 */
export function selectBlocks(image: Uint8Array): {
  layout: Gen4Layout;
  general: BlockRef;
  storage: BlockRef;
  korean: boolean;
} {
  const layout = GEN4_LAYOUTS.find((l) => looksLikeLayout(image, l));
  if (!layout) throw new SaveError("unknown-format", "This file is not a Pokémon save this app can read.");

  const g = [0, 1].map((p) =>
    readFooter(image, p * PARTITION_SIZE, layout.generalSize, BLOCK_ID_GENERAL, layout.footer),
  );
  const s = [0, 1].map((p) =>
    readFooter(
      image,
      p * PARTITION_SIZE + layout.storageOffset,
      layout.storageSize,
      BLOCK_ID_STORAGE,
      layout.footer,
    ),
  );
  const gs = compareSectors(g[0]!, g[1]!);
  const ss = compareSectors(s[0]!, s[1]!);

  if (gs.result === "invalid" || ss.result === "invalid") {
    throw new SaveError("corrupt", "Part of the save fails its checksum: the game would not load it.");
  }

  const gFooter = g[gs.current]!;
  const sFooter = s[ss.current]!;
  const sameSave = gFooter.saveCounter === sFooter.saveCounter;
  // The game also loads "partial + partial" from the same partition without checking the
  // counters (only a debug assert); we additionally require them to match.
  const ok =
    sameSave &&
    ((gs.result === "valid" && ss.result === "valid") ||
      (gs.result === "valid" && ss.result === "partial") ||
      (gs.result === "partial" && ss.result === "partial" && gs.current === ss.current));
  if (!ok) {
    throw new SaveError(
      "inconsistent",
      "The two halves of the save do not match: the game would show a corruption warning.",
    );
  }
  return {
    layout,
    general: {
      id: BLOCK_ID_GENERAL,
      partition: gs.current,
      offset: gs.current * PARTITION_SIZE,
      size: layout.generalSize,
      footer: layout.footer,
    },
    storage: {
      id: BLOCK_ID_STORAGE,
      partition: ss.current,
      offset: ss.current * PARTITION_SIZE + layout.storageOffset,
      size: layout.storageSize,
      footer: layout.footer,
    },
    korean: gFooter.signature === SIGNATURE_KOREAN,
  };
}

/** Splits an optional DeSmuME footer from the raw image. */
function splitImage(input: Uint8Array): { image: Uint8Array; trailer: Uint8Array } {
  if (input.length === SAVE_SIZE) return { image: input.slice(), trailer: new Uint8Array(0) };
  if (input.length === SAVE_SIZE + DESMUME_FOOTER_SIZE) {
    const tail = new TextDecoder("latin1").decode(
      input.subarray(input.length - DESMUME_FOOTER_MARKER.length),
    );
    if (tail === DESMUME_FOOTER_MARKER) {
      return { image: input.slice(0, SAVE_SIZE), trailer: input.slice(SAVE_SIZE) };
    }
  }
  throw new SaveError(
    "unknown-format",
    `A save of this kind is exactly 512 KB (${SAVE_SIZE} bytes); this file is ${input.length} bytes.`,
  );
}

function readEntry(image: Uint8Array, offset: number, size: PokemonEntry["size"], ref: SlotRef) {
  const state = classifySlot(image.subarray(offset, offset + size));
  if (state.kind !== "pokemon") return state.kind === "invalid" ? ("invalid" as const) : null;
  const info = readPk4(state.dec);
  if (info.species > MAX_SPECIES_GEN4) return "invalid" as const;
  const level = info.party
    ? info.party.level
    : levelFromExp(getGen4Species(info.species).growthRate, info.exp);
  return { ref, offset, size, info, level } satisfies PokemonEntry;
}

/**
 * Loads and validates a Generation IV save (Diamond/Pearl, Platinum, HeartGold/SoulSilver).
 * @param input Raw file bytes (512 KiB, or 512 KiB plus a DeSmuME footer). Not modified.
 * @throws SaveError when the file is not a clean Generation IV save.
 */
export function loadSave(input: Uint8Array): LoadedSave {
  const { image, trailer } = splitImage(input);
  const { layout, general, storage, korean } = selectBlocks(image);

  if (readU32(image, general.offset + layout.pokedex) !== DEX_MAGIC) {
    throw new SaveError("pokedex", "The Pokédex data is not where the game keeps it.");
  }

  const unreadable: SlotRef[] = [];
  const party: PokemonEntry[] = [];
  const partyCount = image[general.offset + layout.party - 4]!;
  if (partyCount > PARTY_SLOTS) throw new SaveError("corrupt", `Invalid party size ${partyCount}.`);
  for (let i = 0; i < partyCount; i++) {
    const ref: SlotRef = { area: "party", index: i };
    const e = readEntry(image, general.offset + layout.party + i * PK4_PARTY_SIZE, PK4_PARTY_SIZE, ref);
    if (e === "invalid") unreadable.push(ref);
    else if (e) party.push(e);
  }

  const boxes: BoxInfo[] = [];
  const namesStart = storage.offset + layout.boxNames;
  for (let b = 0; b < BOX_COUNT; b++) {
    const slots: (PokemonEntry | null)[] = [];
    for (let s = 0; s < BOX_SLOTS; s++) {
      const ref: SlotRef = { area: "box", box: b, slot: s };
      const offset = storage.offset + layout.boxOffset(b) + s * PK4_STORED_SIZE;
      const e = readEntry(image, offset, PK4_STORED_SIZE, ref);
      if (e === "invalid") {
        unreadable.push(ref);
        slots.push(null);
      } else slots.push(e);
    }
    boxes.push({
      name: decodeGen4String(image, namesStart + b * BOX_NAME_LENGTH, BOX_NAME_LENGTH / 2),
      slots,
    });
  }

  return {
    layout,
    image,
    trailer,
    general,
    storage,
    // Trainer data: name 8 x u16, TID u16 at +0x10, language u8 at +0x19 (PKHeX SAV4.cs).
    language: image[general.offset + layout.trainer + 0x19]!,
    korean,
    trainerName: decodeGen4String(image, general.offset + layout.trainer, 8),
    trainerId:
      image[general.offset + layout.trainer + 0x10]! | (image[general.offset + layout.trainer + 0x11]! << 8),
    party,
    boxes,
    unreadable,
  };
}

/** Iterates over every Pokémon (party first, then boxes in order). */
export function allPokemon(save: LoadedSave): PokemonEntry[] {
  return [...save.party, ...save.boxes.flatMap((b) => b.slots.filter((s): s is PokemonEntry => s !== null))];
}

/** Joins an image and its trailer back into a file. */
export function toFileBytes(image: Uint8Array, trailer: Uint8Array): Uint8Array {
  const out = new Uint8Array(image.length + trailer.length);
  out.set(image);
  out.set(trailer, image.length);
  return out;
}
