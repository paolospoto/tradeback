/**
 * Pokémon LCRNG used to encrypt PK4 and PK5 data: seed = seed * 0x41C64E6D + 0x6073,
 * XOR key = seed >> 16. Source: PKHeX PokeCrypto.cs `CryptArray`; pret src/pokemon.c
 * `Pokemon_EncryptData`.
 */
export const LCRNG_MULT = 0x41c64e6d;
export const LCRNG_ADD = 0x6073;

/**
 * Advances the Generation III/IV LCRNG by one step.
 * @param seed Current 32-bit seed.
 * @returns Next 32-bit seed.
 */
export function lcrngNext(seed: number): number {
  // Math.imul keeps the multiplication in 32-bit integer space.
  return (Math.imul(seed, LCRNG_MULT) + LCRNG_ADD) >>> 0;
}

/**
 * XORs every little-endian u16 of `data` with the high half of successive LCRNG
 * states, starting from `seed`. The operation is its own inverse.
 *
 * Source: PKHeX PokeCrypto.cs `CryptArray`; pret src/pokemon.c `Pokemon_EncryptData`.
 * @param data Bytes to transform in place; length must be even.
 * @param seed Initial seed (PK4 checksum for the blocks, PID for party stats).
 */
export function cryptArray(data: Uint8Array, seed: number): void {
  if (data.length % 2 !== 0) throw new RangeError("cryptArray needs an even number of bytes");
  let s = seed >>> 0;
  for (let i = 0; i < data.length; i += 2) {
    s = lcrngNext(s);
    const key = s >>> 16;
    data[i]! ^= key & 0xff;
    data[i + 1]! ^= key >>> 8;
  }
}
