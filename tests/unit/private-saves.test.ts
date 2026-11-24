/**
 * Runs the load, self-check and evolve checks on real saves placed in tests/fixtures/private/
 * (gitignored). Skipped when the folder is empty, e.g. in CI.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyEvolutions, analyzePokemon, contextOf } from "@/lib/save/gen4/evolve";
import { allPokemon, loadSave } from "@/lib/save/gen4/sav4";
import { selfCheck, verifyEvolvedImage } from "@/lib/save/gen4/verify";

const DIR = join(import.meta.dirname, "../fixtures/private");
const files = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => /\.(sav|dsv)$/i.test(f) && !/_evolved\./i.test(f))
  : [];

describe.skipIf(files.length === 0)("real saves", () => {
  for (const file of files) {
    it(`${file}: loads, self-checks and evolves cleanly`, () => {
      const save = loadSave(new Uint8Array(readFileSync(join(DIR, file))));
      const report = selfCheck(save);
      expect(report.roundTripFailures).toEqual([]);
      expect(report.checksumFailures).toEqual([]);
      expect(report.partyCheckPassed).toBe(true);

      const ctx = contextOf(save, report.partyCheckPassed);
      const ready = allPokemon(save).filter((e) => analyzePokemon(e, ctx)?.kind === "ready");
      if (ready.length === 0) return;
      const { image, applied } = applyEvolutions(
        save,
        ready.map((e) => e.ref),
        ctx,
      );
      expect(verifyEvolvedImage(save, image, applied)).toEqual({ ok: true, problems: [] });
      const reloaded = loadSave(image);
      expect(selfCheck(reloaded).checksumFailures).toEqual([]);
    });
  }
});
