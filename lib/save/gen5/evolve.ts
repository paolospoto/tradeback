import { GEN5_TARGET_NAMES, type Gen5NameLang } from "../../data/gen5-names";
import { LANGUAGE } from "../../data/gen4-species";
import { getGen5Species } from "../../data/gen5-species";
import { tradeEvolutionsOf, type TradeEvolution } from "../../data/trade-evolutions";
import { readU16, writeU16 } from "../bytes";
import {
  ITEM_EVERSTONE,
  PK4_ABILITY,
  PK4_HELD_ITEM,
  PK4_HP_CURRENT,
  PK4_LEVEL,
  PK4_NICKNAME,
  PK4_SPECIES,
  PK4_STATS,
} from "../gen4/constants";
import { decryptPk4, encryptPk4, refreshPk4Checksum } from "../gen4/pk4";
import { calcStats, levelFromExp } from "../stats";
import type { EvolutionPreview, EvolutionStatus, StatSix } from "../types";
import { writeGen5String } from "./charset";
import { PK5_HIDDEN_ABILITY } from "./constants";
import { registerCaught } from "./pokedex";
import { isShiny } from "./pk5";
import {
  slotKey,
  writeBlockChecksum,
  writeInfoChecksum,
  type LoadedSave,
  type PokemonEntry,
  type SlotRef,
} from "./sav5";

export interface AnalyzeContext {
  gameLanguage: number;
  partyCheckPassed: boolean;
}

export function contextOf(save: LoadedSave, partyCheckPassed: boolean): AnalyzeContext {
  return { gameLanguage: save.language, partyCheckPassed };
}

const NAME_LANG: Readonly<Record<number, Gen5NameLang>> = {
  [LANGUAGE.EN]: "en",
  [LANGUAGE.FR]: "fr",
  [LANGUAGE.DE]: "de",
  [LANGUAGE.IT]: "it",
  [LANGUAGE.ES]: "es",
};

/**
 * Name an evolved Pokémon without nickname gets, in the game's language.
 * @returns undefined for Japanese and Korean (see lib/data/gen5-names.ts).
 */
export function defaultNameFor(species: number, gameLanguage: number): string | undefined {
  const lang = NAME_LANG[gameLanguage];
  return lang ? GEN5_TARGET_NAMES[species]?.[lang] : undefined;
}

/**
 * Whether a Pokémon could evolve on its own, ignoring the Karrablast/Shelmet partner.
 * The Everstone blocks every trade evolution here, Kadabra included: the Kadabra exception is only
 * confirmed for generation IV, and refusing is the safe side.
 */
function baseStatus(entry: PokemonEntry, ctx: AnalyzeContext): EvolutionStatus | undefined {
  const { info } = entry;
  if (info.isEgg) return undefined;
  const rules = tradeEvolutionsOf(info.species, 5);
  if (rules.length === 0) return undefined;
  if (info.heldItem === ITEM_EVERSTONE) return { kind: "blocked", reason: "everstone", rules };
  const rule = rules.find((r) => r.item === undefined || r.item === info.heldItem);
  if (!rule) return { kind: "blocked", reason: "missing-item", rules };
  if (!info.isNicknamed && defaultNameFor(rule.to, ctx.gameLanguage) === undefined) {
    return { kind: "blocked", reason: "unsupported-language", rules };
  }
  if (info.party) {
    if (!ctx.partyCheckPassed) return { kind: "blocked", reason: "party-check-failed", rules };
    if (levelFromExp(getGen5Species(info.species).growthRate, info.exp) !== info.party.level) {
      return { kind: "blocked", reason: "level-mismatch", rules };
    }
  }
  return { kind: "ready", rule };
}

/**
 * Pairs every Karrablast with a Shelmet (they only evolve when traded for each other), in save
 * order: party first, then boxes. A Pokémon that cannot evolve on its own (Everstone, egg, …) is
 * never paired. Unpaired ones stay blocked with "needs-partner".
 */
export function findPartners(
  entries: readonly PokemonEntry[],
  ctx: AnalyzeContext,
): Map<string, PokemonEntry> {
  const ready = (e: PokemonEntry) => baseStatus(e, ctx)?.kind === "ready";
  const karrablast = entries.filter((e) => e.info.species === 588 && ready(e));
  const shelmet = entries.filter((e) => e.info.species === 616 && ready(e));
  const pairs = new Map<string, PokemonEntry>();
  for (let i = 0; i < Math.min(karrablast.length, shelmet.length); i++) {
    pairs.set(slotKey(karrablast[i]!.ref), shelmet[i]!);
    pairs.set(slotKey(shelmet[i]!.ref), karrablast[i]!);
  }
  return pairs;
}

/**
 * Decides whether a Pokémon can trade-evolve.
 * @param partner The Pokémon it would be traded for (Karrablast/Shelmet only), from {@link findPartners}.
 */
export function analyzePokemon(
  entry: PokemonEntry,
  ctx: AnalyzeContext,
  partner?: PokemonEntry,
): EvolutionStatus | undefined {
  const status = baseStatus(entry, ctx);
  if (status?.kind !== "ready" || status.rule.partner === undefined) return status;
  if (!partner || partner.info.species !== status.rule.partner) {
    return { kind: "blocked", reason: "needs-partner", rules: [status.rule] };
  }
  return status;
}

function newAbilityOf(species: number, info: PokemonEntry["info"]): { ability: number; hidden: boolean } {
  const [a1, a2, hidden] = getGen5Species(species).abilities;
  // PKHeX PK5: hidden-ability flag, otherwise slot from bit 16 of the PID (`PIDAbility`).
  if (info.hiddenAbility && hidden !== 0) return { ability: hidden, hidden: true };
  return { ability: ((info.pid >>> 16) & 1) === 1 && a2 !== 0 ? a2 : a1, hidden: false };
}

