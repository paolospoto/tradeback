import { readU16, readU32 } from "../bytes";
import {
  PK4_ABILITY,
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
  PK4_OT_NAME,
  PK4_PID,
  PK4_SID,
  PK4_SPECIES,
  PK4_STATS,
  PK4_TID,
} from "../gen4/constants";
import type { StatSix } from "../types";
import { decodeGen5String } from "./charset";
import { PK5_HIDDEN_ABILITY, PK5_NATURE, PK5_PARTY_SIZE } from "./constants";

/**
 * PK5 shares the PK4 layout for everything this app reads (same offsets for species, item,
 * experience, ability, language, EVs, IVs, nickname and the party stats), the same shuffle and
 * the same encryption: the crypto helpers of gen4/pk4.ts are reused. What differs: the nature is
 * stored (0x41), a hidden-ability flag exists (0x42), text is UTF-16, and the party part is 220 bytes.
 * Source: PKHeX PK5.cs, PokeCrypto.cs `Decrypt45`.
 */
export interface Pk5Info {
  pid: number;
  species: number;
  heldItem: number;
  tid: number;
  sid: number;
  exp: number;
  ability: number;
  hiddenAbility: boolean;
  nature: number;
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
  party?: { level: number; hpCurrent: number; stats: StatSix };
}

function readSix(dec: Uint8Array, offset: number, width: 1 | 2): StatSix {
  const v = (i: number) => (width === 1 ? dec[offset + i]! : readU16(dec, offset + i * 2));
  return [v(0), v(1), v(2), v(3), v(4), v(5)];
}

/** True when the Pokémon is shiny. Source: PKHeX `PKM.IsShiny` (xor of IDs and PID halves below 8, generation V rule). */
export function isShiny(info: Pick<Pk5Info, "pid" | "tid" | "sid">): boolean {
  return ((info.tid ^ info.sid ^ (info.pid >>> 16) ^ (info.pid & 0xffff)) & 0xffff) < 8;
}

/**
 * Reads the fields this app needs from a decrypted PK5.
 * @param dec Decrypted, unshuffled bytes (136 or 220 bytes).
 */
export function readPk5(dec: Uint8Array): Pk5Info {
  const iv32 = readU32(dec, PK4_IV32);
  const info: Pk5Info = {
    pid: readU32(dec, PK4_PID),
    species: readU16(dec, PK4_SPECIES),
    heldItem: readU16(dec, PK4_HELD_ITEM),
    tid: readU16(dec, PK4_TID),
    sid: readU16(dec, PK4_SID),
    exp: readU32(dec, PK4_EXP),
    ability: dec[PK4_ABILITY]!,
    hiddenAbility: (dec[PK5_HIDDEN_ABILITY]! & 1) === 1,
    nature: dec[PK5_NATURE]!,
    language: dec[PK4_LANGUAGE]!,
    evs: readSix(dec, PK4_EVS, 1),
    ivs: [0, 5, 10, 15, 20, 25].map((shift) => (iv32 >>> shift) & 0x1f) as StatSix,
    isEgg: ((iv32 >>> PK4_IV_EGG_BIT) & 1) === 1,
    isNicknamed: ((iv32 >>> PK4_IV_NICKNAMED_BIT) & 1) === 1,
    gender: (dec[PK4_GENDER_FORM]! >>> 1) & 0x3,
    form: dec[PK4_GENDER_FORM]! >>> 3,
    nickname: decodeGen5String(dec, PK4_NICKNAME, 11),
    otName: decodeGen5String(dec, PK4_OT_NAME, 8),
  };
  if (dec.length === PK5_PARTY_SIZE) {
    info.party = {
      level: dec[PK4_LEVEL]!,
      hpCurrent: readU16(dec, PK4_HP_CURRENT),
      stats: readSix(dec, PK4_STATS, 2),
    };
  }
  return info;
}
