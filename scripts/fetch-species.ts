/**
 * Build step: downloads display names (species, abilities, held items) from the
 * PokéAPI dataset and writes `lib/data/species-display.json`.
 *
 * The data comes from PokéAPI's own CSV dataset (the source of the REST API),
 * hosted on GitHub. Four small files replace ~500 REST calls, which keeps the
 * build fast and respects PokéAPI's fair use policy.
 *
 * If the network is unavailable and a previously generated file exists, the
 * build continues with the committed copy instead of failing.
 *
 * These names are for display only; game logic never reads them.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "lib/data/species-display.json");
const CSV_BASE = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv";

/** PokéAPI `languages.csv` ids for the languages the UI needs. */
const LANGS = { it: "8", en: "9" } as const;
type Lang = keyof typeof LANGS;
type Names = Record<Lang, string>;

/** Number of species in Generation V. */
const MAX_SPECIES = 649;
/** Highest ability index in Generation V (Teravolt). */
const MAX_ABILITY = 164;
const GEN4 = "4";
/** Generation V item indexes extend the generation IV ones (same numbers for shared items). */
const GEN5 = "5";

async function fetchCsv(file: string): Promise<string[][]> {
  const res = await fetch(`${CSV_BASE}/${file}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
  return parseCsv(await res.text());
}

/** Minimal RFC 4180 parser (quoted fields may contain commas and newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1);
}

function collectNames(rows: string[][], idCol: number, langCol: number, nameCol: number, maxId: number) {
  const out: Record<number, Partial<Names>> = {};
  for (const r of rows.slice(1)) {
    const id = Number(r[idCol]);
    if (!Number.isInteger(id) || id < 1 || id > maxId) continue;
    for (const [lang, langId] of Object.entries(LANGS) as [Lang, string][]) {
      if (r[langCol] === langId) (out[id] ??= {})[lang] = r[nameCol];
    }
  }
  return out;
}

function complete(map: Record<number, Partial<Names>>, label: string, maxId: number): Record<number, Names> {
  const out: Record<number, Names> = {};
  for (let id = 1; id <= maxId; id++) {
    const n = map[id];
    if (!n?.it || !n.en) throw new Error(`Missing ${label} names for id ${id}`);
    out[id] = { it: n.it, en: n.en };
  }
  return out;
}

async function main() {
  const [speciesRows, abilityRows, itemRows, itemIndexRows] = await Promise.all([
    fetchCsv("pokemon_species_names.csv"),
    fetchCsv("ability_names.csv"),
    fetchCsv("item_names.csv"),
    fetchCsv("item_game_indices.csv"),
  ]);

  const species = complete(collectNames(speciesRows, 0, 1, 2, MAX_SPECIES), "species", MAX_SPECIES);
  const abilities = complete(collectNames(abilityRows, 0, 1, 2, MAX_ABILITY), "ability", MAX_ABILITY);

  // PokéAPI item ids differ from the in-game item index; map them through the
  // Generation IV game indices so the keys match the held item field of PK4.
  // Generation V indexes are used for items that generation IV does not have (e.g. Prism Scale).
  const apiToGen4 = new Map<string, number>();
  for (const r of itemIndexRows.slice(1)) {
    if (r[1] === GEN4) apiToGen4.set(r[0]!, Number(r[2]));
  }
  const usedIndexes = new Set(apiToGen4.values());
  for (const r of itemIndexRows.slice(1)) {
    if (r[1] === GEN5 && !apiToGen4.has(r[0]!) && !usedIndexes.has(Number(r[2])))
      apiToGen4.set(r[0]!, Number(r[2]));
  }
  const items: Record<number, Names> = {};
  for (const r of itemRows.slice(1)) {
    const gen4 = apiToGen4.get(r[0]!);
    if (gen4 === undefined) continue;
    for (const [lang, langId] of Object.entries(LANGS) as [Lang, string][]) {
      if (r[1] === langId) (items[gen4] ??= { it: "", en: "" })[lang] = r[2]!;
    }
  }

  const data = {
    source: "PokéAPI dataset (github.com/PokeAPI/pokeapi, data/v2/csv)",
    species,
    abilities,
    items: Object.fromEntries(Object.entries(items).sort((a, b) => Number(a[0]) - Number(b[0]))),
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data) + "\n");
  console.log(
    `species-display.json: ${Object.keys(species).length} species, ${Object.keys(abilities).length} abilities, ${Object.keys(items).length} items`,
  );
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntryPoint)
  main().catch((err: unknown) => {
    if (existsSync(OUT)) {
      console.warn(`fetch-species: ${String(err)}; keeping the existing species-display.json`);
      return;
    }
    console.error(err);
    process.exit(1);
  });
