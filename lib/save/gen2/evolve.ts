import { getGen4Species } from "../../data/gen4-species";
import { ITEMS, tradeEvolutionsOf, type TradeEvolution } from "../../data/trade-evolutions";
import { GEN2_CHARSET, writeGbString } from "../gen1/charset";
import { decideRename } from "../gen1/names";
import { calcStatGb, levelFromExp, setFlag, writeU16be } from "../gen1/stats";
import type { EvolutionPreview, EvolutionStatus, StatSix } from "../types";
import {
  GEN2_ITEMS,
  MON_HP,
  MON_ITEM,
  MON_MAX_HP,
  MON_SPECIES,
  MON_STATS,
  NAME_LENGTH,
  DEX_FLAG_BYTES,
} from "./constants";
import {
  dexCaught,
  slotKey,
  writeMainChecksum,
  type LoadedSave,
  type PokemonEntry,
  type SlotRef,
} from "./sav2";

export interface AnalyzeContext {
  partyCheckPassed: boolean;
  /** Languages the save can have been played in (lib/save/gen1/names.ts). */
  languages: ReadonlySet<number>;
}

/** Held item as a generation IV item index, which the evolution table uses. Items that do not matter map to 1. */
export function heldItemOf(item: number): number {
  switch (item) {
    case 0:
      return 0;
    case GEN2_ITEMS.EVERSTONE:
      return ITEMS.EVERSTONE;
    case GEN2_ITEMS.KINGS_ROCK:
      return ITEMS.KINGS_ROCK;
    case GEN2_ITEMS.METAL_COAT:
      return ITEMS.METAL_COAT;
    case GEN2_ITEMS.DRAGON_SCALE:
      return ITEMS.DRAGON_SCALE;
    case GEN2_ITEMS.UP_GRADE:
      return ITEMS.UPGRADE;
    default:
      return 1;
  }
}

/**
 * Decides whether a Pokémon can trade-evolve in generation II. The Everstone blocks every trade evolution
 * (pret/pokecrystal `IsMonHoldingEverstone` runs before the trade entry, no Kadabra exception); item evolutions
 * need the item, which the evolution consumes. Box Pokémon evolve too, as in the other generations.
 */
export function analyzePokemon(entry: PokemonEntry, ctx: AnalyzeContext): EvolutionStatus | undefined {
  const { info } = entry;
  if (info.isEgg) return undefined;
  const rules = tradeEvolutionsOf(entry.species, 2);
  if (rules.length === 0) return undefined;
  const item = heldItemOf(info.item);
  if (item === ITEMS.EVERSTONE) return { kind: "blocked", reason: "everstone", rules };
  const rule = rules.find((r) => r.item === undefined || r.item === item);
  if (!rule) return { kind: "blocked", reason: "missing-item", rules };
  if (decideRename(rule.from, rule.to, info.nickname, ctx.languages).kind === "unknown") {
    return { kind: "blocked", reason: "unsupported-language", rules };
  }
  if (info.party) {
    if (!ctx.partyCheckPassed) return { kind: "blocked", reason: "party-check-failed", rules };
    if (levelFromExp(getGen4Species(entry.species).growthRate, info.exp) !== info.level)
      return { kind: "blocked", reason: "level-mismatch", rules };
  }
  return { kind: "ready", rule };
}

/** Stats the game computes (pret/pokecrystal `CalcMonStats`): HP, Atk, Def, Spe, SpA, SpD. Both special stats use the Special DV. */
function evolvedStats(entry: PokemonEntry, to: number): StatSix {
  const { info } = entry;
  const base = getGen4Species(to).baseStats;
  const dv = [info.dvs.hp, info.dvs.atk, info.dvs.def, info.dvs.spe, info.dvs.spc, info.dvs.spc];
  const exp = [
    info.statExp[0],
    info.statExp[1],
    info.statExp[2],
    info.statExp[3],
    info.statExp[4],
    info.statExp[4],
  ];
  return base.map((b, i) => calcStatGb(b, dv[i]!, exp[i]!, info.level, i === 0)) as StatSix;
}

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
    consumedItem: rule.item,
    keptItem: rule.item === undefined && info.item !== 0 ? heldItemOf(info.item) : undefined,
    nickname: info.nickname,
    newName: decision.kind === "rename" ? decision.name : undefined,
    oldStats: info.party ? ([info.party.maxHp, ...info.party.stats] as StatSix) : undefined,
    newStats: info.party ? evolvedStats(entry, rule.to) : undefined,
  };
}

export interface AppliedEvolution {
  preview: EvolutionPreview;
  entry: PokemonEntry;
}

/**
 * Applies trade evolutions to a copy of the save (order follows pret/pokecrystal `EvolveAfterBattle_MasterLoop`:
 * item consumed, species, name, stats, HP, Pokédex). Moves are not changed.
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
  const caught = dexCaught(save.layout);

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

    if (rule.item !== undefined) image[entry.offset + MON_ITEM] = 0;
    image[entry.offset + MON_SPECIES] = rule.to;
    image[entry.listOffset] = rule.to;
    if (entry.info.party && preview.newStats) {
      const s = preview.newStats;
      // pret/pokecrystal: the new HP is the old HP plus the max HP gain, whatever the old HP was.
      const hp = Math.max(0, Math.min(s[0], entry.info.hp + s[0] - entry.info.party.maxHp));
      writeU16be(image, entry.offset + MON_HP, hp);
      writeU16be(image, entry.offset + MON_MAX_HP, s[0]);
      for (let i = 1; i < 6; i++) writeU16be(image, entry.offset + MON_STATS + (i - 1) * 2, s[i]!);
    }
    if (preview.newName !== undefined)
      writeGbString(GEN2_CHARSET, image, entry.nickOffset, NAME_LENGTH, preview.newName);
    setFlag(image, caught, rule.to);
    setFlag(image, caught + DEX_FLAG_BYTES, rule.to);
    applied.push({ preview, entry });
  }
  writeMainChecksum(image, save.layout);
  return { image, applied };
}
