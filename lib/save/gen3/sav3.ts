import { getGen4Species } from "../../data/gen4-species";
import { gen3ToNational } from "../../data/gen3-index";
import { readU16, readU32, writeU16 } from "../bytes";
import { levelFromExp } from "../stats";
import { SaveError, type SlotRef } from "../types";
import { decodeGen3String } from "./charset";
import {
  BOX_COUNT,
  BOX_NAMES_OFFSET,
  BOX_NAME_BYTES,
  BOX_NAME_CHARS,
  BOX_SLOTS,
  EMERALD_LAYOUT,
  FOOTER_CHECKSUM,
  FOOTER_COUNTER,
  FOOTER_ID,
  FOOTER_SIGNATURE,
  FRLG_FLAGS,
  FRLG_FLAG_NATIONAL_DEX,
  FRLG_LAYOUT,
  FRLG_VARS,
  FRLG_VAR_NATIONAL_DEX,
  FRLG_VAR_NATIONAL_DEX_VALUE,
  PK3_PARTY_SIZE,
  PK3_STORED_SIZE,
  RS_LAYOUT,
  RTC_TRAILER_SIZE,
  SAVE_SIZE,
  SAVE_SIZE_HALF,
  SECTORS_PER_SLOT,
  SECTOR_DATA_SIZE,
  SECTOR_SAVEBLOCK1_START,
  SECTOR_SAVEBLOCK2,
  SECTOR_SIGNATURE,
  SECTOR_SIZE,
  SECTOR_STORAGE_START,
  SLOT_SIZE,
  TRAINER_ID,
  TRAINER_NAME,
  type Gen3Layout,
} from "./constants";
import { classifyPk3, readPk3, type Pk3Info } from "./pk3";

export { SaveError, slotKey, type SlotRef } from "../types";

/** The three logical buffers the sectors are split into. Source: pret `sSaveSlotLayout`. */
export type Group = "sb2" | "sb1" | "storage";

const FIRST_SECTOR: Record<Group, number> = {
  sb2: SECTOR_SAVEBLOCK2,
  sb1: SECTOR_SAVEBLOCK1_START,
  storage: SECTOR_STORAGE_START,
};

export interface PokemonEntry {
  ref: SlotRef;
  group: "sb1" | "storage";
  /** Offset of the encrypted structure inside its logical buffer (it may straddle two sectors). */
  offset: number;
  size: typeof PK3_STORED_SIZE | typeof PK3_PARTY_SIZE;
  info: Pk3Info;
  /** National dex number. */
  species: number;
  level: number;
}

export interface BoxInfo {
  name: string;
  slots: (PokemonEntry | null)[];
}

export interface LoadedSave {
  layout: Gen3Layout;
  /** Private copy of the 128 KiB image (the input is never modified). */
  image: Uint8Array;
  /** Bytes after the image (the mGBA clock), restored on export. */
  trailer: Uint8Array;
  /** Active slot: 0 or 1. */
  slot: 0 | 1;
  /** Absolute offset of each sector id in the active slot. */
  sectors: number[];
  /** Bytes covered by each sector's checksum in this file (see {@link checksumSizes}). */
  checksumSize: number[];
  /**
   * Language of the cartridge, deduced from the Pokémon that carry the trainer's own ID; undefined when
   * they are missing or disagree. The game names evolved Pokémon in this language.
   */
  romLanguage: number | undefined;
  nationalDex: boolean;
  trainerName: string;
  trainerId: number;
  party: PokemonEntry[];
  boxes: BoxInfo[];
  unreadable: SlotRef[];
}

/** Checksum of a sector: sum of its u32 words, high and low halves added. Source: pret src/save.c `CalculateChecksum`. */
export function checksum32(data: Uint8Array, start: number, size: number): number {
  let sum = 0;
  for (let i = 0; i + 4 <= size; i += 4) sum = (sum + readU32(data, start + i)) >>> 0;
  return ((sum >>> 16) + sum) & 0xffff;
}

/**
 * Sizes a sector's checksum may cover, most specific first. The game checksums only the bytes the
 * structure uses (pret `sSaveSlotLayout`); PKHeX and the real saves checked here also validate over the whole
 * 0xF80 when the unused tail is zero. The one that matches the original file is kept and reused on write.
 */
export function checksumSizes(layout: Gen3Layout, id: number): number[] {
  if (id === SECTOR_SAVEBLOCK2) return [layout.saveBlock2Size, SECTOR_DATA_SIZE];
  if (id === 4) return [0xf08, SECTOR_DATA_SIZE];
  if (id === 13) return [0x7d0, SECTOR_DATA_SIZE];
  return [SECTOR_DATA_SIZE];
}

