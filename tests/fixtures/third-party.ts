import { existsSync } from "node:fs";
import { join } from "node:path";

/** Real saves fetched by `npm run fetch-test-saves`. Tests that need them are skipped when they are missing. */
export const THIRD_PARTY_SAVES = join(import.meta.dirname, "third-party/saves");

export function hasSave(path: string): boolean {
  return existsSync(join(THIRD_PARTY_SAVES, path));
}