function evolvedStats(entry: PokemonEntry, to: number): StatSix {
  const { info } = entry;
  const sp = getGen5Species(to);
  return calcStats(to, sp.baseStats, info.ivs, info.evs, levelFromExp(sp.growthRate, info.exp), info.nature);
}

/** Describes the effects of an evolution without changing anything. */
export function previewEvolution(
  entry: PokemonEntry,
  rule: TradeEvolution,
  ctx: AnalyzeContext,
  partner?: PokemonEntry,
): EvolutionPreview {
  const { info } = entry;
  return {
    ref: entry.ref,
    from: info.species,
    to: rule.to,
    level: entry.level,
    consumedItem: rule.item,
    keptItem: rule.item === undefined && info.heldItem !== 0 ? info.heldItem : undefined,
    oldAbility: info.ability,
    newAbility: newAbilityOf(rule.to, info).ability,
    nickname: info.nickname,
    newName: info.isNicknamed ? undefined : defaultNameFor(rule.to, ctx.gameLanguage),
    oldStats: info.party?.stats,
    newStats: info.party ? evolvedStats(entry, rule.to) : undefined,
    partner: partner?.ref,
  };
}

export interface AppliedEvolution {
  preview: EvolutionPreview;
  offset: number;
  size: number;
  /** Decrypted structure after the evolution, used by verify.ts. */
  expected: Uint8Array;
}

/** Index of the block that holds an absolute offset, or -1. */
export function blockIndexAt(save: LoadedSave, offset: number): number {
  return save.layout.blocks.findIndex(([o, l]) => offset >= o && offset < o + l);
}

/**
 * Applies trade evolutions to a copy of the save image. Karrablast and Shelmet must be listed
 * together with their partner. The input save is not modified; run `verifyEvolvedImage` on the result.
 * @throws Error when a Pokémon is not ready, listed twice, or its partner is missing from `refs`.
 */
export function applyEvolutions(
  save: LoadedSave,
  refs: readonly SlotRef[],
  ctx: AnalyzeContext,
  partners: ReadonlyMap<string, PokemonEntry>,
): { image: Uint8Array; applied: AppliedEvolution[] } {
  const image = save.image.slice();
  const entries = new Map(
    [...save.party, ...save.boxes.flatMap((b) => b.slots)]
      .filter((e): e is PokemonEntry => e !== null)
      .map((e) => [slotKey(e.ref), e]),
  );
  const [dexStart] = save.layout.blocks[save.layout.dexBlock]!;
  const seen = new Set<string>();
  const wanted = new Set(refs.map(slotKey));
  const applied: AppliedEvolution[] = [];
  const touched = new Set<number>([save.layout.dexBlock]);

  for (const ref of refs) {
    const key = slotKey(ref);
    if (seen.has(key)) throw new Error(`Pokémon ${key} listed twice`);
    seen.add(key);
    const entry = entries.get(key);
    if (!entry) throw new Error(`No Pokémon at ${key}`);
    const partner = partners.get(key);
    const status = analyzePokemon(entry, ctx, partner);
    if (status?.kind !== "ready") throw new Error(`Pokémon ${key} cannot evolve`);
    if (partner && !wanted.has(slotKey(partner.ref)))
      throw new Error(`Pokémon ${key} must evolve together with its partner`);
    const { rule } = status;
    const preview = previewEvolution(entry, rule, ctx, partner);

    const dec = decryptPk4(image.subarray(entry.offset, entry.offset + entry.size));
    if (readU16(dec, PK4_SPECIES) !== rule.from) throw new Error(`Unexpected species at ${key}`);

    writeU16(dec, PK4_SPECIES, rule.to);
    const ability = newAbilityOf(rule.to, entry.info);
    dec[PK4_ABILITY] = ability.ability;
    dec[PK5_HIDDEN_ABILITY] = (dec[PK5_HIDDEN_ABILITY]! & ~1) | (ability.hidden ? 1 : 0);
    if (entry.info.party && preview.newStats) {
      const oldMax = readU16(dec, PK4_STATS);
      let hp = readU16(dec, PK4_HP_CURRENT);
      const newMax = preview.newStats[0];
      dec[PK4_LEVEL] = levelFromExp(getGen5Species(rule.to).growthRate, entry.info.exp);
      preview.newStats.forEach((v, i) => writeU16(dec, PK4_STATS + i * 2, v));
      // Same rule as generation IV: a fainted Pokémon stays at 0 HP, otherwise HP grows by the max HP gain.
      if (hp !== 0 || oldMax === 0) hp = hp === 0 ? newMax : hp + newMax - oldMax;
      writeU16(dec, PK4_HP_CURRENT, Math.max(0, Math.min(hp, newMax)));
    }
    if (rule.item !== undefined) writeU16(dec, PK4_HELD_ITEM, 0);
    if (preview.newName !== undefined) writeGen5String(dec, PK4_NICKNAME, 11, preview.newName);
    refreshPk4Checksum(dec);
    image.set(encryptPk4(dec), entry.offset);

    registerCaught(
      image,
      dexStart,
      save.layout.dexFormLength,
      rule.to,
      entry.info.gender,
      isShiny(entry.info),
      entry.info.language,
    );
    touched.add(blockIndexAt(save, entry.offset));
    applied.push({ preview, offset: entry.offset, size: entry.size, expected: dec });
  }

  touched.delete(-1);
  for (const i of touched) writeBlockChecksum(image, save.layout, i);
  writeInfoChecksum(image, save.layout);
  return { image, applied };
}
