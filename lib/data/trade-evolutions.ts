/**
 * Trade evolutions of generations I–V. `since` says from which generation each one exists.
 *
 * Sources:
 * - pret/pokeplatinum `res/pokemon/<species>/data.json` `evolutions` entries with
 *   EVO_TRADE / EVO_TRADE_WITH_HELD_ITEM: exactly these 17 rows, no others.
 * - Item indexes: pret `generated/items.txt`, cross-checked with PokéAPI
 *   `item_game_indices.csv` (generation 4).
 * - Species numbers: pret `generated/species.txt` (= national dex).
 *
 * Behaviour notes (pret src/pokemon.c `Pokemon_GetEvolutionTargetSpeciesByMethod`
 * and src/evolution.c):
 * - Everstone blocks every trade evolution except Kadabra's: the game skips the
 *   Everstone check when the species is Kadabra.
 * - The held item is removed only for EVO_TRADE_WITH_HELD_ITEM.
 */

export interface TradeEvolution {
  from: number;
  to: number;
  /** Held item required (and consumed), as a generation IV item index; undefined for plain trade evolutions. */
  item?: number;
  /** First generation where this evolution exists. */
  since: 1 | 2 | 3 | 4 | 5;
  /** Karrablast/Shelmet: the species it must be traded for (both evolve). */
  partner?: number;
}

/** Item indexes (Generation IV). */
export const ITEMS = {
  KINGS_ROCK: 221,
  DEEP_SEA_TOOTH: 226,
  DEEP_SEA_SCALE: 227,
  EVERSTONE: 229,
  METAL_COAT: 233,
  DRAGON_SCALE: 235,
  UPGRADE: 252,
  PROTECTOR: 321,
  ELECTIRIZER: 322,
  MAGMARIZER: 323,
  DUBIOUS_DISC: 324,
  REAPER_CLOTH: 325,
} as const;

/** Species numbers used by special rules. */
export const SPECIES = { KADABRA: 64, KARRABLAST: 588, SHELMET: 616 } as const;

export const TRADE_EVOLUTIONS: readonly TradeEvolution[] = [
  { from: 64, to: 65, since: 1 }, // Kadabra -> Alakazam
  { from: 67, to: 68, since: 1 }, // Machoke -> Machamp
  { from: 75, to: 76, since: 1 }, // Graveler -> Golem
  { from: 93, to: 94, since: 1 }, // Haunter -> Gengar
  { from: 61, to: 186, item: ITEMS.KINGS_ROCK, since: 2 }, // Poliwhirl -> Politoed
  { from: 79, to: 199, item: ITEMS.KINGS_ROCK, since: 2 }, // Slowpoke -> Slowking
  { from: 95, to: 208, item: ITEMS.METAL_COAT, since: 2 }, // Onix -> Steelix
  { from: 123, to: 212, item: ITEMS.METAL_COAT, since: 2 }, // Scyther -> Scizor
  { from: 117, to: 230, item: ITEMS.DRAGON_SCALE, since: 2 }, // Seadra -> Kingdra
  { from: 137, to: 233, item: ITEMS.UPGRADE, since: 2 }, // Porygon -> Porygon2
  { from: 233, to: 474, item: ITEMS.DUBIOUS_DISC, since: 4 }, // Porygon2 -> Porygon-Z
  { from: 112, to: 464, item: ITEMS.PROTECTOR, since: 4 }, // Rhydon -> Rhyperior
  { from: 125, to: 466, item: ITEMS.ELECTIRIZER, since: 4 }, // Electabuzz -> Electivire
  { from: 126, to: 467, item: ITEMS.MAGMARIZER, since: 4 }, // Magmar -> Magmortar
  { from: 356, to: 477, item: ITEMS.REAPER_CLOTH, since: 4 }, // Dusclops -> Dusknoir
  { from: 366, to: 367, item: ITEMS.DEEP_SEA_TOOTH, since: 3 }, // Clamperl -> Huntail
  { from: 366, to: 368, item: ITEMS.DEEP_SEA_SCALE, since: 3 }, // Clamperl -> Gorebyss
  // Generation V: only when traded for each other (pret has no gen V decomp).
  { from: 588, to: 589, since: 5, partner: 616 }, // Karrablast -> Escavalier
  { from: 616, to: 617, since: 5, partner: 588 }, // Shelmet -> Accelgor
];

/** Species that evolve by trade, for quick lookups. */
export const TRADE_EVOLVING_SPECIES: ReadonlySet<number> = new Set(TRADE_EVOLUTIONS.map((e) => e.from));

/**
 * Trade evolution rules for a species in a given generation (two for Clamperl).
 * @param generation Defaults to 4, the generation the first version supported.
 */
export function tradeEvolutionsOf(
  species: number,
  generation: 1 | 2 | 3 | 4 | 5 = 4,
): readonly TradeEvolution[] {
  return TRADE_EVOLUTIONS.filter((e) => e.from === species && e.since <= generation);
}
