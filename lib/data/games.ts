import type { GameId, Generation } from "../save/types";

/** English names of the supported game groups. */
export const GAME_NAMES: Readonly<Record<GameId, string>> = {
  "red-blue": "Pokémon Red/Blue",
  yellow: "Pokémon Yellow",
  "gold-silver": "Pokémon Gold/Silver",
  crystal: "Pokémon Crystal",
  "ruby-sapphire": "Pokémon Ruby/Sapphire",
  emerald: "Pokémon Emerald",
  "firered-leafgreen": "Pokémon FireRed/LeafGreen",
  "diamond-pearl": "Pokémon Diamond/Pearl",
  platinum: "Pokémon Platinum",
  "heartgold-soulsilver": "Pokémon HeartGold/SoulSilver",
  "black-white": "Pokémon Black/White",
  "black2-white2": "Pokémon Black 2/White 2",
};

export const GAME_GENERATION: Readonly<Record<GameId, Generation>> = {
  "red-blue": 1,
  yellow: 1,
  "gold-silver": 2,
  crystal: 2,
  "ruby-sapphire": 3,
  emerald: 3,
  "firered-leafgreen": 3,
  "diamond-pearl": 4,
  platinum: 4,
  "heartgold-soulsilver": 4,
  "black-white": 5,
  "black2-white2": 5,
};

/** Short names ("Red/Blue") joined into a readable list. */
export function gameList(games: readonly GameId[]): string {
  const names = games.map((g) => GAME_NAMES[g].replace(/^Pokémon /, ""));
  return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
