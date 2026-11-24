/**
 * Builds synthetic Generation V (Black/White, Black 2/White 2) save images for tests.
 * Everything the parser does not interpret is deterministic noise, so "nothing else
 * changed" checks are meaningful. Not real saves: see tests/fixtures/third-party/ for those.
 */
import { getGen5Species } from "../../lib/data/gen5-species";
import { GEN5_TARGET_NAMES, type Gen5NameLang } from "../../lib/data/gen5-names";
import { writeU16, writeU32 } from "../../lib/save/bytes";
import { crc16Ccitt } from "../../lib/save/crc16";
import { writeGen5String } from "../../lib/save/gen5/charset";
import {
  BLOCK_BOX_NAMES,
  BLOCK_FIRST_BOX,
  BLOCK_PARTY,
  BLOCK_TRAINER,
  BOX_COUNT,
  BOX_NAME_START,
  BOX_NAME_STRIDE,
  BOX_SLOTS,
  BW_LAYOUT,
  DEX_FORMS,
  DEX_MAGIC,
  GAME_BLACK,
  GAME_BLACK2,
  PARTY_COUNT_OFFSET,
  PARTY_START,
  PK5_HIDDEN_ABILITY,
  PK5_NATURE,
  PK5_PARTY_SIZE,
  PK5_STORED_SIZE,
  SAVE_SIZE,
  TRAINER_GAME,
  TRAINER_ID,
  TRAINER_LANGUAGE,
  TRAINER_NAME,
  B2W2_LAYOUT,
  type Gen5Layout,
} from "../../lib/save/gen5/constants";
import { blockCrcOffsets, checksumBlockOffset } from "../../lib/save/gen5/sav5";
import { PK4_ABILITY, PK4_EVS, PK4_EXP, PK4_FRIENDSHIP, PK4_GENDER_FORM, PK4_HELD_ITEM, PK4_HP_CURRENT, PK4_IV32, PK4_LANGUAGE, PK4_LEVEL, PK4_NICKNAME, PK4_PID, PK4_SID, PK4_SPECIES, PK4_STATS, PK4_TID } from "../../lib/save/gen4/constants";
import { encryptPk4, refreshPk4Checksum } from "../../lib/save/gen4/pk4";
import { calcStats, expForLevel } from "../../lib/save/stats";

type Six = [number, number, number, number, number, number];

export interface Mon5Spec {
  species: number;
  pid?: number;
  level?: number;
  heldItem?: number;
  nickname?: string;
  language?: number;
  nature?: number;
  ivs?: Six;
  evs?: Six;
  isEgg?: boolean;
  hiddenAbility?: boolean;
  gender?: number;
  hpCurrent?: number;
}

export interface Save5Spec {
  language?: number;
  trainerName?: string;
  tid?: number;
  sid?: number;
  /** Black/White: "black"; Black 2/White 2: "black2". */
  party?: Mon5Spec[];
  boxes?: Record<number, (Mon5Spec | undefined)[]>;
  dexCaught?: number[];
  nationalDex?: boolean;
  seed?: number;
}

const NAMES: Record<number, string> = {
  64: "Kadabra", 93: "Haunter", 95: "Onix", 366: "Clamperl", 588: "Karrablast", 616: "Shelmet", 25: "Pikachu", 497: "Serperior",
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s >>> 16;
  };
}

/** Decrypted PK5 bytes for a spec. */
export function buildPk5(spec: Mon5Spec, party: boolean, gameLanguage: number, tid = 12345, sid = 54321): Uint8Array {
  const d = new Uint8Array(party ? PK5_PARTY_SIZE : PK5_STORED_SIZE);
  const sp = getGen5Species(spec.species);
  const pid = (spec.pid ?? 0x12345678) >>> 0;
  const level = spec.level ?? 30;
  const ivs = spec.ivs ?? [31, 20, 15, 10, 25, 5];
  const evs = spec.evs ?? [0, 0, 0, 0, 0, 0];
  const language = spec.language ?? gameLanguage;
  const nature = spec.nature ?? 7;
  writeU32(d, PK4_PID, pid);
  writeU16(d, PK4_SPECIES, spec.species);
  writeU16(d, PK4_HELD_ITEM, spec.heldItem ?? 0);
  writeU16(d, PK4_TID, tid);
  writeU16(d, PK4_SID, sid);
  writeU32(d, PK4_EXP, expForLevel(sp.growthRate, level));
  d[PK4_FRIENDSHIP] = 70;
  const [a1, a2, ha] = sp.abilities;
  d[PK4_ABILITY] = spec.hiddenAbility && ha !== 0 ? ha : ((pid >>> 16) & 1) === 1 && a2 !== 0 ? a2 : a1;
  d[PK4_LANGUAGE] = language;
  evs.forEach((v, i) => (d[PK4_EVS + i] = v));
  writeU16(d, 0x28, 33);
  d[0x30] = 35;
  let iv32 = 0;
  ivs.forEach((v, i) => (iv32 |= (v & 0x1f) << (i * 5)));
  if (spec.isEgg) iv32 |= 1 << 30;
  if (spec.nickname !== undefined) iv32 |= 1 << 31;
  writeU32(d, PK4_IV32, iv32 >>> 0);
  d[PK4_GENDER_FORM] = (spec.gender ?? 0) << 1;
  d[PK5_NATURE] = nature;
  d[PK5_HIDDEN_ABILITY] = spec.hiddenAbility ? 1 : 0;
  for (let i = 0; i < 22; i++) d[PK4_NICKNAME + i] = 0xff;
  const langKey: Record<number, Gen5NameLang> = { 2: "en", 3: "fr", 4: "it", 5: "de", 7: "es" };
  const name = spec.nickname ?? (langKey[language] ? GEN5_TARGET_NAMES[spec.species]?.[langKey[language]!] : undefined) ?? NAMES[spec.species] ?? "Mon";
  writeGen5String(d, PK4_NICKNAME, 11, spec.isEgg ? "Egg" : name);
  d[0x83] = 4;
  d[0x84] = 5;
  d[0x5f] = 21;
  if (party) {
    d[PK4_LEVEL] = level;
    const stats = calcStats(spec.species, sp.baseStats, ivs, evs, level, nature);
    stats.forEach((v, i) => writeU16(d, PK4_STATS + i * 2, v));
    writeU16(d, PK4_HP_CURRENT, spec.hpCurrent ?? stats[0]);
  }
  refreshPk4Checksum(d);
  return d;
}