interface SlotScan {
  /** id -> absolute offset, only for sectors with a valid signature and checksum. */
  valid: Map<number, { offset: number; size: number }>;
  anySignature: boolean;
  /** Counter of the last valid sector (what the game uses). */
  counter: number;
  /** Highest counter of any sector with the signature, valid or not. */
  newest: number;
}

/** Mirrors pret src/save.c `GetSaveValidStatus` for one slot. */
function scanSlot(image: Uint8Array, slot: number, layoutFor: (id: number) => number[]): SlotScan {
  const valid = new Map<number, { offset: number; size: number }>();
  let anySignature = false;
  let counter = 0;
  let newest = 0;
  for (let i = 0; i < SECTORS_PER_SLOT; i++) {
    const offset = slot * SLOT_SIZE + i * SECTOR_SIZE;
    if (readU32(image, offset + FOOTER_SIGNATURE) !== SECTOR_SIGNATURE) continue;
    anySignature = true;
    newest = Math.max(newest, readU32(image, offset + FOOTER_COUNTER));
    const id = readU16(image, offset + FOOTER_ID);
    if (id >= SECTORS_PER_SLOT) continue;
    const stored = readU16(image, offset + FOOTER_CHECKSUM);
    const size = layoutFor(id).find((s) => checksum32(image, offset, s) === stored);
    if (size !== undefined) {
      valid.set(id, { offset, size });
      counter = readU32(image, offset + FOOTER_COUNTER);
    }
  }
  return { valid, anySignature, counter, newest };
}

/** Which game a slot belongs to. Source: PKHeX SaveUtil.cs `GetVersionG3SAV` (SaveBlock2 offset 0xAC: FRLG fixed 1, RS battle tower data, Emerald encryption key). */
function detectLayout(image: Uint8Array, sector0: number): Gen3Layout {
  const v = readU32(image, sector0 + 0xac);
  if (v === 1) return FRLG_LAYOUT;
  if (v === 0) return RS_LAYOUT;
  for (let i = 0x890; i < 0xf2c; i++) if (image[sector0 + i] !== 0) return EMERALD_LAYOUT;
  return RS_LAYOUT;
}

/** Splits an optional mGBA clock trailer from the image. */
function splitImage(input: Uint8Array): { image: Uint8Array; trailer: Uint8Array } {
  if (input.length === SAVE_SIZE_HALF) {
    throw new SaveError(
      "unsupported-version",
      "This save is only 64 KB: the second half of the usual 128 KB is missing, so it is not supported.",
    );
  }
  if (input.length === SAVE_SIZE) return { image: input.slice(), trailer: new Uint8Array(0) };
  if (input.length === SAVE_SIZE + RTC_TRAILER_SIZE)
    return { image: input.slice(0, SAVE_SIZE), trailer: input.slice(SAVE_SIZE) };
  throw new SaveError(
    "unknown-format",
    `A save of this kind is exactly 128 KB (${SAVE_SIZE} bytes); this file is ${input.length} bytes.`,
  );
}

/** True when the file looks like a generation III save: both halves hold sectors with the signature. */
export function looksLikeGen3(bytes: Uint8Array): boolean {
  if (
    bytes.length !== SAVE_SIZE &&
    bytes.length !== SAVE_SIZE + RTC_TRAILER_SIZE &&
    bytes.length !== SAVE_SIZE_HALF
  )
    return false;
  let sectors = 0;
  for (let i = 0; i < SECTORS_PER_SLOT; i++) {
    if (readU32(bytes, i * SECTOR_SIZE + FOOTER_SIGNATURE) === SECTOR_SIGNATURE) sectors++;
  }
  return sectors >= 1;
}

/** Absolute offset of a byte of a logical buffer, or undefined past its last sector. */
export function absOffset(save: Pick<LoadedSave, "sectors">, group: Group, offset: number): number {
  const sector = FIRST_SECTOR[group] + Math.floor(offset / SECTOR_DATA_SIZE);
  return save.sectors[sector]! + (offset % SECTOR_DATA_SIZE);
}

/** Reads bytes of a logical buffer (may cross sectors). */
export function readLogical(
  image: Uint8Array,
  save: Pick<LoadedSave, "sectors">,
  group: Group,
  offset: number,
  length: number,
): Uint8Array {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = image[absOffset(save, group, offset + i)]!;
  return out;
}

/** Writes bytes into a logical buffer (may cross sectors). */
export function writeLogical(
  image: Uint8Array,
  save: Pick<LoadedSave, "sectors">,
  group: Group,
  offset: number,
  bytes: Uint8Array,
): void {
  for (let i = 0; i < bytes.length; i++) image[absOffset(save, group, offset + i)] = bytes[i]!;
}

