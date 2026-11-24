import { DEX_FLAG_BYTES, DEX_OWNED, DEX_SEEN, type Gen3Layout } from "./constants";
import { absOffset, readLogical, type Group, type LoadedSave } from "./sav3";

type Where = { group: Group; offset: number };

/** Every place the "seen" bits live: SaveBlock2's Pokédex and two copies in SaveBlock1. Source: pret `GetSetPokedexFlag` (FLAG_SET_SEEN writes all three). */
export function seenArrays(layout: Gen3Layout): Where[] {
  return [
    { group: "sb2", offset: DEX_SEEN },
    ...layout.seenCopies.map((offset) => ({ group: "sb1" as const, offset })),
  ];
}

/** The "owned" (caught) array. */
export const OWNED_ARRAY: Where = { group: "sb2", offset: DEX_OWNED };

function bitAt(w: Where, nationalSpecies: number): { offset: number; mask: number } {
  const bit = nationalSpecies - 1;
  return { offset: w.offset + (bit >> 3), mask: 1 << (bit & 7) };
}

/** Reads the owned and seen flags of a national dex number. */
export function readDexEntry(
  image: Uint8Array,
  save: Pick<LoadedSave, "sectors" | "layout">,
  nationalSpecies: number,
) {
  const get = (w: Where) => {
    const { offset, mask } = bitAt(w, nationalSpecies);
    return (readLogical(image, save, w.group, offset, 1)[0]! & mask) !== 0;
  };
  return { owned: get(OWNED_ARRAY), seen: seenArrays(save.layout).map(get) };
}

/**
 * Registers a species as seen and caught, as the game does after an evolution
 * (pret src/evolution_scene.c: `GetSetPokedexFlag(national, FLAG_SET_SEEN)` then `FLAG_SET_CAUGHT`).
 * Unlike later generations, nothing about gender or language is stored.
 * @param image Save image, modified in place.
 */
export function registerCaught(
  image: Uint8Array,
  save: Pick<LoadedSave, "sectors" | "layout">,
  nationalSpecies: number,
): void {
  for (const w of [...seenArrays(save.layout), OWNED_ARRAY]) {
    const { offset, mask } = bitAt(w, nationalSpecies);
    const at = absOffset(save, w.group, offset);
    image[at] = image[at]! | mask;
  }
}

/** Absolute offsets of every byte of the Pokédex arrays (for the "nothing else changed" check). */
export function dexByteOffsets(save: Pick<LoadedSave, "sectors" | "layout">): number[] {
  const out: number[] = [];
  for (const w of [...seenArrays(save.layout), OWNED_ARRAY]) {
    for (let i = 0; i < DEX_FLAG_BYTES; i++) out.push(absOffset(save, w.group, w.offset + i));
  }
  return out;
}
