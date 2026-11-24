/**
 * Writes the synthetic test saves used by the end-to-end tests and for manual checks.
 * Usage: npm run make-fixtures
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ITEMS } from "../lib/data/trade-evolutions";
import { buildGen4Save, buildPlatinumSave } from "../tests/fixtures/builder";
import { buildGen5Save } from "../tests/fixtures/builder5";
import { buildGen3Save } from "../tests/fixtures/builder3";
import { EMERALD_LAYOUT, FRLG_LAYOUT } from "../lib/save/gen3/constants";
import { buildGen1Save } from "../tests/fixtures/builder1";
import { buildGen2Save } from "../tests/fixtures/builder2";
import { B2W2_LAYOUT } from "../lib/save/gen5/constants";
import { DIAMOND_PEARL_LAYOUT, HGSS_LAYOUT } from "../lib/save/gen4/layouts";

const dir = join(import.meta.dirname, "../tests/fixtures");

const demo = buildPlatinumSave({
  trainerName: "PAOLO",
  language: 4,
  party: [
    { species: 93, level: 38, nickname: "Fantasmino", pid: 0x5a3c9e21, hpCurrent: 60 },
    { species: 392, level: 52, heldItem: 234 },
    { species: 95, level: 34, heldItem: ITEMS.METAL_COAT, pid: 0x0badf00d },
    { species: 64, level: 30, heldItem: ITEMS.EVERSTONE },
    { species: 67, level: 33, heldItem: ITEMS.EVERSTONE },
  ],
  boxes: {
    0: [
      { species: 366, level: 20, heldItem: ITEMS.DEEP_SEA_TOOTH },
      { species: 366, level: 22, heldItem: ITEMS.DEEP_SEA_SCALE },
      { species: 366, level: 18 },
      { species: 123, level: 25 },
      { species: 25, level: 12 },
      undefined,
      { species: 137, level: 30, heldItem: ITEMS.UPGRADE },
      { species: 75, level: 28, language: 2 },
      { species: 93, isEgg: true, level: 1 },
    ],
    1: [
      { species: 117, level: 32, heldItem: ITEMS.DRAGON_SCALE },
      { species: 356, level: 40, heldItem: ITEMS.REAPER_CLOTH },
    ],
    4: [undefined, undefined, { species: 112, level: 45, heldItem: ITEMS.PROTECTOR }],
  },
  dexCaught: [93, 392, 95, 64, 67, 366, 123, 25, 137, 75, 117, 356, 112],
});
writeFileSync(join(dir, "platinum-demo.sav"), demo);
writeFileSync(join(dir, "platinum-none.sav"), buildPlatinumSave({ party: [{ species: 392, level: 20 }] }));
const otherGames = {
  party: [
    { species: 93, level: 36, nickname: "Spooky" },
    { species: 95, level: 30, heldItem: ITEMS.METAL_COAT },
  ],
  boxes: {
    0: [{ species: 64, level: 25 }],
    3: [undefined, { species: 366, level: 20, heldItem: ITEMS.DEEP_SEA_TOOTH }],
  },
  trainerName: "ASH",
  language: 2,
};
writeFileSync(join(dir, "diamond-pearl.sav"), buildGen4Save(otherGames, DIAMOND_PEARL_LAYOUT));
writeFileSync(join(dir, "heartgold-soulsilver.sav"), buildGen4Save(otherGames, HGSS_LAYOUT));
const corrupt = demo.slice();
corrupt[0x40000 + 0x500]! ^= 0xff;
corrupt[0x500]! ^= 0xff;
writeFileSync(join(dir, "platinum-corrupt.sav"), corrupt);
console.log(`Fixtures written to ${dir}`);

writeFileSync(
  join(dir, "black-white.sav"),
  buildGen5Save({
    trainerName: "ASH",
    party: [
      { species: 588, level: 30, nickname: "Clicker" },
      { species: 93, level: 36 },
    ],
    boxes: { 0: [{ species: 616, level: 28 }], 5: [{ species: 95, level: 30, heldItem: ITEMS.METAL_COAT }] },
  }),
);
writeFileSync(
  join(dir, "black2-white2.sav"),
  buildGen5Save({ trainerName: "ASH", party: [{ species: 64, level: 30 }] }, B2W2_LAYOUT),
);

const gba = {
  trainerName: "ASH",
  party: [
    { species: 93, level: 36, nickname: "Spooky" },
    { species: 95, level: 30, heldItem: 199 },
  ],
  boxes: { 0: [{ species: 64, level: 25 }], 3: [undefined, { species: 366, level: 20, heldItem: 192 }] },
};
writeFileSync(join(dir, "emerald.sav"), buildGen3Save(gba, EMERALD_LAYOUT));
writeFileSync(join(dir, "firered-leafgreen.sav"), buildGen3Save({ ...gba, nationalDex: false }, FRLG_LAYOUT));

writeFileSync(
  join(dir, "red-blue.sav"),
  buildGen1Save({
    trainerName: "ASH",
    party: [
      { species: 93, level: 36 },
      { species: 67, level: 30 },
    ],
    dexCaught: [93, 67],
  }),
);
writeFileSync(
  join(dir, "crystal.sav"),
  buildGen2Save({
    trainerName: "ASH",
    party: [
      { species: 93, level: 36 },
      { species: 95, level: 30, item: 0x8f },
    ],
    boxes: { 0: [{ species: 137, level: 20, item: 0xac }] },
  }),
);
