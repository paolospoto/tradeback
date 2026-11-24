import { getGen4Species } from "../../data/gen4-species";
import { bytesEqual } from "../bytes";
import { calcStats, natureOf } from "../stats";
import type { StatSix } from "../types";
import { FOOTER_CHECKSUM, SECTORS_PER_SLOT } from "./constants";
import type { AppliedEvolution } from "./evolve";
import { decryptPk3, encryptPk3 } from "./pk3";
import { dexByteOffsets } from "./pokedex";
import {
  absOffset,
  allPokemon,
  badSectors,
  loadSave,
  readLogical,
  slotKey,
  type LoadedSave,
  type PokemonEntry,
} from "./sav3";

export interface PartyStatCheck {
  key: string;
  species: number;
  stored: StatSix;
  computed: StatSix;
  /** See gen4/verify.ts: "pending-evs" when stored stats lie between the zero-EV and current-EV results. */
  result: "exact" | "pending-evs" | "mismatch";
}

/** Deoxys changes its base stats with the form (stored in the game, not in the Pokémon). */
const FORM_STAT_SPECIES: ReadonlySet<number> = new Set([386]);

/** Recomputes the stats of every party Pokémon and compares them with the stored ones. */
export function checkPartyStats(save: LoadedSave): PartyStatCheck[] {
  return save.party
    .filter((e) => !e.info.isEgg && e.info.party && !FORM_STAT_SPECIES.has(e.species))
    .map((e) => {
      const { info } = e;
      const base = getGen4Species(e.species).baseStats;
      const nature = natureOf(info.pid);
      const stored = info.party!.stats;
      const computed = calcStats(e.species, base, info.ivs, info.evs, info.party!.level, nature);
      const zeroEv = calcStats(e.species, base, info.ivs, [0, 0, 0, 0, 0, 0], info.party!.level, nature);
      const exact = stored.every((v, i) => v === computed[i]);
      const between = stored.every((v, i) => v >= zeroEv[i]! && v <= computed[i]!);
      return {
        key: slotKey(e.ref),
        species: e.species,
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
  const raw = readLogical(save.image, save, e.group, e.offset, e.size);
  return bytesEqual(encryptPk3(decryptPk3(raw)), raw);
}

/** Safety checks run on the real file before any change. */
export function selfCheck(save: LoadedSave): SelfCheckReport {
  const roundTripFailures = allPokemon(save)
    .filter((e) => !roundTrips(save, e))
    .map((e) => slotKey(e.ref));
  const checksumFailures = badSectors(save.image, save).map((i) => `sector ${i}`);
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

/** Absolute offsets an evolution is allowed to change: the evolved structures, the Pokédex arrays and the sector checksums. */
export function allowedOffsets(save: LoadedSave, applied: readonly AppliedEvolution[]): Set<number> {
  const allowed = new Set<number>(dexByteOffsets(save));
  for (const a of applied)
    for (let i = 0; i < a.size; i++) allowed.add(absOffset(save, a.group, a.offset + i));
  for (let id = 0; id < SECTORS_PER_SLOT; id++) {
    const crc = save.sectors[id]! + FOOTER_CHECKSUM;
    allowed.add(crc);
    allowed.add(crc + 1);
  }
  return allowed;
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
  if (reloaded.slot !== save.slot) problems.push("The game would load the other save slot.");
  if (!selfCheck(reloaded).canEdit) problems.push("Checksums or encryption round trip fail on the new file.");

  const byKey = new Map(allPokemon(reloaded).map((e) => [slotKey(e.ref), e]));
  for (const a of applied) {
    const e = byKey.get(slotKey(a.preview.ref));
    if (!e || e.species !== a.preview.to) {
      problems.push(`${slotKey(a.preview.ref)} does not have the expected species.`);
      continue;
    }
    if (!bytesEqual(decryptPk3(readLogical(image, save, a.group, a.offset, a.size)), a.expected)) {
      problems.push(`${slotKey(a.preview.ref)} differs from the expected data.`);
    }
  }
  if (allPokemon(reloaded).length !== allPokemon(save).length)
    problems.push("The number of Pokémon changed.");

  const allowed = allowedOffsets(save, applied);
  const diff: number[] = [];
  for (let i = 0; i < image.length && diff.length < 16; i++) {
    if (image[i] !== save.image[i] && !allowed.has(i)) diff.push(i);
  }
  if (diff.length > 0)
    problems.push(`Unexpected changes at ${diff.map((o) => "0x" + o.toString(16)).join(", ")}.`);
  return { ok: problems.length === 0, problems };
}
