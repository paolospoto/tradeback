/**
 * Downloads the third-party saves used by the real-save tests into tests/fixtures/third-party/saves/.
 * They are not committed because their sources have no license. Files already present are only verified.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const PKSAV = "https://raw.githubusercontent.com/ncorgan/pksav-test-saves/db0dd46";
const ROCS_PC = "https://raw.githubusercontent.com/EvenSix66/RoCs-PC/1bffa8a";

const SAVES: { path: string; url: string; sha256: string }[] = [
  {
    path: "gen1/red.sav",
    url: `${PKSAV}/red_blue/pokemon_red.sav`,
    sha256: "9f3e7089075a50ff280e286e96de9fef08ffde98cd034b77dfca6a25107ff7a1",
  },
  {
    path: "gen1/yellow.sav",
    url: `${PKSAV}/yellow/pokemon_yellow.sav`,
    sha256: "1c751da6b8a58096b0e65f02c2184af468c27c4ada1010e0b75b8cb77bf8d085",
  },
  {
    path: "gen2/gold.sav",
    url: `${PKSAV}/gold_silver/pokemon_gold.sav`,
    sha256: "38416aa9ddb85647ec13003aabbdc3b37cb9499b0513d738c8798e8fbfd2b5e5",
  },
  {
    path: "gen2/crystal.sav",
    url: `${PKSAV}/crystal/pokemon_crystal.sav`,
    sha256: "a1fdbf5d3e03b6be78eb84460322078d66ec344ebaf29abf0ddd5f315da91f02",
  },
  {
    path: "gen3/ruby.sav",
    url: `${PKSAV}/ruby_sapphire/pokemon_ruby.sav`,
    sha256: "2a07f8921b04649299da2efd2ee7bab4ba7d7ca2e1391898631a7f38b439a354",
  },
  {
    path: "gen3/emerald.sav",
    url: `${PKSAV}/emerald/pokemon_emerald.sav`,
    sha256: "10ebec735d15b9520fd726f5e16b7de20922d7b7dcca3115039ee31cec5ba4fb",
  },
  {
    path: "gen3/firered.sav",
    url: `${PKSAV}/firered_leafgreen/pokemon_firered.sav`,
    sha256: "992c40024f9ce972e6aa9e7d16b414302b2a0db80c0a111bd0463b1d427518d6",
  },
  {
    path: "gen4/diamond.sav",
    url: `${PKSAV}/diamond_pearl/pokemon_diamond.sav`,
    sha256: "64057bbfc091f3af1078979227df2f1e9bd7cba733b70db603abcf713b138a1e",
  },
  {
    path: "gen4/platinum.sav",
    url: `${PKSAV}/platinum/pokemon_platinum.sav`,
    sha256: "0a2e585928905b796636a25a400f1cae3cdfd6e172e4c39454db685ea201ca41",
  },
  {
    path: "gen4/soulsilver.sav",
    url: `${PKSAV}/heartgold_soulsilver/pokemon_soulsilver.sav`,
    sha256: "3b58804d536a219dff6869b8c608f7c3daa0961ae48fb1a79fb6ee6748d6d7e8",
  },
  {
    path: "gen5/black.sav",
    url: `${ROCS_PC}/14 - Gen V - BW Collection/Save Data/Pokemon Black.sav`,
    sha256: "9cbda4f1d738564c94a8920cfa4796766cfd83642146b87209dfdd5726a5037a",
  },
  {
    path: "gen5/white.sav",
    url: `${ROCS_PC}/14 - Gen V - BW Collection/Save Data/Pokemon White.sav`,
    sha256: "711c2445ba43add0465c18af41f99f5b820a3fe630db54c441440d84b19c5772",
  },
  {
    path: "gen5/black2.sav",
    url: `${ROCS_PC}/15 - Gen V - B2W2 Collection/Save Data/Pokemon Black 2.sav`,
    sha256: "1b7890895574f1f92b2df627109ffa75cb281ad62ee579656b1645b8907ab6b6",
  },
  {
    path: "gen5/white2.sav",
    url: `${ROCS_PC}/15 - Gen V - B2W2 Collection/Save Data/Pokemon White 2.sav`,
    sha256: "b4fd021f21a72aef1b79fc842e9a94f2c7b8a0d88cee075d1f242f84bbdc8e2c",
  },
];

const DIR = join(import.meta.dirname, "../tests/fixtures/third-party/saves");

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

for (const { path, url, sha256: expected } of SAVES) {
  const target = join(DIR, path);
  if (existsSync(target) && sha256(readFileSync(target)) === expected) continue;

  const res = await fetch(encodeURI(url));
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} from ${url}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== expected) throw new Error(`${path}: sha256 ${actual}, expected ${expected}`);

  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  console.log(`fetched ${path}`);
}
