import { getGen4Species } from "../../data/gen4-species";
import { decodeGbString, GEN2_CHARSET } from "../gen1/charset";
import {
  checksum16,
  getFlag,
  levelFromExp,
  readDvs,
  readExp,
  readStatExp,
  readU16be,
  type Dvs,
} from "../gen1/stats";
import { SaveError, type SlotRef } from "../types";
import {
  BOX_BANKS,
  BOX_COUNT,
  BOX_MON_SIZE,
  BOX_MONS,
  BOX_NICKS,
  BOX_SIZE,
  BOX_SLOTS,
  BOXES_PER_BANK,
  CHECK_VALUE_1,
  CHECK_VALUE_2,
  DEX_CAUGHT_FROM_PARTY,
  GAME_START,
  GEN2_LAYOUTS,
  MON_DVS,
  MON_EXP,
  MON_HP,
  MON_ID,
  MON_ITEM,
  MON_LEVEL,
  MON_MAX_HP,
  MON_SPECIES,
  MON_STAT_EXP,
  MON_STATS,
  NAME_LENGTH,
  PARTY_MON_SIZE,
  PARTY_MONS,
  PARTY_NICKS,
  PARTY_SLOTS,
  PLAYER_ID,
  PLAYER_NAME,
  RTC_TRAILER_SIZES,
  SAVE_SIZE,
  SPECIES_EGG,
  type Gen2Layout,
} from "./constants";

export { SaveError, slotKey, type SlotRef } from "../types";

export interface Gen2Info {
  species: number;
  item: number;
  isEgg: boolean;
  id: number;
  exp: number;
  statExp: [number, number, number, number, number];
  dvs: Dvs;
  level: number;
  hp: number;
  nickname: string;
  party?: { maxHp: number; stats: [number, number, number, number, number] };
}

export interface PokemonEntry {
  ref: SlotRef;
  offset: number;
  size: number;
  listOffset: number;
  nickOffset: number;
  /** National dex number (generation II stores it directly). */
  species: number;
  info: Gen2Info;
  level: number;
  box?: number;
}

export interface BoxInfo {
  name: string;
  slots: (PokemonEntry | null)[];
}

export interface LoadedSave {
  layout: Gen2Layout;
  image: Uint8Array;
  /** Real-time clock bytes after the image, restored on export. */
  trailer: Uint8Array;
  trainerName: string;
  trainerId: number;
  currentBox: number;
  party: PokemonEntry[];
  boxes: BoxInfo[];
  unreadable: SlotRef[];
}

/** Offset of the caught flags; the seen flags follow. */
export const dexCaught = (layout: Gen2Layout) => layout.party + DEX_CAUGHT_FROM_PARTY;

/** True when the check values and the 16-bit checksum of this layout are valid. */
function layoutValid(d: Uint8Array, l: Gen2Layout): boolean {
  return (
    d[GAME_START - 1] === CHECK_VALUE_1 &&
    d[l.checkValue2] === CHECK_VALUE_2 &&
    (d[l.checksum]! | (d[l.checksum + 1]! << 8)) === checksum16(d, GAME_START, l.gameEnd)
  );
}

/** The layout of a generation II image, or undefined. */
export function detectLayout(d: Uint8Array): Gen2Layout | undefined {
  if (d.length < SAVE_SIZE) return undefined;
  return GEN2_LAYOUTS.find((l) => layoutValid(d, l));
}

export function looksLikeGen2(d: Uint8Array): boolean {
  return (
    (d.length === SAVE_SIZE || RTC_TRAILER_SIZES.some((n) => d.length === SAVE_SIZE + n)) &&
    detectLayout(d) !== undefined
  );
}

/** Recomputes the main checksum (the backup copy is not touched: the game only reads it when the main one fails). */
export function writeMainChecksum(d: Uint8Array, l: Gen2Layout): void {
  const s = checksum16(d, GAME_START, l.gameEnd);
  d[l.checksum] = s & 0xff;
  d[l.checksum + 1] = s >> 8;
}

export const storedBoxOffset = (n: number) =>
  BOX_BANKS[Math.floor(n / BOXES_PER_BANK)]! + (n % BOXES_PER_BANK) * BOX_SIZE;

