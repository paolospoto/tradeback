import { getGen5Species, MAX_SPECIES_GEN5 } from "../../data/gen5-species";
import { readU16, readU32, writeU16 } from "../bytes";
import { crc16Ccitt } from "../crc16";
import { DESMUME_FOOTER_MARKER, DESMUME_FOOTER_SIZE } from "../gen4/constants";
import { classifySlot } from "../gen4/pk4";
import { levelFromExp } from "../stats";
import { SaveError, type SlotRef } from "../types";
import { decodeGen5String } from "./charset";
import {
  BLOCK_BOX_NAMES,
  BLOCK_FIRST_BOX,
  BLOCK_PARTY,
  BLOCK_TRAINER,
  BOX_COUNT,
  BOX_NAME_LENGTH,
  BOX_NAME_START,
  BOX_NAME_STRIDE,
  BOX_SLOTS,
  BW_LAYOUT,
  DEX_MAGIC,
  GAME_BLACK,
  GAME_BLACK2,
  GAME_WHITE,
  GAME_WHITE2,
  PARTY_COUNT_OFFSET,
  PARTY_SLOTS,
  PARTY_START,
  PK5_PARTY_SIZE,
  PK5_STORED_SIZE,
  SAVE_SIZE,
  TRAINER_GAME,
  TRAINER_ID,
  TRAINER_LANGUAGE,
  TRAINER_NAME,
  GEN5_LAYOUTS,
  type Gen5Layout,
} from "./constants";
import { readPk5, type Pk5Info } from "./pk5";

export { SaveError, slotKey, type SlotRef } from "../types";

export interface PokemonEntry {
  ref: SlotRef;
  /** Absolute offset of the encrypted structure in the image. */
  offset: number;
  size: typeof PK5_STORED_SIZE | typeof PK5_PARTY_SIZE;
  info: Pk5Info;
  /** Party: stored level. Box: level computed from experience. */
  level: number;
}

export interface BoxInfo {
  name: string;
  slots: (PokemonEntry | null)[];
}

/** A Generation V save that passed validation. */
export interface LoadedSave {
  layout: Gen5Layout;
  /** "Black", "White", "Black 2" or "White 2" as read from the trainer data (see GAME_* constants). */
  version: number;
  /** Private copy of the 512 KiB image (the input is never modified). */
  image: Uint8Array;
  /** Bytes after the image (emulator footer), restored on export. */
  trailer: Uint8Array;
  language: number;
  korean: boolean;
  nationalDex: boolean;
  trainerName: string;
  trainerId: number;
  party: PokemonEntry[];
  boxes: BoxInfo[];
  /** Slots holding data the game itself would reject; never touched. */
  unreadable: SlotRef[];
}

/** Offset of the checksum block in the main copy. */
export function checksumBlockOffset(layout: Gen5Layout): number {
  return layout.blocks[layout.blocks.length - 1]![0];
}

/** Absolute offset of the CRC of the checksum block. Source: PKHeX SaveUtil.cs `IsValidFooter5` (footer + length + 0xE). */
function infoCrcOffset(layout: Gen5Layout): number {
  return checksumBlockOffset(layout) + layout.checksumInfoLength + 0xe;
}

/** CRC offsets of block `i`: the one after its data and its copy in the checksum block. */
export function blockCrcOffsets(layout: Gen5Layout, i: number): { inBlock: number; inTable: number } {
  const [offset, length] = layout.blocks[i]!;
  return { inBlock: offset + length + 2, inTable: checksumBlockOffset(layout) + 2 * i };
}

/** Recomputes the CRC of one block (data CRC and its table copy). Counters do not exist in this format. */
export function writeBlockChecksum(image: Uint8Array, layout: Gen5Layout, i: number): void {
  const [offset, length] = layout.blocks[i]!;
  const crc = crc16Ccitt(image.subarray(offset, offset + length));
  const { inBlock, inTable } = blockCrcOffsets(layout, i);
  writeU16(image, inBlock, crc);
  writeU16(image, inTable, crc);
}

/** Recomputes the CRC of the checksum block itself (after the table entries were updated). */
export function writeInfoChecksum(image: Uint8Array, layout: Gen5Layout): void {
  const start = checksumBlockOffset(layout);
  writeU16(
    image,
    infoCrcOffset(layout),
    crc16Ccitt(image.subarray(start, start + layout.checksumInfoLength)),
  );
}

/** True when the checksum block of the main copy is intact (used to recognise the game). */
export function hasValidInfoBlock(image: Uint8Array, layout: Gen5Layout): boolean {
  const start = checksumBlockOffset(layout);
  return (
    readU16(image, infoCrcOffset(layout)) ===
    crc16Ccitt(image.subarray(start, start + layout.checksumInfoLength))
  );
}

/** Indexes of the blocks whose stored CRC or table copy is wrong. */
export function badBlocks(image: Uint8Array, layout: Gen5Layout): number[] {
  const bad: number[] = [];
  for (let i = 0; i < layout.blocks.length - 1; i++) {
    const [offset, length] = layout.blocks[i]!;
    const crc = crc16Ccitt(image.subarray(offset, offset + length));
    const { inBlock, inTable } = blockCrcOffsets(layout, i);
    if (readU16(image, inBlock) !== crc || readU16(image, inTable) !== crc) bad.push(i);
  }
  return bad;
}

