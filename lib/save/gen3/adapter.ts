/** Generation III adapter: Ruby/Sapphire, Emerald and FireRed/LeafGreen. */
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
import { analyzePokemon, applyEvolutions, commonEntry, contextOf, previewEvolution } from "./evolve";
import { allPokemon, looksLikeGen3, loadSave } from "./sav3";
import { selfCheck, verifyEvolvedImage } from "./verify";

export const gen3Adapter: SaveAdapter = {
  name: "Generation III",
  games: ["ruby-sapphire", "emerald", "firered-leafgreen"],

  matches: looksLikeGen3,

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
      candidates.push({ key: slotKey(entry.ref), entry: commonEntry(entry, ctx), status, preview });
    }
    return {
      save: {
        game: save.layout.game,
        generation: 3,
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
