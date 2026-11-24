/**
 * Entry point of the save logic: finds the adapter for a file and opens it.
 * The UI uses only this module and ./types.
 */
import { gen1Adapter } from "./gen1/adapter";
import { gen2Adapter } from "./gen2/adapter";
import { gen3Adapter } from "./gen3/adapter";
import { gen4Adapter } from "./gen4/adapter";
import { gen5Adapter } from "./gen5/adapter";
import { SaveError, type GameId, type OpenedSave, type SaveAdapter } from "./types";

export * from "./types";
export { evolvedFileName } from "./filename";

/** Adapters in detection order. Sizes rarely overlap; where they do, signatures decide. */
export const ADAPTERS: readonly SaveAdapter[] = [
  gen5Adapter,
  gen4Adapter,
  gen3Adapter,
  gen2Adapter,
  gen1Adapter,
];

/** Every game group some adapter can open, oldest first. */
export const SUPPORTED_GAMES: readonly GameId[] = (
  [
    "red-blue",
    "yellow",
    "gold-silver",
    "crystal",
    "ruby-sapphire",
    "emerald",
    "firered-leafgreen",
    "diamond-pearl",
    "platinum",
    "heartgold-soulsilver",
    "black-white",
    "black2-white2",
  ] as const
).filter((g) => ADAPTERS.some((a) => a.games.includes(g)));

/**
 * Detects the game, parses the file and runs the safety checks.
 * @param bytes Raw file contents. Not modified.
 * @throws SaveError when the file is not a supported save or fails a check.
 */
export function openSave(bytes: Uint8Array): OpenedSave {
  for (const adapter of ADAPTERS) {
    if (adapter.matches(bytes)) return adapter.open(bytes);
  }
  throw new SaveError("unknown-format", `No supported game uses a ${bytes.length}-byte save file.`);
}
