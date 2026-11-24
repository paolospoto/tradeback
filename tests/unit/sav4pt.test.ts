import { describe, expect, it } from "vitest";
import { loadSave, readFooter, SaveError, toFileBytes } from "@/lib/save/gen4/sav4";
import { crc16Ccitt } from "@/lib/save/crc16";
import {
  DESMUME_FOOTER_MARKER,
  PARTITION_SIZE,
  PT_GENERAL_SIZE,
  PT_STORAGE_OFFSET,
} from "@/lib/save/gen4/constants";
import { buildPlatinumSave } from "../fixtures/builder";
import { writeU32 } from "@/lib/save/bytes";

function errorCode(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof SaveError ? e.code : `unexpected: ${String(e)}`;
  }
  return undefined;
}

const sample = () =>
  buildPlatinumSave({
    trainerName: "PAOLO",
    party: [
      { species: 93, level: 40, nickname: "Fantasmino" },
      { species: 392, level: 50, heldItem: 234 },
    ],
    boxes: {
      0: [{ species: 64, level: 25 }, undefined, { species: 366, level: 20, heldItem: 227 }],
      17: [undefined, { species: 95, level: 33 }],
    },
  });

describe("loadSave", () => {
  it("reads trainer, party and boxes", () => {
    const save = loadSave(sample());
    expect(save.trainerName).toBe("PAOLO");
    expect(save.language).toBe(4);
    expect(save.party.map((p) => [p.info.species, p.level, p.info.nickname])).toEqual([
      [93, 40, "Fantasmino"],
      [392, 50, "INFERNAPE"],
    ]);
    expect(save.party[1]!.info.heldItem).toBe(234);
    expect(save.boxes).toHaveLength(18);
    expect(save.boxes[0]!.name).toBe("BOX 1");
    expect(save.boxes[0]!.slots[0]!.info.species).toBe(64);
    expect(save.boxes[0]!.slots[0]!.level).toBe(25);
    expect(save.boxes[0]!.slots[1]).toBeNull();
    expect(save.boxes[17]!.slots[1]!.info.species).toBe(95);
    expect(save.unreadable).toEqual([]);
  });

  it("never modifies its input", () => {
    const img = sample();
    const copy = img.slice();
    const save = loadSave(img);
    save.image[100]! ^= 0xff;
    expect(img).toEqual(copy);
  });

  it("picks the partition with the newer save counter", () => {
    expect(loadSave(sample()).general.partition).toBe(1);
    expect(loadSave(buildPlatinumSave({ partitions: "primary" })).general.partition).toBe(0);
    expect(loadSave(buildPlatinumSave({ partitions: "backup" })).storage.partition).toBe(1);
  });

  it("falls back to the other partition when the newer one fails its CRC, if both blocks agree", () => {
    const img = buildPlatinumSave();
    img[PARTITION_SIZE + 0x200]! ^= 0xff; // corrupt newer general block
    img[PARTITION_SIZE + PT_STORAGE_OFFSET + 0x200]! ^= 0xff; // and newer storage block
    const save = loadSave(img);
    expect(save.general.partition).toBe(0);
    expect(save.storage.partition).toBe(0);
  });

  it("rejects a save whose newer general block is corrupt but storage is fine (game reports corruption)", () => {
    const img = buildPlatinumSave();
    img[PARTITION_SIZE + 0x200]! ^= 0xff;
    expect(errorCode(() => loadSave(img))).toBe("inconsistent");
  });

  it("rejects wrong sizes", () => {
    expect(errorCode(() => loadSave(new Uint8Array(1000)))).toBe("unknown-format");
    expect(errorCode(() => loadSave(new Uint8Array(0x40000)))).toBe("unknown-format");
  });

  it("rejects random data and fully corrupt saves", () => {
    expect(errorCode(() => loadSave(new Uint8Array(0x80000)))).toBe("unknown-format");
    const img = buildPlatinumSave({ partitions: "primary" });
    img[0x300]! ^= 1;
    img[PT_STORAGE_OFFSET + 0x300]! ^= 1;
    // The footers still identify a Platinum save, so this is corruption, not an unknown format.
    expect(errorCode(() => loadSave(img))).toBe("corrupt");
  });

  it("rejects a corrupt storage block when only one partition exists", () => {
    const img = buildPlatinumSave({ partitions: "primary" });
    img[PT_STORAGE_OFFSET + 0x300]! ^= 1;
    expect(errorCode(() => loadSave(img))).toBe("corrupt");
  });

  it("rejects blocks from different saves", () => {
    const img = buildPlatinumSave({ partitions: "primary" });
    const f = PT_GENERAL_SIZE - 0x14;
    writeU32(img, f, 99);
    img.set([0, 0], f + 0x12);
    const crc = crc16Ccitt(img.subarray(0, f));
    img[f + 0x12] = crc & 0xff;
    img[f + 0x13] = crc >> 8;
    expect(readFooter(img, 0, PT_GENERAL_SIZE, 0).valid).toBe(true);
    expect(errorCode(() => loadSave(img))).toBe("inconsistent");
  });

  it("accepts and preserves a DeSmuME footer", () => {
    const img = sample();
    const trailer = new Uint8Array(0x7a);
    trailer.set(new TextEncoder().encode(DESMUME_FOOTER_MARKER), 0x7a - DESMUME_FOOTER_MARKER.length);
    const file = toFileBytes(img, trailer);
    const save = loadSave(file);
    expect(save.trailer).toEqual(trailer);
    expect(toFileBytes(save.image, save.trailer)).toEqual(file);
  });

  it("reports unreadable slots without failing", () => {
    const img = sample();
    const slot = PARTITION_SIZE + PT_STORAGE_OFFSET + 4 + 136 * 2; // box 1 slot 3 (Clamperl), newer partition
    img[slot + 50]! ^= 0xff;
    // Fix the block CRC so only the Pokémon is damaged.
    const f = PARTITION_SIZE + PT_STORAGE_OFFSET + 0x121e4 - 0x14;
    const crc = crc16Ccitt(img.subarray(PARTITION_SIZE + PT_STORAGE_OFFSET, f));
    img[f + 0x12] = crc & 0xff;
    img[f + 0x13] = crc >> 8;
    const save = loadSave(img);
    expect(save.unreadable).toEqual([{ area: "box", box: 0, slot: 2 }]);
  });
});
