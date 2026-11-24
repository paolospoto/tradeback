import { readU16, readU32, writeU16 } from "../bytes";
import { decodeGen4String } from "./charset";
import {
  BLOCK_POSITION,
  PK4_ABILITY,
  PK4_BLOCK_SIZE,
  PK4_BLOCKS_START,
  PK4_CHECKSUM,
  PK4_EVS,
  PK4_EXP,
  PK4_GENDER_FORM,
  PK4_HELD_ITEM,
  PK4_HP_CURRENT,
  PK4_IV32,
  PK4_IV_EGG_BIT,
  PK4_IV_NICKNAMED_BIT,
  PK4_LANGUAGE,
  PK4_LEVEL,
  PK4_NICKNAME,
  PK4_NICKNAME_LENGTH,
  PK4_OT_NAME,
  PK4_PARTY_SIZE,
  PK4_PID,
  PK4_SANITY,
  PK4_SID,
  PK4_SPECIES,
  PK4_STATS,
  PK4_STORED_SIZE,
  PK4_TID,
} from "./constants";
import { cryptArray } from "../prng";

import type { StatSix } from "../types";

/** Six values in in-game stat order: HP, Atk, Def, Spe, SpA, SpD. */
export type { StatSix };

/** Readable view of a decrypted PK4 structure. */
export interface Pk4Info {
  pid: number;
  species: number;
  heldItem: number;
  tid: number;
  sid: number;
  exp: number;
  ability: number;
  language: number;
  evs: StatSix;
  ivs: StatSix;
  isEgg: boolean;
  isNicknamed: boolean;
  /** 0 male, 1 female, 2 genderless (stored value). */
  gender: number;
  form: number;
  nickname: string;
  otName: string;
  /** Party-only fields; undefined for box Pokémon. */
  party?: { level: number; hpCurrent: number; stats: StatSix };
}

function assertSize(data: Uint8Array): void {
  // 0xDC is the generation V party size: PK5 uses the same shuffle and encryption.
  if (data.length !== PK4_STORED_SIZE && data.length !== PK4_PARTY_SIZE && data.length !== 0xdc) {
    throw new RangeError(
      `PK4 data must be ${PK4_STORED_SIZE} or ${PK4_PARTY_SIZE} bytes, got ${data.length}`,
    );
  }
}

/** Shuffle value: `(PID >> 13) & 31`, reduced to 0-23. Source: PKHeX PokeCrypto.cs, pret `BoxPokemon_GetDataBlock`. */
export function shuffleValue(pid: number): number {
  return ((pid >>> 13) & 31) % 24;
}

/**
 * Computes the PK4 checksum: 16-bit sum of the u16 words of bytes 0x08-0x87 (decrypted).
 * Source: PKHeX G4PKM.cs `Checksums.Add16(Data[8..SIZE_4STORED])`; pret `Pokemon_GetDataChecksum`.
 * @param dec Decrypted, unshuffled PK4 bytes.
 */
export function calcPk4Checksum(dec: Uint8Array): number {
  let sum = 0;
  for (let i = PK4_BLOCKS_START; i < PK4_STORED_SIZE; i += 2) sum = (sum + readU16(dec, i)) & 0xffff;
  return sum;
}

/**
 * Decrypts and unshuffles a PK4 structure (box or party size).
 * @param enc Encrypted bytes as stored in the save; not modified.
 * @returns A new array with the decrypted, unshuffled structure.
 */
export function decryptPk4(enc: Uint8Array): Uint8Array {
  assertSize(enc);
  const dec = enc.slice();
  const pid = readU32(dec, PK4_PID);
  const blocks = dec.subarray(PK4_BLOCKS_START, PK4_STORED_SIZE);
  cryptArray(blocks, readU16(dec, PK4_CHECKSUM));
  if (dec.length > PK4_STORED_SIZE) cryptArray(dec.subarray(PK4_STORED_SIZE), pid);
  const stored = blocks.slice();
  const pos = BLOCK_POSITION[shuffleValue(pid)]!;
  for (let logical = 0; logical < 4; logical++) {
    const from = pos[logical]! * PK4_BLOCK_SIZE;
    blocks.set(stored.subarray(from, from + PK4_BLOCK_SIZE), logical * PK4_BLOCK_SIZE);
  }
  return dec;
}

/**
 * Shuffles and encrypts a decrypted PK4 structure. The checksum field is used
 * as the seed, so call {@link calcPk4Checksum} and store it first.
 * @param dec Decrypted, unshuffled bytes; not modified.
 * @returns A new array in the stored (encrypted) form.
 */