/** Recomputes the checksum of every sector of the active slot, over the size that validated the original. */
export function writeSlotChecksums(
  image: Uint8Array,
  save: Pick<LoadedSave, "sectors" | "checksumSize">,
): void {
  for (let id = 0; id < SECTORS_PER_SLOT; id++) {
    const offset = save.sectors[id]!;
    writeU16(image, offset + FOOTER_CHECKSUM, checksum32(image, offset, save.checksumSize[id]!));
  }
}

/** Indexes of sectors of the active slot whose stored checksum is wrong. */
export function badSectors(image: Uint8Array, save: Pick<LoadedSave, "sectors" | "checksumSize">): number[] {
  const bad: number[] = [];
  for (let id = 0; id < SECTORS_PER_SLOT; id++) {
    const offset = save.sectors[id]!;
    if (readU16(image, offset + FOOTER_CHECKSUM) !== checksum32(image, offset, save.checksumSize[id]!))
      bad.push(id);
  }
  return bad;
}

function readEntry(
  image: Uint8Array,
  save: Pick<LoadedSave, "sectors">,
  group: "sb1" | "storage",
  offset: number,
  size: PokemonEntry["size"],
  ref: SlotRef,
) {
  const state = classifyPk3(readLogical(image, save, group, offset, size));
  if (state.kind !== "pokemon") return state.kind === "invalid" ? ("invalid" as const) : null;
  const info = readPk3(state.dec);
  const species = gen3ToNational(info.speciesInternal);
  if (species === 0) return "invalid" as const;
  const level = info.party ? info.party.level : levelFromExp(getGen4Species(species).growthRate, info.exp);
  return { ref, group, offset, size, info, species, level } satisfies PokemonEntry;
}

/** The game language when every Pokémon with the trainer's own ID agrees on it. */
function deduceLanguage(entries: readonly PokemonEntry[], tid: number, sid: number): number | undefined {
  const langs = new Set(
    entries.filter((e) => e.info.tid === tid && e.info.sid === sid).map((e) => e.info.language),
  );
  return langs.size === 1 ? [...langs][0] : undefined;
}

/** National Pokédex state. FireRed/LeafGreen also require a flag and a variable (pret `IsNationalPokedexEnabled`). */
function nationalDexOf(image: Uint8Array, save: Pick<LoadedSave, "sectors">, layout: Gen3Layout): boolean {
  const magic = readLogical(image, save, "sb2", layout.nationalMagic.offset, 1)[0]!;
  if (magic !== layout.nationalMagic.value) return false;
  if (!layout.nationalDexFlagsRequired) return true;
  const flagByte = readLogical(image, save, "sb1", FRLG_FLAGS + (FRLG_FLAG_NATIONAL_DEX >> 3), 1)[0]!;
  const v = readLogical(image, save, "sb1", FRLG_VARS + FRLG_VAR_NATIONAL_DEX * 2, 2);
  return (
    (flagByte & (1 << (FRLG_FLAG_NATIONAL_DEX & 7))) !== 0 &&
    (v[0]! | (v[1]! << 8)) === FRLG_VAR_NATIONAL_DEX_VALUE
  );
}

/**
 * Loads and validates a Ruby/Sapphire, Emerald or FireRed/LeafGreen save.
 * The slot the game would load is used (pret `GetSaveValidStatus`: highest counter, slot = counter % 2);
 * the other slot, which holds the previous save, is left untouched.
 * @throws SaveError
 */
