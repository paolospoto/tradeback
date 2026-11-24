/**
 * Builds synthetic Pokémon Platinum save images for tests.
 *
 * The layout follows lib/save/gen4/constants.ts. Everything the parser does not
 * interpret is filled with deterministic pseudo-random bytes, so "nothing else
 * changed" checks are meaningful. These files are NOT real saves: they cannot
 * replace checks on a real file.
 */
import { GEN4_TARGET_NAMES, getGen4Species, nameLangOf } from "../../lib/data/gen4-species";
import { writeU16, writeU32 } from "../../lib/save/bytes";
import { writeGen4String } from "../../lib/save/gen4/charset";
import {
  BLOCK_ID_GENERAL,
  BLOCK_ID_STORAGE,
  BOX_COUNT,
  BOX_SLOTS,
  DEX_MAGIC,
  PARTITION_SIZE,
  PK4_ABILITY,
  PK4_EVS,
  PK4_EXP,
  PK4_FRIENDSHIP,
  PK4_GENDER_FORM,
  PK4_HELD_ITEM,
  PK4_HP_CURRENT,
  PK4_IV32,
  PK4_LANGUAGE,
  PK4_LEVEL,
  PK4_NICKNAME,
  PK4_OT_NAME,
  PK4_PARTY_SIZE,
  PK4_PID,
  PK4_SID,
  PK4_SPECIES,
  PK4_STATS,
  PK4_STORED_SIZE,
  PK4_TID,
  SAVE_SIZE,
  SIGNATURE_INTL,
  SIGNATURE_KOREAN,
} from "../../lib/save/gen4/constants";
import { PLATINUM_LAYOUT, type Gen4Layout } from "../../lib/save/gen4/layouts";
import { crc16Ccitt } from "../../lib/save/crc16";
import { encryptPk4, refreshPk4Checksum } from "../../lib/save/gen4/pk4";
import { genderOf } from "../../lib/save/gen4/pokedex";
import { calcStats, expForLevel, natureOf } from "../../lib/save/stats";

type Six = [number, number, number, number, number, number];

export interface MonSpec {
  species: number;
  pid?: number;
  level?: number;
  heldItem?: number;
  /** Nickname; when absent the Pokémon carries its species name. */
  nickname?: string;
  /** Pokémon language (default: same as the game). */
  language?: number;
  ivs?: Six;
  evs?: Six;
  isEgg?: boolean;
  /** Party only: current HP (default: max). */
  hpCurrent?: number;
  /** Party only: EVs gained after the last stat refresh (stored stats use evs minus these). */
  pendingEvs?: Six;
  /** Party only: overwrite stored stats (to simulate a corrupt or unexpected value). */
  statsOverride?: Six;
}

export interface SaveSpec {
  language?: number;
  korean?: boolean;
  trainerName?: string;
  tid?: number;
  sid?: number;
  party?: MonSpec[];
  /** Box contents: box index -> slots (undefined = empty slot). */
  boxes?: Record<number, (MonSpec | undefined)[]>;
  /** Species already registered in the Pokédex as seen and caught. */
  dexCaught?: number[];
  /** Which partitions hold valid data: "both" (backup newer), "primary", "backup". */
  partitions?: "both" | "primary" | "backup";
  seed?: number;
}

/** Display names used for species without nickname in the fixtures (any language works for parsing). */
const BASIC_NAMES: Record<number, string> = {
  25: "PIKACHU", 61: "POLIWHIRL", 64: "KADABRA", 67: "MACHOKE", 75: "GRAVELER", 79: "SLOWPOKE",
  93: "HAUNTER", 95: "ONIX", 112: "RHYDON", 117: "SEADRA", 123: "SCYTHER", 125: "ELECTABUZZ",
  126: "MAGMAR", 137: "PORYGON", 233: "PORYGON2", 356: "DUSCLOPS", 366: "CLAMPERL", 392: "INFERNAPE",
  6: "CHARIZARD", 130: "GYARADOS", 448: "LUCARIO",
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s >>> 16;
  };
}

