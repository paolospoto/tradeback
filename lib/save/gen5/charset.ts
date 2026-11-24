/**
 * Generation V text: UTF-16 code units, 0xFFFF terminator. Names the app writes
 * (species names in Latin script) need no remapping; the private-use codes the
 * game keeps for a few symbols are shown as they are.
 * Source: PKHeX PK5.cs (nickname 11 x u16 at 0x48); checked on the real saves.
 */
export function decodeGen5String(data: Uint8Array, offset: number, maxChars: number): string {
  let out = "";
  for (let i = 0; i < maxChars; i++) {
    const c = data[offset + i * 2]! | (data[offset + i * 2 + 1]! << 8);
    if (c === 0xffff || c === 0) break;
    out += String.fromCharCode(c);
  }
  return out;
}

/**
 * Writes a string followed by the terminator. Bytes after the terminator are left as
 * they are (the game does the same: real saves keep leftovers there).
 * @throws RangeError when the text does not fit with its terminator.
 */
export function writeGen5String(data: Uint8Array, offset: number, maxChars: number, text: string): void {
  if (text.length >= maxChars) throw new RangeError(`"${text}" does not fit in ${maxChars - 1} characters`);
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    data[offset + i * 2] = c & 0xff;
    data[offset + i * 2 + 1] = c >>> 8;
  }
  data[offset + text.length * 2] = 0xff;
  data[offset + text.length * 2 + 1] = 0xff;
}
