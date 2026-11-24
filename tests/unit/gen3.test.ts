/** Generation III: Ruby/Sapphire, Emerald, FireRed/LeafGreen. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasSave, THIRD_PARTY_SAVES } from "../fixtures/third-party";
import { GEN3_ITEMS } from "@/lib/data/gen3-index";
import { openSave, SaveError } from "@/lib/save";
import { EMERALD_LAYOUT, FRLG_LAYOUT, RS_LAYOUT, SECTOR_SIZE, SLOT_SIZE } from "@/lib/save/gen3/constants";
import { readDexEntry } from "@/lib/save/gen3/pokedex";
import { allPokemon, badSectors, loadSave } from "@/lib/save/gen3/sav3";
import { buildGen3Save } from "../fixtures/builder3";

const base = {
  trainerName: "ASH",
  party: [
    { species: 93, level: 36, nickname: "Spooky" },
    { species: 95, level: 30, heldItem: GEN3_ITEMS.METAL_COAT },
  ],
  boxes: {
    0: [{ species: 64, level: 25 }],
    1: [
      ...Array<undefined>(19).fill(undefined),
      { species: 366, level: 20, heldItem: GEN3_ITEMS.DEEP_SEA_TOOTH },
    ], // slot 19: straddles two sectors
    13: [undefined, { species: 366, level: 20, heldItem: GEN3_ITEMS.DEEP_SEA_SCALE }],
  },
};

describe.each([
  [RS_LAYOUT, "ruby-sapphire"],
  [EMERALD_LAYOUT, "emerald"],
  [FRLG_LAYOUT, "firered-leafgreen"],
] as const)("%s", (layout, game) => {
  const image = (spec = base, counter = 7) => buildGen3Save({ ...spec, counter, nationalDex: true }, layout);

  it("is recognised and read, including a Pokémon that straddles two sectors", () => {
    const save = loadSave(image());
    expect(save.layout).toBe(layout);
    expect(save.trainerName).toBe("ASH");
    expect(save.romLanguage).toBe(2);
    expect(save.party.map((p) => [p.species, p.level, p.info.nickname])).toEqual([
      [93, 36, "Spooky"],
      [95, 30, "ONIX"],
    ]);
    expect(save.boxes[1]!.slots[19]!.species).toBe(366);
    expect(save.boxes[13]!.slots[1]!.species).toBe(366);
    expect(save.boxes[13]!.name).toBe("BOX14");
    expect(allPokemon(save)).toHaveLength(5);
  });

  it("uses the slot the game loads (counter % 2)", () => {
    expect(loadSave(image(base, 7)).slot).toBe(1);
    expect(loadSave(image(base, 8)).slot).toBe(0);
  });

  it("evolves everything, verifies, renames only default names and fills the 4 Pokédex arrays", () => {
    const opened = openSave(image());
    expect(opened.save.game).toBe(game);
    const refs = opened.candidates.filter((c) => c.preview).map((c) => c.entry.ref);
    expect(refs).toHaveLength(5);
    const result = opened.evolve(refs);
    expect(result.ok, result.ok ? "" : result.problems.join("; ")).toBe(true);
    if (!result.ok) return;
    const after = loadSave(result.bytes);
    expect(badSectors(after.image, after)).toEqual([]);
    expect(after.party.map((p) => [p.species, p.info.nickname, p.info.heldItem])).toEqual([
      [94, "Spooky", 0],
      [208, "STEELIX", 0],
    ]);
    expect(after.boxes[0]!.slots[0]!.species).toBe(65);
    expect(after.boxes[1]!.slots[19]!.species).toBe(367);
    expect(after.boxes[13]!.slots[1]!.species).toBe(368);
    expect(after.boxes[13]!.slots[1]!.info.nickname).toBe("GOREBYSS");
    for (const sp of [94, 208, 65, 367, 368]) {
      const e = readDexEntry(after.image, after, sp);
      expect([sp, e.owned, ...e.seen]).toEqual([sp, true, true, true, true]);
    }
  });

  it("only changes the evolved Pokémon, the Pokédex arrays and checksums, and leaves the other slot alone", () => {
    const before = image();
    const result = openSave(before).evolve([{ area: "party", index: 1 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const other = 1 - loadSave(before).slot;
    expect(result.bytes.subarray(other * SLOT_SIZE, (other + 1) * SLOT_SIZE)).toEqual(
      before.subarray(other * SLOT_SIZE, (other + 1) * SLOT_SIZE),
    );
    expect(result.bytes.subarray(2 * SLOT_SIZE)).toEqual(before.subarray(2 * SLOT_SIZE));
    let changed = 0;
    result.bytes.forEach((b, i) => b !== before[i] && changed++);
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(260);
  });

  it("blocks Everstone (Kadabra included) and missing items", () => {
    const img = buildGen3Save(
      {
        party: [
          { species: 64, heldItem: GEN3_ITEMS.EVERSTONE },
          { species: 95 },
          { species: 93, heldItem: GEN3_ITEMS.EVERSTONE },
        ],
        nationalDex: true,
      },
      layout,
    );
    expect(
      openSave(img).candidates.map((c) => (c.status.kind === "blocked" ? c.status.reason : "ready")),
    ).toEqual(["everstone", "missing-item", "everstone"]);
  });

  it("writes the default name in the cartridge language", () => {
    const img = buildGen3Save(
      {
        party: [
          { species: 95, heldItem: GEN3_ITEMS.METAL_COAT, level: 30 },
          { species: 79, heldItem: GEN3_ITEMS.KINGS_ROCK, level: 30 },
        ],
        nationalDex: true,
      },
      layout,
      3,
    );
    const result = openSave(img).evolve([
      { area: "party", index: 0 },
      { area: "party", index: 1 },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(loadSave(result.bytes).party.map((p) => p.info.nickname)).toEqual(["STEELIX", "ROIGADA"]);
  });

  it("does not guess when the cartridge language is unknown: default names block, nicknames evolve", () => {
    const img = buildGen3Save(
      {
        party: [
          { species: 93, foreignOt: true },
          { species: 93, foreignOt: true, nickname: "Boo" },
        ],
        nationalDex: true,
      },
      layout,
    );
    const opened = openSave(img);
    expect(opened.save.party).toHaveLength(2);
    expect(opened.candidates.map((c) => (c.status.kind === "blocked" ? c.status.reason : "ready"))).toEqual([
      "ready",
      "unsupported-language",
    ]); // ready ones are listed first
  });

  it("rejects a corrupt sector", () => {
    const img = image();
    const slot = loadSave(img).slot;
    img[slot * SLOT_SIZE + 5 * SECTOR_SIZE + 0x100]! ^= 1;
    expect(() => openSave(img)).toThrow(SaveError);
  });
});

describe("FireRed/LeafGreen National Pokédex rule", () => {
  const spec = {
    party: [
      { species: 95, level: 30, heldItem: GEN3_ITEMS.METAL_COAT },
      { species: 93, level: 30 },
      { species: 79, level: 30, heldItem: GEN3_ITEMS.KINGS_ROCK },
    ],
  };
  it("blocks evolutions beyond the Kanto Pokédex without it, but not Haunter", () => {
    const opened = openSave(buildGen3Save({ ...spec, nationalDex: false }, FRLG_LAYOUT));
    expect(opened.candidates.map((c) => (c.status.kind === "blocked" ? c.status.reason : "ready"))).toEqual([
      "ready",
      "national-dex",
      "national-dex",
    ]); // Haunter first
  });
  it("allows them once it is unlocked", () => {
    const opened = openSave(buildGen3Save({ ...spec, nationalDex: true }, FRLG_LAYOUT));
    expect(opened.candidates.every((c) => c.status.kind === "ready")).toBe(true);
  });
  it("does not apply to Emerald", () => {
    const opened = openSave(buildGen3Save({ ...spec, nationalDex: false }, EMERALD_LAYOUT));
    expect(opened.candidates.every((c) => c.status.kind === "ready")).toBe(true);
  });
});

describe.skipIf(!hasSave("gen3"))("real saves", () => {
  const dir = join(THIRD_PARTY_SAVES, "gen3");
  it("emerald.sav reads the known party and passes the self-check", () => {
    const opened = openSave(new Uint8Array(readFileSync(join(dir, "emerald.sav"))));
    expect(opened.save.game).toBe("emerald");
    expect(opened.check.problems).toEqual([]);
    expect(opened.save.party.map((p) => p.info.species)).toEqual([256, 281, 285, 278]);
    expect(opened.save.party.map((p) => p.info.nickname)).toEqual([
      "COMBUSKEN",
      "KIRLIA",
      "SHROOMISH",
      "WINGULL",
    ]);
  });
  it("firered.sav reads the known party and passes the self-check", () => {
    const opened = openSave(new Uint8Array(readFileSync(join(dir, "firered.sav"))));
    expect(opened.save.game).toBe("firered-leafgreen");
    expect(opened.check.problems).toEqual([]);
    expect(opened.save.party.map((p) => p.info.species)).toEqual([65, 208, 6, 230, 143, 68]);
  });
  it("ruby.sav (64 KB) is refused with a clear message", () => {
    expect(() => openSave(new Uint8Array(readFileSync(join(dir, "ruby.sav"))))).toThrow(/64 KB/);
  });
});
