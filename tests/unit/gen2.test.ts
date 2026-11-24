/** Generation II: Gold, Silver, Crystal. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasSave, THIRD_PARTY_SAVES } from "../fixtures/third-party";
import { openSave, SaveError } from "@/lib/save";
import { CRYSTAL_LAYOUT, GEN2_ITEMS, GOLD_LAYOUT, SAVE_SIZE } from "@/lib/save/gen2/constants";
import { loadSave } from "@/lib/save/gen2/sav2";
import { buildGen2Save } from "../fixtures/builder2";

const spec = {
  trainerName: "ASH",
  party: [
    { species: 93, level: 36, nickname: "SPOOKY" },
    { species: 95, level: 30, item: GEN2_ITEMS.METAL_COAT },
    { species: 79, level: 28, item: GEN2_ITEMS.KINGS_ROCK, statExp: 4000 },
    { species: 117, level: 33 },
  ],
  currentBox: 3,
  boxes: {
    3: [{ species: 137, level: 25, item: GEN2_ITEMS.UP_GRADE }],
    10: [
      { species: 123, level: 22, item: GEN2_ITEMS.METAL_COAT },
      { species: 64, level: 40, nickname: "BOO" },
      { species: 93, isEgg: true },
    ],
  },
  dexCaught: [93, 95, 79, 137],
};

describe.each([
  [CRYSTAL_LAYOUT, "crystal"],
  [GOLD_LAYOUT, "gold-silver"],
] as const)("%s", (layout, game) => {
  const image = (s = spec) => buildGen2Save(s, layout);

  it("loads trainer, party, the active box and a stored box", () => {
    const s = loadSave(image());
    expect(s.layout).toBe(layout);
    expect(s.trainerName).toBe("ASH");
    expect(s.party.map((p) => [p.species, p.level, p.info.nickname])).toEqual([
      [93, 36, "SPOOKY"],
      [95, 30, "ONIX"],
      [79, 28, "SLOWPOKE"],
      [117, 33, "SEADRA"],
    ]);
    expect(s.boxes[3]!.slots[0]!.species).toBe(137);
    expect(s.boxes[10]!.slots.filter(Boolean).map((e) => [e!.species, e!.info.isEgg])).toEqual([
      [123, false],
      [64, false],
      [253, true],
    ]);
  });

  it("evolves everything that can, spends the items, renames default names and registers the Pokédex", () => {
    const opened = openSave(image());
    expect(opened.save.game).toBe(game);
    const refs = opened.candidates.filter((c) => c.preview).map((c) => c.entry.ref);
    expect(refs).toHaveLength(6); // the egg is ignored; Seadra needs a Dragon Scale and has none
    const blocked = opened.candidates.filter((c) => !c.preview);
    expect(blocked.map((c) => c.status.kind === "blocked" && c.status.reason)).toEqual(["missing-item"]);
    const result = opened.evolve(refs);
    expect(result.ok, result.ok ? "" : result.problems.join("; ")).toBe(true);
    if (!result.ok) return;
    const after = loadSave(result.bytes);
    expect(after.party.map((p) => [p.species, p.info.nickname, p.info.item])).toEqual([
      [94, "SPOOKY", 0],
      [208, "STEELIX", 0],
      [199, "SLOWKING", 0],
      [117, "SEADRA", 0],
    ]);
    expect(after.boxes[3]!.slots[0]!.species).toBe(233);
    expect(after.boxes[10]!.slots.filter(Boolean).map((e) => [e!.species, e!.info.nickname])).toEqual([
      [212, "SCIZOR"],
      [65, "BOO"],
      [253, "EGG"],
    ]);
    const dex = (n: number) => (after.image[layout.party + 450 + ((n - 1) >> 3)]! >> ((n - 1) & 7)) & 1;
    expect([94, 208, 199, 233, 212, 65].map(dex)).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it("blocks Everstone, and adds the max HP gain to the current HP", () => {
    const img = buildGen2Save(
      {
        party: [
          { species: 93, item: GEN2_ITEMS.EVERSTONE, nickname: "A" },
          { species: 93, hpCurrent: 30, nickname: "B" },
        ],
      },
      layout,
    );
    const opened = openSave(img);
    expect(opened.candidates.map((c) => (c.status.kind === "blocked" ? c.status.reason : "ready"))).toEqual([
      "ready",
      "everstone",
    ]);
    const before = loadSave(img).party[1]!;
    const result = opened.evolve([{ area: "party", index: 1 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = loadSave(result.bytes).party[1]!;
    expect(after.species).toBe(94);
    expect(after.info.hp).toBe(30 + after.info.party!.maxHp - before.info.party!.maxHp);
  });

  it("only changes the evolved Pokémon, the Pokédex and the checksum; the clock bytes are kept", () => {
    const before = buildGen2Save({ ...spec, trailer: 44 }, layout);
    const result = openSave(before).evolve([{ area: "party", index: 0 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes.length).toBe(SAVE_SIZE + 44);
    expect(result.bytes.subarray(SAVE_SIZE)).toEqual(before.subarray(SAVE_SIZE));
    let changed = 0;
    result.bytes.forEach((b, i) => b !== before[i] && changed++);
    expect(changed).toBeLessThan(80);
  });

  it("rejects a bad checksum", () => {
    const img = image();
    img[0x2100]! ^= 1;
    expect(() => openSave(img)).toThrow(SaveError);
  });
});

describe.skipIf(!hasSave("gen2"))("real saves", () => {
  const dir = join(THIRD_PARTY_SAVES, "gen2");
  it("crystal.sav (with 44 clock bytes) reads the party, passes the stat check and keeps the trailer", () => {
    const bytes = new Uint8Array(readFileSync(join(dir, "crystal.sav")));
    const opened = openSave(bytes);
    expect(opened.save.game).toBe("crystal");
    expect(opened.save.trainerName).toBe("AMANDA");
    expect(opened.check.partyCheckPassed).toBe(true);
    expect(opened.save.party.map((p) => p.info.species)).toEqual([151, 150, 251, 144, 145, 146]);
  });
  it("gold.sav reads the party and passes the stat check", () => {
    const opened = openSave(new Uint8Array(readFileSync(join(dir, "gold.sav"))));
    expect(opened.save.game).toBe("gold-silver");
    expect(opened.check.partyCheckPassed).toBe(true);
    expect(opened.save.party.map((p) => p.info.species)).toEqual([244, 245, 119, 47, 18]);
  });
});
