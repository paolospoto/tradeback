/** Generation I adapter: Red, Blue and Yellow (Western). */
import {
  joinWrapper,
  SaveError,
  slotKey,
  sortCandidates,
  type Candidate,
  type MonInfo,
  type OpenedSave,
  type PokemonEntry as CommonEntry,
  type SaveAdapter,
  type SlotRef,
} from "../types";
import { SAVE_SIZE } from "./constants";
import { analyzePokemon, applyEvolutions, previewEvolution, type AnalyzeContext } from "./evolve";
import { allPokemon, loadSave, looksLikeGen1, type PokemonEntry } from "./sav1";
import { selfCheck, verifyEvolvedImage } from "./verify";
import { decideRename, deduceLanguages } from "./names";
import { tradeEvolutionsOf } from "../../data/trade-evolutions";

function commonEntry(e: PokemonEntry, ctx: AnalyzeContext): CommonEntry {
  const rule = tradeEvolutionsOf(e.species, 1)[0];
  const info: MonInfo = {
    species: e.species,
    heldItem: 0,
    isEgg: false,
    isNicknamed: rule
      ? decideRename(rule.from, rule.to, e.info.nickname, ctx.languages).kind === "keep"
      : true,
    nickname: e.info.nickname,
  };
  return { ref: e.ref, info, level: e.level };
}

export const gen1Adapter: SaveAdapter = {
  name: "Generation I",
  games: ["red-blue", "yellow"],

  matches: (bytes) => bytes.length === SAVE_SIZE && looksLikeGen1(bytes),

  open(bytes): OpenedSave {
    const save = loadSave(bytes);
    const report = selfCheck(save);
    if (!report.canEdit) throw new SaveError("self-check", report.checksumFailures.join(", "));
    const ctx: AnalyzeContext = {
      partyCheckPassed: report.partyCheckPassed,
      languages: deduceLanguages(
        allPokemon(save).map((e) => ({
          species: e.species,
          nickname: e.info.nickname,
          own: e.info.otId === save.trainerId,
        })),
      ),
    };
    const candidates: Candidate[] = [];
    for (const entry of allPokemon(save)) {
      const status = analyzePokemon(entry, ctx);
      if (!status) continue;
      candidates.push({
        key: slotKey(entry.ref),
        entry: commonEntry(entry, ctx),
        status,
        preview: status.kind === "ready" ? previewEvolution(entry, status.rule, ctx) : undefined,
      });
    }
    return {
      save: {
        game: save.game,
        generation: 1,
        trainerName: save.trainerName,
        party: save.party.map((e) => commonEntry(e, ctx)),
        boxes: save.boxes.map((b) => ({
          name: b.name,
          slots: b.slots.map((e) => (e ? commonEntry(e, ctx) : null)),
        })),
        unreadable: save.unreadable,
      },
      check: {
        canEdit: true,
        partyCheckPassed: report.partyCheckPassed,
        problems: report.party.filter((p) => p.result === "mismatch").map((p) => `party stats ${p.key}`),
      },
      candidates: sortCandidates(candidates),
      evolve(refs: readonly SlotRef[]) {
        try {
          const { image, applied } = applyEvolutions(save, refs, ctx);
          const result = verifyEvolvedImage(save, image, applied);
          if (!result.ok) return { ok: false, problems: result.problems };
          return {
            ok: true,
            bytes: joinWrapper(image, save.trailer),
            previews: applied.map((a) => a.preview),
          };
        } catch (err) {
          return { ok: false, problems: [String(err)] };
        }
      },
    };
  },
};