/** Splits an optional DeSmuME footer from the raw image. */
function splitImage(input: Uint8Array): { image: Uint8Array; trailer: Uint8Array } {
  if (input.length === SAVE_SIZE) return { image: input.slice(), trailer: new Uint8Array(0) };
  if (input.length === SAVE_SIZE + DESMUME_FOOTER_SIZE) {
    const tail = new TextDecoder("latin1").decode(
      input.subarray(input.length - DESMUME_FOOTER_MARKER.length),
    );
    if (tail === DESMUME_FOOTER_MARKER)
      return { image: input.slice(0, SAVE_SIZE), trailer: input.slice(SAVE_SIZE) };
  }
  throw new SaveError(
    "unknown-format",
    `A save of this kind is exactly 512 KB (${SAVE_SIZE} bytes); this file is ${input.length} bytes.`,
  );
}

/** Finds the layout whose checksum block is intact, or undefined. */
export function detectLayout(image: Uint8Array): Gen5Layout | undefined {
  if (image.length < SAVE_SIZE) return undefined;
  return GEN5_LAYOUTS.find((l) => hasValidInfoBlock(image, l));
}

function readEntry(image: Uint8Array, offset: number, size: PokemonEntry["size"], ref: SlotRef) {
  const state = classifySlot(image.subarray(offset, offset + size));
  if (state.kind !== "pokemon") return state.kind === "invalid" ? ("invalid" as const) : null;
  const info = readPk5(state.dec);
  if (info.species > MAX_SPECIES_GEN5) return "invalid" as const;
  const level = info.party
    ? info.party.level
    : levelFromExp(getGen5Species(info.species).growthRate, info.exp);
  return { ref, offset, size, info, level } satisfies PokemonEntry;
}

/**
 * Loads and validates a Black/White or Black 2/White 2 save.
 *
 * The game's main copy (offset 0) is the one read and edited, as every save editor does;
 * the backup copy that follows it is left untouched.
 * @param input Raw file bytes (512 KiB, or 512 KiB plus a DeSmuME footer). Not modified.
 * @throws SaveError when the file is not a clean Generation V save.
 */
export function loadSave(input: Uint8Array): LoadedSave {
  const { image, trailer } = splitImage(input);
  const layout = detectLayout(image);
  if (!layout) throw new SaveError("unknown-format", "This file is not a Pokémon save this app can read.");
  const bad = badBlocks(image, layout);
  if (bad.length > 0) {
    throw new SaveError(
      "corrupt",
      `Part of the save fails its checksum (blocks ${bad.join(", ")}): the game would not load it.`,
    );
  }

  const [trainerStart] = layout.blocks[BLOCK_TRAINER]!;
  const version = image[trainerStart + TRAINER_GAME]!;
  const expected = layout === BW_LAYOUT ? [GAME_BLACK, GAME_WHITE] : [GAME_BLACK2, GAME_WHITE2];
  if (!expected.includes(version))
    throw new SaveError(
      "unknown-format",
      "The game version in the save is not one of Black, White, Black 2 or White 2.",
    );

  const [dexStart] = layout.blocks[layout.dexBlock]!;
  if (readU32(image, dexStart) !== DEX_MAGIC)
    throw new SaveError("pokedex", "The Pokédex data is not where the game keeps it.");
  const language = image[trainerStart + TRAINER_LANGUAGE]!;

  const unreadable: SlotRef[] = [];
  const party: PokemonEntry[] = [];
  const [partyStart] = layout.blocks[BLOCK_PARTY]!;
  const partyCount = image[partyStart + PARTY_COUNT_OFFSET]!;
  if (partyCount > PARTY_SLOTS) throw new SaveError("corrupt", `Invalid party size ${partyCount}.`);
  for (let i = 0; i < partyCount; i++) {
    const ref: SlotRef = { area: "party", index: i };
    const e = readEntry(image, partyStart + PARTY_START + i * PK5_PARTY_SIZE, PK5_PARTY_SIZE, ref);
    if (e === "invalid") unreadable.push(ref);
    else if (e) party.push(e);
  }

  const [namesStart] = layout.blocks[BLOCK_BOX_NAMES]!;
  const boxes: BoxInfo[] = [];
  for (let b = 0; b < BOX_COUNT; b++) {
    const [boxStart] = layout.blocks[BLOCK_FIRST_BOX + b]!;
    const slots: (PokemonEntry | null)[] = [];
    for (let s = 0; s < BOX_SLOTS; s++) {
      const ref: SlotRef = { area: "box", box: b, slot: s };
      const e = readEntry(image, boxStart + s * PK5_STORED_SIZE, PK5_STORED_SIZE, ref);
      if (e === "invalid") {
        unreadable.push(ref);
        slots.push(null);
      } else slots.push(e);
    }
    boxes.push({
      name: decodeGen5String(image, namesStart + BOX_NAME_START + b * BOX_NAME_STRIDE, BOX_NAME_LENGTH),
      slots,
    });
  }

  return {
    layout,
    version,
    image,
    trailer,
    language,
    korean: language === 8,
    nationalDex: (readU32(image, dexStart + 4) & 1) === 1,
    trainerName: decodeGen5String(image, trainerStart + TRAINER_NAME, 8),
    trainerId: readU16(image, trainerStart + TRAINER_ID),
    party,
    boxes,
    unreadable,
  };
}

/** Iterates over every Pokémon (party first, then boxes in order). */
export function allPokemon(save: LoadedSave): PokemonEntry[] {
  return [...save.party, ...save.boxes.flatMap((b) => b.slots.filter((s): s is PokemonEntry => s !== null))];
}
