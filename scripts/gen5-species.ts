/**
 * One-off research script (not part of the build): writes lib/data/gen5-species.ts.
 *
 * Primary source: the PokéAPI CSV dataset (github.com/PokeAPI/pokeapi, data/v2/csv),
 * reduced to generation V values with the `*_past.csv` tables (a past row holds the
 * value used up to and including its generation_id).
 * Cross-check: PKHeX `Resources/byte/personal/personal_bw` and `personal_b2w2`
 * (PersonalInfo5BW / PersonalInfo5B2W2 layout: stats 0x00-0x05, gender 0x12,
 * growth 0x15, abilities 0x18-0x1A), read as data only.
 * Third check for species 1-493: the Platinum table in lib/data/gen4-species.ts
 * (base stats, gender ratio and growth rate did not change in generation V).
 *
 * Usage: npx tsx scripts/gen5-species.ts
 * The script refuses to write the file if the sources disagree.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getGen4Species } from "../lib/data/gen4-species";
import { parseCsv } from "./fetch-species";

const ROOT = join(import.meta.dirname, "..");
const OUT = join(ROOT, "lib/data/gen5-species.ts");
const CSV = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";
const PERSONAL = "https://raw.githubusercontent.com/kwsch/PKHeX/master/PKHeX.Core/Resources/byte/personal";
const MAX = 649;
const GEN = 5;

async function text(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}
async function bytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}
const csv = async (f: string) => parseCsv(await text(`${CSV}/${f}`)).slice(1);

/** PokéAPI stat ids 1..6 = hp, atk, def, spa, spd, speed -> in-game order index. */
const STAT_TO_INGAME: Record<string, number> = { "1": 0, "2": 1, "3": 2, "4": 4, "5": 5, "6": 3 };
/** PokéAPI growth_rate_id -> in-game growth index (0 medium fast, 1 erratic, 2 fluctuating, 3 medium slow, 4 fast, 5 slow). */
const GROWTH: Record<string, number> = { "1": 5, "2": 0, "3": 4, "4": 3, "5": 1, "6": 2 };
/** PokéAPI gender_rate (eighths female, -1 genderless) -> in-game ratio byte. */
const GENDER: Record<string, number> = {
  "-1": 255,
  "0": 0,
  "1": 31,
  "2": 63,
  "4": 127,
  "6": 191,
  "7": 225,
  "8": 254,
};

type Row = [number, number, number, number, number, number, number, number, number, number, number];

/**
 * Known errors in PokéAPI's past tables, resolved in favour of the game data (PKHeX personal
 * tables, which are dumped from the ROMs). Each one is reported, never applied silently.
 * - Koffing/Weezing: no second or hidden ability before generation VII (Stench became their
 *   hidden ability in generation VII); PokéAPI reports Stench as hidden in generation V.
 * - Cryogonal: generation V Attack 50, Defense 30 (generation VII raised HP and Defense);
 *   PokéAPI's past row swaps the two values.
 */
const OVERRIDES: Record<number, { abilities?: [number, number, number]; stats?: number[] }> = {
  109: { abilities: [26, 0, 0] },
  110: { abilities: [26, 0, 0] },
  615: { stats: [70, 50, 30, 105, 95, 135] },
};