export function encryptPk4(dec: Uint8Array): Uint8Array {
  assertSize(dec);
  const enc = dec.slice();
  const pid = readU32(enc, PK4_PID);
  const blocks = enc.subarray(PK4_BLOCKS_START, PK4_STORED_SIZE);
  const logicalCopy = blocks.slice();
  const pos = BLOCK_POSITION[shuffleValue(pid)]!;
  for (let logical = 0; logical < 4; logical++) {
    blocks.set(
      logicalCopy.subarray(logical * PK4_BLOCK_SIZE, (logical + 1) * PK4_BLOCK_SIZE),
      pos[logical]! * PK4_BLOCK_SIZE,
    );
  }
  cryptArray(blocks, readU16(enc, PK4_CHECKSUM));
  if (enc.length > PK4_STORED_SIZE) cryptArray(enc.subarray(PK4_STORED_SIZE), pid);
  return enc;
}

/**
 * Recomputes and stores the checksum of a decrypted PK4.
 * @param dec Decrypted bytes, modified in place.
 */
export function refreshPk4Checksum(dec: Uint8Array): void {
  writeU16(dec, PK4_CHECKSUM, calcPk4Checksum(dec));
}

/** Result of classifying a stored slot. */
export type SlotState =
  | { kind: "empty" }
  | { kind: "invalid"; reason: "checksum" | "flags" }
  | { kind: "pokemon"; dec: Uint8Array };

/**
 * Decrypts a stored slot and classifies it.
 *
 * The game initialises empty slots as encrypted zeros (pret src/pokemon.c
 * `BoxPokemon_Init`), which decrypt to species 0 with a valid checksum. Fully
 * zeroed slots (never written) are also treated as empty.
 * @param enc Encrypted slot bytes.
 */
export function classifySlot(enc: Uint8Array): SlotState {
  if (enc.every((b) => b === 0)) return { kind: "empty" };
  const dec = decryptPk4(enc);
  if (calcPk4Checksum(dec) !== readU16(dec, PK4_CHECKSUM)) return { kind: "invalid", reason: "checksum" };
  if (readU16(dec, PK4_SPECIES) === 0) return { kind: "empty" };
  if (readU16(dec, PK4_SANITY) !== 0) return { kind: "invalid", reason: "flags" };
  return { kind: "pokemon", dec };
}

function readSix(dec: Uint8Array, offset: number, width: 1 | 2): StatSix {
  const v = (i: number) => (width === 1 ? dec[offset + i]! : readU16(dec, offset + i * 2));
  return [v(0), v(1), v(2), v(3), v(4), v(5)];
}

/**
 * Reads the fields this app needs from a decrypted PK4.
 * @param dec Decrypted, unshuffled bytes (box or party size).
 */
export function readPk4(dec: Uint8Array): Pk4Info {
  assertSize(dec);
  const iv32 = readU32(dec, PK4_IV32);
  const ivs: StatSix = [0, 5, 10, 15, 20, 25].map((shift) => (iv32 >>> shift) & 0x1f) as StatSix;
  const info: Pk4Info = {
    pid: readU32(dec, PK4_PID),
    species: readU16(dec, PK4_SPECIES),
    heldItem: readU16(dec, PK4_HELD_ITEM),
    tid: readU16(dec, PK4_TID),
    sid: readU16(dec, PK4_SID),
    exp: readU32(dec, PK4_EXP),
    ability: dec[PK4_ABILITY]!,
    language: dec[PK4_LANGUAGE]!,
    evs: readSix(dec, PK4_EVS, 1),
    ivs,
    isEgg: ((iv32 >>> PK4_IV_EGG_BIT) & 1) === 1,
    isNicknamed: ((iv32 >>> PK4_IV_NICKNAMED_BIT) & 1) === 1,
    gender: (dec[PK4_GENDER_FORM]! >>> 1) & 0x3,
    form: dec[PK4_GENDER_FORM]! >>> 3,
    nickname: decodeGen4String(dec, PK4_NICKNAME, PK4_NICKNAME_LENGTH),
    otName: decodeGen4String(dec, PK4_OT_NAME, 8),
  };
  if (dec.length === PK4_PARTY_SIZE) {
    info.party = {
      level: dec[PK4_LEVEL]!,
      hpCurrent: readU16(dec, PK4_HP_CURRENT),
      stats: readSix(dec, PK4_STATS, 2),
    };
  }
  return info;
}
