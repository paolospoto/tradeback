/** Diamond/Pearl and HeartGold/SoulSilver: same engine as Platinum, other layouts. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasSave, THIRD_PARTY_SAVES } from "../fixtures/third-party";
import { ITEMS } from "@/lib/data/trade-evolutions";
import { openSave } from "@/lib/save";
import { loadSave, allPokemon } from "@/lib/save/gen4/sav4";
import { readDexEntry } from "@/lib/save/gen4/pokedex";
import { DIAMOND_PEARL_LAYOUT, HGSS_LAYOUT, PLATINUM_LAYOUT } from "@/lib/save/gen4/layouts";
import { buildGen4Save } from "../fixtures/builder";

const spec = {
  trainerName: "ASH",
  language: 2,
  party: [
    { species: 93, level: 36, nickname: "Spooky" },
    { species: 95, level: 30, heldItem: ITEMS.METAL_COAT },
  ],
  boxes: {
    0: [{ species: 64, level: 25 }],
    17: [undefined, { species: 366, level: 20, heldItem: ITEMS.DEEP_SEA_TOOTH }],
  },
};

describe.each([
  [DIAMOND_PEARL_LAYOUT, "diamond-pearl"],
  [HGSS_LAYOUT, "heartgold-soulsilver"],
  [PLATINUM_LAYOUT, "platinum"],
] as const)("%s layout", (layout, game) => {
  const image = () => buildGen4Save(spec, layout);

  it("is recognised and read (party, first and last box, trainer)", () => {
    const save = loadSave(image());
    expect(save.layout.game).toBe(game);
    expect(save.trainerName).toBe("ASH");
    expect(save.language).toBe(2);
    expect(save.party.map((p) => p.info.species)).toEqual([93, 95]);
    expect(save.boxes[0]!.slots[0]!.info.species).toBe(64);
    expect(save.boxes[17]!.slots[1]!.info.species).toBe(366);
    expect(save.boxes[17]!.name).toBe("BOX 18");
    expect(allPokemon(save)).toHaveLength(4);
  });

  it("evolves everything, verifies the result and registers the Pokédex", () => {
    const opened = openSave(image());
    expect(opened.save.game).toBe(game);
    const ready = opened.candidates.filter((c) => c.preview).map((c) => c.entry.ref);
    expect(ready).toHaveLength(4);
    const result = opened.evolve(ready);
    expect(result.ok, result.ok ? "" : result.problems.join("; ")).toBe(true);
    if (!result.ok) return;
    const after = loadSave(result.bytes);
    expect(after.party.map((p) => p.info.species)).toEqual([94, 208]);
    expect(after.boxes[0]!.slots[0]!.info.species).toBe(65);
    expect(after.boxes[17]!.slots[1]!.info.species).toBe(367);
    const dex = after.general.offset + layout.pokedex;
    for (const species of [94, 208, 65, 367]) {
      const e = readDexEntry(after.image, dex, species, layout.dexLanguages);
      expect([species, e.caught, e.seen]).toEqual([species, true, true]);
      // English (2) is bit 1; Diamond/Pearl keeps no language byte for these species.
      if (layout.dexLanguages !== undefined) expect(e.languages & 0b10).toBe(0b10);
    }
  });

  it("only changes the evolved Pokémon, the Pokédex and the CRCs", () => {
    const before = image();
    const opened = openSave(before);
    const result = opened.evolve([{ area: "party", index: 0 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const changed = new Set<number>();
    result.bytes.forEach((b, i) => b !== before[i] && changed.add(i));
    const save = loadSave(before);
    const inRange = (i: number) =>
      (i >= save.general.offset + layout.party && i < save.general.offset + layout.party + 236) ||
      (i >= save.general.offset + layout.pokedex && i < save.general.offset + layout.pokedex + 0x300) ||
      (i >= save.general.offset + layout.generalSize - layout.footer.size + layout.footer.checksum &&
        i < save.general.offset + layout.generalSize - layout.footer.size + layout.footer.checksum + 2) ||
      (i >= save.storage.offset + layout.storageSize - layout.footer.size + layout.footer.checksum &&
        i < save.storage.offset + layout.storageSize - layout.footer.size + layout.footer.checksum + 2);
    expect([...changed].filter((i) => !inRange(i))).toEqual([]);
  });

  it("refuses a corrupt checksum", () => {
    const img = image();
    img[0x300]! ^= 1;
    img[0x40000 + 0x300]! ^= 1;
    expect(() => openSave(img)).toThrow(/checksum|corrupt/i);
  });
});

describe.skipIf(!hasSave("gen4"))("real saves", () => {
  const dir = join(THIRD_PARTY_SAVES, "gen4");
  for (const [file, game] of [
    ["diamond.sav", "diamond-pearl"],
    ["soulsilver.sav", "heartgold-soulsilver"],
  ] as const) {
    it(`${file} opens, passes the self-check and reads a plausible party`, () => {
      const opened = openSave(new Uint8Array(readFileSync(join(dir, file))));
      expect(opened.save.game).toBe(game);
      expect(opened.check.canEdit).toBe(true);
      expect(opened.check.partyCheckPassed).toBe(true);
      expect(opened.save.party.length).toBeGreaterThan(0);
      expect(opened.save.trainerName.length).toBeGreaterThan(0);
      for (const p of opened.save.party) {
        expect(p.info.species).toBeGreaterThan(0);
        expect(p.info.species).toBeLessThanOrEqual(493);
        expect(p.level).toBeGreaterThan(0);
      }
    });
  }
});
