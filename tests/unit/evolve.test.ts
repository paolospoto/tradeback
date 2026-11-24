import { describe, expect, it } from "vitest";
import { analyzePokemon, applyEvolutions, contextOf, previewEvolution } from "@/lib/save/gen4/evolve";
import {
  loadSave,
  slotKey,
  writeBlockChecksum,
  type LoadedSave,
  type PokemonEntry,
  type SlotRef,
} from "@/lib/save/gen4/sav4";
import { selfCheck, verifyEvolvedImage } from "@/lib/save/gen4/verify";
import { readDexEntry } from "@/lib/save/gen4/pokedex";
import { getGen4Species } from "@/lib/data/gen4-species";
import { ITEMS, TRADE_EVOLUTIONS } from "@/lib/data/trade-evolutions";
import { PT_POKEDEX } from "@/lib/save/gen4/constants";
import { calcStats, natureOf } from "@/lib/save/stats";
import { buildPlatinumSave, type MonSpec, type SaveSpec } from "../fixtures/builder";

function setup(spec: SaveSpec) {
  const save = loadSave(buildPlatinumSave(spec));
  const report = selfCheck(save);
  const ctx = contextOf(save, report.partyCheckPassed);
  return { save, ctx, report };
}

function find(save: LoadedSave, ref: SlotRef): PokemonEntry {
  const all = [...save.party, ...save.boxes.flatMap((b) => b.slots)].filter((e): e is PokemonEntry => !!e);
  return all.find((e) => slotKey(e.ref) === slotKey(ref))!;
}

function evolveOne(spec: SaveSpec, ref: SlotRef) {
  const { save, ctx } = setup(spec);
  const { image, applied } = applyEvolutions(save, [ref], ctx);
  const verify = verifyEvolvedImage(save, image, applied);
  expect(verify.problems).toEqual([]);
  const after = loadSave(image);
  return { save, after, evolved: find(after, ref), applied, image };
}

const party0: SlotRef = { area: "party", index: 0 };
const box0: SlotRef = { area: "box", box: 0, slot: 0 };

describe("trade evolution rules", () => {
  for (const rule of TRADE_EVOLUTIONS.filter((r) => r.since <= 4)) {
    for (const where of ["party", "box"] as const) {
      it(`${rule.from} -> ${rule.to} in the ${where}`, () => {
        const mon: MonSpec = { species: rule.from, level: 36, heldItem: rule.item, pid: 0x2468ace1 };
        const spec: SaveSpec = where === "party" ? { party: [mon] } : { boxes: { 0: [mon] } };
        const ref = where === "party" ? party0 : box0;
        const { evolved, after } = evolveOne(spec, ref);
        expect(evolved.info.species).toBe(rule.to);
        expect(evolved.info.heldItem).toBe(0);
        expect(evolved.level).toBe(36);
        // Default name in the game language (Italian fixture).
        const names: Record<number, string> = {
          186: "POLITOED",
          474: "PORYGON-Z",
          367: "HUNTAIL",
          368: "GOREBYSS",
        };
        if (names[rule.to]) expect(evolved.info.nickname).toBe(names[rule.to]);
        const dex = readDexEntry(after.image, after.general.offset + PT_POKEDEX, rule.to);
        expect(dex).toMatchObject({ caught: true, seen: true });
        expect(dex.languages & (1 << 4)).toBeTruthy(); // Italian bit
      });
    }
  }
});

