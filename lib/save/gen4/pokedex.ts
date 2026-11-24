import { getGen4Species } from "../../data/gen4-species";
import {
  DEX_CAUGHT,
  DEX_GENDER_FIRST,
  DEX_GENDER_SECOND,
  DEX_LANGUAGE_BIT,
  DEX_SEEN,
  GENDER_FEMALE,
  GENDER_MALE,
  GENDER_NONE,
} from "./constants";

/**
 * Gender of a Pokémon from its species and PID.
 * Source: pret src/pokemon.c `SpeciesData_GetGenderOf` (ratio 0 male, 254 female,
 * 255 genderless; otherwise female when ratio > PID & 0xFF).
 */
export function genderOf(species: number, pid: number): number {
  const ratio = getGen4Species(species).genderRatio;
  if (ratio === 0) return GENDER_MALE;
  if (ratio === 254) return GENDER_FEMALE;
  if (ratio === 255) return GENDER_NONE;
  return ratio > (pid & 0xff) ? GENDER_FEMALE : GENDER_MALE;
}

function bitRef(dexStart: number, region: number, species: number): [number, number] {
  const index = species - 1;
  return [dexStart + region + (index >> 3), 1 << (index & 7)];
}

function getBit(d: Uint8Array, dexStart: number, region: number, species: number): boolean {
  const [o, m] = bitRef(dexStart, region, species);
  return (d[o]! & m) !== 0;
}

function setBit(d: Uint8Array, dexStart: number, region: number, species: number, value: boolean): void {
  const [o, m] = bitRef(dexStart, region, species);
  d[o] = value ? d[o]! | m : d[o]! & ~m;
}

/** Reads the caught and seen flags of a species. */
export function readDexEntry(
  d: Uint8Array,
  dexStart: number,
  species: number,
  dexLanguages: number | undefined = 0x128,
) {
  return {
    caught: getBit(d, dexStart, DEX_CAUGHT, species),
    seen: getBit(d, dexStart, DEX_SEEN, species),
    languages: dexLanguages === undefined ? 0 : d[dexStart + dexLanguages + species]!,
  };
}

/**
 * Registers a species as caught, exactly like the game does after an evolution
 * (pret src/evolution.c calls `Pokedex_Capture`; logic in src/pokedex.c):
 * - first time seen: both gender bits = gender; otherwise, if the first gender differs, second gender = gender
 *   (genderless counts as male, `UpdateGender`);
 * - language bit (`UpdateLanguage`, Korean and unknown languages are skipped);
 * - caught and seen bits.
 * Form data is not touched: no trade evolution produces a species with Pokédex forms.
 * @param d Save image, modified in place.
 * @param dexStart Absolute offset of the Pokédex structure.
 * @param species Species to register.
 * @param pid PID of the Pokémon (for gender).
 * @param language Language of the Pokémon (PK4 offset 0x17).
 * @param dexLanguages Offset of the language bytes inside the Pokédex; undefined when the game keeps none for this species.
 */
export function registerCaught(
  d: Uint8Array,
  dexStart: number,
  species: number,
  pid: number,
  language: number,
  dexLanguages: number | undefined,
): void {
  const g = genderOf(species, pid);
  const genderBit = g === GENDER_FEMALE;
  if (!getBit(d, dexStart, DEX_SEEN, species)) {
    setBit(d, dexStart, DEX_GENDER_SECOND, species, genderBit);
    setBit(d, dexStart, DEX_GENDER_FIRST, species, genderBit);
  } else if (getBit(d, dexStart, DEX_GENDER_FIRST, species) !== genderBit) {
    setBit(d, dexStart, DEX_GENDER_SECOND, species, genderBit);
  }
  const langBit = DEX_LANGUAGE_BIT[language];
  if (langBit !== undefined && dexLanguages !== undefined)
    d[dexStart + dexLanguages + species]! |= 1 << langBit;
  setBit(d, dexStart, DEX_CAUGHT, species, true);
  setBit(d, dexStart, DEX_SEEN, species, true);
}
