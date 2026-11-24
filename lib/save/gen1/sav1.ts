import { getGen1Species, gen1ToNational, MAX_SPECIES_GEN1 } from "../../data/gen1-species";
import { SaveError, type SlotRef } from "../types";
import { decodeGbString, GEN1_CHARSET } from "./charset";
import {
  BANK_ALL_CHECKSUM,
  BANK_BOX_CHECKSUMS,
  BOX_BANKS,
  BOX_CHANGED_BIT,
  BOX_COUNT,
  BOX_MON_SIZE,
  BOX_MONS,
  BOX_NICKS,
  BOX_NUM_MASK,
  BOX_SIZE,
  BOX_SLOTS,
  BOXES_PER_BANK,
  CHECKSUM_OFFSET,
  CHECKSUM_START,
  CUR_BOX,
  CURRENT_BOX_NUM,
  LIST_COUNT,
  LIST_SPECIES,
  MON_BOX_LEVEL,
  MON_DVS,
  MON_EXP,
  MON_HP,
  MON_LEVEL,
  MON_MAX_HP,
  MON_OT_ID,
  MON_SPECIES,
  MON_STAT_EXP,
  MON_STATS,
  NAME_LENGTH,
  PARTY,
  PARTY_MON_SIZE,
  PARTY_MONS,
  PARTY_NICKS,
  PARTY_SLOTS,
  PIKACHU_FRIENDSHIP,
  PLAYER_ID,
  PLAYER_NAME,
  SAVE_SIZE,
  STARTER,
  STARTER_PIKACHU,
} from "./constants";
import { checksum8, levelFromExp, readDvs, readExp, readStatExp, readU16be, type Dvs } from "./stats";

export { SaveError, slotKey, type SlotRef } from "../types";

/** Facts about one Pokémon (generation I). */
export interface Gen1Info {
  internal: number;
  hp: number;
  boxLevel: number;
  otId: number;
  exp: number;
  statExp: [number, number, number, number, number];
  dvs: Dvs;
  nickname: string;
  party?: { level: number; maxHp: number; stats: [number, number, number, number] };
}

export interface PokemonEntry {
  ref: SlotRef;
  /** Absolute offset of the Pokémon structure. */
  offset: number;
  size: number;
  /** Absolute offset of its byte in the species list (kept equal to the structure's species). */
  listOffset: number;
  /** Absolute offset of its 11-byte nickname. */
  nickOffset: number;
  /** National dex number. */
  species: number;
  info: Gen1Info;
  level: number;
  /** Stored box of the Pokémon: 0-11, or undefined for the party. */
  box?: number;
}

export interface BoxInfo {
  name: string;
  slots: (PokemonEntry | null)[];
}

export interface LoadedSave {
  game: "red-blue" | "yellow";
  image: Uint8Array;
  trailer: Uint8Array;
  trainerName: string;
  trainerId: number;
  currentBox: number;
  /** False until the player changes boxes for the first time; the stored boxes hold garbage then. */
  storedBoxesValid: boolean;
  party: PokemonEntry[];
  boxes: BoxInfo[];
  unreadable: SlotRef[];
}

/** A list (count, species list with terminator) that is well formed. Source: PKHeX SaveUtil.cs `IsListValidG12`. */
export function isListValid(d: Uint8Array, offset: number, maxCount: number): boolean {
  const count = d[offset]!;
  return count <= maxCount && d[offset + 1 + count] === 0xff;
}

/** True when the image has the generation I party and current box lists and a valid main checksum. */
export function looksLikeGen1(d: Uint8Array): boolean {
  return (
    d.length >= SAVE_SIZE &&
    isListValid(d, PARTY, PARTY_SLOTS) &&
    isListValid(d, CUR_BOX, BOX_SLOTS) &&
    checksum8(d, CHECKSUM_START, CHECKSUM_OFFSET) === d[CHECKSUM_OFFSET]
  );
}

