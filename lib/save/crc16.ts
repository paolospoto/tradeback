/**
 * CRC-16/CCITT-FALSE (polynomial 0x1021, initial value 0xFFFF, no reflection,
 * no final XOR), used by Generation IV save block footers.
 *
 * Source: PKHeX Checksums.cs `CRC16_CCITT` (initial top/bottom bytes 0xFF) and
 * pret src/savedata.c `CalcCRC16Checksum(start, size - sizeof(SaveBlockFooter))`.
 * Check value: "123456789" -> 0x29B1.
 */

const TABLE: Uint16Array = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    t[i] = crc;
  }
  return t;
})();

/**
 * Computes the CRC-16/CCITT-FALSE of a byte range.
 * @param data Bytes to checksum.
 * @returns The 16-bit checksum.
 */
export function crc16Ccitt(data: Uint8Array): number {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc = ((crc << 8) & 0xffff) ^ TABLE[((crc >> 8) ^ data[i]!) & 0xff]!;
  }
  return crc;
}
