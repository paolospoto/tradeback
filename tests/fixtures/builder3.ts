/**
 * Builds synthetic Generation III (GBA) save images for tests. Sectors are rotated like the game does,
 * both slots are written (the older one with a lower counter), and everything the parser does not
 * interpret is deterministic noise. Not real saves: see tests/fixtures/third-party/ for those.
 */
import { GEN3_SPECIES_NAMES, type Gen3NameLang } from "../../lib/data/gen3-names";
import { nationalToGen3 } from "../../lib/data/gen3-index";
import { getGen4Species } from "../../lib/data/gen4-species";
import { writeU16, writeU32 } from "../../lib/save/bytes";
import { writeGen3String } from "../../lib/save/gen3/charset";
import {
  BOX_COUNT,
  BOX_NAMES_OFFSET,
  BOX_NAME_BYTES,
  BOX_SLOTS,
  DEX_OWNED,
  DEX_SEEN,
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
  PK3_OT_NAME,
  PK3_PARTY_SIZE,
  PK3_PID,
  PK3_SID,
  PK3_SPECIES,
  PK3_STATS,
  PK3_STORED_SIZE,
  PK3_TID,
  RS_LAYOUT,
  SAVE_SIZE,
  SECTORS_PER_SLOT,
  SECTOR_DATA_SIZE,
  SECTOR_SIGNATURE,
  SECTOR_SIZE,
  SLOT_SIZE,
  type Gen3Layout,
} from "../../lib/save/gen3/constants";
import { encryptPk3, refreshPk3Checksum } from "../../lib/save/gen3/pk3";
import { checksum32, checksumSizes } from "../../lib/save/gen3/sav3";
import { calcStats, expForLevel, natureOf } from "../../lib/save/stats";

type Six = [number, number, number, number, number, number];

export interface Mon3Spec {
  /** National dex number. */
  species: number;
  pid?: number;
  level?: number;
  /** Generation III item id. */
  heldItem?: number;
  /** Custom nickname; absent means the default name in the Pokémon's language. */
  nickname?: string;
  language?: number;
  /** Trainer ID of the original trainer (default: the save's own). */
  foreignOt?: boolean;
  ivs?: Six;
  evs?: Six;
  isEgg?: boolean;
  hpCurrent?: number;
}

export interface Save3Spec {
  trainerName?: string;
  tid?: number;
  sid?: number;
  party?: Mon3Spec[];
  boxes?: Record<number, (Mon3Spec | undefined)[]>;
  dexCaught?: number[];
  /** Set the National Pokédex (FireRed/LeafGreen: magic, flag and variable). */
  nationalDex?: boolean;
  seed?: number;
  counter?: number;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s >>> 16;
  };
}

const LANG_KEY: Record<number, Gen3NameLang> = { 2: "en", 3: "fr", 4: "it", 5: "de", 7: "es" };

/** Decrypted PK3 bytes for a spec. */
export function buildPk3(spec: Mon3Spec, party: boolean, language: number, tid: number, sid: number): Uint8Array {
  const d = new Uint8Array(party ? PK3_PARTY_SIZE : PK3_STORED_SIZE);
  const sp = getGen4Species(spec.species);
  const pid = (spec.pid ?? 0x12345678) >>> 0;
  const level = spec.level ?? 30;
  const ivs = spec.ivs ?? [31, 20, 15, 10, 25, 5];
  const evs = spec.evs ?? [0, 0, 0, 0, 0, 0];
  const lang = spec.language ?? language;
  writeU32(d, PK3_PID, pid);
  writeU16(d, PK3_TID, spec.foreignOt ? (tid + 1) & 0xffff : tid);
  writeU16(d, PK3_SID, sid);
  d.fill(0xff, PK3_NICKNAME, PK3_NICKNAME + PK3_NICKNAME_BYTES);
  const defaultName = LANG_KEY[lang] ? GEN3_SPECIES_NAMES[spec.species]?.[LANG_KEY[lang]!] : undefined;
  writeGen3String(d, PK3_NICKNAME, PK3_NICKNAME_BYTES, spec.isEgg ? "EGG" : (spec.nickname ?? defaultName ?? "MON"));
  d[PK3_LANGUAGE] = lang;
  d[PK3_FLAGS] = 2 | (spec.isEgg ? 4 : 0);
  d.fill(0xff, PK3_OT_NAME, PK3_OT_NAME + 7);
  writeGen3String(d, PK3_OT_NAME, 7, "TEST");
  writeU16(d, PK3_SPECIES, nationalToGen3(spec.species));
  writeU16(d, PK3_HELD_ITEM, spec.heldItem ?? 0);
  writeU32(d, PK3_EXP, expForLevel(sp.growthRate, level));
  d[0x29] = 70;
  evs.forEach((v, i) => (d[PK3_EVS + i] = v));
  writeU16(d, 0x2c, 33);
  d[0x34] = 35;
  let iv32 = 0;
  ivs.forEach((v, i) => (iv32 |= (v & 0x1f) << (i * 5)));
  if (spec.isEgg) iv32 |= 1 << 30;
  writeU32(d, PK3_IV32, iv32 >>> 0);
  if (party) {
    d[PK3_LEVEL] = level;
    const stats = calcStats(spec.species, sp.baseStats, ivs, evs, level, natureOf(pid));
    stats.forEach((v, i) => writeU16(d, PK3_STATS + i * 2, v));
    writeU16(d, PK3_HP_CURRENT, spec.hpCurrent ?? stats[0]);
  }
  refreshPk3Checksum(d);
  return d;
}

