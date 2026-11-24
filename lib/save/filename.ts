/**
 * Name of the evolved file: the uploaded name plus "_evolved", keeping the
 * extension, since Delta exports battery saves as .sav or .dsv.
 */
export function evolvedFileName(original: string): string {
  const match = /^(.*?)(\.(?:sav|dsv))?$/i.exec(original)!;
  return `${match[1] || "salvataggio"}_evolved${match[2] ?? ".sav"}`;
}
