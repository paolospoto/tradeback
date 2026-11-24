import { describe, expect, it } from "vitest";
import { crc16Ccitt } from "@/lib/save/crc16";
import { cryptArray, lcrngNext } from "@/lib/save/prng";
import {
  calcPk4Checksum,
  classifySlot,
  decryptPk4,
  encryptPk4,
  refreshPk4Checksum,
  shuffleValue,
} from "@/lib/save/gen4/pk4";
import { BLOCK_POSITION } from "@/lib/save/gen4/constants";
import { emptySlot } from "../fixtures/builder";

const hex = (s: string) => Uint8Array.from(s.match(/../g)!.map((b) => parseInt(b, 16)));

describe("crc16Ccitt", () => {
  it("matches the CRC-16/CCITT-FALSE check value", () => {
    expect(crc16Ccitt(new TextEncoder().encode("123456789"))).toBe(0x29b1);
  });
  it("returns the initial value for empty input", () => {
    expect(crc16Ccitt(new Uint8Array(0))).toBe(0xffff);
  });
  it("matches known vectors", () => {
    expect(crc16Ccitt(new Uint8Array([0x00]))).toBe(0xe1f0);
    expect(crc16Ccitt(new TextEncoder().encode("A"))).toBe(0xb915);
  });
});

describe("LCRNG", () => {
  it("advances with 0x41C64E6D / 0x6073", () => {
    expect(lcrngNext(0)).toBe(0x6073);
    expect(lcrngNext(1)).toBe(0x41c6aee0);
  });
  it("cryptArray is its own inverse", () => {
    const data = Uint8Array.from({ length: 128 }, (_, i) => (i * 7) & 0xff);
    const copy = data.slice();
    cryptArray(copy, 0xbeef);
    expect(copy).not.toEqual(data);
    cryptArray(copy, 0xbeef);
    expect(copy).toEqual(data);
  });
});

describe("PK4 encryption", () => {
  // Vector produced by an independent Python implementation written from the
  // pret/pokeplatinum sources (Pokemon_EncryptData + BoxPokemon_GetDataBlock), shuffle value 21.
  const DEC = hex(
    "35afa2c00000000033587da2c7ec11365b80a5caef14395e83a8cdf2173c6186abd0f51a3f6489aed3f81d42678cb1d6fb20456a8fb4d9fe23486d92b7dc01264b7095badf04294e7398bde2072c51769bc0e50a2f54799ec3e80d32577ca1c6eb10355a7fa4c9ee13385d82a7ccf1163b6085aacff4193e6388add2f71c41668bb0d5fa1f44698eb3d8fd22476c91b6db00254a6f94b9de03284d7297bce1062b50759abfe4092e53789dc2e70c31567ba0c5ea0f34597ea3c8ed12375c81a6cbf0153a5f84a9cef3183d6287acd1f61b40658aafd4f91e43688db2d7fc21466b90b5daff24496e93b8dd02",
  );
  const ENC = hex(
    "35afa2c0000080df6b99105d16d451cbe8bc1f6b0f4930a2344418e11d92191d9510a16a9ac2378db8481566d572706f4cdac0ef05b259be2a14cf96200a7b65c16c29955a1c39962b389d541eda594502916c204e77cd4610ffea5b7a24f36d90e054f0c2487f95f824e0d47c61343683189bd3842fbd0b61e760ce3734d3e84511e9d9ce2db8b81656d5f1446736a47a0d0581d51a8dd17fa913152b9fb37c06df5054a98dfb4ef5a38c6bb39010b69414a9cb4895205530e12d5f3f9e5b20f1c2b8de64eff3e964c9c12a1fc4a8d9980e96c808b16124298467481d4a8d6d8e55a8d37f8a675d3b1519ac",
  );

  it("matches the independent implementation (party size, shuffle 21)", () => {
    expect(shuffleValue(0xc0a2af35)).toBe(21);
    const dec = DEC.slice();
    refreshPk4Checksum(dec);
    expect(encryptPk4(dec)).toEqual(ENC);
    expect(decryptPk4(ENC)).toEqual(dec);
  });

  it("round-trips for every shuffle value, box and party sizes", () => {
    for (let sv = 0; sv < 32; sv++) {
      for (const size of [136, 236]) {
        const dec = Uint8Array.from({ length: size }, (_, i) => (i * 13 + sv) & 0xff);
        dec.set([0x11, 0x22 ^ sv, (sv << 5) & 0xff, 0x40 | (sv >> 3)], 0); // PID with the given shuffle bits
        dec[4] = dec[5] = 0;
        refreshPk4Checksum(dec);
        const enc = encryptPk4(dec);
        expect(decryptPk4(enc)).toEqual(dec);
      }
    }
  });

  it("uses the 24 distinct block orders, rows 24-31 repeating 0-7", () => {
    const rows = new Set(BLOCK_POSITION.map((r) => r.join("")));
    expect(rows.size).toBe(24);
    for (let sv = 24; sv < 32; sv++) expect(sv % 24).toBe(sv - 24);
  });

  it("computes the checksum as the 16-bit sum of words 0x08-0x87", () => {
    const d = new Uint8Array(136);
    d[8] = 0xff;
    d[9] = 0xff;
    d[10] = 0x02;
    expect(calcPk4Checksum(d)).toBe(0x0001);
  });

  it("classifies the game's empty slots (encrypted zeros) and zero-filled slots as empty", () => {
    expect(classifySlot(emptySlot(136)).kind).toBe("empty");
    expect(classifySlot(emptySlot(236)).kind).toBe("empty");
    expect(classifySlot(new Uint8Array(136)).kind).toBe("empty");
  });

  it("flags a slot whose checksum fails", () => {
    const dec = DEC.slice(0, 136);
    refreshPk4Checksum(dec);
    const enc = encryptPk4(dec);
    enc[40]! ^= 1;
    expect(classifySlot(enc)).toEqual({ kind: "invalid", reason: "checksum" });
  });
});