async function main() {
  const [stats, statsPast, abil, abilPast, species, names] = await Promise.all([
    csv("pokemon_stats.csv"),
    csv("pokemon_stats_past.csv"),
    csv("pokemon_abilities.csv"),
    csv("pokemon_abilities_past.csv"),
    csv("pokemon_species.csv"),
    csv("pokemon_species_names.csv"),
  ]);
  const [bw, b2w2] = await Promise.all([
    bytes(`${PERSONAL}/personal_bw`),
    bytes(`${PERSONAL}/personal_b2w2`),
  ]);

  const rows: Row[] = [];
  const problems: string[] = [];
  const bwAbilityDiffs: Record<number, [number, number, number]> = {};
  const en: Record<number, string> = {};
  for (const r of names) if (r[1] === "9" && Number(r[0]) <= MAX) en[Number(r[0])] = r[2]!;

  for (let id = 1; id <= MAX; id++) {
    const s = String(id);
    // Stats: current value, replaced by the past value of the earliest generation >= 5.
    const base = [0, 0, 0, 0, 0, 0];
    for (const r of stats) if (r[0] === s) base[STAT_TO_INGAME[r[1]!]!] = Number(r[2]);
    for (const stat of ["1", "2", "3", "4", "5", "6"]) {
      const past = statsPast
        .filter((r) => r[0] === s && r[2] === stat && Number(r[1]) >= GEN)
        .sort((a, b) => Number(a[1]) - Number(b[1]))[0];
      if (past) base[STAT_TO_INGAME[stat]!] = Number(past[3]);
    }
    // Abilities by slot (1, 2, 3 = hidden), same past rule; an empty ability id means "no ability in that slot".
    const slots: Record<string, number> = {};
    for (const r of abil) if (r[0] === s) slots[r[3]!] = Number(r[1]);
    for (const slot of ["1", "2", "3"]) {
      const past = abilPast
        .filter((r) => r[0] === s && r[4] === slot && Number(r[1]) >= GEN)
        .sort((a, b) => Number(a[1]) - Number(b[1]))[0];
      if (past) slots[slot] = past[2] === "" ? 0 : Number(past[2]);
    }
    let a1 = slots["1"] ?? 0;
    let a2 = slots["2"] ?? 0;
    let ah = slots["3"] ?? 0;
    const fix = OVERRIDES[id];
    if (fix?.abilities) {
      console.log(`override ${id} abilities ${[a1, a2, ah]} -> ${fix.abilities}`);
      [a1, a2, ah] = fix.abilities;
    }
    if (fix?.stats) {
      console.log(`override ${id} stats ${base} -> ${fix.stats}`);
      fix.stats.forEach((v, i) => (base[i] = v));
    }
    const sp = species.find((r) => r[0] === s)!;
    const gender = GENDER[sp[8]!]!;
    const growth = GROWTH[sp[14]!]!;
    const row: Row = [
      ...(base as [number, number, number, number, number, number]),
      a1,
      a2,
      ah,
      gender,
      growth,
    ];

    // Cross-check with PKHeX personal tables (entry index = species for 1-649).
    for (const [label, table, size] of [
      ["personal_b2w2", b2w2, 0x4c],
      ["personal_bw", bw, 0x3c],
    ] as const) {
      const p = table.subarray(id * size, (id + 1) * size);
      const pStats = [p[0], p[1], p[2], p[3], p[4], p[5]];
      if (pStats.some((v, i) => v !== base[i])) problems.push(`${id} ${label} stats ${pStats} vs ${base}`);
      if (p[0x12] !== gender) problems.push(`${id} ${label} gender ${p[0x12]} vs ${gender}`);
      if (p[0x15] !== growth) problems.push(`${id} ${label} growth ${p[0x15]} vs ${growth}`);
      // PKHeX fills empty slots with the first ability.
      const norm = (v: number) => (v === 0 ? a1 : v);
      const pa: [number, number, number] = [p[0x18]!, p[0x19]!, p[0x1a]!];
      const same = pa[0] === a1 && pa[1] === norm(a2) && pa[2] === norm(ah);
      if (!same) {
        if (label === "personal_bw") bwAbilityDiffs[id] = pa;
        else problems.push(`${id} ${label} abilities ${pa} vs ${[a1, a2, ah]}`);
      }
    }
    if (id <= 493) {
      const g4 = getGen4Species(id);
      if (g4.baseStats.some((v, i) => v !== base[i]))
        problems.push(`${id} gen4 stats ${g4.baseStats} vs ${base}`);
      if (g4.genderRatio !== gender) problems.push(`${id} gen4 gender`);
      if (g4.growthRate !== growth) problems.push(`${id} gen4 growth`);
    }
    rows.push(row);
  }

  console.log(`B/W ability differences from B2/W2: ${JSON.stringify(bwAbilityDiffs)}`);
  if (problems.length > 0) {
    console.error(problems.join("\n"));
    throw new Error(`${problems.length} mismatches; file not written`);
  }

  if (Object.keys(bwAbilityDiffs).length > 0)
    throw new Error("Black/White abilities differ: extend the template");
  const body = rows.map((r, i) => `  [${r.join(",")}], // ${i + 1} ${en[i + 1]}`).join("\n");
  writeFileSync(OUT, template(body));
  console.log(`gen5-species.ts: ${rows.length} species`);
}

function template(body: string): string {
  return `/**
 * Generation V (Black/White, Black 2/White 2) species data used by game logic:
 * base stats, abilities (hidden included), gender ratio and growth rate for all
 * 649 species.
 *
 * Do NOT replace with current PokéAPI values: later generations changed base
 * stats and abilities of several species.
 *
 * Sources (compared value by value by scripts/gen5-species.ts, 0 mismatches):
 * - PokéAPI CSV dataset (github.com/PokeAPI/pokeapi, data/v2/csv, 2026-11):
 *   pokemon_stats(.past), pokemon_abilities(.past), pokemon_species, reduced to
 *   generation V values.
 * - PKHeX \`Resources/byte/personal/personal_b2w2\` and \`personal_bw\`
 *   (PersonalInfo5B2W2 / PersonalInfo5BW layout), read as data only.
 * - Species 1-493: lib/data/gen4-species.ts (base stats, gender ratio and growth
 *   rate are unchanged in generation V).
 * Ability ids are the in-game indexes (= PokéAPI ability ids 1-164).
 *
 * Generated by scripts/gen5-species.ts (one-off, not part of the build).
 */
import type { BaseStats, GrowthRate } from "./gen4-species";

export interface Gen5Species {
  readonly baseStats: BaseStats;
  /** Ability ids [first, second, hidden]; 0 when the slot is empty. */
  readonly abilities: readonly [number, number, number];
  /** 0 = male only, 254 = female only, 255 = genderless, otherwise female threshold. */
  readonly genderRatio: number;
  readonly growthRate: GrowthRate;
}

/** Highest national dex number in Generation V. */
export const MAX_SPECIES_GEN5 = 649;

type Row = readonly [number, number, number, number, number, number, number, number, number, number, number];

// [hp, atk, def, spe, spa, spd, ability1, ability2, hiddenAbility, genderRatio, growthRate], index = species - 1.
// Black/White and Black 2/White 2 use the same values for every species (base forms).
// prettier-ignore
const ROWS: readonly Row[] = [
${body}
];

/**
 * Returns the Generation V data of a species.
 * @param species National dex number (1-649).
 * @throws RangeError when the species is outside Generation V.
 */
export function getGen5Species(species: number): Gen5Species {
  const r = ROWS[species - 1];
  if (!r || !Number.isInteger(species)) throw new RangeError(\`Species \${species} is not a Generation V species\`);
  return {
    baseStats: [r[0], r[1], r[2], r[3], r[4], r[5]],
    abilities: [r[6], r[7], r[8]],
    genderRatio: r[9],
    growthRate: r[10] as GrowthRate,
  };
}
`;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
