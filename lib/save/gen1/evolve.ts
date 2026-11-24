import { getGen1Species, nationalToGen1 } from "../../data/gen1-species";
import { tradeEvolutionsOf, type TradeEvolution } from "../../data/trade-evolutions";
import { GEN1_CHARSET, writeGbString } from "./charset";
import { DEX_OWNED, DEX_SEEN, MON_HP, MON_MAX_HP, MON_SPECIES, MON_STATS, NAME_LENGTH } from "./constants";
import { decideRename } from "./names";
import { calcStatGb, levelFromExp, setFlag, writeU16be } from "./stats";
import {
  slotKey,
  writeBankChecksums,
  writeMainChecksum,
  type LoadedSave,
  type PokemonEntry,
  type SlotRef,
} from "./sav1";
import type { EvolutionPreview, EvolutionStatus, StatSix } from "../types";

export interface AnalyzeContext {
  partyCheckPassed: boolean;
  /** Languages the save can have been played in (see names.ts). */
  languages: ReadonlySet<number>;
}

/**
 * Decides whether a Pokémon can trade-evolve in generation I. There are no items: Kadabra, Machoke, Graveler
 * and Haunter only. Eggs and held items do not exist. Box Pokémon evolve too, as in the other generations
 * (the game itself only evolves the party in a link trade).
 */
export function analyzePokemon(entry: PokemonEntry, ctx: AnalyzeContext): EvolutionStatus | undefined {
  const rules = tradeEvolutionsOf(entry.species, 1);
  if (rules.length === 0) return undefined;
  const rule = rules[0]!;
  if (decideRename(rule.from, rule.to, entry.info.nickname, ctx.languages).kind === "unknown") {
    return { kind: "blocked", reason: "unsupported-language", rules };
  }
  const { info } = entry;
  if (info.party) {
    if (!ctx.partyCheckPassed) return { kind: "blocked", reason: "party-check-failed", rules };
    if (levelFromExp(getGen1Species(entry.species).growthRate, info.exp) !== info.party.level) {
      return { kind: "blocked", reason: "level-mismatch", rules };
    }
  }
  return { kind: "ready", rule };
}

/** Stats the game computes for the evolved Pokémon (pret/pokered `CalcStats`): HP, Atk, Def, Spe, Spc. */
function evolvedStats(entry: PokemonEntry, to: number): [number, number, number, number, number] {
  const { info } = entry;
  const base = getGen1Species(to).baseStats;
  const level = info.party!.level;
  const dv = [info.dvs.hp, info.dvs.atk, info.dvs.def, info.dvs.spe, info.dvs.spc];
  return base.map((b, i) => calcStatGb(b, dv[i]!, info.statExp[i]!, level, i === 0)) as [
    number,
    number,
    number,
    number,
    number,
  ];
}

const six = (s: readonly number[]): StatSix => [s[0]!, s[1]!, s[2]!, s[3]!, s[4]!, s[4]!];

export function previewEvolution(
  entry: PokemonEntry,
  rule: TradeEvolution,
  ctx: AnalyzeContext,
): EvolutionPreview {
  const { info } = entry;
  const decision = decideRename(rule.from, rule.to, info.nickname, ctx.languages);
  return {
    ref: entry.ref,
    from: entry.species,
    to: rule.to,
    level: entry.level,
    nickname: info.nickname,
    newName: decision.kind === "rename" ? decision.name : undefined,
    oldStats: info.party ? six([info.party.maxHp, ...info.party.stats]) : undefined,
    newStats: info.party ? six(evolvedStats(entry, rule.to)) : undefined,
  };
}

export interface AppliedEvolution {
  preview: EvolutionPreview;
  entry: PokemonEntry;
  /** The bytes the structure, list entry and nickname hold after the evolution. */
  expected: { mon: Uint8Array; nick: Uint8Array };
}

/**
 * Applies trade evolutions to a copy of the save (order follows pret/pokered `Evolution_PartyMonLoop`: species,
 * name, stats, HP, Pokédex). Types are not rewritten: all four evolutions keep the same types.
 * @throws Error when a Pokémon is not ready or listed twice.
 */
export function applyEvolutions(
  save: LoadedSave,
  refs: readonly SlotRef[],
  ctx: AnalyzeContext,
): { image: Uint8Array; applied: AppliedEvolution[] } {
  const image = save.image.slice();
  const entries = new Map(
    [...save.party, ...save.boxes.flatMap((b) => b.slots)]
      .filter((e): e is PokemonEntry => e !== null)
      .map((e) => [slotKey(e.ref), e]),
  );
  const seen = new Set<string>();
  const applied: AppliedEvolution[] = [];
  const touchedBoxes = new Set<number>();

  for (const ref of refs) {
    const key = slotKey(ref);
    if (seen.has(key)) throw new Error(`Pokémon ${key} listed twice`);
    seen.add(key);
    const entry = entries.get(key);
    if (!entry) throw new Error(`No Pokémon at ${key}`);
    const status = analyzePokemon(entry, ctx);
    if (status?.kind !== "ready") throw new Error(`Pokémon ${key} cannot evolve`);
    const { rule } = status;
    const preview = previewEvolution(entry, rule, ctx);
    const internal = nationalToGen1(rule.to);

    image[entry.offset + MON_SPECIES] = internal;
    image[entry.listOffset] = internal;
    if (entry.info.party) {
      const stats = evolvedStats(entry, rule.to);
      const oldMax = entry.info.party.maxHp;
      // pret/pokered: the new HP is the old HP plus the max HP gain, whatever the old HP was.
      const hp = Math.min(stats[0], entry.info.hp + stats[0] - oldMax);
      writeU16be(image, entry.offset + MON_HP, Math.max(0, hp));
      writeU16be(image, entry.offset + MON_MAX_HP, stats[0]);
      for (let i = 1; i < 5; i++) writeU16be(image, entry.offset + MON_STATS + i * 2, stats[i]!);
    }
    if (preview.newName !== undefined)
      writeGbString(GEN1_CHARSET, image, entry.nickOffset, NAME_LENGTH, preview.newName);
    setFlag(image, DEX_OWNED, rule.to);
    setFlag(image, DEX_SEEN, rule.to);
    if (entry.box !== undefined && entry.box !== save.currentBox) touchedBoxes.add(entry.box);
    applied.push({
      preview,
      entry,
      expected: {
        mon: image.slice(entry.offset, entry.offset + entry.size),
        nick: image.slice(entry.nickOffset, entry.nickOffset + NAME_LENGTH),
      },
    });
  }

  for (const b of touchedBoxes) writeBankChecksums(image, b);
  writeMainChecksum(image);
  return { image, applied };
}
