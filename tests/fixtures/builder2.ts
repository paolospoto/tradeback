/** Builds synthetic generation II (Gold/Silver/Crystal) saves for tests. Not real saves. */
import { getGen4Species } from "../../lib/data/gen4-species";
import { GB_SPECIES_NAMES } from "../../lib/data/gb-names";
import { GEN2_CHARSET, writeGbString } from "../../lib/save/gen1/charset";
import { calcStatGb, expForLevel, writeU16be } from "../../lib/save/gen1/stats";
import {
  BOX_COUNT, BOX_MON_SIZE, BOX_MONS, BOX_NICKS, BOX_SLOTS, CHECK_VALUE_1, CHECK_VALUE_2, CRYSTAL_LAYOUT, DEX_FLAG_BYTES, GAME_START,
  MON_DVS, MON_EXP, MON_HP, MON_ID, MON_ITEM, MON_LEVEL, MON_MAX_HP, MON_SPECIES, MON_STAT_EXP, MON_STATS, NAME_LENGTH, PARTY_MON_SIZE,
  PARTY_MONS, PARTY_NICKS, PLAYER_ID, PLAYER_NAME, SAVE_SIZE, SPECIES_EGG, type Gen2Layout,
} from "../../lib/save/gen2/constants";
import { dexCaught, storedBoxOffset, writeMainChecksum } from "../../lib/save/gen2/sav2";

export interface Mon2Spec {
  species: number;
  level?: number;
  item?: number;
  nickname?: string;
  dvs?: [number, number, number, number];
  statExp?: number;
  hpCurrent?: number;
  isEgg?: boolean;
  /** Original trainer ID (default: the player's). */
  foreignOt?: boolean;
}

export interface Save2Spec {
  trainerName?: string;
  party?: Mon2Spec[];
  boxes?: Record<number, Mon2Spec[]>;
  currentBox?: number;
  dexCaught?: number[];
  /** Clock bytes appended after the image. */
  trailer?: number;
}

const TID = 0x1a5d;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 16) & 0xff;
}

function writeMon(img: Uint8Array, at: number, m: Mon2Spec, party: boolean) {
  const sp = getGen4Species(m.species);
  const level = m.level ?? 30;
  const [a, d, s, c] = m.dvs ?? [9, 8, 7, 6];
  const hpDv = ((a & 1) << 3) | ((d & 1) << 2) | ((s & 1) << 1) | (c & 1);
  const se = m.statExp ?? 0;
  img.fill(0, at, at + (party ? PARTY_MON_SIZE : BOX_MON_SIZE));
  img[at + MON_SPECIES] = m.isEgg ? SPECIES_EGG : m.species;
  img[at + MON_ITEM] = m.item ?? 0;
  writeU16be(img, at + MON_ID, m.foreignOt ? TID + 1 : TID);
  const exp = expForLevel(sp.growthRate, level);
  img[at + MON_EXP] = exp >> 16;
  img[at + MON_EXP + 1] = (exp >> 8) & 255;
  img[at + MON_EXP + 2] = exp & 255;
  for (let i = 0; i < 5; i++) writeU16be(img, at + MON_STAT_EXP + i * 2, se);
  img[at + MON_DVS] = (a << 4) | d;
  img[at + MON_DVS + 1] = (s << 4) | c;
  img[at + MON_LEVEL] = level;
  if (party) {
    const dv = [hpDv, a, d, s, c, c];
    const stats = sp.baseStats.map((b, i) => calcStatGb(b, dv[i]!, se, level, i === 0));
    writeU16be(img, at + MON_MAX_HP, stats[0]!);
    for (let i = 1; i < 6; i++) writeU16be(img, at + MON_STATS + (i - 1) * 2, stats[i]!);
    writeU16be(img, at + MON_HP, m.hpCurrent ?? stats[0]!);
  }
}

function writeList(img: Uint8Array, list: number, mons: Mon2Spec[], slots: number, monsAt: number, monSize: number, nicksAt: number, party: boolean) {
  img[list] = mons.length;
  img.fill(0xff, list + 1, list + 2 + slots);
  mons.forEach((m, i) => {
    img[list + 1 + i] = m.isEgg ? SPECIES_EGG : m.species;
    writeMon(img, list + monsAt + i * monSize, m, party);
    writeGbString(GEN2_CHARSET, img, list + nicksAt + i * NAME_LENGTH, NAME_LENGTH, m.isEgg ? "EGG" : (m.nickname ?? GB_SPECIES_NAMES[m.species - 1]![0]));
  });
}

export function buildGen2Save(spec: Save2Spec = {}, layout: Gen2Layout = CRYSTAL_LAYOUT): Uint8Array {
  const img = new Uint8Array(SAVE_SIZE + (spec.trailer ?? 0));
  const next = rng(13);
  for (let i = 0; i < img.length; i++) img[i] = next();
  const currentBox = spec.currentBox ?? 0;
  img[GAME_START - 1] = CHECK_VALUE_1;
  img[layout.checkValue2] = CHECK_VALUE_2;
  writeU16be(img, PLAYER_ID, TID);
  writeGbString(GEN2_CHARSET, img, PLAYER_NAME, NAME_LENGTH, spec.trainerName ?? "ASH");
  img[layout.curBox] = currentBox;
  writeList(img, layout.party, spec.party ?? [], 6, PARTY_MONS, PARTY_MON_SIZE, PARTY_NICKS, true);
  const caught = dexCaught(layout);
  img.fill(0, caught, caught + 2 * DEX_FLAG_BYTES);
  for (const sp of spec.dexCaught ?? []) for (const base of [caught, caught + DEX_FLAG_BYTES]) img[base + ((sp - 1) >> 3)]! |= 1 << ((sp - 1) & 7);
  for (let b = 0; b < BOX_COUNT; b++) {
    const at = b === currentBox ? layout.activeBox : storedBoxOffset(b);
    writeList(img, at, spec.boxes?.[b] ?? [], BOX_SLOTS, BOX_MONS, BOX_MON_SIZE, BOX_NICKS, false);
  }
  writeMainChecksum(img, layout);
  return img;
}
