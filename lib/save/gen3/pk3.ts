import { readU16, readU32, writeU16 } from "../bytes";
import { BLOCK_POSITION } from "../gen4/constants";
import type { StatSix } from "../types";
import { decodeGen3String } from "./charset";
import {
  PK3_BLOCK_SIZE,
  PK3_BLOCKS_END,
  PK3_BLOCKS_START,
  PK3_CHECKSUM,
  PK3_EVS,
  PK3_EXP,
  PK3_FLAGS,
  PK3_HELD_ITEM,
  PK3_HP_CURRENT,
  PK3_IV32,
  PK3_LANGUAGE,
  PK3_LEVEL,
  PK3_NICKNAME,
  PK3_NICKNAME_BYTES,
  PK3_PARTY_SIZE,
  PK3_PID,
  PK3_SANITY,
  PK3_SID,
  PK3_SPECIES,
  PK3_STATS,
  PK3_STORED_SIZE,
  PK3_TID,
} from "./constants";

function assertSize(data: Uint8Array): void {
  if (data.length !== PK3_STORED_SIZE && data.length !== PK3_PARTY_SIZE) {
    throw new RangeError(
      `PK3 data must be ${PK3_STORED_SIZE} or ${PK3_PARTY_SIZE} bytes, got ${data.length}`,
    );
  }
}

/** XORs the 48 data bytes with the key `PID ^ (TID | SID << 16)`; an involution. Source: PKHeX PokeCrypto.cs `Decrypt3`. */
function xorBlocks(data: Uint8Array): void {
  const key = (readU32(data, PK3_PID) ^ readU32(data, PK3_TID)) >>> 0;
  for (let i = PK3_BLOCKS_START; i < PK3_BLOCKS_END; i += 4) {
    const v = (readU32(data, i) ^ key) >>> 0;
    data[i] = v & 0xff;
    data[i + 1] = (v >>> 8) & 0xff;
    data[i + 2] = (v >>> 16) & 0xff;
    data[i + 3] = v >>> 24;
  }
}

/** Substructure order depends on `PID % 24` (generation IV uses the same 24 orders but picks them with other bits). */
function positions(data: Uint8Array): readonly number[] {
  return BLOCK_POSITION[readU32(data, PK3_PID) % 24]!;
}

/** 16-bit sum of the u16 words of the 48 data bytes (decrypted). Source: PKHeX PK3.cs `CalculateChecksum`. */
export function calcPk3Checksum(dec: Uint8Array): number {
  let sum = 0;
  for (let i = PK3_BLOCKS_START; i < PK3_BLOCKS_END; i += 2) sum = (sum + readU16(dec, i)) & 0xffff;
  return sum;
}

/** Decrypts and unshuffles a PK3 (box or party size). Returns a new array. */
export function decryptPk3(enc: Uint8Array): Uint8Array {
  assertSize(enc);
  const dec = enc.slice();
  xorBlocks(dec);
  const stored = dec.slice(PK3_BLOCKS_START, PK3_BLOCKS_END);
  const pos = positions(dec);
  for (let logical = 0; logical < 4; logical++) {
    dec.set(
      stored.subarray(pos[logical]! * PK3_BLOCK_SIZE, (pos[logical]! + 1) * PK3_BLOCK_SIZE),
      PK3_BLOCKS_START + logical * PK3_BLOCK_SIZE,
    );
  }
  return dec;
}

/** Shuffles and encrypts a decrypted PK3. The checksum is not recomputed here. */
export function encryptPk3(dec: Uint8Array): Uint8Array {
  assertSize(dec);
  const enc = dec.slice();
  const pos = positions(enc);
  for (let logical = 0; logical < 4; logical++) {
    enc.set(
      dec.subarray(
        PK3_BLOCKS_START + logical * PK3_BLOCK_SIZE,
        PK3_BLOCKS_START + (logical + 1) * PK3_BLOCK_SIZE,
      ),
      PK3_BLOCKS_START + pos[logical]! * PK3_BLOCK_SIZE,
    );
  }
  xorBlocks(enc);
  return enc;
}

/** Recomputes and stores the checksum of a decrypted PK3. */
export function refreshPk3Checksum(dec: Uint8Array): void {
  writeU16(dec, PK3_CHECKSUM, calcPk3Checksum(dec));
}

export type Pk3Slot = { kind: "empty" } | { kind: "invalid" } | { kind: "pokemon"; dec: Uint8Array };

/**
 * Decrypts a stored slot and classifies it. Empty slots are all zeros; a slot is valid when its
 * checksum matches, it is flagged as holding a species and it is not a bad egg.
 */
export function classifyPk3(enc: Uint8Array): Pk3Slot {
  if (enc.every((b) => b === 0)) return { kind: "empty" };
  const dec = decryptPk3(enc);
  if (calcPk3Checksum(dec) !== readU16(dec, PK3_CHECKSUM)) return { kind: "invalid" };
  const flags = dec[PK3_FLAGS]!;
  if ((flags & 1) !== 0 || readU16(dec, PK3_SANITY) !== 0) return { kind: "invalid" };
  if ((flags & 2) === 0 || readU16(dec, PK3_SPECIES) === 0) return { kind: "empty" };
  return { kind: "pokemon", dec };
}

export interface Pk3Info {
  pid: number;
  /** Internal generation III species id (not the national number). */
  speciesInternal: number;
  heldItem: number;
  tid: number;
  sid: number;
  exp: number;
  language: number;
  evs: StatSix;
  ivs: StatSix;
  isEgg: boolean;
  /** Ability slot bit (0 first ability, 1 second). */
  abilityBit: number;
  nickname: string;
  party?: { level: number; hpCurrent: number; stats: StatSix };
}

function readSix(dec: Uint8Array, offset: number, width: 1 | 2): StatSix {
  const v = (i: number) => (width === 1 ? dec[offset + i]! : readU16(dec, offset + i * 2));
  return [v(0), v(1), v(2), v(3), v(4), v(5)];
}

/** Reads the fields this app needs from a decrypted PK3. */
export function readPk3(dec: Uint8Array): Pk3Info {
  const iv32 = readU32(dec, PK3_IV32);
  const info: Pk3Info = {
    pid: readU32(dec, PK3_PID),
    speciesInternal: readU16(dec, PK3_SPECIES),
    heldItem: readU16(dec, PK3_HELD_ITEM),
    tid: readU16(dec, PK3_TID),
    sid: readU16(dec, PK3_SID),
    exp: readU32(dec, PK3_EXP),
    language: dec[PK3_LANGUAGE]!,
    evs: readSix(dec, PK3_EVS, 1),
    ivs: [0, 5, 10, 15, 20, 25].map((shift) => (iv32 >>> shift) & 0x1f) as StatSix,
    isEgg: ((iv32 >>> 30) & 1) === 1 || (dec[PK3_FLAGS]! & 4) !== 0,
    abilityBit: iv32 >>> 31,
    nickname: decodeGen3String(dec, PK3_NICKNAME, PK3_NICKNAME_BYTES),
  };
  if (dec.length === PK3_PARTY_SIZE) {
    info.party = {
      level: dec[PK3_LEVEL]!,
      hpCurrent: readU16(dec, PK3_HP_CURRENT),
      stats: readSix(dec, PK3_STATS, 2),
    };
  }
  return info;
}
