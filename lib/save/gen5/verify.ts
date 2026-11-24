import { getGen5Species } from "../../data/gen5-species";
import { bytesEqual } from "../bytes";
import { decryptPk4, encryptPk4 } from "../gen4/pk4";
import { unexpectedDifferences } from "../gen4/verify";
import { calcStats } from "../stats";
import type { StatSix } from "../types";
import type { AppliedEvolution } from "./evolve";
import { blockIndexAt } from "./evolve";
import {
  allPokemon,
  badBlocks,
  blockCrcOffsets,
  checksumBlockOffset,
  loadSave,
  slotKey,
  type LoadedSave,
  type PokemonEntry,
} from "./sav5";

export interface PartyStatCheck {
  key: string;
  species: number;
  stored: StatSix;
  computed: StatSix;
  /** See gen4/verify.ts: "pending-evs" when stored stats lie between the zero-EV and current-EV results. */
  result: "exact" | "pending-evs" | "mismatch";
}

/** Species whose forms change the base stats (Deoxys, Wormadam, Rotom, Giratina, Shaymin, Darmanitan, the Therian formes, Kyurem, Meloetta). */
const FORM_STAT_SPECIES: ReadonlySet<number> = new Set([
  386, 413, 479, 487, 492, 555, 641, 642, 645, 646, 648,
]);

/** Recomputes the stats of every party Pokémon with the stored nature and compares them with the stored ones. */
export function checkPartyStats(save: LoadedSave): PartyStatCheck[] {
  return save.party
    .filter((e) => !e.info.isEgg && e.info.party && !FORM_STAT_SPECIES.has(e.info.species))
    .map((e) => {
      const { info } = e;
      const base = getGen5Species(info.species).baseStats;
      const stored = info.party!.stats;
      const computed = calcStats(info.species, base, info.ivs, info.evs, info.party!.level, info.nature);
      const zeroEv = calcStats(
        info.species,
        base,
        info.ivs,
        [0, 0, 0, 0, 0, 0],
        info.party!.level,
        info.nature,
      );
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

export interface SelfCheckReport {
  roundTripFailures: string[];
  checksumFailures: string[];
  party: PartyStatCheck[];
  canEdit: boolean;
  partyCheckPassed: boolean;
}

function roundTrips(save: LoadedSave, e: PokemonEntry): boolean {
  const raw = save.image.subarray(e.offset, e.offset + e.size);
  return bytesEqual(encryptPk4(decryptPk4(raw)), raw);
}

/** Safety checks run on the real file before any change. */
export function selfCheck(save: LoadedSave): SelfCheckReport {
  const roundTripFailures = allPokemon(save)
    .filter((e) => !roundTrips(save, e))
    .map((e) => slotKey(e.ref));
  const checksumFailures = badBlocks(save.image, save.layout).map((i) => `block ${i}`);
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
  const ranges: [number, number][] = applied.map((a) => [a.offset, a.offset + a.size]);
  const [dexStart, dexLength] = save.layout.blocks[save.layout.dexBlock]!;
  ranges.push([dexStart, dexStart + dexLength]);
  const touched = new Set([save.layout.dexBlock, ...applied.map((a) => blockIndexAt(save, a.offset))]);
  for (const i of touched) {
    const { inBlock, inTable } = blockCrcOffsets(save.layout, i);
    ranges.push([inBlock, inBlock + 2], [inTable, inTable + 2]);
  }
  const info = checksumBlockOffset(save.layout) + save.layout.checksumInfoLength + 0xe;
  ranges.push([info, info + 2]);
  return ranges;
}

export interface VerifyResult {
  ok: boolean;
  problems: string[];
}

/** Post-write verification: reloads the image and checks checksums, evolved species and that nothing else changed. */
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
  if (reloaded.layout !== save.layout) problems.push("The game would be recognised differently.");
  if (!selfCheck(reloaded).canEdit) problems.push("Checksums or encryption round trip fail on the new file.");

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
  if (diff.length > 0)
    problems.push(`Unexpected changes at ${diff.map((o) => "0x" + o.toString(16)).join(", ")}.`);
  return { ok: problems.length === 0, problems };
}
