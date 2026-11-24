import { GEN4_TARGET_NAMES, getGen4Species, LANGUAGE, nameLangOf } from "../../data/gen4-species";
import { tradeEvolutionsOf, type TradeEvolution } from "../../data/trade-evolutions";
import { readU16, writeU16 } from "../bytes";
import { writeGen4String } from "./charset";
import {
  ITEM_EVERSTONE,
  PK4_ABILITY,
  PK4_HELD_ITEM,
  PK4_HP_CURRENT,
  PK4_LEVEL,
  PK4_NICKNAME,
  PK4_NICKNAME_LENGTH,
  PK4_SPECIES,
  PK4_STATS,
  SPECIES_KADABRA,
} from "./constants";
import type { EvolutionPreview, EvolutionStatus, StatSix } from "../types";
import { decryptPk4, encryptPk4, readPk4, refreshPk4Checksum } from "./pk4";
import { registerCaught } from "./pokedex";
import { slotKey, writeBlockChecksum, type LoadedSave, type PokemonEntry, type SlotRef } from "./sav4";
import { calcStats, levelFromExp, natureOf } from "../stats";

export type { BlockReason, EvolutionPreview, EvolutionStatus } from "../types";

export interface AnalyzeContext {
  /** Game language (trainer data); default names are written in this language. */
  gameLanguage: number;
  korean: boolean;
  /** Result of the party stat self-check. */
  partyCheckPassed: boolean;
}

/** Builds the analysis context of a loaded save. */
export function contextOf(save: LoadedSave, partyCheckPassed: boolean): AnalyzeContext {
  return { gameLanguage: save.language, korean: save.korean, partyCheckPassed };
}

/**
 * Name the game gives an evolved Pokémon that has no nickname.
 *
 * The game writes the species name in the language of the cartridge doing the
 * evolution, not the Pokémon's language (pret src/evolution.c sets
 * MON_DATA_SPECIES_NAME, which loads the name from the ROM's own text bank).
 * @returns The name, or undefined when it cannot be written (Korean).
 */
export function defaultNameFor(species: number, gameLanguage: number, korean: boolean): string | undefined {
  if (korean || gameLanguage === LANGUAGE.KO) return undefined;
  const lang = nameLangOf(gameLanguage);
  return lang ? GEN4_TARGET_NAMES[species]?.[lang] : undefined;
}

/**
 * Decides whether a Pokémon can trade-evolve.
 * @returns undefined when its species does not evolve by trade, or when it is an egg.
 */
export function analyzePokemon(entry: PokemonEntry, ctx: AnalyzeContext): EvolutionStatus | undefined {
  const { info } = entry;
  if (info.isEgg) return undefined;
  const rules = tradeEvolutionsOf(info.species);
  if (rules.length === 0) return undefined;

  if (info.heldItem === ITEM_EVERSTONE && info.species !== SPECIES_KADABRA) {
    return { kind: "blocked", reason: "everstone", rules };
  }
  const rule = rules.find((r) => r.item === undefined || r.item === info.heldItem);
  if (!rule) return { kind: "blocked", reason: "missing-item", rules };
  if (!info.isNicknamed && defaultNameFor(rule.to, ctx.gameLanguage, ctx.korean) === undefined) {
    return { kind: "blocked", reason: "unsupported-language", rules };
  }
  if (info.party) {
    if (!ctx.partyCheckPassed) return { kind: "blocked", reason: "party-check-failed", rules };
    if (levelFromExp(getGen4Species(info.species).growthRate, info.exp) !== info.party.level) {
      return { kind: "blocked", reason: "level-mismatch", rules };
    }
  }
  return { kind: "ready", rule };
}

function newAbilityOf(species: number, pid: number): number {
  const [a1, a2] = getGen4Species(species).abilities;
  // pret src/pokemon.c `BoxPokemon_CalcAbility`: second ability when it exists and the PID is odd.
  return a2 !== 0 && (pid & 1) === 1 ? a2 : a1;
}

/** Stats the game computes for the evolved Pokémon (pret `Pokemon_CalcStats`). */
function evolvedStats(entry: PokemonEntry, to: number): StatSix {
  const { info } = entry;
  const level = levelFromExp(getGen4Species(to).growthRate, info.exp);
  return calcStats(to, getGen4Species(to).baseStats, info.ivs, info.evs, level, natureOf(info.pid));
}

/**
 * Describes the effects of an evolution without changing anything.
 * @param entry A Pokémon whose status is "ready".
 * @param rule The rule returned by {@link analyzePokemon}.
 */
export function previewEvolution(
  entry: PokemonEntry,
  rule: TradeEvolution,
  ctx: AnalyzeContext,
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
    newAbility: newAbilityOf(rule.to, info.pid),
    nickname: info.nickname,
    newName: info.isNicknamed ? undefined : defaultNameFor(rule.to, ctx.gameLanguage, ctx.korean),
    oldStats: info.party?.stats,
    newStats: info.party ? evolvedStats(entry, rule.to) : undefined,
  };
}

/** One evolution that was applied. */
export interface AppliedEvolution {
  preview: EvolutionPreview;
  offset: number;
  size: number;
  /** Decrypted structure after the evolution, used by verify.ts. */
  expected: Uint8Array;
}

/**
 * Applies trade evolutions to a copy of the save image.
 * The input save is not modified. Run {@link verifyEvolvedImage} on the result
 * before offering it for download.
 * @param save Loaded save.
 * @param refs Pokémon to evolve; each must be "ready".
 * @param ctx Analysis context (see {@link contextOf}).
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

    const dec = decryptPk4(image.subarray(entry.offset, entry.offset + entry.size));
    if (readU16(dec, PK4_SPECIES) !== rule.from) throw new Error(`Unexpected species at ${key}`);

    // Steps follow pret src/evolution.c: species, ability, level and stats, item, name.
    writeU16(dec, PK4_SPECIES, rule.to);
    dec[PK4_ABILITY] = preview.newAbility!;
    if (entry.info.party && preview.newStats) {
      const oldMax = readU16(dec, PK4_STATS);
      let hp = readU16(dec, PK4_HP_CURRENT);
      const newMax = preview.newStats[0];
      dec[PK4_LEVEL] = levelFromExp(getGen4Species(rule.to).growthRate, entry.info.exp);
      preview.newStats.forEach((v, i) => writeU16(dec, PK4_STATS + i * 2, v));
      // pret `Pokemon_CalcStats`: a fainted Pokémon stays at 0 HP; otherwise HP grows by the max HP gain.
      if (hp !== 0 || oldMax === 0) hp = hp === 0 ? newMax : hp + newMax - oldMax;
      writeU16(dec, PK4_HP_CURRENT, Math.max(0, Math.min(hp, newMax)));
    }
    if (rule.item !== undefined) writeU16(dec, PK4_HELD_ITEM, 0);
    if (preview.newName !== undefined)
      writeGen4String(dec, PK4_NICKNAME, PK4_NICKNAME_LENGTH, preview.newName);
    refreshPk4Checksum(dec);
    image.set(encryptPk4(dec), entry.offset);

    registerCaught(
      image,
      save.general.offset + save.layout.pokedex,
      rule.to,
      entry.info.pid,
      entry.info.language,
      save.layout.dexLanguages,
    );
    applied.push({ preview, offset: entry.offset, size: entry.size, expected: dec });
  }

  writeBlockChecksum(image, save.general);
  writeBlockChecksum(image, save.storage);
  return { image, applied };
}

/** Convenience: reads back the evolved Pokémon of an applied evolution. */
export function readApplied(a: AppliedEvolution) {
  return readPk4(a.expected);
}
