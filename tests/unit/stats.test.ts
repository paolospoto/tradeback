import { describe, expect, it } from "vitest";
import { calcStats, expForLevel, levelFromExp, natureEffect, natureOf } from "@/lib/save/stats";
import { getGen4Species } from "@/lib/data/gen4-species";

describe("stats", () => {
  it("reproduces the textbook Garchomp example (level 78, Adamant)", () => {
    // Bulbapedia "Stat" article example: IVs 24/12/30/5/16/23, EVs 74/190/91/23/48/84.
    const base = getGen4Species(445).baseStats;
    expect(base).toEqual([108, 130, 95, 102, 80, 85]);
    const stats = calcStats(445, base, [24, 12, 30, 5, 16, 23], [74, 190, 91, 23, 48, 84], 78, 3);
    expect(stats).toEqual([289, 278, 193, 171, 135, 171]);
  });

  it("gives Shedinja 1 HP", () => {
    expect(
      calcStats(292, getGen4Species(292).baseStats, [31, 31, 31, 31, 31, 31], [0, 0, 0, 0, 0, 0], 50, 0)[0],
    ).toBe(1);
  });

  it("maps natures to raised/lowered stats", () => {
    expect(natureOf(25 + 3)).toBe(3);
    expect(natureEffect(3, 1)).toBe(1); // Adamant +Atk
    expect(natureEffect(3, 4)).toBe(-1); // Adamant -SpA
    expect(natureEffect(0, 1)).toBe(0); // Hardy
    expect(natureEffect(12, 3)).toBe(0); // Serious
  });

  it("matches the experience totals at level 100", () => {
    expect([0, 1, 2, 3, 4, 5].map((g) => expForLevel(g as 0, 100))).toEqual([
      1_000_000, 600_000, 1_640_000, 1_059_860, 800_000, 1_250_000,
    ]);
    expect(expForLevel(3, 1)).toBe(0);
  });

  it("computes the level from experience", () => {
    expect(levelFromExp(3, 0)).toBe(1);
    expect(levelFromExp(3, expForLevel(3, 37))).toBe(37);
    expect(levelFromExp(3, expForLevel(3, 37) - 1)).toBe(36);
    expect(levelFromExp(0, 2_000_000)).toBe(100);
  });
});
