/** Generation V: Black/White and Black 2/White 2. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasSave, THIRD_PARTY_SAVES } from "../fixtures/third-party";
import { ITEMS } from "@/lib/data/trade-evolutions";
import { openSave, SaveError } from "@/lib/save";
import { B2W2_LAYOUT, BW_LAYOUT, BLOCK_PARTY } from "@/lib/save/gen5/constants";
import { readDexEntry } from "@/lib/save/gen5/pokedex";
import { allPokemon, badBlocks, loadSave } from "@/lib/save/gen5/sav5";
import { buildGen5Save } from "../fixtures/builder5";

const base = {
  trainerName: "Ash",
  party: [
    { species: 93, level: 36, nickname: "Spooky" },
    { species: 95, level: 30, heldItem: ITEMS.METAL_COAT },
  ],
  boxes: {
    0: [{ species: 64, level: 25 }],
    23: [undefined, { species: 366, level: 20, heldItem: ITEMS.DEEP_SEA_TOOTH }],
  },
};

describe.each([
  [BW_LAYOUT, "black-white"],
  [B2W2_LAYOUT, "black2-white2"],
] as const)("%s", (layout, game) => {
  const image = (spec = base) => buildGen5Save(spec, layout);

  it("loads trainer, party and the first and last box", () => {
    const save = loadSave(image());
    expect(save.layout).toBe(layout);
    expect(save.trainerName).toBe("Ash");
    expect(save.party.map((p) => [p.info.species, p.level, p.info.nickname])).toEqual([
      [93, 36, "Spooky"],
      [95, 30, "Onix"],
    ]);
    expect(save.boxes[0]!.slots[0]!.info.species).toBe(64);
    expect(save.boxes[23]!.slots[1]!.info.species).toBe(366);
    expect(save.boxes[23]!.name).toBe("Box 24");
    expect(allPokemon(save)).toHaveLength(4);
  });

  it("evolves everything, verifies, and registers the Pokédex", () => {
    const opened = openSave(image());
    expect(opened.save.game).toBe(game);
    const refs = opened.candidates.filter((c) => c.preview).map((c) => c.entry.ref);
    expect(refs).toHaveLength(4);
    const result = opened.evolve(refs);
    expect(result.ok, result.ok ? "" : result.problems.join("; ")).toBe(true);
    if (!result.ok) return;
    const after = loadSave(result.bytes);
    expect(badBlocks(after.image, after.layout)).toEqual([]);
    expect(after.party.map((p) => [p.info.species, p.info.nickname])).toEqual([
      [94, "Spooky"],
      [208, "Steelix"],
    ]);
    expect(after.boxes[0]!.slots[0]!.info.species).toBe(65);
    expect(after.boxes[23]!.slots[1]!.info.species).toBe(367);
    expect(after.boxes[23]!.slots[1]!.info.heldItem).toBe(0);
    const [dex] = layout.blocks[layout.dexBlock]!;
    for (const sp of [94, 208, 65, 367]) {
      const e = readDexEntry(after.image, dex, layout.dexFormLength, sp, 2);
      expect([sp, e.caught, e.seen, e.displayed, e.language]).toEqual([sp, true, true, true, true]);
    }
  });

  it("writes the default name in the game's language only when there is no nickname", () => {
    const it4 = buildGen5Save(
      { language: 4, party: [{ species: 95, level: 30, heldItem: ITEMS.METAL_COAT }] },
      layout,
    );
    const result = openSave(it4).evolve([{ area: "party", index: 0 }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(loadSave(result.bytes).party[0]!.info.nickname).toBe("Steelix");
    const de = buildGen5Save({ language: 5, party: [{ species: 93, level: 30 }] }, layout);
    const r2 = openSave(de).evolve([{ area: "party", index: 0 }]);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(loadSave(r2.bytes).party[0]!.info.nickname).toBe("Gengar");
  });

  it("only changes the evolved Pokémon, the Pokédex block and CRCs, and leaves the backup alone", () => {
    const before = image();
    const result = openSave(before).evolve([{ area: "party", index: 0 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bytes.subarray(layout.copySize)).toEqual(before.subarray(layout.copySize));
    const [partyStart] = layout.blocks[BLOCK_PARTY]!;
    const [dexStart, dexLen] = layout.blocks[layout.dexBlock]!;
    const outside: number[] = [];
    result.bytes.forEach((b, i) => {
      if (b === before[i]) return;
      const inMon = i >= partyStart + 8 && i < partyStart + 8 + 220;
      const inDex = i >= dexStart && i < dexStart + dexLen;
      const inCrc = i >= layout.copySize - 0x100 && i < layout.copySize; // table + info CRC
      const inBlockCrc = [BLOCK_PARTY, layout.dexBlock].some((k) => {
        const [o, l] = layout.blocks[k]!;
        return i >= o + l && i < o + l + 4;
      });
      if (!inMon && !inDex && !inCrc && !inBlockCrc) outside.push(i);
    });
    expect(outside).toEqual([]);
  });

  it("keeps hidden abilities and the stored nature", () => {
    const img = buildGen5Save(
      { party: [{ species: 64, level: 40, hiddenAbility: true, nature: 3 }] },
      layout,
    );
    const before = loadSave(img).party[0]!.info;
    expect(before.hiddenAbility).toBe(true);
    const result = openSave(img).evolve([{ area: "party", index: 0 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const after = loadSave(result.bytes).party[0]!.info;
    expect(after.species).toBe(65);
    expect(after.hiddenAbility).toBe(true);
    expect(after.nature).toBe(3);
  });

  it("blocks Everstone (Kadabra too) and missing items", () => {
    const img = buildGen5Save(
      {
        party: [
          { species: 64, heldItem: ITEMS.EVERSTONE },
          { species: 95 },
          { species: 93, heldItem: ITEMS.EVERSTONE },
        ],
      },
      layout,
    );
    const reasons = openSave(img).candidates.map((c) =>
      c.status.kind === "blocked" ? c.status.reason : "ready",
    );
    expect(reasons).toEqual(["everstone", "missing-item", "everstone"]);
  });

  describe("Karrablast and Shelmet", () => {
    const pair = {
      party: [
        { species: 588, level: 30 },
        { species: 616, level: 30 },
      ],
    };

    it("evolve together, even when only one is selected", () => {
      const opened = openSave(buildGen5Save(pair, layout));
      const first = opened.candidates.find((c) => c.entry.info.species === 588)!;
      expect(first.preview?.partner).toEqual({ area: "party", index: 1 });
      const result = opened.evolve([first.entry.ref]);
      expect(result.ok, result.ok ? "" : result.problems.join("; ")).toBe(true);
      if (result.ok) expect(loadSave(result.bytes).party.map((p) => p.info.species)).toEqual([589, 617]);
    });

    it("stay blocked alone", () => {
      const opened = openSave(buildGen5Save({ party: [{ species: 588 }] }, layout));
      expect(opened.candidates[0]!.status).toMatchObject({ kind: "blocked", reason: "needs-partner" });
    });

    it("are blocked when either holds an Everstone", () => {
      const opened = openSave(
        buildGen5Save({ party: [{ species: 588, heldItem: ITEMS.EVERSTONE }, { species: 616 }] }, layout),
      );
      expect(opened.candidates.map((c) => c.status.kind === "blocked" && c.status.reason)).toEqual([
        "everstone",
        "needs-partner",
      ]);
    });

    it("pair across the party and the boxes, one pair per partner", () => {
      const opened = openSave(
        buildGen5Save(
          { party: [{ species: 588 }], boxes: { 2: [{ species: 616 }, { species: 616 }] } },
          layout,
        ),
      );
      const ready = opened.candidates.filter((c) => c.preview);
      expect(ready).toHaveLength(2);
      const blocked = opened.candidates.filter((c) => !c.preview);
      expect(blocked.map((c) => c.status.kind === "blocked" && c.status.reason)).toEqual(["needs-partner"]);
    });
  });

  it("rejects a corrupt block", () => {
    const img = image();
    img[0x2000]! ^= 1; // inside box 2
    expect(() => openSave(img)).toThrow(SaveError);
  });
});

describe.skipIf(!hasSave("gen5"))("real saves", () => {
  const dir = join(THIRD_PARTY_SAVES, "gen5");
  for (const [file, game] of [
    ["black.sav", "black-white"],
    ["white.sav", "black-white"],
    ["black2.sav", "black2-white2"],
    ["white2.sav", "black2-white2"],
  ] as const) {
    it(`${file}: opens, self-check passes, party reads as expected`, () => {
      const opened = openSave(new Uint8Array(readFileSync(join(dir, file))));
      expect(opened.save.game).toBe(game);
      expect(opened.check.canEdit).toBe(true);
      expect(opened.check.problems).toEqual([]);
      expect(opened.save.party).toHaveLength(6);
      for (const p of opened.save.party) {
        expect(p.info.species).toBeGreaterThan(0);
        expect(p.info.species).toBeLessThanOrEqual(649);
        expect(p.level).toBe(100);
      }
    });
  }
});