/** Builds a 128 KiB image for the given game. The active slot (higher counter) is slot 1 when `counter` is odd. */
export function buildGen3Save(spec: Save3Spec = {}, layout: Gen3Layout = EMERALD_LAYOUT, language = 2): Uint8Array {
  const img = new Uint8Array(SAVE_SIZE);
  const next = rng(spec.seed ?? 5);
  for (let i = 0; i < img.length; i++) img[i] = next() & 0xff;
  const tid = spec.tid ?? 12345;
  const sid = spec.sid ?? 54321;

  const sb2 = new Uint8Array(SECTOR_DATA_SIZE);
  const sb1 = new Uint8Array(4 * SECTOR_DATA_SIZE);
  const storage = new Uint8Array(9 * SECTOR_DATA_SIZE);
  for (const buf of [sb2, sb1, storage]) for (let i = 0; i < buf.length; i++) buf[i] = next() & 0xff;
  // Unused tails are zero in real saves.
  sb2.fill(0, layout.saveBlock2Size);
  sb1.fill(0, 3 * SECTOR_DATA_SIZE + 0xf08);
  storage.fill(0, 8 * SECTOR_DATA_SIZE + 0x7d0);

  sb2.fill(0xff, 0, 8);
  writeGen3String(sb2, 0, 7, spec.trainerName ?? "ASH");
  writeU16(sb2, 0x0a, tid);
  writeU16(sb2, 0x0c, sid);
  // Game detection byte(s) at 0xAC.
  writeU32(sb2, 0xac, layout === FRLG_LAYOUT ? 1 : layout === RS_LAYOUT ? 0 : 0x5a5a1234);
  if (layout === EMERALD_LAYOUT) sb2[0x900] = 1;
  sb2.fill(0, DEX_OWNED, DEX_OWNED + 49);
  sb2.fill(0, DEX_SEEN, DEX_SEEN + 49);
  sb2[layout.nationalMagic.offset] = spec.nationalDex ? layout.nationalMagic.value : 0;

  const party = spec.party ?? [];
  sb1[layout.partyCount] = party.length;
  for (let i = 0; i < 6; i++) {
    const bytes = party[i]
      ? encryptPk3(buildPk3(party[i]!, true, language, tid, sid))
      : new Uint8Array(PK3_PARTY_SIZE);
    sb1.set(bytes, layout.party + i * PK3_PARTY_SIZE);
  }
  for (const off of layout.seenCopies) sb1.fill(0, off, off + 49);
  for (const sp of spec.dexCaught ?? []) {
    const bit = sp - 1;
    for (const [buf, off] of [[sb2, DEX_OWNED], [sb2, DEX_SEEN], ...layout.seenCopies.map((o) => [sb1, o] as const)] as const) {
      buf[off + (bit >> 3)]! |= 1 << (bit & 7);
    }
  }
  if (layout === FRLG_LAYOUT && spec.nationalDex) {
    sb1[FRLG_FLAGS + (FRLG_FLAG_NATIONAL_DEX >> 3)]! |= 1 << (FRLG_FLAG_NATIONAL_DEX & 7);
    writeU16(sb1, FRLG_VARS + FRLG_VAR_NATIONAL_DEX * 2, FRLG_VAR_NATIONAL_DEX_VALUE);
  } else if (layout === FRLG_LAYOUT) {
    sb1[FRLG_FLAGS + (FRLG_FLAG_NATIONAL_DEX >> 3)]! &= ~(1 << (FRLG_FLAG_NATIONAL_DEX & 7));
  }

  storage.fill(0, 4, 4 + BOX_COUNT * BOX_SLOTS * PK3_STORED_SIZE);
  for (let b = 0; b < BOX_COUNT; b++) {
    for (let s = 0; s < BOX_SLOTS; s++) {
      const mon = spec.boxes?.[b]?.[s];
      if (mon) storage.set(encryptPk3(buildPk3(mon, false, language, tid, sid)), 4 + (b * BOX_SLOTS + s) * PK3_STORED_SIZE);
    }
    storage.fill(0xff, BOX_NAMES_OFFSET + b * BOX_NAME_BYTES, BOX_NAMES_OFFSET + (b + 1) * BOX_NAME_BYTES);
    writeGen3String(storage, BOX_NAMES_OFFSET + b * BOX_NAME_BYTES, 8, `BOX${b + 1}`);
  }

  const counter = spec.counter ?? 7;
  const chunks = (id: number): Uint8Array =>
    id === 0 ? sb2 : id <= 4 ? sb1.subarray((id - 1) * SECTOR_DATA_SIZE, id * SECTOR_DATA_SIZE) : storage.subarray((id - 5) * SECTOR_DATA_SIZE, (id - 4) * SECTOR_DATA_SIZE);
  for (const slot of [0, 1]) {
    // The active slot is `counter % 2`; the other one is the previous save.
    const slotCounter = slot === counter % 2 ? counter : counter - 1;
    const rotation = slot === 0 ? 3 : 9; // sectors are rotated differently in each slot
    for (let i = 0; i < SECTORS_PER_SLOT; i++) {
      const id = (i + rotation) % SECTORS_PER_SLOT;
      const offset = slot * SLOT_SIZE + i * SECTOR_SIZE;
      img.set(chunks(id), offset);
      img.fill(0, offset + SECTOR_DATA_SIZE, offset + FOOTER_ID);
      writeU16(img, offset + FOOTER_ID, id);
      writeU16(img, offset + FOOTER_CHECKSUM, checksum32(img, offset, checksumSizes(layout, id)[0]!));
      writeU32(img, offset + FOOTER_SIGNATURE, SECTOR_SIGNATURE);
      writeU32(img, offset + FOOTER_COUNTER, slotCounter);
    }
  }
  return img;
}