describe("blocking rules", () => {
  it("blocks Everstone holders", () => {
    const { save, ctx } = setup({
      boxes: {
        0: [
          { species: 93, heldItem: ITEMS.EVERSTONE },
          { species: 95, heldItem: ITEMS.EVERSTONE },
        ],
      },
    });
    expect(analyzePokemon(save.boxes[0]!.slots[0]!, ctx)).toMatchObject({
      kind: "blocked",
      reason: "everstone",
    });
    expect(analyzePokemon(save.boxes[0]!.slots[1]!, ctx)).toMatchObject({
      kind: "blocked",
      reason: "everstone",
    });
  });

  it("lets Kadabra evolve with an Everstone and keeps the stone, as Gen IV does", () => {
    const { save, ctx } = setup({ boxes: { 0: [{ species: 64, heldItem: ITEMS.EVERSTONE }] } });
    const status = analyzePokemon(save.boxes[0]!.slots[0]!, ctx);
    expect(status?.kind).toBe("ready");
    const { evolved } = evolveOne({ boxes: { 0: [{ species: 64, heldItem: ITEMS.EVERSTONE }] } }, box0);
    expect(evolved.info.species).toBe(65);
    expect(evolved.info.heldItem).toBe(ITEMS.EVERSTONE);
  });

  it("keeps the held item of plain trade evolutions", () => {
    const { evolved } = evolveOne({ party: [{ species: 67, heldItem: 234 }] }, party0);
    expect(evolved.info.heldItem).toBe(234);
  });

  it("blocks item evolutions without the right item", () => {
    const { save, ctx } = setup({
      boxes: {
        0: [
          { species: 95 },
          { species: 123, heldItem: ITEMS.KINGS_ROCK },
          { species: 366, heldItem: ITEMS.METAL_COAT },
        ],
      },
    });
    for (const slot of save.boxes[0]!.slots.slice(0, 3)) {
      expect(analyzePokemon(slot!, ctx)).toMatchObject({ kind: "blocked", reason: "missing-item" });
    }
  });

  it("ignores eggs and species that do not trade-evolve", () => {
    const { save, ctx } = setup({ boxes: { 0: [{ species: 93, isEgg: true }, { species: 25 }] } });
    expect(analyzePokemon(save.boxes[0]!.slots[0]!, ctx)).toBeUndefined();
    expect(analyzePokemon(save.boxes[0]!.slots[1]!, ctx)).toBeUndefined();
  });

  it("picks Clamperl's target from the held item", () => {
    expect(
      evolveOne({ boxes: { 0: [{ species: 366, heldItem: ITEMS.DEEP_SEA_TOOTH }] } }, box0).evolved.info
        .species,
    ).toBe(367);
    expect(
      evolveOne({ boxes: { 0: [{ species: 366, heldItem: ITEMS.DEEP_SEA_SCALE }] } }, box0).evolved.info
        .species,
    ).toBe(368);
  });

  it("blocks non-nicknamed Pokémon in Korean games but allows nicknamed ones", () => {
    const { save, ctx } = setup({
      korean: true,
      language: 8,
      boxes: {
        0: [
          { species: 93, language: 8, nickname: "GHOST" },
          { species: 93, language: 2 },
        ],
      },
    });
    expect(analyzePokemon(save.boxes[0]!.slots[0]!, ctx)?.kind).toBe("ready");
    expect(analyzePokemon(save.boxes[0]!.slots[1]!, ctx)).toMatchObject({
      kind: "blocked",
      reason: "unsupported-language",
    });
  });

  it("refuses to apply a blocked evolution", () => {
    const { save, ctx } = setup({ boxes: { 0: [{ species: 95 }] } });
    expect(() => applyEvolutions(save, [box0], ctx)).toThrow();
  });
});

