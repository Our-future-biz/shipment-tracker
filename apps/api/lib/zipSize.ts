/**
 * The total size an .xlsx (a zip) unpacks to, as its central directory declares it, read without
 * unpacking anything; null when the directory cannot be read, holds more than `maxEntries` files,
 * or needs ZIP64 (which no uploaded workbook does). The first guard against a zip bomb: the zip
 * reader of exceljs refuses a part whose unpacked size differs from what is declared, but only
 * once it has unpacked it.
 */
export function zipUnpackedBytes(buf: Buffer, maxEntries: number): number | null {
  const EOCD = 0x06054b50;
  const CEN = 0x02014b50;
  if (buf.length < 22) return null;
  const from = Math.max(0, buf.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = buf.readUInt16LE(eocd + 10);
  const dirSize = buf.readUInt32LE(eocd + 12);
  const dirStart = buf.readUInt32LE(eocd + 16);
  if (entries === 0xffff || dirStart === 0xffffffff || entries > maxEntries || dirStart + dirSize > eocd) return null;
  let total = 0;
  let p = dirStart;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== CEN) return null;
    const size = buf.readUInt32LE(p + 24);
    if (size === 0xffffffff) return null;
    total += size;
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return total;
}
