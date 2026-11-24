/**
 * openSave on every real third-party save (see tests/fixtures/third-party/README.md):
 * each must open as the expected game, or be refused with a SaveError, never crash.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasSave, THIRD_PARTY_SAVES } from "../fixtures/third-party";
import { openSave, SaveError, type GameId, type SaveErrorCode } from "@/lib/save";

const EXPECTED: Record<string, GameId | SaveErrorCode> = {
  "gen1/red.sav": "red-blue",
  "gen1/red-delta-export.sav": "red-blue",
  "gen1/yellow.sav": "yellow",
  "gen2/gold.sav": "gold-silver",
  "gen2/crystal.sav": "crystal",
  "gen3/ruby.sav": "unsupported-version",
  "gen3/emerald.sav": "emerald",
  "gen3/firered.sav": "firered-leafgreen",
  "gen4/diamond.sav": "diamond-pearl",
  "gen4/platinum.sav": "platinum",
  "gen4/soulsilver.sav": "heartgold-soulsilver",
  "gen5/black.sav": "black-white",
  "gen5/white.sav": "black-white",
  "gen5/black2.sav": "black2-white2",
  "gen5/white2.sav": "black2-white2",
};

function outcome(file: string): string {
  try {
    return openSave(new Uint8Array(readFileSync(join(THIRD_PARTY_SAVES, file)))).save.game;
  } catch (err) {
    if (err instanceof SaveError) return err.code;
    throw err;
  }
}

describe("openSave on third-party saves", () => {
  for (const [file, expected] of Object.entries(EXPECTED)) {
    it.skipIf(!hasSave(file))(`${file} → ${expected}`, () => {
      expect(outcome(file)).toBe(expected);
    });
  }

  it("evolves every ready candidate of each opened save and the result reopens", () => {
    for (const file of Object.keys(EXPECTED)) {
      let opened;
      try {
        opened = openSave(new Uint8Array(readFileSync(join(THIRD_PARTY_SAVES, file))));
      } catch {
        continue;
      }
      const ready = opened.candidates.filter((c) => c.preview).map((c) => c.entry.ref);
      if (ready.length === 0) continue;
      const result = opened.evolve(ready);
      expect(result.ok, `${file}: ${result.ok ? "" : result.problems.join("; ")}`).toBe(true);
      if (result.ok) expect(openSave(result.bytes).save.game).toBe(opened.save.game);
    }
  });
});