describe("evolution effects", () => {
  it("keeps a nickname and the trailing name bytes", () => {
    const { evolved, save } = evolveOne({ party: [{ species: 93, nickname: "Fantasmino" }] }, party0);
    expect(evolved.info.nickname).toBe("Fantasmino");
    expect(evolved.info.isNicknamed).toBe(true);
    expect(save.party[0]!.info.nickname).toBe("Fantasmino");
  });

  it("renames in the game language, not the Pokémon's language", () => {
    const { evolved } = evolveOne({ language: 5, boxes: { 0: [{ species: 93, language: 2 }] } }, box0);
    expect(evolved.info.nickname).toBe("GENGAR");
    const de = evolveOne({ language: 5, boxes: { 0: [{ species: 64, language: 2 }] } }, box0).evolved;
    expect(de.info.nickname).toBe("SIMSALA");
    expect(de.info.language).toBe(2);
    expect(de.info.isNicknamed).toBe(false);
    const fr = evolveOne(
      { language: 3, boxes: { 0: [{ species: 125, heldItem: ITEMS.ELECTIRIZER }] } },
      box0,
    ).evolved;
    expect(fr.info.nickname).toBe("ELEKABLE");
    const ja = evolveOne({ language: 1, boxes: { 0: [{ species: 93 }] } }, box0).evolved;
    expect(ja.info.nickname).toBe("ゲンガー");
  });

  it("sets the ability from the PID slot of the new species", () => {
    // Porygon2 -> Porygon-Z: abilities [Adaptability 91, Download 88].
    const even = evolveOne(
      { boxes: { 0: [{ species: 233, heldItem: ITEMS.DUBIOUS_DISC, pid: 0x10 }] } },
      box0,
    ).evolved;
    const odd = evolveOne(
      { boxes: { 0: [{ species: 233, heldItem: ITEMS.DUBIOUS_DISC, pid: 0x11 }] } },
      box0,
    ).evolved;
    expect(even.info.ability).toBe(91);
    expect(odd.info.ability).toBe(88);
    // Haunter -> Gengar: single ability Levitate (26) whatever the PID.
    expect(evolveOne({ boxes: { 0: [{ species: 93, pid: 0x11 }] } }, box0).evolved.info.ability).toBe(26);
  });

  it("recalculates party stats with Gen IV base stats and raises current HP by the max HP gain", () => {
    const mon: MonSpec = {
      species: 95,
      level: 40,
      heldItem: ITEMS.METAL_COAT,
      pid: 0x9a2c3e57,
      ivs: [31, 30, 29, 28, 27, 26],
      evs: [100, 50, 0, 0, 0, 252],
      hpCurrent: 50,
    };
    const { evolved, save } = evolveOne({ party: [mon] }, party0);
    const expected = calcStats(
      208,
      getGen4Species(208).baseStats,
      mon.ivs!,
      mon.evs!,
      40,
      natureOf(mon.pid!),
    );
    expect(evolved.info.party!.stats).toEqual(expected);
    const oldMax = save.party[0]!.info.party!.stats[0];
    expect(evolved.info.party!.hpCurrent).toBe(50 + expected[0] - oldMax);
  });

  it("applies EVs earned since the last level-up, like the game", () => {
    const mon: MonSpec = {
      species: 67,
      level: 30,
      evs: [40, 40, 0, 0, 0, 0],
      pendingEvs: [8, 8, 0, 0, 0, 0],
    };
    const { evolved, save } = evolveOne({ party: [mon] }, party0);
    expect(selfCheck(save).party[0]!.result).toBe("pending-evs");
    expect(evolved.info.party!.stats).toEqual(
      calcStats(
        68,
        getGen4Species(68).baseStats,
        [31, 20, 15, 10, 25, 5],
        mon.evs!,
        30,
        natureOf(0x12345678),
      ),
    );
  });

  it("leaves a fainted Pokémon at 0 HP", () => {
    expect(evolveOne({ party: [{ species: 75, hpCurrent: 0 }] }, party0).evolved.info.party!.hpCurrent).toBe(
      0,
    );
  });

  it("registers gender in the Pokédex the way the game does", () => {
    // Gengar is 50% female: PID low byte < 127 -> female.
    const { after } = evolveOne({ boxes: { 0: [{ species: 93, pid: 0x00000010 }] } }, box0);
    const dex = after.general.offset + PT_POKEDEX;
    const idx = 94 - 1;
    const bit = (o: number) => (after.image[dex + o + (idx >> 3)]! >> (idx & 7)) & 1;
    expect([bit(0x84), bit(0xc4)]).toEqual([1, 1]);
  });

  it("does not disturb an existing Pokédex entry beyond the documented bits", () => {
    const { after, save } = evolveOne({ dexCaught: [94], boxes: { 0: [{ species: 93, pid: 0xff }] } }, box0);
    const dex = save.general.offset + PT_POKEDEX;
    expect(readDexEntry(after.image, dex, 94)).toMatchObject({ caught: true, seen: true });
    // Gender first bit was 0 (male) and the evolved one is male too: nothing else changes.
    expect(after.image[dex + 0xc4 + (93 >> 3)]).toBe(save.image[dex + 0xc4 + (93 >> 3)]);
  });

  it("evolves several Pokémon in the same file", () => {
    const { save, ctx } = setup({
      party: [{ species: 64 }, { species: 25 }, { species: 117, heldItem: ITEMS.DRAGON_SCALE }],
      boxes: {
        0: [{ species: 366, heldItem: ITEMS.DEEP_SEA_SCALE }],
        5: [undefined, { species: 356, heldItem: ITEMS.REAPER_CLOTH }],
      },
    });
    const refs: SlotRef[] = [party0, { area: "party", index: 2 }, box0, { area: "box", box: 5, slot: 1 }];
    const { image, applied } = applyEvolutions(save, refs, ctx);
    expect(verifyEvolvedImage(save, image, applied)).toEqual({ ok: true, problems: [] });
    const after = loadSave(image);
    expect(refs.map((r) => find(after, r).info.species)).toEqual([65, 230, 368, 477]);
    expect(after.party[1]!.info.species).toBe(25);
    expect(() => applyEvolutions(save, [party0, party0], ctx)).toThrow();
  });

  it("does not modify the loaded save", () => {
    const { save, ctx } = setup({ party: [{ species: 64 }] });
    const before = save.image.slice();
    applyEvolutions(save, [party0], ctx);
    expect(save.image).toEqual(before);
  });

  it("keeps the save counters and the backup partition untouched", () => {
    const { save, ctx } = setup({ party: [{ species: 64 }] });
    const { image } = applyEvolutions(save, [party0], ctx);
    const backup = save.general.partition === 1 ? [0, 0x40000] : [0x40000, 0x80000];
    expect(image.subarray(backup[0], backup[1])).toEqual(save.image.subarray(backup[0], backup[1]));
  });

  it("previews item use, ability, name and stats", () => {
    const { save, ctx } = setup({ party: [{ species: 123, heldItem: ITEMS.METAL_COAT, level: 50 }] });
    const entry = save.party[0]!;
    const status = analyzePokemon(entry, ctx);
    expect(status?.kind).toBe("ready");
    if (status?.kind !== "ready") return;
    const p = previewEvolution(entry, status.rule, ctx);
    expect(p).toMatchObject({
      from: 123,
      to: 212,
      consumedItem: ITEMS.METAL_COAT,
      newName: "SCIZOR",
      level: 50,
    });
    expect(p.newStats).toHaveLength(6);
  });
});

