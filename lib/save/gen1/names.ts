import { GB_SPECIES_NAMES } from "../../data/gb-names";

export type RenameDecision = { kind: "keep" } | { kind: "rename"; name: string } | { kind: "unknown" };

/** A Pokémon seen when deducing the language. `own` is true when the trainer ID of the Pokémon is the player's. */
export interface NameSample {
  species: number;
  nickname: string;
  own: boolean;
}

const ALL = [0, 1, 2, 3, 4] as const;

function namesOf(species: number): readonly string[] {
  return GB_SPECIES_NAMES[species - 1] ?? [];
}

/**
 * Finds the languages the save can have been played in. Generation I and II saves do not store the language,
 * so it is deduced from the player's own Pokémon that still carry their default name: such a name equals the
 * species name in the language of the cartridge. The result is the intersection over all of them (all five
 * languages when there is no such Pokémon). It is empty when they disagree.
 */
export function deduceLanguages(samples: readonly NameSample[]): ReadonlySet<number> {
  let langs = new Set<number>(ALL);
  for (const s of samples) {
    if (!s.own) continue;
    const names = namesOf(s.species);
    const matching = ALL.filter((l) => names[l] === s.nickname);
    if (matching.length === 0) continue; // a real nickname
    langs = new Set([...langs].filter((l) => matching.includes(l as 0)));
  }
  return langs;
}

/**
 * Whether the game renames an evolved Pokémon: only when its nickname equals the pre-evolution species name
 * (pret/pokered `RenameEvolvedMon`, pret/pokecrystal `UpdateSpeciesNameIfNotNicknamed`), in the language of the cartridge.
 * With several possible languages the new name must be the same in all the matching ones, else the answer is "unknown"
 * and the evolution is blocked.
 */
export function decideRename(
  from: number,
  to: number,
  nickname: string,
  langs: ReadonlySet<number>,
): RenameDecision {
  const old = namesOf(from);
  const next = namesOf(to);
  if (old.length === 0 || next.length === 0) return { kind: "unknown" };
  const matching = [...langs].filter((l) => old[l] === nickname);
  if (matching.length === 0) return { kind: "keep" };
  const targets = new Set(matching.map((l) => next[l]!));
  return targets.size === 1 ? { kind: "rename", name: [...targets][0]! } : { kind: "unknown" };
}