export function loadSave(input: Uint8Array): LoadedSave {
  const { image, trailer } = splitImage(input);
  // The checksum sizes depend on the game, and the game on a valid sector 0: try each layout.
  let layout: Gen3Layout | undefined;
  let slotScans: SlotScan[] = [];
  for (const candidate of [FRLG_LAYOUT, EMERALD_LAYOUT, RS_LAYOUT]) {
    // Sector 0 of any slot tells the game apart; use whichever slot has a sector with id 0.
    const trial = [0, 1].map((slot) => scanSlot(image, slot, (id) => checksumSizes(candidate, id)));
    const sector0 = trial.map((t) => t.valid.get(SECTOR_SAVEBLOCK2)?.offset).find((o) => o !== undefined);
    if (sector0 === undefined) continue;
    if (detectLayout(image, sector0) === candidate) {
      layout = candidate;
      slotScans = trial;
      break;
    }
  }
  if (!layout) {
    if (![0, 1].some((slot) => looksLikeGen3(image.subarray(slot * SLOT_SIZE))))
      throw new SaveError("unknown-format", "This file is not a Pokémon save this app can read.");
    throw new SaveError("corrupt", "Part of the save fails its checksum: the game would not load it.");
  }

  const status = slotScans.map((s) =>
    s.anySignature ? (s.valid.size === SECTORS_PER_SLOT ? "ok" : "error") : "empty",
  );
  const counters = slotScans.map((s) => s.counter);
  let counter: number;
  if (status[0] === "ok" && status[1] === "ok") {
    if (
      (counters[0] === 0xffffffff && counters[1] === 0) ||
      (counters[0] === 0 && counters[1] === 0xffffffff)
    ) {
      counter = (counters[0]! + 1) >>> 0 < (counters[1]! + 1) >>> 0 ? counters[1]! : counters[0]!;
    } else {
      counter = counters[0]! < counters[1]! ? counters[1]! : counters[0]!;
    }
  } else if (status[0] === "ok") counter = counters[0]!;
  else if (status[1] === "ok") counter = counters[1]!;
  else throw new SaveError("corrupt", "No save slot passes its checksums: the game would not load it.");
  // The game loads the good slot of a pair with a damaged one and shows a warning (pret `GetSaveValidStatus`).
  // That is fine when the damaged slot is the older one (a half-written previous save); if it is newer, the
  // player's latest progress is the damaged part, and editing the older slot would hide it.
  if (slotScans.some((s, i) => status[i] === "error" && s.newest > counter)) {
    throw new SaveError(
      "inconsistent",
      "The most recent save slot is damaged: the game would fall back to an older save and show a corruption warning.",
    );
  }
  const slot = (counter % 2) as 0 | 1;
  const scan = slotScans[slot]!;
  if (status[slot] !== "ok") {
    throw new SaveError(
      "inconsistent",
      "The save slot the game would load is damaged while the other is not: the game would show a corruption warning.",
    );
  }

  const sectors = Array.from({ length: SECTORS_PER_SLOT }, (_, id) => scan.valid.get(id)!.offset);
  const checksumSize = Array.from({ length: SECTORS_PER_SLOT }, (_, id) => scan.valid.get(id)!.size);
  const base = { sectors };
  if (readU16(image, sectors[SECTOR_SAVEBLOCK2]! + 6) === 0) {
    throw new SaveError(
      "unsupported-version",
      "This looks like a Japanese save, which is not supported yet.",
    );
  }

  const unreadable: SlotRef[] = [];
  const party: PokemonEntry[] = [];
  const partyCount = readLogical(image, base, "sb1", layout.partyCount, 1)[0]!;
  if (partyCount > 6) throw new SaveError("corrupt", `Invalid party size ${partyCount}.`);
  for (let i = 0; i < partyCount; i++) {
    const ref: SlotRef = { area: "party", index: i };
    const e = readEntry(image, base, "sb1", layout.party + i * PK3_PARTY_SIZE, PK3_PARTY_SIZE, ref);
    if (e === "invalid") unreadable.push(ref);
    else if (e) party.push(e);
  }

  const boxes: BoxInfo[] = [];
  for (let b = 0; b < BOX_COUNT; b++) {
    const slots: (PokemonEntry | null)[] = [];
    for (let s = 0; s < BOX_SLOTS; s++) {
      const ref: SlotRef = { area: "box", box: b, slot: s };
      const e = readEntry(
        image,
        base,
        "storage",
        4 + (b * BOX_SLOTS + s) * PK3_STORED_SIZE,
        PK3_STORED_SIZE,
        ref,
      );
      if (e === "invalid") {
        unreadable.push(ref);
        slots.push(null);
      } else slots.push(e);
    }
    const nameBytes = readLogical(
      image,
      base,
      "storage",
      BOX_NAMES_OFFSET + b * BOX_NAME_BYTES,
      BOX_NAME_BYTES,
    );
    boxes.push({ name: decodeGen3String(nameBytes, 0, BOX_NAME_CHARS), slots });
  }

  const trainer = readLogical(image, base, "sb2", TRAINER_NAME, 0x0e);
  const tid = readU16(trainer, TRAINER_ID);
  const sid = readU16(trainer, TRAINER_ID + 2);
  const all = [...party, ...boxes.flatMap((b) => b.slots.filter((s): s is PokemonEntry => s !== null))];
  return {
    layout,
    image,
    trailer,
    slot,
    sectors,
    checksumSize,
    romLanguage: deduceLanguage(all, tid, sid),
    nationalDex: nationalDexOf(image, base, layout),
    trainerName: decodeGen3String(trainer, 0, 7),
    trainerId: tid,
    party,
    boxes,
    unreadable,
  };
}

/** Iterates over every Pokémon (party first, then boxes in order). */
export function allPokemon(save: LoadedSave): PokemonEntry[] {
  return [...save.party, ...save.boxes.flatMap((b) => b.slots.filter((s): s is PokemonEntry => s !== null))];
}
