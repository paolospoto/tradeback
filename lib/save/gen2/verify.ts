import { getGen4Species } from "../../data/gen4-species";
import { calcStatGb, checksum16 } from "../gen1/stats";
import type { StatSix } from "../types";
import { DEX_FLAG_BYTES, GAME_START, NAME_LENGTH } from "./constants";
import type { AppliedEvolution } from "./evolve";
import { allPokemon, dexCaught, loadSave, slotKey, type LoadedSave } from "./sav2";

export interface PartyStatCheck {
  key: string;
  species: number;
  stored: StatSix;
  computed: StatSix;
  /** "pending-stat-exp": stored stats lie between the zero and the current Stat Exp results. */
  result: "exact" | "pending-stat-exp" | "mismatch";
}

function calc(species: number, e: PokemonEntryLike, withExp: boolean): StatSix {
  const base = getGen4Species(species).baseStats;
  const { dvs, statExp, level } = e;
  const dv = [dvs.hp, dvs.atk, dvs.def, dvs.spe, dvs.spc, dvs.spc];
  const exp = [statExp[0], statExp[1], statExp[2], statExp[3], statExp[4], statExp[4]];
  return base.map((b, i) => calcStatGb(b, dv[i]!, withExp ? exp[i]! : 0, level, i === 0)) as StatSix;
}
type PokemonEntryLike = LoadedSave["party"][number]["info"];

export function checkPartyStats(save: LoadedSave): PartyStatCheck[] {
  return save.party
    .filter((e) => e.info.party && !e.info.isEgg)
    .map((e) => {
      const stored = [e.info.party!.maxHp, ...e.info.party!.stats] as StatSix;
      const full = calc(e.species, e.info, true);
      const zero = calc(e.species, e.info, false);
      const exact = stored.every((v, i) => v === full[i]);
      const between = stored.every((v, i) => v >= zero[i]! && v <= full[i]!);
      return {
        key: slotKey(e.ref),
        species: e.species,
        stored,
        computed: full,
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
  const l = save.layout;
  const checksumFailures: string[] = [];
  if (
    (save.image[l.checksum]! | (save.image[l.checksum + 1]! << 8)) !==
    checksum16(save.image, GAME_START, l.gameEnd)
  )
    checksumFailures.push("main");
  const party = checkPartyStats(save);
  return {
    checksumFailures,
    party,
    canEdit: checksumFailures.length === 0,
    partyCheckPassed: party.every((p) => p.result !== "mismatch"),
  };
}

/** Byte ranges an evolution is allowed to change. */
export function allowedRanges(save: LoadedSave, applied: readonly AppliedEvolution[]): [number, number][] {
  const caught = dexCaught(save.layout);
  const ranges: [number, number][] = [
    [caught, caught + 2 * DEX_FLAG_BYTES],
    [save.layout.checksum, save.layout.checksum + 2],
  ];
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

/** Post-write verification: reloads the image, checks the checksum, the species and that nothing else changed (the trailer included). */
export function verifyEvolvedImage(
  save: LoadedSave,
  image: Uint8Array,
  applied: readonly AppliedEvolution[],
): VerifyResult {
  const problems: string[] = [];
  const full = new Uint8Array(image.length + save.trailer.length);
  full.set(image);
  full.set(save.trailer, image.length);
  let reloaded: LoadedSave;
  try {
    reloaded = loadSave(full);
  } catch (err) {
    return { ok: false, problems: [`The new file does not load: ${String(err)}`] };
  }
  if (reloaded.layout !== save.layout) problems.push("The game would be recognised differently.");
  if (!selfCheck(reloaded).canEdit) problems.push("The checksum fails on the new file.");
  const byKey = new Map(allPokemon(reloaded).map((e) => [slotKey(e.ref), e]));
  for (const a of applied) {
    const e = byKey.get(slotKey(a.preview.ref));
    if (!e || e.species !== a.preview.to)
      problems.push(`${slotKey(a.preview.ref)} does not have the expected species.`);
  }
  if (allPokemon(reloaded).length !== allPokemon(save).length)
    problems.push("The number of Pokémon changed.");
  const ranges = allowedRanges(save, applied);
  const diff: number[] = [];
  for (let i = 0; i < image.length && diff.length < 16; i++) {
    if (image[i] !== save.image[i] && !ranges.some(([s, e]) => i >= s && i < e)) diff.push(i);
  }
  if (diff.length > 0)
    problems.push(`Unexpected changes at ${diff.map((o) => "0x" + o.toString(16)).join(", ")}.`);
  return { ok: problems.length === 0, problems };
}
