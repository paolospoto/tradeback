import { getGen4Species } from "../../data/gen4-species";
import { bytesEqual } from "../bytes";
import { DEX_GENDER_SECOND, DEX_REGION_SIZE } from "./constants";
import type { AppliedEvolution } from "./evolve";
import type { StatSix } from "../types";
import { decryptPk4, encryptPk4 } from "./pk4";
import { allPokemon, loadSave, readFooter, slotKey, type LoadedSave, type PokemonEntry } from "./sav4";
import { calcStats, natureOf } from "../stats";

/** Result of comparing stored party stats with the formula. */
export interface PartyStatCheck {
  key: string;
  species: number;
  stored: StatSix;
  computed: StatSix;
  /** "exact": identical. "pending-evs": stored stats sit between the values with zero EVs and with
   * the current EVs (the game applies EVs won in battle only at the next level-up). */
  result: "exact" | "pending-evs" | "mismatch";
}

/**
 * Species whose alternate forms have other base stats than the table holds (Wormadam's
 * cloaks, Rotom's appliances, Giratina Origin, Shaymin Sky). The form is kept in the PK4
 * (offset 0x40, bits 3-7) and the stored stats follow it, so the formula check cannot judge them.
 * Source: PKHeX personal data for generation IV (separate personal entries per form).
 */
const FORM_STAT_SPECIES: ReadonlySet<number> = new Set([386, 413, 479, 487, 492]);

/**
 * Recomputes the stats of every party Pokémon and compares them with the stored ones.
 *
 * Gen IV stores stats and refreshes them only on level-up, evolution, vitamins or
 * withdrawal from the PC (pret src/pokemon.c callers of `Pokemon_CalcLevelAndStats`),
 * so EVs earned since the last level-up can make the stored value lower than the
 * formula. Such a value must still be at least the zero-EV result.
 */
export function checkPartyStats(save: LoadedSave): PartyStatCheck[] {
  return save.party
    .filter((e) => !e.info.isEgg && e.info.party && !FORM_STAT_SPECIES.has(e.info.species))
    .map((e) => {
      const { info } = e;
      const base = getGen4Species(info.species).baseStats;
      const nature = natureOf(info.pid);
      const stored = info.party!.stats;
      const computed = calcStats(info.species, base, info.ivs, info.evs, info.party!.level, nature);
      const zeroEv = calcStats(info.species, base, info.ivs, [0, 0, 0, 0, 0, 0], info.party!.level, nature);
      const exact = stored.every((v, i) => v === computed[i]);
      const between = stored.every((v, i) => v >= zeroEv[i]! && v <= computed[i]!);
      return {
        key: slotKey(e.ref),
        species: info.species,
        stored,
        computed,
        result: exact ? "exact" : between ? "pending-evs" : "mismatch",
      } satisfies PartyStatCheck;
    });
}

/** Problems found by {@link selfCheck}. */
export interface SelfCheckReport {
  /** Slots whose decrypt + encrypt round trip does not give the original bytes. */
  roundTripFailures: string[];
  /** Blocks whose recomputed CRC differs from the stored one. */
  checksumFailures: string[];
  party: PartyStatCheck[];
  /** True when editing is allowed at all. */
  canEdit: boolean;
  /** True when party Pokémon may be evolved. */
  partyCheckPassed: boolean;
}

function roundTrips(save: LoadedSave, e: PokemonEntry): boolean {
  const raw = save.image.subarray(e.offset, e.offset + e.size);
  return bytesEqual(encryptPk4(decryptPk4(raw)), raw);
}

/**
 * Safety checks run on the real file before any change.
 */
export function selfCheck(save: LoadedSave): SelfCheckReport {
  const roundTripFailures = allPokemon(save)
    .filter((e) => !roundTrips(save, e))
    .map((e) => slotKey(e.ref));
  const checksumFailures = [save.general, save.storage]
    .filter((b) => !readFooter(save.image, b.offset, b.size, b.id, b.footer).valid)
    .map((b) => (b.id === 0 ? "general" : "storage"));
  const party = checkPartyStats(save);
  const partyCheckPassed = party.every((p) => p.result !== "mismatch");
  return {
    roundTripFailures,
    checksumFailures,
    party,
    canEdit: roundTripFailures.length === 0 && checksumFailures.length === 0,
    partyCheckPassed,
  };
}

/** Byte ranges an evolution is allowed to change. */
export function allowedRanges(save: LoadedSave, applied: readonly AppliedEvolution[]): [number, number][] {
  const dex = save.general.offset + save.layout.pokedex;
  const ranges: [number, number][] = applied.map((a) => [a.offset, a.offset + a.size]);
  // Pokédex: caught/seen/gender bit arrays and the per-species language bytes.
  const regionsEnd = DEX_GENDER_SECOND + DEX_REGION_SIZE;
  ranges.push([
    dex,
    dex + (save.layout.dexLanguages === undefined ? regionsEnd : save.layout.dexLanguages + 494),
  ]);
  for (const b of [save.general, save.storage]) {
    const crc = b.offset + b.size - b.footer.size + b.footer.checksum;
    ranges.push([crc, crc + 2]);
  }
  return ranges;
}

/** First differing offsets between two images that fall outside the allowed ranges. */
export function unexpectedDifferences(
  before: Uint8Array,
  after: Uint8Array,
  ranges: readonly [number, number][],
  limit = 16,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < before.length && out.length < limit; i++) {
    if (before[i] !== after[i] && !ranges.some(([s, e]) => i >= s && i < e)) out.push(i);
  }
  return out;
}

export interface VerifyResult {
  ok: boolean;
  problems: string[];
}

/**
 * Post-write verification: reloads the produced image with the same
 * parser and checks checksums, evolved species and that nothing else changed.
 * The download must be blocked unless `ok` is true.
 */
export function verifyEvolvedImage(
  save: LoadedSave,
  image: Uint8Array,
  applied: readonly AppliedEvolution[],
): VerifyResult {
  const problems: string[] = [];
  let reloaded: LoadedSave;
  try {
    reloaded = loadSave(image);
  } catch (err) {
    return { ok: false, problems: [`The new file does not load: ${String(err)}`] };
  }
  if (reloaded.general.offset !== save.general.offset || reloaded.storage.offset !== save.storage.offset) {
    problems.push("The game would load a different copy of the save.");
  }
  const report = selfCheck(reloaded);
  if (!report.canEdit) problems.push("Checksums or encryption round trip fail on the new file.");

  const byKey = new Map(allPokemon(reloaded).map((e) => [slotKey(e.ref), e]));
  for (const a of applied) {
    const e = byKey.get(slotKey(a.preview.ref));
    if (!e || e.info.species !== a.preview.to) {
      problems.push(`${slotKey(a.preview.ref)} does not have the expected species.`);
      continue;
    }
    if (!bytesEqual(decryptPk4(image.subarray(a.offset, a.offset + a.size)), a.expected)) {
      problems.push(`${slotKey(a.preview.ref)} differs from the expected data.`);
    }
  }
  if (allPokemon(reloaded).length !== allPokemon(save).length)
    problems.push("The number of Pokémon changed.");

  const diff = unexpectedDifferences(save.image, image, allowedRanges(save, applied));
  if (diff.length > 0) {
    problems.push(`Unexpected changes at ${diff.map((o) => "0x" + o.toString(16)).join(", ")}.`);
  }
  return { ok: problems.length === 0, problems };
}