export function isYellow(d: Uint8Array): boolean {
  const starter = d[STARTER]!;
  return starter !== 0 ? starter === STARTER_PIKACHU : d[PIKACHU_FRIENDSHIP] !== 0;
}

/** Recomputes the main checksum. */
export function writeMainChecksum(d: Uint8Array): void {
  d[CHECKSUM_OFFSET] = checksum8(d, CHECKSUM_START, CHECKSUM_OFFSET);
}

/** Absolute offset of stored box `n` (0-11) in banks 2 and 3. */
export function storedBoxOffset(n: number): number {
  return BOX_BANKS[Math.floor(n / BOXES_PER_BANK)]! + (n % BOXES_PER_BANK) * BOX_SIZE;
}

/** Recomputes the checksums of the bank that holds stored box `n`: all six boxes, and one per box. Source: pret save.asm `CalcIndividualBoxCheckSums`. */
export function writeBankChecksums(d: Uint8Array, n: number): void {
  const bank = BOX_BANKS[Math.floor(n / BOXES_PER_BANK)]!;
  d[bank + BANK_ALL_CHECKSUM] = checksum8(d, bank, bank + BANK_ALL_CHECKSUM);
  for (let i = 0; i < BOXES_PER_BANK; i++) {
    d[bank + BANK_BOX_CHECKSUMS + i] = checksum8(d, bank + i * BOX_SIZE, bank + (i + 1) * BOX_SIZE);
  }
}

/** Banks whose stored checksums are wrong. */
export function badBankChecksums(d: Uint8Array): number[] {
  const bad: number[] = [];
  BOX_BANKS.forEach((bank, b) => {
    const ok =
      d[bank + BANK_ALL_CHECKSUM] === checksum8(d, bank, bank + BANK_ALL_CHECKSUM) &&
      Array.from({ length: BOXES_PER_BANK }, (_, i) => i).every(
        (i) =>
          d[bank + BANK_BOX_CHECKSUMS + i] === checksum8(d, bank + i * BOX_SIZE, bank + (i + 1) * BOX_SIZE),
      );
    if (!ok) bad.push(b);
  });
  return bad;
}

function readInfo(d: Uint8Array, offset: number, party: boolean, nickOffset: number): Gen1Info {
  return {
    internal: d[offset + MON_SPECIES]!,
    hp: readU16be(d, offset + MON_HP),
    boxLevel: d[offset + MON_BOX_LEVEL]!,
    otId: readU16be(d, offset + MON_OT_ID),
    exp: readExp(d, offset + MON_EXP),
    statExp: readStatExp(d, offset + MON_STAT_EXP),
    dvs: readDvs(d[offset + MON_DVS]!, d[offset + MON_DVS + 1]!),
    nickname: decodeGbString(GEN1_CHARSET, d, nickOffset, NAME_LENGTH),
    party: party
      ? {
          level: d[offset + MON_LEVEL]!,
          maxHp: readU16be(d, offset + MON_MAX_HP),
          stats: [
            readU16be(d, offset + MON_STATS + 2),
            readU16be(d, offset + MON_STATS + 4),
            readU16be(d, offset + MON_STATS + 6),
            readU16be(d, offset + MON_STATS + 8),
          ],
        }
      : undefined,
  };
}

