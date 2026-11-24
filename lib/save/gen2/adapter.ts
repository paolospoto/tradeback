/** Generation II adapter: Gold, Silver and Crystal (Western). */
import { tradeEvolutionsOf } from "../../data/trade-evolutions";
import { deduceLanguages, decideRename } from "../gen1/names";
import {
  joinWrapper,
  SaveError,
  slotKey,
  sortCandidates,
  type Candidate,
  type OpenedSave,
  type PokemonEntry as CommonEntry,
  type SaveAdapter,
  type SlotRef,
} from "../types";
import { analyzePokemon, applyEvolutions, heldItemOf, previewEvolution, type AnalyzeContext } from "./evolve";
import { allPokemon, loadSave, looksLikeGen2, type PokemonEntry } from "./sav2";
import { selfCheck, verifyEvolvedImage } from "./verify";

function commonEntry(e: PokemonEntry, ctx: AnalyzeContext): CommonEntry {
  const rule = tradeEvolutionsOf(e.species, 2)[0];
  return {
    ref: e.ref,
    level: e.level,
    info: {
      species: e.species,
      heldItem: heldItemOf(e.info.item),
      isEgg: e.info.isEgg,
      isNicknamed: rule
        ? decideRename(rule.from, rule.to, e.info.nickname, ctx.languages).kind === "keep"
        : true,
      nickname: e.info.nickname,
    },
  };
}

export const gen2Adapter: SaveAdapter = {
  name: "Generation II",
  games: ["gold-silver", "crystal"],
  matches: looksLikeGen2,

  open(bytes): OpenedSave {
    const save = loadSave(bytes);
    const report = selfCheck(save);
    if (!report.canEdit) throw new SaveError("self-check", report.checksumFailures.join(", "));
    const ctx: AnalyzeContext = {
      partyCheckPassed: report.partyCheckPassed,
      languages: deduceLanguages(
        allPokemon(save)
          .filter((e) => !e.info.isEgg)
          .map((e) => ({ species: e.species, nickname: e.info.nickname, own: e.info.id === save.trainerId })),
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
        game: save.layout.game,
        generation: 2,
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
