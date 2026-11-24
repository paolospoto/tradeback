import { getGen1Species } from "../../data/gen1-species";
import type { StatSix } from "../types";
import {
  BANK_ALL_CHECKSUM,
  BANK_BOX_CHECKSUMS,
  BOX_BANKS,
  BOXES_PER_BANK,
  CHECKSUM_OFFSET,
  CHECKSUM_START,
  DEX_FLAG_BYTES,
  DEX_OWNED,
  DEX_SEEN,
  NAME_LENGTH,
} from "./constants";
import type { AppliedEvolution } from "./evolve";
import { allPokemon, badBankChecksums, loadSave, slotKey, type LoadedSave } from "./sav1";
import { calcStatGb, checksum8 } from "./stats";

export interface PartyStatCheck {
  key: string;
  species: number;
  stored: StatSix;
  computed: StatSix;
  /** "pending-stat-exp": stored stats lie between the zero Stat Exp and the current Stat Exp results (stats refresh at level-up). */
  result: "exact" | "pending-stat-exp" | "mismatch";
}

/** Recomputes the stats of every party Pokémon and compares them with the stored ones. */
export function checkPartyStats(save: LoadedSave): PartyStatCheck[] {
  return save.party
    .filter((e) => e.info.party)
    .map((e) => {
      const { info } = e;
      const base = getGen1Species(e.species).baseStats;
      const level = info.party!.level;
      const dv = [info.dvs.hp, info.dvs.atk, info.dvs.def, info.dvs.spe, info.dvs.spc];
      const calc = (exp: readonly number[]) =>
        base.map((b, i) => calcStatGb(b, dv[i]!, exp[i]!, level, i === 0));
      const full = calc(info.statExp);
      const zero = calc([0, 0, 0, 0, 0]);
      const s = [info.party!.maxHp, ...info.party!.stats];
      const six = (v: readonly number[]): StatSix => [v[0]!, v[1]!, v[2]!, v[3]!, v[4]!, v[4]!];
      const exact = s.every((v, i) => v === full[i]);
      const between = s.every((v, i) => v >= zero[i]! && v <= full[i]!);
      return {
        key: slotKey(e.ref),
        species: e.species,
        stored: six(s),
        computed: six(full),
        result: exact ? "exact" : between ? "pending-stat-exp" : "mismatch",
      } satisfies PartyStatCheck;
    });
}

export interface SelfCheckReport {
  checksumFailures: string[];
  party: PartyStatCheck[];
  canEdit: boolean;
  partyCheckPassed: boolean;
}

export function selfCheck(save: LoadedSave): SelfCheckReport {
  const checksumFailures: string[] = [];
  if (checksum8(save.image, CHECKSUM_START, CHECKSUM_OFFSET) !== save.image[CHECKSUM_OFFSET])
    checksumFailures.push("main");
  if (save.storedBoxesValid)
    badBankChecksums(save.image).forEach((b) => checksumFailures.push(`boxes bank ${b + 2}`));
  const party = checkPartyStats(save);
  return {
    checksumFailures,
    party,
    canEdit: checksumFailures.length === 0,
    partyCheckPassed: party.every((p) => p.result !== "mismatch"),
  };
}

/** Byte ranges an evolution is allowed to change. */
export function allowedRanges(applied: readonly AppliedEvolution[]): [number, number][] {
  const ranges: [number, number][] = [
    [DEX_OWNED, DEX_OWNED + DEX_FLAG_BYTES],
    [DEX_SEEN, DEX_SEEN + DEX_FLAG_BYTES],
    [CHECKSUM_OFFSET, CHECKSUM_OFFSET + 1],
  ];
  for (const bank of BOX_BANKS)
    ranges.push([bank + BANK_ALL_CHECKSUM, bank + BANK_BOX_CHECKSUMS + BOXES_PER_BANK]);
  for (const a of applied) {
    ranges.push(
      [a.entry.offset, a.entry.offset + a.entry.size],
      [a.entry.listOffset, a.entry.listOffset + 1],
      [a.entry.nickOffset, a.entry.nickOffset + NAME_LENGTH],
    );
  }
  return ranges;
}

export interface VerifyResult {
  ok: boolean;
  problems: string[];
}

/** Post-write verification: reloads the image, checks checksums, the evolved structures and that nothing else changed. */
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
  if (!selfCheck(reloaded).canEdit) problems.push("Checksums fail on the new file.");
  const byKey = new Map(allPokemon(reloaded).map((e) => [slotKey(e.ref), e]));
  for (const a of applied) {
    const e = byKey.get(slotKey(a.preview.ref));
    if (!e || e.species !== a.preview.to)
      problems.push(`${slotKey(a.preview.ref)} does not have the expected species.`);
  }
  if (allPokemon(reloaded).length !== allPokemon(save).length)
    problems.push("The number of Pokémon changed.");
  const ranges = allowedRanges(applied);
  const diff: number[] = [];
  for (let i = 0; i < image.length && diff.length < 16; i++) {
    if (image[i] !== save.image[i] && !ranges.some(([s, e]) => i >= s && i < e)) diff.push(i);
  }
  if (diff.length > 0)
    problems.push(`Unexpected changes at ${diff.map((o) => "0x" + o.toString(16)).join(", ")}.`);
  return { ok: problems.length === 0, problems };
}
