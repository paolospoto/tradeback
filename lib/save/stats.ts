import type { BaseStats, GrowthRate } from "../data/gen4-species";
import type { StatSix } from "./types";

/**
 * Nature of a Pokémon: PID mod 25.
 * Source: PKHeX (Gen 3-4 nature from PID); pret src/pokemon.c `Pokemon_GetNatureOf` (`personality % NATURE_COUNT`).
 */
export function natureOf(pid: number): number {
  return (pid >>> 0) % 25;
}

/**
 * Nature effect on a non-HP stat: +1 (x1.1), -1 (x0.9) or 0.
 * Nature n raises stat floor(n / 5) and lowers stat n % 5 over (Atk, Def, Spe, SpA, SpD);
 * no effect when both are the same. Checked against all 25 rows of pret
 * src/pokemon.c `sNatureStatAffinities`.
 * @param nature 0-24.
 * @param statIndex 1-5 in in-game order (1 Atk, 2 Def, 3 Spe, 4 SpA, 5 SpD).
 */
export function natureEffect(nature: number, statIndex: number): -1 | 0 | 1 {
  const up = Math.floor(nature / 5);
  const down = nature % 5;
  if (up === down) return 0;
  if (statIndex - 1 === up) return 1;
  if (statIndex - 1 === down) return -1;
  return 0;
}

/**
 * Computes the six stats of a Pokémon exactly as Platinum does.
 *
 * Source: pret src/pokemon.c `Pokemon_CalcStats`:
 * HP = (2B + IV + EV/4) * L / 100 + L + 10; other = ((2B + IV + EV/4) * L / 100 + 5) then
 * `Pokemon_GetNatureStatValue` (value * 110 / 100 or value * 90 / 100, integer division).
 * Shedinja's HP is always 1 (species 292).
 * @returns Stats in order HP, Atk, Def, Spe, SpA, SpD.
 */
export function calcStats(
  species: number,
  base: BaseStats,
  ivs: StatSix,
  evs: StatSix,
  level: number,
  nature: number,
): StatSix {
  const core = (i: number) => Math.floor(((2 * base[i]! + ivs[i]! + Math.floor(evs[i]! / 4)) * level) / 100);
  const hp = species === 292 ? 1 : core(0) + level + 10;
  const other = (i: number) => {
    const v = core(i) + 5;
    const eff = natureEffect(nature, i);
    if (eff === 1) return Math.floor((v * 110) / 100);
    if (eff === -1) return Math.floor((v * 90) / 100);
    return v;
  };
  return [hp, other(1), other(2), other(3), other(4), other(5)];
}

/**
 * Experience needed to reach a level, per growth rate.
 * Formulas reproduce every value of pret `res/pokemon/.shared/exp_tables.csv` for levels 1-100
 * (checked programmatically; level 1 is 0 for all rates).
 */
export function expForLevel(growth: GrowthRate, n: number): number {
  if (n <= 1) return 0;
  const n3 = n * n * n;
  switch (growth) {
    case 0:
      return n3;
    case 1:
      if (n <= 50) return Math.floor((n3 * (100 - n)) / 50);
      if (n <= 68) return Math.floor((n3 * (150 - n)) / 100);
      if (n <= 98) return Math.floor((n3 * Math.floor((1911 - 10 * n) / 3)) / 500);
      return Math.floor((n3 * (160 - n)) / 100);
    case 2:
      if (n <= 15) return Math.floor((n3 * (Math.floor((n + 1) / 3) + 24)) / 50);
      if (n <= 36) return Math.floor((n3 * (n + 14)) / 50);
      return Math.floor((n3 * (Math.floor(n / 2) + 32)) / 50);
    case 3:
      return Math.floor((6 * n3) / 5) - 15 * n * n + 100 * n - 140;
    case 4:
      return Math.floor((4 * n3) / 5);
    case 5:
      return Math.floor((5 * n3) / 4);
  }
}

/**
 * Level reached with a given amount of experience (1-100).
 * Mirrors pret src/pokemon.c `SpeciesData_GetLevelAt` (highest level whose threshold is <= exp).
 */
export function levelFromExp(growth: GrowthRate, exp: number): number {
  let level = 1;
  while (level < 100 && expForLevel(growth, level + 1) <= exp) level++;
  return level;
}