describe("safety checks", () => {
  it("disables party evolutions when stored stats contradict the formula", () => {
    const { save, ctx, report } = setup({
      party: [{ species: 93, statsOverride: [10, 10, 10, 10, 10, 10] }],
      boxes: { 0: [{ species: 93 }] },
    });
    expect(report.partyCheckPassed).toBe(false);
    expect(analyzePokemon(save.party[0]!, ctx)).toMatchObject({
      kind: "blocked",
      reason: "party-check-failed",
    });
    expect(analyzePokemon(save.boxes[0]!.slots[0]!, ctx)?.kind).toBe("ready");
  });

  it("passes the round trip and checksum self-check on an untouched file", () => {
    const { report } = setup({ party: [{ species: 93 }, { species: 6 }], boxes: { 3: [{ species: 130 }] } });
    expect(report).toMatchObject({
      roundTripFailures: [],
      checksumFailures: [],
      canEdit: true,
      partyCheckPassed: true,
    });
  });

  it("rejects an output altered outside the allowed areas", () => {
    const { save, ctx } = setup({ party: [{ species: 64 }] });
    const { image, applied } = applyEvolutions(save, [party0], ctx);
    const tampered = image.slice();
    tampered[save.general.offset + 0x2000]! ^= 1;
    // Keep the CRC valid so only the diff check can catch it.
    writeBlockChecksum(tampered, save.general);
    expect(() => loadSave(tampered)).not.toThrow();
    const result = verifyEvolvedImage(save, tampered, applied);
    expect(result.ok).toBe(false);
    expect(result.problems.join(" ")).toMatch(/Unexpected changes at 0x/);
  });

  it("rejects an output with a bad checksum or a wrong species", () => {
    const { save, ctx } = setup({ party: [{ species: 64 }] });
    const { image, applied } = applyEvolutions(save, [party0], ctx);
    const badCrc = image.slice();
    badCrc[save.general.offset + save.general.size - 1]! ^= 1;
    expect(verifyEvolvedImage(save, badCrc, applied).ok).toBe(false);
    const wrong = [{ ...applied[0]!, preview: { ...applied[0]!.preview, to: 66 } }];
    expect(verifyEvolvedImage(save, image, wrong).ok).toBe(false);
  });
});
