import { describe, expect, it } from "vitest";
import { evolvedFileName } from "@/lib/save/filename";

describe("evolvedFileName", () => {
  it("keeps the .sav or .dsv extension", () => {
    expect(evolvedFileName("platinum.sav")).toBe("platinum_evolved.sav");
    expect(evolvedFileName("Pokemon Versione Platino.dsv")).toBe("Pokemon Versione Platino_evolved.dsv");
    expect(evolvedFileName("GAME.DSV")).toBe("GAME_evolved.DSV");
  });
  it("falls back to .sav for other names", () => {
    expect(evolvedFileName("save")).toBe("save_evolved.sav");
    expect(evolvedFileName(".sav")).toBe("salvataggio_evolved.sav");
  });
});
