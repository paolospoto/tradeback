const SPRITES = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

/**
 * Classic 2D game sprite (96×96 pixel art), used for every Pokémon image and the favicon.
 * Served by PokéAPI; not stored in this repo. Shown unoptimized with pixelated scaling (see globals.css).
 */
export function spriteUrl(id: number): string {
  return `${SPRITES}/${id}.png`;
}