function emptySlot(size: number): Uint8Array {
  return encryptPk4(new Uint8Array(size));
}

/** Builds a 512 KiB Generation V image: main copy at 0, an older-looking backup right after. */
export function buildGen5Save(spec: Save5Spec = {}, layout: Gen5Layout = BW_LAYOUT): Uint8Array {
  const img = new Uint8Array(SAVE_SIZE);
  const next = rng(spec.seed ?? 3);
  for (let i = 0; i < img.length; i++) img[i] = next() & 0xff;
  const language = spec.language ?? 2;
  const at = (block: number) => layout.blocks[block]![0];

  const t = at(BLOCK_TRAINER);
  img.fill(0xff, t + TRAINER_NAME, t + TRAINER_NAME + 16);
  writeGen5String(img, t + TRAINER_NAME, 8, spec.trainerName ?? "Ash");
  writeU16(img, t + TRAINER_ID, spec.tid ?? 12345);
  writeU16(img, t + TRAINER_ID + 2, spec.sid ?? 54321);
  img[t + TRAINER_LANGUAGE] = language;
  img[t + TRAINER_GAME] = layout === B2W2_LAYOUT ? GAME_BLACK2 : GAME_BLACK;

  const party = spec.party ?? [];
  const p = at(BLOCK_PARTY);
  img[p + PARTY_COUNT_OFFSET] = party.length;
  for (let i = 0; i < 6; i++) {
    const bytes = party[i] ? encryptPk4(buildPk5(party[i]!, true, language, spec.tid, spec.sid)) : emptySlot(PK5_PARTY_SIZE);
    img.set(bytes, p + PARTY_START + i * PK5_PARTY_SIZE);
  }

  const dex = at(layout.dexBlock);
  const [, dexLength] = layout.blocks[layout.dexBlock]!;
  img.fill(0, dex, dex + dexLength);
  writeU32(img, dex, DEX_MAGIC);
  writeU32(img, dex + 4, spec.nationalDex === false ? 0 : 1);
  for (const sp of spec.dexCaught ?? []) {
    const idx = sp - 1;
    img[dex + 0x08 + (idx >> 3)]! |= 1 << (idx & 7);
    img[dex + 0x5c + (idx >> 3)]! |= 1 << (idx & 7);
    img[dex + 0x1ac + (idx >> 3)]! |= 1 << (idx & 7);
  }
  void DEX_FORMS;

  const names = at(BLOCK_BOX_NAMES);
  for (let b = 0; b < BOX_COUNT; b++) {
    const box = at(BLOCK_FIRST_BOX + b);
    for (let s = 0; s < BOX_SLOTS; s++) {
      const mon = spec.boxes?.[b]?.[s];
      img.set(mon ? encryptPk4(buildPk5(mon, false, language, spec.tid, spec.sid)) : emptySlot(PK5_STORED_SIZE), box + s * PK5_STORED_SIZE);
    }
    const n = names + BOX_NAME_START + b * BOX_NAME_STRIDE;
    img.fill(0xff, n, n + 0x14);
    writeGen5String(img, n, 10, `Box ${b + 1}`);
  }

  // CRC of every block, its table copy, then the checksum block's own CRC.
  for (let i = 0; i < layout.blocks.length - 1; i++) {
    const [o, l] = layout.blocks[i]!;
    const crc = crc16Ccitt(img.subarray(o, o + l));
    const { inBlock, inTable } = blockCrcOffsets(layout, i);
    writeU16(img, inBlock, crc);
    writeU16(img, inTable, crc);
  }
  const info = checksumBlockOffset(layout);
  writeU16(img, info + layout.checksumInfoLength + 0xe, crc16Ccitt(img.subarray(info, info + layout.checksumInfoLength)));
  return img;
}
