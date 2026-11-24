/** Generation I: Red, Blue, Yellow. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasSave, THIRD_PARTY_SAVES } from "../fixtures/third-party";
import { openSave, SaveError } from "@/lib/save";
import { badBankChecksums, loadSave, storedBoxOffset } from "@/lib/save/gen1/sav1";
import { buildGen1Save } from "../fixtures/builder1";

const spec = {
  trainerName: "ASH",
  party: [
    { species: 93, level: 36, nickname: "SPOOKY" },
    { species: 64, level: 30, statExp: 5000 },
    { species: 25, level: 20 },
  ],
  currentBox: 2,
  boxes: {
    2: [{ species: 67, level: 25 }],
    8: [
      { species: 75, level: 22 },
      { species: 93, level: 40, nickname: "BOO" },
    ],
  },
  dexCaught: [93, 64, 25],
};

describe("generation I", () => {
  it("loads party, current box and stored boxes", () => {
    const s = loadSave(buildGen1Save(spec));
    expect(s.party.map((p) => [p.species, p.level, p.info.nickname])).toEqual([
      [93, 36, "SPOOKY"],
      [64, 30, "KADABRA"],
      [25, 20, "PIKACHU"],
    ]);
    expect(s.boxes[2]!.slots[0]!.species).toBe(67);
    expect(s.boxes[8]!.slots.filter(Boolean).map((e) => e!.species)).toEqual([75, 93]);
    expect(badBankChecksums(buildGen1Save(spec))).toEqual([]);
  });

  it("ignores stored boxes until the player changed boxes", () => {
    const s = loadSave(buildGen1Save({ ...spec, boxesChanged: false }));
    expect(s.boxes[8]!.slots.every((e) => e === null)).toBe(true);
    expect(s.boxes[2]!.slots[0]!.species).toBe(67);
  });

  it("evolves everything, renames default names only, keeps checksums and the Pokédex valid", () => {
    const opened = openSave(buildGen1Save(spec));
    expect(opened.save.game).toBe("red-blue");
    const refs = opened.candidates.filter((c) => c.preview).map((c) => c.entry.ref);
    expect(refs).toHaveLength(5);
    const result = opened.evolve(refs);
    expect(result.ok, result.ok ? "" : result.problems.join("; ")).toBe(true);
    if (!result.ok) return;
    const after = loadSave(result.bytes);
    expect(after.party.map((p) => [p.species, p.info.nickname])).toEqual([
      [94, "SPOOKY"],
      [65, "ALAKAZAM"],
      [25, "PIKACHU"],
    ]);
    expect(after.boxes[2]!.slots[0]!.species).toBe(68);
    expect(after.boxes[8]!.slots.filter(Boolean).map((e) => [e!.species, e!.info.nickname])).toEqual([
      [76, "GOLEM"],
      [94, "BOO"],
    ]);
    expect(badBankChecksums(after.image)).toEqual([]);
    const owned = (n: number) => (after.image[0x25a3 + ((n - 1) >> 3)]! >> ((n - 1) & 7)) & 1;
    expect([94, 65, 68, 76].map(owned)).toEqual([1, 1, 1, 1]);
  });

  it("recalculates party stats and adds the max HP gain to the current HP", () => {
    const opened = openSave(
      buildGen1Save({ party: [{ species: 64, level: 30, hpCurrent: 40, nickname: "KADA" }] }),
    );
    const result = opened.evolve([{ area: "party", index: 0 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = loadSave(result.bytes).party[0]!;
    const before = loadSave(
      buildGen1Save({ party: [{ species: 64, level: 30, hpCurrent: 40, nickname: "KADA" }] }),
    ).party[0]!;
    expect(p.info.hp).toBe(40 + p.info.party!.maxHp - before.info.party!.maxHp);
  });

  it("only changes the evolved Pokémon, the Pokédex and checksums", () => {
    const before = buildGen1Save(spec);
    const result = openSave(before).evolve([{ area: "party", index: 0 }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    let changed = 0;
    result.bytes.forEach((b, i) => b !== before[i] && changed++);
    expect(changed).toBeLessThan(60);
  });

  it("deduces the language from the player's default names: a German save names Alakazam SIMSALA", () => {
    // PIKACHU alone fits every language, but a German-only default name (GEOROK = Graveler) settles it.
    const img = buildGen1Save({
      party: [
        { species: 64, nickname: "KADABRA" },
        { species: 75, nickname: "GEOROK" },
      ],
    });
    const result = openSave(img).evolve([{ area: "party", index: 0 }]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(loadSave(result.bytes).party[0]!.info.nickname).toBe("SIMSALA");
  });

  it("blocks an ambiguous default name instead of guessing", () => {
    const opened = openSave(buildGen1Save({ party: [{ species: 64, nickname: "KADABRA" }] }));
    expect(opened.candidates[0]!.status).toMatchObject({ kind: "blocked", reason: "unsupported-language" });
  });

  it("tells Yellow apart and rejects a bad checksum", () => {
    expect(openSave(buildGen1Save({ ...spec, yellow: true })).save.game).toBe("yellow");
    const img = buildGen1Save(spec);
    img[0x2700]! ^= 1;
    expect(() => openSave(img)).toThrow(SaveError);
    void storedBoxOffset;
  });
});

describe("real saves", () => {
  const dir = join(THIRD_PARTY_SAVES, "gen1");
  for (const [file, game] of [
    ["red.sav", "red-blue"],
    ["red-delta-export.sav", "red-blue"],
    ["yellow.sav", "yellow"],
  ] as const) {
    it.skipIf(!hasSave(`gen1/${file}`))(
      `${file}: opens; party stats ${file === "yellow.sav" ? "match the formula exactly" : "do not match (the fixture was edited after the stats were computed)"}`,
      () => {
        const opened = openSave(new Uint8Array(readFileSync(join(dir, file))));
        expect(opened.save.game).toBe(game);
        expect(opened.save.party.length).toBeGreaterThan(0);
        expect(opened.check.partyCheckPassed).toBe(file === "yellow.sav");
      },
    );
  }
});
