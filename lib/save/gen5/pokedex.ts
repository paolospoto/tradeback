import {
  DEX_CAUGHT,
  DEX_DISPLAYED,
  DEX_FORMS,
  DEX_LANGUAGE_BITS,
  DEX_LANGUAGE_INDEX,
  DEX_LANGUAGE_MAX_SPECIES,
  DEX_REGION_SIZE,
  DEX_SEEN,
} from "./constants";

function flagRef(base: number, bit: number): [number, number] {
  return [base + (bit >> 3), 1 << (bit & 7)];
}
function getFlag(d: Uint8Array, base: number, bit: number): boolean {
  const [o, m] = flagRef(base, bit);
  return (d[o]! & m) !== 0;
}
function setFlag(d: Uint8Array, base: number, bit: number): void {
  const [o, m] = flagRef(base, bit);
  d[o] = d[o]! | m;
}

/** Region of the seen and displayed arrays: bit 1 = shiny, bit 0 = female. Source: PKHeX Zukan5.cs `GetRegion`. */
export function regionOf(gender: number, shiny: boolean): number {
  return (shiny ? 2 : 0) | (gender & 1);
}

/** Reads the flags of a species. `dexStart` is the absolute offset of the Pokédex block. */
export function readDexEntry(
  d: Uint8Array,
  dexStart: number,
  formLength: number,
  species: number,
  language: number,
) {
  const bit = species - 1;
  const langIndex = DEX_LANGUAGE_INDEX[language];
  const langBase = dexStart + DEX_FORMS + formLength * 4;
  return {
    caught: getFlag(d, dexStart + DEX_CAUGHT, bit),
    seen: [0, 1, 2, 3].some((r) => getFlag(d, dexStart + DEX_SEEN + r * DEX_REGION_SIZE, bit)),
    seenRegions: [0, 1, 2, 3].filter((r) => getFlag(d, dexStart + DEX_SEEN + r * DEX_REGION_SIZE, bit)),
    displayed: [0, 1, 2, 3].some((r) => getFlag(d, dexStart + DEX_DISPLAYED + r * DEX_REGION_SIZE, bit)),
    language:
      langIndex !== undefined && species <= DEX_LANGUAGE_MAX_SPECIES
        ? getFlag(d, langBase, bit * DEX_LANGUAGE_BITS + langIndex)
        : false,
  };
}

/**
 * Registers a species as seen and caught, as PKHeX `Zukan5.SetDex` does for a Pokémon
 * received by evolution: the seen flag of its gender/shiny region, the caught flag, the
 * displayed flag when no region is displayed yet, and the language flag (species 1-493,
 * known languages only). No trade-evolution target has Pokédex forms.
 * @param d Save image, modified in place.
 * @param dexStart Absolute offset of the Pokédex block.
 * @param formLength Bytes of form flags per region (9 Black/White, 11 Black 2/White 2).
 */
export function registerCaught(
  d: Uint8Array,
  dexStart: number,
  formLength: number,
  species: number,
  gender: number,
  shiny: boolean,
  language: number,
): void {
  const bit = species - 1;
  const region = regionOf(gender, shiny);
  setFlag(d, dexStart + DEX_SEEN + region * DEX_REGION_SIZE, bit);
  setFlag(d, dexStart + DEX_CAUGHT, bit);
  const displayed = [0, 1, 2, 3].some((r) => getFlag(d, dexStart + DEX_DISPLAYED + r * DEX_REGION_SIZE, bit));
  if (!displayed) setFlag(d, dexStart + DEX_DISPLAYED + region * DEX_REGION_SIZE, bit);
  const langIndex = DEX_LANGUAGE_INDEX[language];
  if (langIndex !== undefined && species <= DEX_LANGUAGE_MAX_SPECIES) {
    setFlag(d, dexStart + DEX_FORMS + formLength * 4, bit * DEX_LANGUAGE_BITS + langIndex);
  }
}
