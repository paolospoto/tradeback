/**
 * Byte-level comparison of two Platinum saves, e.g. a file evolved by
 * PKHeX desktop ("expected") and the same evolution done by this app ("actual").
 *
 * Usage: npm run diff-saves -- expected.sav actual.sav
 *
 * Differences are grouped by area. Inside Pokémon structures the comparison is done on the
 * decrypted data, field by field, because one changed field changes every encrypted byte.
 * Exit code: 0 when identical, 1 when there are differences, 2 on usage or load errors.
 */
import { readFileSync } from "node:fs";
import { readU16 } from "../lib/save/bytes";

import { decryptPk4 } from "../lib/save/gen4/pk4";
import { loadSave, slotKey, type LoadedSave, type SlotRef } from "../lib/save/gen4/sav4";

const PK4_FIELDS: [number, number, string][] = [
  [0x00, 4, "PID"],
  [0x04, 2, "flags"],
  [0x06, 2, "checksum"],
  [0x08, 2, "species"],
  [0x0a, 2, "held item"],
  [0x0c, 4, "TID/SID"],
  [0x10, 4, "EXP"],
  [0x14, 1, "friendship"],
  [0x15, 1, "ability"],
  [0x16, 1, "markings"],
  [0x17, 1, "language"],
  [0x18, 6, "EVs"],
  [0x1e, 6, "contest stats"],
  [0x24, 4, "ribbons A"],
  [0x28, 8, "moves"],
  [0x30, 4, "PP"],
  [0x34, 4, "PP ups"],
  [0x38, 4, "IVs/egg/nickname flag"],
  [0x3c, 4, "ribbons B"],
  [0x40, 1, "fateful/gender/form"],
  [0x41, 7, "block B misc"],
  [0x48, 22, "nickname"],
  [0x5e, 2, "unused/origin game"],
  [0x60, 8, "ribbons C"],
  [0x68, 16, "OT name"],
  [0x78, 6, "egg/met dates"],
  [0x7e, 4, "locations"],
  [0x82, 6, "pokerus/ball/met level/encounter"],
  [0x88, 4, "status"],
  [0x8c, 1, "level"],
  [0x8d, 1, "capsule"],
  [0x8e, 2, "current HP"],
  [0x90, 12, "stats"],
  [0x9c, 0x50, "mail/battle data"],
];

function load(path: string): LoadedSave {
  try {
    return loadSave(new Uint8Array(readFileSync(path)));
  } catch (err) {
    console.error(`${path}: ${String(err)}`);
    process.exit(2);
  }
}

const [aPath, bPath] = process.argv.slice(2);
if (!aPath || !bPath) {
  console.error("Usage: npm run diff-saves -- <expected.sav> <actual.sav>");
  process.exit(2);
}
const a = load(aPath);
const b = load(bPath);
if (a.general.offset !== b.general.offset || a.storage.offset !== b.storage.offset) {
  console.log(
    `Active blocks differ: ${aPath} general@${a.general.offset.toString(16)}, ${bPath} general@${b.general.offset.toString(16)}`,
  );
}

const slots: { ref: SlotRef; offset: number; size: number }[] = [];
for (let i = 0; i < 6; i++)
  slots.push({ ref: { area: "party", index: i }, offset: a.general.offset + 0xa0 + i * 236, size: 236 });
for (let box = 0; box < 18; box++)
  for (let slot = 0; slot < 30; slot++)
    slots.push({
      ref: { area: "box", box, slot },
      offset: a.storage.offset + 4 + (box * 30 + slot) * 136,
      size: 136,
    });

const dexStart = a.general.offset + a.layout.pokedex;
const dexEnd = dexStart + 0x128 + 494;
const footers = [a.general, a.storage].map(
  (blk) => [blk.offset + blk.size - blk.footer.size, blk.offset + blk.size] as const,
);
const covered = (i: number) => slots.some((s) => i >= s.offset && i < s.offset + s.size);

let count = 0;
for (const s of slots) {
  const ra = a.image.subarray(s.offset, s.offset + s.size);
  const rb = b.image.subarray(s.offset, s.offset + s.size);
  if (ra.every((v, i) => v === rb[i])) continue;
  const da = decryptPk4(ra);
  const db = decryptPk4(rb);
  const fields = PK4_FIELDS.filter(
    ([o, n]) => o + n <= s.size && !da.subarray(o, o + n).every((v, i) => v === db[o + i]),
  );
  console.log(`Pokémon ${slotKey(s.ref)} (species ${readU16(da, 8)} -> ${readU16(db, 8)}):`);
  for (const [o, n, name] of fields) {
    const fmt = (d: Uint8Array) =>
      Array.from(d.subarray(o, o + n), (x) => x.toString(16).padStart(2, "0")).join(" ");
    console.log(`  0x${o.toString(16).padStart(2, "0")} ${name}: ${fmt(da)}  |  ${fmt(db)}`);
    count++;
  }
}

const other: number[] = [];
for (let i = 0; i < a.image.length; i++) {
  if (a.image[i] === b.image[i] || covered(i)) continue;
  if (i >= dexStart && i < dexEnd) {
    const rel = i - dexStart;
    const area =
      rel < 4
        ? "magic"
        : rel < 0x44
          ? "caught"
          : rel < 0x84
            ? "seen"
            : rel < 0xc4
              ? "gender 1"
              : rel < 0x104
                ? "gender 2"
                : rel >= 0x128
                  ? `language of species ${rel - 0x128}`
                  : "forms";
    console.log(
      `Pokédex +0x${rel.toString(16)} (${area}): ${a.image[i]!.toString(2).padStart(8, "0")} | ${b.image[i]!.toString(2).padStart(8, "0")}`,
    );
  } else if (footers.some(([s, e]) => i >= s && i < e)) {
    console.log(`Footer byte 0x${i.toString(16)}: ${a.image[i]!.toString(16)} | ${b.image[i]!.toString(16)}`);
  } else other.push(i);
  count++;
}
if (other.length) {
  console.log(
    `Other differences (${other.length} bytes): ${other
      .slice(0, 32)
      .map((o) => "0x" + o.toString(16))
      .join(" ")}${other.length > 32 ? " ..." : ""}`,
  );
}
console.log(count === 0 ? "No differences." : `${count} difference(s).`);
process.exit(count === 0 ? 0 : 1);
