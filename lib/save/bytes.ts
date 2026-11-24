/** Little-endian helpers over Uint8Array (no DataView allocation per call). */

export function readU16(d: Uint8Array, o: number): number {
  return d[o]! | (d[o + 1]! << 8);
}

export function readU32(d: Uint8Array, o: number): number {
  return (d[o]! | (d[o + 1]! << 8) | (d[o + 2]! << 16) | (d[o + 3]! << 24)) >>> 0;
}

export function writeU16(d: Uint8Array, o: number, v: number): void {
  d[o] = v & 0xff;
  d[o + 1] = (v >>> 8) & 0xff;
}

export function writeU32(d: Uint8Array, o: number, v: number): void {
  d[o] = v & 0xff;
  d[o + 1] = (v >>> 8) & 0xff;
  d[o + 2] = (v >>> 16) & 0xff;
  d[o + 3] = (v >>> 24) & 0xff;
}

/** Returns true when two byte arrays have the same length and content. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