/** Reads the Pokémon of one list. `list` is the absolute offset of the count byte. */
function readList(
  d: Uint8Array,
  list: number,
  slots: number,
  monsAt: number,
  monSize: number,
  nicksAt: number,
  party: boolean,
  refOf: (i: number) => SlotRef,
  box: number | undefined,
  unreadable: SlotRef[],
): PokemonEntry[] {
  const count = d[list + LIST_COUNT]!;
  if (count > slots) throw new SaveError("corrupt", `Invalid list size ${count}.`);
  const out: PokemonEntry[] = [];
  for (let i = 0; i < count; i++) {
    const offset = list + monsAt + i * monSize;
    const listOffset = list + LIST_SPECIES + i;
    const nickOffset = list + nicksAt + i * NAME_LENGTH;
    const internal = d[offset + MON_SPECIES]!;
    const species = gen1ToNational(internal);
    if (species === 0 || species > MAX_SPECIES_GEN1 || d[listOffset] !== internal) {
      unreadable.push(refOf(i));
      continue;
    }
    const info = readInfo(d, offset, party, nickOffset);
    const level = info.party ? info.party.level : levelFromExp(getGen1Species(species).growthRate, info.exp);
    out.push({ ref: refOf(i), offset, size: monSize, listOffset, nickOffset, species, info, level, box });
  }
  return out;
}

/**
 * Loads and validates a generation I save (Red, Blue or Yellow, Western versions).
 * @throws SaveError
 */
export function loadSave(input: Uint8Array): LoadedSave {
  if (input.length !== SAVE_SIZE) {
    throw new SaveError(
      "unknown-format",
      `A save of this kind is exactly 32 KB (${SAVE_SIZE} bytes); this file is ${input.length} bytes.`,
    );
  }
  const image = input.slice();
  if (!looksLikeGen1(image))
    throw new SaveError("unknown-format", "This file is not a Pokémon save this app can read.");

  const boxNum = image[CURRENT_BOX_NUM]!;
  const currentBox = boxNum & BOX_NUM_MASK;
  const storedBoxesValid = (boxNum & BOX_CHANGED_BIT) !== 0;
  if (currentBox >= BOX_COUNT) throw new SaveError("corrupt", `Invalid current box ${currentBox}.`);
  if (storedBoxesValid && badBankChecksums(image).length > 0) {
    throw new SaveError("corrupt", "The stored boxes fail their checksum: the game would not load them.");
  }

  const unreadable: SlotRef[] = [];
  const party = readList(
    image,
    PARTY,
    PARTY_SLOTS,
    PARTY_MONS,
    PARTY_MON_SIZE,
    PARTY_NICKS,
    true,
    (i) => ({ area: "party", index: i }),
    undefined,
    unreadable,
  );

  const boxes: BoxInfo[] = [];
  for (let b = 0; b < BOX_COUNT; b++) {
    const name = `BOX ${b + 1}`;
    const list = b === currentBox ? CUR_BOX : storedBoxesValid ? storedBoxOffset(b) : undefined;
    if (list === undefined || (b !== currentBox && image[list]! > BOX_SLOTS)) {
      // The game would see an empty box; an out-of-range count in an unused slot is treated the same way.
      boxes.push({ name, slots: Array<PokemonEntry | null>(BOX_SLOTS).fill(null) });
      continue;
    }
    const entries = readList(
      image,
      list,
      BOX_SLOTS,
      BOX_MONS,
      BOX_MON_SIZE,
      BOX_NICKS,
      false,
      (i) => ({ area: "box", box: b, slot: i }),
      b,
      unreadable,
    );
    const slots = Array<PokemonEntry | null>(BOX_SLOTS).fill(null);
    for (const e of entries) slots[(e.ref as { slot: number }).slot] = e;
    boxes.push({ name, slots });
  }

  return {
    game: isYellow(image) ? "yellow" : "red-blue",
    image,
    trailer: new Uint8Array(0),
    trainerName: decodeGbString(GEN1_CHARSET, image, PLAYER_NAME, NAME_LENGTH),
    trainerId: readU16be(image, PLAYER_ID),
    currentBox,
    storedBoxesValid,
    party,
    boxes,
    unreadable,
  };
}

/** Iterates over every Pokémon (party first, then boxes in order). */
export function allPokemon(save: LoadedSave): PokemonEntry[] {
  return [...save.party, ...save.boxes.flatMap((b) => b.slots.filter((s): s is PokemonEntry => s !== null))];
}
