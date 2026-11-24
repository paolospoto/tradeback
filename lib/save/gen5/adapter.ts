/** Generation V adapter: Black/White and Black 2/White 2. */
import { DESMUME_FOOTER_SIZE } from "../gen4/constants";
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
import { SAVE_SIZE } from "./constants";
import { analyzePokemon, applyEvolutions, contextOf, findPartners, previewEvolution } from "./evolve";
import { allPokemon, detectLayout, loadSave } from "./sav5";
import { selfCheck, verifyEvolvedImage } from "./verify";

export const gen5Adapter: SaveAdapter = {
  name: "Generation V",
  games: ["black-white", "black2-white2"],

  matches(bytes) {
    if (bytes.length !== SAVE_SIZE && bytes.length !== SAVE_SIZE + DESMUME_FOOTER_SIZE) return false;
    return detectLayout(bytes.subarray(0, SAVE_SIZE)) !== undefined;
  },

  open(bytes): OpenedSave {
    const save = loadSave(bytes);
    const report = selfCheck(save);
    if (!report.canEdit) {
      throw new SaveError("self-check", [...report.roundTripFailures, ...report.checksumFailures].join(", "));
    }
    const ctx = contextOf(save, report.partyCheckPassed);
    const entries = allPokemon(save);
    const partners = findPartners(entries, ctx);
    const candidates: Candidate[] = [];
    for (const entry of entries) {
      const key = slotKey(entry.ref);
      const partner = partners.get(key);
      const status = analyzePokemon(entry, ctx, partner);
      if (!status) continue;
      const preview =
        status.kind === "ready" ? previewEvolution(entry, status.rule, ctx, partner) : undefined;
      candidates.push({ key, entry, status, preview });
    }
    return {
      save: { ...save, game: save.layout.game, generation: 5 },
      check: {
        canEdit: true,
        partyCheckPassed: report.partyCheckPassed,
        problems: report.party.filter((p) => p.result === "mismatch").map((p) => `party stats ${p.key}`),
      },
      candidates: sortCandidates(candidates),
      evolve(refs: readonly SlotRef[]) {
        try {
          // A Karrablast or Shelmet always evolves together with its partner.
          const all = new Map(refs.map((r) => [slotKey(r), r]));
          for (const r of refs) {
            const partner = partners.get(slotKey(r));
            if (partner) all.set(slotKey(partner.ref), partner.ref);
          }
          const { image, applied } = applyEvolutions(save, [...all.values()], ctx, partners);
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