/** Builds the decrypted PK4 bytes for a spec. */
export function buildPk4(spec: MonSpec, party: boolean, gameLanguage: number, tid = 12345, sid = 54321): Uint8Array {
  const d = new Uint8Array(party ? PK4_PARTY_SIZE : PK4_STORED_SIZE);
  const sp = getGen4Species(spec.species);
  const pid = (spec.pid ?? 0x12345678) >>> 0;
  const level = spec.level ?? 30;
  const ivs = spec.ivs ?? [31, 20, 15, 10, 25, 5];
  const evs = spec.evs ?? [0, 0, 0, 0, 0, 0];
  const language = spec.language ?? gameLanguage;
  writeU32(d, PK4_PID, pid);
  writeU16(d, PK4_SPECIES, spec.species);
  writeU16(d, PK4_HELD_ITEM, spec.heldItem ?? 0);
  writeU16(d, PK4_TID, tid);
  writeU16(d, PK4_SID, sid);
  writeU32(d, PK4_EXP, expForLevel(sp.growthRate, level));
  d[PK4_FRIENDSHIP] = 70;
  const [a1, a2] = sp.abilities;
  d[PK4_ABILITY] = a2 !== 0 && (pid & 1) === 1 ? a2 : a1;
  d[PK4_LANGUAGE] = language;
  evs.forEach((v, i) => (d[PK4_EVS + i] = v));
  // Moves: give everything one move so the structure looks plausible.
  writeU16(d, 0x28, 33);
  d[0x30] = 35;
  let iv32 = 0;
  ivs.forEach((v, i) => (iv32 |= (v & 0x1f) << (i * 5)));
  if (spec.isEgg) iv32 |= 1 << 30;
  if (spec.nickname !== undefined) iv32 |= 1 << 31;
  writeU32(d, PK4_IV32, iv32 >>> 0);
  d[PK4_GENDER_FORM] = genderOf(spec.species, pid) << 1;
  // Trash bytes in the nickname area, as real games leave them.
  for (let i = 0; i < 22; i++) d[PK4_NICKNAME + i] = 0xff;
  const lang = nameLangOf(language);
  const name =
    spec.nickname ?? (lang ? GEN4_TARGET_NAMES[spec.species]?.[lang] : undefined) ?? BASIC_NAMES[spec.species] ?? "MON";
  writeGen4String(d, PK4_NICKNAME, 11, spec.isEgg ? "EGG" : name);
  for (let i = 0; i < 16; i++) d[PK4_OT_NAME + i] = 0xff;
  writeGen4String(d, PK4_OT_NAME, 8, "TEST");
  d[0x83] = 4; // Poké Ball
  d[0x84] = 5; // met level
  if (party) {
    d[PK4_LEVEL] = level;
    const pending = spec.pendingEvs ?? [0, 0, 0, 0, 0, 0];
    const storedEvs = evs.map((v, i) => v - pending[i]!) as Six;
    const stats = spec.statsOverride ?? calcStats(spec.species, sp.baseStats, ivs, storedEvs, level, natureOf(pid));
    stats.forEach((v, i) => writeU16(d, PK4_STATS + i * 2, v));
    writeU16(d, PK4_HP_CURRENT, spec.hpCurrent ?? stats[0]);
  }
  refreshPk4Checksum(d);
  return d;
}

function writeFooter(img: Uint8Array, start: number, size: number, id: number, saveCounter: number, korean: boolean, layout: Gen4Layout) {
  const ft = layout.footer;
  const f = start + size - ft.size;
  writeU32(img, f + ft.saveCounter, saveCounter);
  if (ft.blockCounter !== undefined) writeU32(img, f + ft.blockCounter, saveCounter);
  writeU32(img, f + ft.blockSize, size);
  writeU32(img, f + ft.signature, korean ? SIGNATURE_KOREAN : SIGNATURE_INTL);
  img[f + ft.blockId] = id;
  img[f + ft.blockId + 1] = 0; // padding byte (Sinnoh) or high byte of the u16 id (HG/SS)
  writeU16(img, f + ft.checksum, crc16Ccitt(img.subarray(start, f)));
}

