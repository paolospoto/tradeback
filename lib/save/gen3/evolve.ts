import { GEN3_SPECIES_NAMES, type Gen3NameLang } from "../../data/gen3-names";
import { GEN3_ITEMS, nationalToGen3 } from "../../data/gen3-index";
import { getGen4Species } from "../../data/gen4-species";
import { ITEMS, tradeEvolutionsOf, type TradeEvolution } from "../../data/trade-evolutions";
import { readU16, writeU16 } from "../bytes";
import { calcStats, levelFromExp, natureOf } from "../stats";
import type { EvolutionPreview, EvolutionStatus, PokemonEntry as CommonEntry, StatSix } from "../types";
import { writeGen3String } from "./charset";
import {
  GEN3_LANGUAGE,
  PK3_HELD_ITEM,
  PK3_HP_CURRENT,
  PK3_LEVEL,
  PK3_NICKNAME,
  PK3_NICKNAME_BYTES,
  PK3_SPECIES,
  PK3_STATS,
} from "./constants";
import { decryptPk3, encryptPk3, refreshPk3Checksum } from "./pk3";
import { registerCaught } from "./pokedex";
import {
  readLogical,
  slotKey,
  writeLogical,
  writeSlotChecksums,
  type LoadedSave,
  type PokemonEntry,
  type SlotRef,
} from "./sav3";

/** Last species of the Kanto Pokédex (Mew). Source: pret/pokefirered evolution_scene.c `tPostEvoSpecies > SPECIES_MEW`. */
const KANTO_LAST = 151;

export interface AnalyzeContext {
  romLanguage: number | undefined;
  nationalDex: boolean;
  /** FireRed/LeafGreen: evolutions into species beyond the Kanto Pokédex need the National Pokédex. */
  needsNationalDex: boolean;
  partyCheckPassed: boolean;
}

export function contextOf(save: LoadedSave, partyCheckPassed: boolean): AnalyzeContext {
  return {
    romLanguage: save.romLanguage,
    nationalDex: save.nationalDex,
    needsNationalDex: save.layout.nationalDexFlagsRequired,
    partyCheckPassed,
  };
}

const NAME_LANG: Readonly<Record<number, Gen3NameLang>> = {
  [GEN3_LANGUAGE.EN]: "en",
  [GEN3_LANGUAGE.FR]: "fr",
  [GEN3_LANGUAGE.DE]: "de",
  [GEN3_LANGUAGE.IT]: "it",
  [GEN3_LANGUAGE.ES]: "es",
};

/** Held item as a generation IV item index (what the evolution table uses). Only the items that matter are mapped; other items become 1. */
export function heldItemOf(gen3Item: number): number {
  switch (gen3Item) {
    case 0:
      return 0;
    case GEN3_ITEMS.EVERSTONE:
      return ITEMS.EVERSTONE;
    case GEN3_ITEMS.KINGS_ROCK:
      return ITEMS.KINGS_ROCK;
    case GEN3_ITEMS.METAL_COAT:
      return ITEMS.METAL_COAT;
    case GEN3_ITEMS.DRAGON_SCALE:
      return ITEMS.DRAGON_SCALE;
    case GEN3_ITEMS.UP_GRADE:
      return ITEMS.UPGRADE;
    case GEN3_ITEMS.DEEP_SEA_TOOTH:
      return ITEMS.DEEP_SEA_TOOTH;
    case GEN3_ITEMS.DEEP_SEA_SCALE:
      return ITEMS.DEEP_SEA_SCALE;
    default:
      return 1;
  }
}

/** True when the Pokémon carries the default name of its species in some language. */
function hasDefaultNameInAnyLanguage(species: number, nickname: string): boolean {
  return Object.values(GEN3_SPECIES_NAMES[species] ?? {}).includes(nickname);
}

/**
 * Whether the game would rename the Pokémon when it evolves: its nickname equals the species name of the
 * cartridge's language (pret src/evolution_scene.c `EvolutionRenameMon`).
 * @returns "unknown" when the cartridge language is not known and the nickname looks like a default name.
 */
function renameDecision(entry: PokemonEntry, ctx: AnalyzeContext): "keep" | "rename" | "unknown" {
  const lang = ctx.romLanguage === undefined ? undefined : NAME_LANG[ctx.romLanguage];
  if (lang === undefined)
    return hasDefaultNameInAnyLanguage(entry.species, entry.info.nickname) ? "unknown" : "keep";
  return GEN3_SPECIES_NAMES[entry.species]?.[lang] === entry.info.nickname ? "rename" : "keep";
}

/** The game-independent view of an entry (see ../types.ts). A Pokémon counts as nicknamed unless the game would rename it. */
export function commonEntry(entry: PokemonEntry, ctx: AnalyzeContext): CommonEntry {
  return {
    ref: entry.ref,
    level: entry.level,
    info: {
      species: entry.species,
      heldItem: heldItemOf(entry.info.heldItem),
      isEgg: entry.info.isEgg,
      isNicknamed: renameDecision(entry, ctx) === "keep",
      nickname: entry.info.nickname,
    },
  };
}

