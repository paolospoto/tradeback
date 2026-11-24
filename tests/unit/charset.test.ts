import { describe, expect, it } from "vitest";
import { CHARSET_SIZE, decodeGen4String, encodeGen4Chars, writeGen4String } from "@/lib/save/gen4/charset";
import { GEN4_TARGET_NAMES } from "@/lib/data/gen4-species";

function encode(text: string, cap = 11): Uint8Array {
  const buf = new Uint8Array(cap * 2).fill(0xee);
  writeGen4String(buf, 0, cap, text);
  return buf;
}

describe("Gen IV charset", () => {
  it("covers the international table 0x000-0x1EC", () => {
    expect(CHARSET_SIZE).toBe(0x1ed);
  });

  it("encodes Latin letters and digits at the documented codes", () => {
    expect(encodeGen4Chars("A")).toEqual([0x12b]);
    expect(encodeGen4Chars("a")).toEqual([0x145]);
    expect(encodeGen4Chars("0")).toEqual([0x121]);
    expect(encodeGen4Chars("-")).toEqual([0x1be]);
    expect(encodeGen4Chars(" ")).toEqual([0x1de]);
    expect(encodeGen4Chars("é")).toEqual([0x188]);
  });

  it("encodes Japanese names with full-width glyphs", () => {
    expect(encodeGen4Chars("ゲンガー")).toEqual([0x63, 0xa1, 0x5d, 0xf1]);
    expect(encodeGen4Chars("ポリゴン２")).toEqual([0x8e, 0x9b, 0x65, 0xa1, 0xa4]);
  });

  it("round-trips every trade evolution name in every language", () => {
    for (const names of Object.values(GEN4_TARGET_NAMES)) {
      for (const name of Object.values(names)) {
        expect(decodeGen4String(encode(name), 0, 11)).toBe(name);
      }
    }
  });

  it("writes the terminator and leaves trailing bytes untouched, like the game", () => {
    const buf = encode("GENGAR");
    expect(buf[12]).toBe(0xff);
    expect(buf[13]).toBe(0xff);
    expect(buf[14]).toBe(0xee);
  });

  it("refuses names that do not fit or characters without a glyph", () => {
    expect(() => encode("ABCDEFGHIJK")).toThrow(RangeError);
    expect(() => encodeGen4Chars("€")).toThrow();
  });

  it("decodes accents, gender symbols and stops at the terminator", () => {
    const buf = new Uint8Array([0x88, 0x01, 0xbb, 0x01, 0xff, 0xff, 0x2b, 0x01]);
    expect(decodeGen4String(buf, 0, 4)).toBe("é♂");
  });
});
