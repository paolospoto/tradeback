import type { GrowthRate } from "../../data/gen4-species";
import { expForLevel, levelFromExp } from "../stats";

export { expForLevel, levelFromExp };
export type { GrowthRate };

/** Individual values of generation I and II: 4 bits each; the HP value is made of the low bit of the other four. */
export interface Dvs {
  atk: number;
  def: number;
  spe: number;
  spc: number;
  hp: number;
}

/** Reads the 2-byte DV word. Source: pret `box_struct` DVs: byte 0 = Atk (high) / Def (low), byte 1 = Spd (high) / Spc (low). */
export function readDvs(b0: number, b1: number): Dvs {
  const atk = b0 >> 4;
  const def = b0 & 15;
  const spe = b1 >> 4;
  const spc = b1 & 15;
  return { atk, def, spe, spc, hp: ((atk & 1) << 3) | ((def & 1) << 2) | ((spe & 1) << 1) | (spc & 1) };
}

/**
 * Stat Exp bonus of one stat: a quarter of the ceiling of the square root of the Stat Exp (at most 255).
 * Source: pret/pokered `CalcStat`, pret/pokecrystal `CalcMonStatC` (`.sqrt` loop capped at 255).
 */
export function statExpBonus(statExp: number): number {
  let n = 0;
  while (n * n < statExp && n < 255) n++;
  return n >> 2;
}

/**
 * One stat of generation I and II: `((base + DV) * 2 + bonus) * level / 100 + 5`, or `+ level + 10` for HP.
 * Source: pret/pokered `CalcStat`; pret/pokecrystal `CalcMonStatC`.
 */
export function calcStatGb(base: number, dv: number, statExp: number, level: number, isHp: boolean): number {
  const core = Math.floor((((base + dv) * 2 + statExpBonus(statExp)) * level) / 100);
  return isHp ? core + level + 10 : core + 5;
}

/** Reads the 5 big-endian Stat Exp values (HP, Atk, Def, Spd, Spc). */
export function readStatExp(d: Uint8Array, offset: number): [number, number, number, number, number] {
  const v = (i: number) => (d[offset + i * 2]! << 8) | d[offset + i * 2 + 1]!;
  return [v(0), v(1), v(2), v(3), v(4)];
}

/** Experience points are 3 bytes, big-endian. */
export function readExp(d: Uint8Array, offset: number): number {
  return (d[offset]! << 16) | (d[offset + 1]! << 8) | d[offset + 2]!;
}

export const readU16be = (d: Uint8Array, o: number) => (d[o]! << 8) | d[o + 1]!;
export function writeU16be(d: Uint8Array, o: number, v: number): void {
  d[o] = (v >> 8) & 0xff;
  d[o + 1] = v & 0xff;
}

/** 8-bit sum, complemented (generation I). Source: pret/pokered `CalcCheckSum`. */
export function checksum8(d: Uint8Array, start: number, end: number): number {
  let s = 0;
  for (let i = start; i < end; i++) s = (s + d[i]!) & 0xff;
  return ~s & 0xff;
}

/** 16-bit sum of bytes (generation II). Source: pret/pokecrystal `Checksum`. */
export function checksum16(d: Uint8Array, start: number, end: number): number {
  let s = 0;
  for (let i = start; i < end; i++) s = (s + d[i]!) & 0xffff;
  return s;
}

/** Checks a flag array bit (bit = number - 1). */
export function getFlag(d: Uint8Array, base: number, number: number): boolean {
  return (d[base + ((number - 1) >> 3)]! & (1 << ((number - 1) & 7))) !== 0;
}

/** Sets a flag array bit (bit = number - 1). */
export function setFlag(d: Uint8Array, base: number, number: number): void {
  const o = base + ((number - 1) >> 3);
  d[o] = d[o]! | (1 << ((number - 1) & 7));
}