function readInfo(d: Uint8Array, at: number, party: boolean, nickAt: number): Gen2Info {
  const species = d[at + MON_SPECIES]!;
  return {
    species,
    item: d[at + MON_ITEM]!,
    isEgg: species === SPECIES_EGG,
    id: readU16be(d, at + MON_ID),
    exp: readExp(d, at + MON_EXP),
    statExp: readStatExp(d, at + MON_STAT_EXP),
    dvs: readDvs(d[at + MON_DVS]!, d[at + MON_DVS + 1]!),
    level: d[at + MON_LEVEL]!,
    hp: party ? readU16be(d, at + MON_HP) : 0,
    nickname: decodeGbString(GEN2_CHARSET, d, nickAt, NAME_LENGTH),
    party: party
      ? {
          maxHp: readU16be(d, at + MON_MAX_HP),
          stats: [0, 1, 2, 3, 4].map((i) => readU16be(d, at + MON_STATS + i * 2)) as [
            number,
            number,
            number,
            number,
            number,
          ],
        }
      : undefined,
  };
}

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
  const count = d[list]!;
  if (count > slots) throw new SaveError("corrupt", `Invalid list size ${count}.`);
  const out: PokemonEntry[] = [];
  for (let i = 0; i < count; i++) {
    const at = list + monsAt + i * monSize;
    const listOffset = list + 1 + i;
    const nickOffset = list + nicksAt + i * NAME_LENGTH;
    const species = d[at + MON_SPECIES]!;
    if (species === 0 || (species > 251 && species !== SPECIES_EGG) || d[listOffset] !== species) {
      unreadable.push(refOf(i));
      continue;
    }
    const info = readInfo(d, at, party, nickOffset);
    out.push({
      ref: refOf(i),
      offset: at,
      size: monSize,
      listOffset,
      nickOffset,
      species,
      info,
      level: info.level,
      box,
    });
  }
  return out;
}

/** A list with a valid count and terminator; stored boxes that fail it are shown as empty. */
const listOk = (d: Uint8Array, at: number) => d[at]! <= BOX_SLOTS && d[at + 1 + d[at]!] === 0xff;

/**
 * Loads and validates a generation II save (Gold, Silver or Crystal, Western versions).
 * @throws SaveError
 */
export function loadSave(input: Uint8Array): LoadedSave {
  const ok = input.length === SAVE_SIZE || RTC_TRAILER_SIZES.some((n) => input.length === SAVE_SIZE + n);
  if (!ok)
    throw new SaveError(
      "unknown-format",
      `A save of this kind is 32 KB (${SAVE_SIZE} bytes) plus at most 48 clock bytes; this file is ${input.length} bytes.`,
    );
  const image = input.slice(0, SAVE_SIZE);
  const trailer = input.slice(SAVE_SIZE);
  const layout = detectLayout(image);
  if (!layout) throw new SaveError("unknown-format", "This file is not a Pokémon save this app can read.");

  const currentBox = image[layout.curBox]!;
  if (currentBox >= BOX_COUNT) throw new SaveError("corrupt", `Invalid current box ${currentBox}.`);
  const unreadable: SlotRef[] = [];
  const party = readList(
    image,
    layout.party,
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
    const at = b === currentBox ? layout.activeBox : storedBoxOffset(b);
    const slots = Array<PokemonEntry | null>(BOX_SLOTS).fill(null);
    if (listOk(image, at)) {
      for (const e of readList(
        image,
        at,
        BOX_SLOTS,
        BOX_MONS,
        BOX_MON_SIZE,
        BOX_NICKS,
        false,
        (i) => ({ area: "box", box: b, slot: i }),
        b,
        unreadable,
      )) {
        slots[(e.ref as { slot: number }).slot] = e;
      }
    }
    boxes.push({ name: `BOX ${b + 1}`, slots });
  }
  return {
    layout,
    image,
    trailer,
    trainerName: decodeGbString(GEN2_CHARSET, image, PLAYER_NAME, NAME_LENGTH),
    trainerId: readU16be(image, PLAYER_ID),
    currentBox,
    party,
    boxes,
    unreadable,
  };
}

export function allPokemon(save: LoadedSave): PokemonEntry[] {
  return [...save.party, ...save.boxes.flatMap((b) => b.slots.filter((s): s is PokemonEntry => s !== null))];
}

/** Base data growth rate of an entry's species. */
export function growthOf(species: number) {
  return getGen4Species(species).growthRate;
}

export { getFlag, levelFromExp };
