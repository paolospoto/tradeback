import { STRING_TERMINATOR } from "./constants";

/**
 * Generation IV character table (international glyphs 0x000-0x1EC) and
 * conversion helpers. Korean glyphs (0x400+) are not included in v1: they
 * decode to U+FFFD and Korean-language default names are not written.
 *
 * Sources, compared code by code:
 * - pret/pokeplatinum `tools/msgenc/charmap.txt` (the game's own text encoder).
 * - PKHeX `StringConverter4Util.cs` `TableINT`.
 * Both agree on every letter, digit, kana and punctuation mark. Where they use
 * different Unicode stand-ins for the same game symbol (for example 0x0F1, the
 * Japanese long vowel mark, or full-width gender symbols), the table follows
 * PKHeX so that names read the same as in PKHeX. 0x1BB/0x1BC are the half-width
 * gender symbols, shown as ♂/♀ (PKHeX normalizes them the same way).
 * Code 0x000 and codes without a known glyph are U+0000 (unused).
 */
// prettier-ignore
const TABLE_ROWS = [
  "\u0000\u3000ぁあぃいぅうぇえぉおかがきぎ", // 000
  "くぐけげこごさざしじすずせぜそぞ", // 010
  "ただちぢっつづてでとどなにぬねの", // 020
  "はばぱひびぴふぶぷへべぺほぼぽま", // 030
  "みむめもゃやゅゆょよらりるれろわ", // 040
  "をんァアィイゥウェエォオカガキギ", // 050
  "クグケゲコゴサザシジスズセゼソゾ", // 060
  "タダチヂッツヅテデトドナニヌネノ", // 070
  "ハバパヒビピフブプヘベペホボポマ", // 080
  "ミムメモャヤュユョヨラリルレロワ", // 090
  "ヲン０１２３４５６７８９ＡＢＣＤ", // 0A0
  "ＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴ", // 0B0
  "ＵＶＷＸＹＺａｂｃｄｅｆｇｈｉｊ", // 0C0
  "ｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ", // 0D0
  "\u0000！？、。…・／「」『』（）♂♀", // 0E0
  "＋ー×÷＝～：；．，♠♣♥♦★◎", // 0F0
  "○□△◇＠♪％☀☁☂☃☋♔♕☊⇗", // 100
  "⇘☾円♈♉♊♋♌♍♎♏←↑↓→‣", // 110
  "＆0123456789ABCDE", // 120
  "FGHIJKLMNOPQRSTU", // 130
  "VWXYZabcdefghijk", // 140
  "lmnopqrstuvwxyzÀ", // 150
  "ÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐ", // 160
  "ÑÒÓÔÕÖ×ØÙÚÛÜÝÞßà", // 170
  "áâãäåæçèéêëìíîïð", // 180
  "ñòóôõö÷øùúûüýþÿŒ", // 190
  "œŞşªº¹²³$¡¿!?,.…", // 1A0
  "･/‘'“”„«»()♂♀+-*", // 1B0
  "#=&~:;♠♣♥♦★◉●■▲◆", // 1C0
  "@♪%☀☁☂☃☺♚♛☹↗↘☽ ⁴", // 1D0
  "₧₦\u0000\u0000\u0000\u0000\u0000\u0000°_＿\u0000\u0000", // 1E0
];

const UNUSED = "\u0000";
const DECODE: readonly string[] = Array.from(TABLE_ROWS.join(""));

/** Encoding preferences: for symbols present twice, Latin text uses the half-width code (higher index). */
const ENCODE = new Map<string, number>();
for (let code = 0; code < DECODE.length; code++) {
  const ch = DECODE[code]!;
  if (ch !== UNUSED) ENCODE.set(ch, code);
}
// Aliases accepted when encoding (same glyph, different Unicode code point).
ENCODE.set("\u2019", 0x1b3); // ’ (right single quotation mark) -> apostrophe
ENCODE.set("\uff0d", 0x0f1); // － (pret's stand-in for the long vowel mark)

/** Number of glyphs in the international table. */
export const CHARSET_SIZE = DECODE.length;

/**
 * Decodes a Generation IV string (u16 little-endian codes, ends at 0xFFFF or 0x0000).
 * @param data Bytes holding the string.
 * @param offset Start offset.
 * @param maxChars Maximum number of u16 codes to read.
 * @returns The decoded text; unknown codes become U+FFFD.
 */
export function decodeGen4String(data: Uint8Array, offset: number, maxChars: number): string {
  let out = "";
  for (let i = 0; i < maxChars; i++) {
    const code = data[offset + i * 2]! | (data[offset + i * 2 + 1]! << 8);
    if (code === STRING_TERMINATOR || code === 0) break;
    const ch = DECODE[code];
    out += ch === undefined || ch === UNUSED ? "\ufffd" : ch;
  }
  return out;
}

/**
 * Encodes text into Generation IV codes.
 * @param text Text to encode.
 * @returns The codes, without terminator.
 * @throws Error when a character has no Generation IV glyph.
 */
export function encodeGen4Chars(text: string): number[] {
  return Array.from(text).map((ch) => {
    const code = ENCODE.get(ch);
    if (code === undefined) throw new Error(`Character "${ch}" cannot be written in a Generation IV save`);
    return code;
  });
}

/**
 * Writes text the way the game does when it renames a Pokémon: the codes,
 * then one 0xFFFF terminator. Bytes after the terminator are left untouched
 * (pret src/string_gf.c `String_ToChars` copies size + 1 codes only).
 * @param data Destination buffer.
 * @param offset Start offset.
 * @param maxChars Capacity in u16 codes, terminator included.
 * @param text Text to write.
 * @throws RangeError when the text plus terminator does not fit.
 */
export function writeGen4String(data: Uint8Array, offset: number, maxChars: number, text: string): void {
  const codes = encodeGen4Chars(text);
  if (codes.length + 1 > maxChars)
    throw new RangeError(`"${text}" does not fit in ${maxChars - 1} characters`);
  codes.push(STRING_TERMINATOR);
  codes.forEach((code, i) => {
    data[offset + i * 2] = code & 0xff;
    data[offset + i * 2 + 1] = code >>> 8;
  });
}
