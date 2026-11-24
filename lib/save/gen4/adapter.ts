/**
 * Generation IV adapter: wires the Platinum loader, evolution logic and safety
 * checks to the game-independent interface in ../types.ts.
 */
import { SAVE_SIZE, DESMUME_FOOTER_SIZE } from "./constants";
import { analyzePokemon, applyEvolutions, contextOf, previewEvolution } from "./evolve";
import { allPokemon, loadSave } from "./sav4";
import { selfCheck, verifyEvolvedImage } from "./verify";
import {
  joinWrapper,
  SaveError,
  slotKey,
  sortCandidates,
  type Candidate,
  type OpenedSave,
  type SaveAdapter,
  type SlotRef,
} from "../types";

export const gen4Adapter: SaveAdapter = {
  name: "Generation IV",
  games: ["diamond-pearl", "platinum", "heartgold-soulsilver"],

  matches(bytes) {
    return bytes.length === SAVE_SIZE || bytes.length === SAVE_SIZE + DESMUME_FOOTER_SIZE;
  },

  open(bytes): OpenedSave {
    const save = loadSave(bytes);
    const report = selfCheck(save);
    if (!report.canEdit) {
      throw new SaveError("self-check", [...report.roundTripFailures, ...report.checksumFailures].join(", "));
    }
    const ctx = contextOf(save, report.partyCheckPassed);
    const candidates: Candidate[] = [];
    for (const entry of allPokemon(save)) {
      const status = analyzePokemon(entry, ctx);
      if (!status) continue;
      const preview = status.kind === "ready" ? previewEvolution(entry, status.rule, ctx) : undefined;
      candidates.push({ key: slotKey(entry.ref), entry, status, preview });
    }
    return {
      save: { ...save, game: save.layout.game, generation: 4 },
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