/** Encrypted empty slot, as the game initialises it (encrypted zeros, checksum 0). */
export function emptySlot(size: number): Uint8Array {
  return encryptPk4(new Uint8Array(size));
}

/** Builds a 512 KiB Platinum image (see {@link buildGen4Save}). */
export function buildPlatinumSave(spec: SaveSpec = {}): Uint8Array {
  return buildGen4Save(spec, PLATINUM_LAYOUT);
}

/**
 * Builds a 512 KiB Generation IV image for the given game layout.
 * @returns The image; when both partitions are valid, the backup (0x40000) is the newer one.
 */
export function buildGen4Save(spec: SaveSpec = {}, layout: Gen4Layout = PLATINUM_LAYOUT): Uint8Array {
  const img = new Uint8Array(SAVE_SIZE);
  const next = rng(spec.seed ?? 1);
  for (let i = 0; i < img.length; i++) img[i] = next() & 0xff;
  const language = spec.language ?? 4;
  const korean = spec.korean ?? false;
  const partitions = spec.partitions ?? "both";
  const counters: Record<0 | 1, number | undefined> = {
    0: partitions === "backup" ? undefined : 41,
    1: partitions === "primary" ? undefined : 42,
  };

  for (const p of [0, 1] as const) {
    const g = p * PARTITION_SIZE;
    const s = g + layout.storageOffset;
    // Trainer.
    for (let i = 0; i < 16; i++) img[g + layout.trainer + i] = 0xff;
    writeGen4String(img, g + layout.trainer, 8, spec.trainerName ?? "PAOLO");
    writeU16(img, g + layout.trainer + 0x10, spec.tid ?? 12345);
    writeU16(img, g + layout.trainer + 0x12, spec.sid ?? 54321);
    img[g + layout.trainer + 0x19] = language;
    // Party.
    const party = spec.party ?? [];
    img[g + layout.party - 4] = party.length;
    for (let i = 0; i < 6; i++) {
      const bytes = party[i]
        ? encryptPk4(buildPk4(party[i]!, true, language, spec.tid, spec.sid))
        : emptySlot(PK4_PARTY_SIZE);
      img.set(bytes, g + layout.party + i * PK4_PARTY_SIZE);
    }
    // Pokédex: magic + cleared flags + caught entries.
    const dex = g + layout.pokedex;
    img.fill(0, dex, dex + 0x128 + 494);
    img.fill(0xff, dex + 0x10c, dex + 0x128); // Unown forms: none seen
    writeU32(img, dex, DEX_MAGIC);
    for (const sp of spec.dexCaught ?? []) {
      const idx = sp - 1;
      img[dex + 4 + (idx >> 3)]! |= 1 << (idx & 7);
      img[dex + 0x44 + (idx >> 3)]! |= 1 << (idx & 7);
    }
    // Boxes.
    img.fill(0, s, s + 4);
    for (let b = 0; b < BOX_COUNT; b++) {
      for (let slot = 0; slot < BOX_SLOTS; slot++) {
        const mon = spec.boxes?.[b]?.[slot];
        const bytes = mon ? encryptPk4(buildPk4(mon, false, language, spec.tid, spec.sid)) : emptySlot(PK4_STORED_SIZE);
        img.set(bytes, s + layout.boxOffset(b) + slot * PK4_STORED_SIZE);
      }
      const nameOffset = s + layout.boxNames + b * 40;
      for (let i = 0; i < 40; i++) img[nameOffset + i] = 0;
      writeGen4String(img, nameOffset, 20, `BOX ${b + 1}`);
    }
    const counter = counters[p];
    if (counter === undefined) {
      // Partition never written: erased flash.
      img.fill(0xff, g, g + PARTITION_SIZE);
      continue;
    }
    writeFooter(img, g, layout.generalSize, BLOCK_ID_GENERAL, counter, korean, layout);
    writeFooter(img, s, layout.storageSize, BLOCK_ID_STORAGE, counter, korean, layout);
  }
  return img;
}
