/**
 * Types shared by every game adapter. The UI depends only on these and on
 * `openSave` (lib/save/index.ts), never on a specific save format.
 */
import type { TradeEvolution } from "../data/trade-evolutions";

export type Generation = 1 | 2 | 3 | 4 | 5;

/** Supported game groups (games that share a save layout). */
export type GameId =
  | "red-blue"
  | "yellow"
  | "gold-silver"
  | "crystal"
  | "ruby-sapphire"
  | "emerald"
  | "firered-leafgreen"
  | "diamond-pearl"
  | "platinum"
  | "heartgold-soulsilver"
  | "black-white"
  | "black2-white2";

export type StatSix = [number, number, number, number, number, number];

/** Where a Pokémon lives in the save. */
export type SlotRef = { area: "party"; index: number } | { area: "box"; box: number; slot: number };

/** Stable string key for a slot. */
export function slotKey(ref: SlotRef): string {
  return ref.area === "party" ? `party-${ref.index}` : `box-${ref.box}-${ref.slot}`;
}

/** Facts about a Pokémon that every generation can provide. */
export interface MonInfo {
  /** National Pokédex number (generation I internal indexes are converted). */
  species: number;
  /**
   * Held item as a generation IV item index (the ids used by
   * lib/data/trade-evolutions.ts and the display names); 0 when none. Adapters
   * convert their own item ids; items that matter for evolutions are always mapped.
   */
  heldItem: number;
  isEgg: boolean;
  isNicknamed: boolean;
  nickname: string;
}

export interface PokemonEntry {
  ref: SlotRef;
  info: MonInfo;
  level: number;
}

export interface BoxInfo {
  name: string;
  slots: (PokemonEntry | null)[];
}

/** The game-independent view of a loaded save. */
export interface GameSave {
  game: GameId;
  generation: Generation;
  trainerName: string;
  party: PokemonEntry[];
  boxes: BoxInfo[];
  /** Slots holding data the game itself would reject; never touched. */
  unreadable: SlotRef[];
}

/** Why a trade-evolving Pokémon cannot be evolved. */
export type BlockReason =
  /** Holding an Everstone. */
  | "everstone"
  /** Not holding the item the evolution needs. */
  | "missing-item"
  /** The game would rename it, but its name cannot be written (e.g. Korean games). */
  | "unsupported-language"
  /** Party Pokémon whose stored level does not match its experience. */
  | "level-mismatch"
  /** Party evolutions are disabled because the stat self-check failed. */
  | "party-check-failed"
  /** FireRed/LeafGreen without the National Pokédex: the target is outside the Kanto Pokédex. */
  | "national-dex"
  /** Karrablast/Shelmet: they only evolve when traded for each other, and the partner is missing or blocked. */
  | "needs-partner";

export type EvolutionStatus =
  | { kind: "ready"; rule: TradeEvolution }
  | { kind: "blocked"; reason: BlockReason; rules: readonly TradeEvolution[] };

/** What an evolution will change. Optional fields depend on the generation. */
export interface EvolutionPreview {
  ref: SlotRef;
  from: number;
  to: number;
  level: number;
  /** Item consumed by the evolution (generation IV item index). */
  consumedItem?: number;
  /** Item kept (plain trade evolutions keep what they hold). */
  keptItem?: number;
  oldAbility?: number;
  newAbility?: number;
  nickname: string;
  /** New name when the Pokémon has no nickname; undefined when the nickname is kept. */
  newName?: string;
  oldStats?: StatSix;
  newStats?: StatSix;
  /** Karrablast/Shelmet: the Pokémon it is traded for, which evolves too. */
  partner?: SlotRef;
}

/** A Pokémon that evolves by trade, with what stands in its way (if anything). */
export interface Candidate {
  key: string;
  entry: PokemonEntry;
  status: EvolutionStatus;
  /** Present when the status is "ready". */
  preview?: EvolutionPreview;
}

/** Outcome of the checks run on the original file before any change. */
export interface SelfCheckSummary {
  /** False only for problems that make editing unsafe; `openSave` throws in that case. */
  canEdit: boolean;
  /** False when party Pokémon must not be evolved (stats do not match the formula). */
  partyCheckPassed: boolean;
  problems: string[];
}

export type EvolveOutcome =
  /** The new file, wrapper included, already verified. */
  { ok: true; bytes: Uint8Array; previews: EvolutionPreview[] } | { ok: false; problems: string[] };

/** A save opened by its adapter, ready for the UI. */
export interface OpenedSave {
  save: GameSave;
  check: SelfCheckSummary;
  /** Every trade-evolution candidate, ready ones first. */
  candidates: Candidate[];
  /**
   * Evolves the given Pokémon on a copy of the file and verifies the result.
   * Never modifies the opened save.
   */
  evolve(refs: readonly SlotRef[]): EvolveOutcome;
}

/** One save format (a generation, or a family of games sharing a layout). */
export interface SaveAdapter {
  name: string;
  /** Game groups this adapter can open. */
  games: readonly GameId[];
  /** Cheap check: does this file look like this adapter's format (size, signatures)? */
  matches(bytes: Uint8Array): boolean;
  /** Parses and checks the file. @throws SaveError */
  open(bytes: Uint8Array): OpenedSave;
}

/** Machine-readable reasons a file is rejected; the UI maps them to messages. */
export type SaveErrorCode =
  /** Not a save of any supported game. */
  | "unknown-format"
  /** A known game in a version we do not support yet (e.g. Japanese generation I). */
  | "unsupported-version"
  /** Invalid checksum or impossible values. */
  | "corrupt"
  /** The save's internal copies or sections disagree. */
  | "inconsistent"
  /** The Pokédex data is not where the game keeps it. */
  | "pokedex"
  /** The safety checks on the original file failed. */
  | "self-check";

/** Error thrown when a file cannot be used. Nothing is ever written in that case. */
export class SaveError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SaveError";
  }
}

/** Puts ready candidates first, keeping the party/box order inside each group. */
export function sortCandidates(list: Candidate[]): Candidate[] {
  return [...list.filter((c) => c.preview), ...list.filter((c) => !c.preview)];
}

/** Joins an image and the bytes an emulator appended to it. */
export function joinWrapper(image: Uint8Array, trailer: Uint8Array): Uint8Array {
  const out = new Uint8Array(image.length + trailer.length);
  out.set(image);
  out.set(trailer, image.length);
  return out;
}