/** Name an evolved Pokémon gets, in the cartridge language. */
export function defaultNameFor(species: number, romLanguage: number | undefined): string | undefined {
  const lang = romLanguage === undefined ? undefined : NAME_LANG[romLanguage];
  return lang ? GEN3_SPECIES_NAMES[species]?.[lang] : undefined;
}

/**
 * Decides whether a Pokémon can trade-evolve in generation III. The Everstone blocks every trade
 * evolution (pret `GetEvolutionTargetSpecies` has no Kadabra exception).
 */
export function analyzePokemon(entry: PokemonEntry, ctx: AnalyzeContext): EvolutionStatus | undefined {
  const { info } = entry;
  if (info.isEgg) return undefined;
  const rules = tradeEvolutionsOf(entry.species, 3);
  if (rules.length === 0) return undefined;
  const item = heldItemOf(info.heldItem);
  if (item === ITEMS.EVERSTONE) return { kind: "blocked", reason: "everstone", rules };
  const rule = rules.find((r) => r.item === undefined || r.item === item);
  if (!rule) return { kind: "blocked", reason: "missing-item", rules };
  if (ctx.needsNationalDex && !ctx.nationalDex && rule.to > KANTO_LAST)
    return { kind: "blocked", reason: "national-dex", rules };
  const decision = renameDecision(entry, ctx);
  if (
    decision === "unknown" ||
    (decision === "rename" && defaultNameFor(rule.to, ctx.romLanguage) === undefined)
  ) {
    return { kind: "blocked", reason: "unsupported-language", rules };
  }
  if (info.party) {
    if (!ctx.partyCheckPassed) return { kind: "blocked", reason: "party-check-failed", rules };
    if (levelFromExp(getGen4Species(entry.species).growthRate, info.exp) !== info.party.level) {
      return { kind: "blocked", reason: "level-mismatch", rules };
    }
  }
  return { kind: "ready", rule };
}

function evolvedStats(entry: PokemonEntry, to: number): StatSix {
  const { info } = entry;
  const sp = getGen4Species(to);
  return calcStats(
    to,
    sp.baseStats,
    info.ivs,
    info.evs,
    levelFromExp(sp.growthRate, info.exp),
    natureOf(info.pid),
  );
}

/** Describes the effects of an evolution without changing anything. */
export function previewEvolution(
  entry: PokemonEntry,
  rule: TradeEvolution,
  ctx: AnalyzeContext,
): EvolutionPreview {
  const { info } = entry;
  return {
    ref: entry.ref,
    from: entry.species,
    to: rule.to,
    level: entry.level,
    consumedItem: rule.item,
    keptItem: rule.item === undefined && info.heldItem !== 0 ? heldItemOf(info.heldItem) : undefined,
    nickname: info.nickname,
    newName: renameDecision(entry, ctx) === "rename" ? defaultNameFor(rule.to, ctx.romLanguage) : undefined,
    oldStats: info.party?.stats,
    newStats: info.party ? evolvedStats(entry, rule.to) : undefined,
  };
}

export interface AppliedEvolution {
  preview: EvolutionPreview;
  group: "sb1" | "storage";
  offset: number;
  size: number;
  /** Decrypted structure after the evolution, used by verify.ts. */
  expected: Uint8Array;
}

/**
 * Applies trade evolutions to a copy of the save image (order of changes follows pret
 * src/evolution_scene.c: species, stats, rename, Pokédex). The input save is not modified.
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

    const dec = decryptPk3(readLogical(image, save, entry.group, entry.offset, entry.size));
    if (readU16(dec, PK3_SPECIES) !== nationalToGen3(rule.from))
      throw new Error(`Unexpected species at ${key}`);
    writeU16(dec, PK3_SPECIES, nationalToGen3(rule.to));
    if (entry.info.party && preview.newStats) {
      const oldMax = readU16(dec, PK3_STATS);
      let hp = readU16(dec, PK3_HP_CURRENT);
      const newMax = preview.newStats[0];
      dec[PK3_LEVEL] = levelFromExp(getGen4Species(rule.to).growthRate, entry.info.exp);
      preview.newStats.forEach((v, i) => writeU16(dec, PK3_STATS + i * 2, v));
      // pret `CalculateMonStats`: a fainted Pokémon stays at 0 HP; otherwise HP grows by the max HP gain.
      if (hp !== 0 || oldMax === 0) hp = hp === 0 ? newMax : hp + newMax - oldMax;
      writeU16(dec, PK3_HP_CURRENT, Math.max(0, Math.min(hp, newMax)));
    }
    if (rule.item !== undefined) writeU16(dec, PK3_HELD_ITEM, 0);
    if (preview.newName !== undefined)
      writeGen3String(dec, PK3_NICKNAME, PK3_NICKNAME_BYTES, preview.newName);
    refreshPk3Checksum(dec);
    writeLogical(image, save, entry.group, entry.offset, encryptPk3(dec));
    registerCaught(image, save, rule.to);
    applied.push({ preview, group: entry.group, offset: entry.offset, size: entry.size, expected: dec });
  }

  writeSlotChecksums(image, save);
  return { image, applied };
}
