/** Builds synthetic generation I (Red/Blue/Yellow) saves for tests. Not real saves. */
import { getGen1Species, nationalToGen1 } from "../../lib/data/gen1-species";
import { GB_SPECIES_NAMES } from "../../lib/data/gb-names";
import { GEN1_CHARSET, writeGbString } from "../../lib/save/gen1/charset";
import {
  BOX_BANKS, BOX_MON_SIZE, BOX_MONS, BOX_NICKS, BOX_SIZE, BOX_SLOTS, BOXES_PER_BANK, CHECKSUM_OFFSET, CUR_BOX, CURRENT_BOX_NUM,
  DEX_OWNED, DEX_SEEN, MON_BOX_LEVEL, MON_DVS, MON_EXP, MON_HP, MON_LEVEL, MON_MAX_HP, MON_OT_ID, MON_SPECIES, MON_STAT_EXP, MON_STATS,
  NAME_LENGTH, PARTY, PARTY_MON_SIZE, PARTY_MONS, PARTY_NICKS, PLAYER_ID, PLAYER_NAME, SAVE_SIZE, STARTER, STARTER_PIKACHU, PIKACHU_FRIENDSHIP,
} from "../../lib/save/gen1/constants";
import { storedBoxOffset, writeBankChecksums, writeMainChecksum } from "../../lib/save/gen1/sav1";
import { calcStatGb, expForLevel, writeU16be } from "../../lib/save/gen1/stats";

export interface Mon1Spec {
  species: number;
  level?: number;
  nickname?: string;
  dvs?: [number, number, number, number];
  statExp?: number;
  hpCurrent?: number;
}

export interface Save1Spec {
  trainerName?: string;
  party?: Mon1Spec[];
  /** Box index -> Pokémon. The current box is `currentBox`. */
  boxes?: Record<number, Mon1Spec[]>;
  currentBox?: number;
  boxesChanged?: boolean;
  yellow?: boolean;
  dexCaught?: number[];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) >>> 16) & 0xff;
}

function writeMon(img: Uint8Array, at: number, spec: Mon1Spec, party: boolean) {
  const sp = getGen1Species(spec.species);
  const level = spec.level ?? 30;
  const [a, d, s, c] = spec.dvs ?? [9, 8, 7, 6];
  const hpDv = ((a & 1) << 3) | ((d & 1) << 2) | ((s & 1) << 1) | (c & 1);
  const statExp = spec.statExp ?? 0;
  img.fill(0, at, at + (party ? PARTY_MON_SIZE : BOX_MON_SIZE));
  img[at + MON_SPECIES] = nationalToGen1(spec.species);
  img[at + MON_BOX_LEVEL] = level;
  img[at + 5] = sp.types[0];
  img[at + 6] = sp.types[1];
  writeU16be(img, at + MON_OT_ID, 0x1234);
  const exp = expForLevel(sp.growthRate, level);
  img[at + MON_EXP] = exp >> 16;
  img[at + MON_EXP + 1] = (exp >> 8) & 255;
  img[at + MON_EXP + 2] = exp & 255;
  for (let i = 0; i < 5; i++) writeU16be(img, at + MON_STAT_EXP + i * 2, statExp);
  img[at + MON_DVS] = (a << 4) | d;
  img[at + MON_DVS + 1] = (s << 4) | c;
  if (party) {
    const dv = [hpDv, a, d, s, c];
    const stats = sp.baseStats.map((b, i) => calcStatGb(b, dv[i]!, statExp, level, i === 0));
    img[at + MON_LEVEL] = level;
    writeU16be(img, at + MON_MAX_HP, stats[0]!);
    for (let i = 1; i < 5; i++) writeU16be(img, at + MON_STATS + i * 2, stats[i]!);
    writeU16be(img, at + MON_HP, spec.hpCurrent ?? stats[0]!);
  } else writeU16be(img, at + MON_HP, 10);
}

function writeList(img: Uint8Array, list: number, mons: Mon1Spec[], slots: number, monsAt: number, monSize: number, nicksAt: number, party: boolean) {
  img[list] = mons.length;
  img.fill(0xff, list + 1, list + 1 + slots + 1);
  mons.forEach((m, i) => {
    img[list + 1 + i] = nationalToGen1(m.species);
    writeMon(img, list + monsAt + i * monSize, m, party);
    const name = m.nickname ?? GB_SPECIES_NAMES[m.species - 1]![0];
    writeGbString(GEN1_CHARSET, img, list + nicksAt + i * NAME_LENGTH, NAME_LENGTH, name);
  });
}

export function buildGen1Save(spec: Save1Spec = {}): Uint8Array {
  const img = new Uint8Array(SAVE_SIZE);
  const next = rng(11);
  for (let i = 0; i < img.length; i++) img[i] = next();
  const currentBox = spec.currentBox ?? 0;
  writeGbString(GEN1_CHARSET, img, PLAYER_NAME, NAME_LENGTH, spec.trainerName ?? "ASH");
  img.fill(0, DEX_OWNED, DEX_SEEN + 19);
  for (const sp of spec.dexCaught ?? []) for (const base of [DEX_OWNED, DEX_SEEN]) img[base + ((sp - 1) >> 3)]! |= 1 << ((sp - 1) & 7);
  writeU16be(img, PLAYER_ID, 0x1234);
  img[CURRENT_BOX_NUM] = currentBox | (spec.boxesChanged === false ? 0 : 0x80);
  img[STARTER] = spec.yellow ? STARTER_PIKACHU : 0xb0;
  img[PIKACHU_FRIENDSHIP] = spec.yellow ? 90 : 0;
  writeList(img, PARTY, spec.party ?? [], 6, PARTY_MONS, PARTY_MON_SIZE, PARTY_NICKS, true);
  writeList(img, CUR_BOX, spec.boxes?.[currentBox] ?? [], BOX_SLOTS, BOX_MONS, BOX_MON_SIZE, BOX_NICKS, false);
  for (let b = 0; b < 12; b++) {
    if (b === currentBox) continue;
    const at = storedBoxOffset(b);
    writeList(img, at, spec.boxes?.[b] ?? [], BOX_SLOTS, BOX_MONS, BOX_MON_SIZE, BOX_NICKS, false);
  }
  for (const bank of BOX_BANKS) void bank;
  for (let b = 0; b < 12; b += BOXES_PER_BANK) writeBankChecksums(img, b);
  void BOX_SIZE;
  writeMainChecksum(img);
  void CHECKSUM_OFFSET;
  return img;
}
