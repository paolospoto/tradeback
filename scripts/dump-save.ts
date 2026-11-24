/**
 * Debug tool: prints the game, trainer, party and boxes of any supported save,
 * with the trade-evolution status of each Pokémon.
 *
 * Usage: npm run dump-save -- path/to/file.sav [--all]
 * Compare the output with PKHeX (species, level, nickname, held item).
 */
import { readFileSync } from "node:fs";
import displayData from "../lib/data/species-display.json" with { type: "json" };
import { GAME_NAMES } from "../lib/data/games";
import { openSave, slotKey, type PokemonEntry } from "../lib/save";

const display = displayData as {
  species: Record<string, { en: string }>;
  items: Record<string, { en: string }>;
};

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.error("Usage: npm run dump-save -- <file.sav> [--all]");
  process.exit(2);
}

const opened = openSave(new Uint8Array(readFileSync(file)));
const { save, check } = opened;
const status = new Map(opened.candidates.map((c) => [c.key, c]));

function line(e: PokemonEntry): string {
  const i = e.info;
  const sp = display.species[i.species]?.en ?? `#${i.species}`;
  const item = i.heldItem ? (display.items[i.heldItem]?.en ?? `item ${i.heldItem}`) : "-";
  const c = status.get(slotKey(e.ref));
  const evo = !c
    ? ""
    : c.preview
      ? `  => EVOLVES to #${c.preview.to}`
      : c.status.kind === "blocked"
        ? `  => blocked (${c.status.reason})`
        : "";
  return `${sp.padEnd(11)} Lv${String(e.level).padStart(3)}  "${i.nickname}"${i.isNicknamed ? "*" : ""}  item: ${item}${i.isEgg ? " EGG" : ""}${evo}`;
}

console.log(`File: ${file}`);
console.log(`Game: ${GAME_NAMES[save.game]} (generation ${save.generation})`);
console.log(`Trainer: ${save.trainerName}`);
console.log(
  `Self-check: party stats ${check.partyCheckPassed ? "ok" : "MISMATCH"}${check.problems.length ? ` (${check.problems.join(", ")})` : ""}`,
);
if (save.unreadable.length) console.log(`Unreadable slots: ${save.unreadable.map(slotKey).join(" ")}`);

console.log("\nParty");
save.party.forEach((e, i) => console.log(`  ${i + 1}. ${line(e)}`));
const all = flags.includes("--all");
save.boxes.forEach((box, b) => {
  const mons = box.slots.map((e, s) => [s, e] as const).filter(([, e]) => e);
  if (mons.length === 0 && !all) return;
  console.log(`\nBox ${b + 1} "${box.name}" (${mons.length}/${box.slots.length})`);
  for (const [s, e] of mons) console.log(`  ${String(s + 1).padStart(2)}. ${line(e!)}`);
});
