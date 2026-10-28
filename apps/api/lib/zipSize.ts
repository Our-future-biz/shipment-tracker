import { inflateRawSync } from "node:zlib";

const EOCD = 0x06054b50;
const CEN = 0x02014b50;
const LOC = 0x04034b50;
const STORED = 0;
const DEFLATED = 8;

/** How far an uploaded workbook may unpack, checked before it is opened. */
export interface ZipLimits {
  /** The most files the zip may hold. */
  maxEntries: number;
  /** The most bytes all its files may unpack to together. */
  maxBytes: number;
}

/**
 * The total size an .xlsx (a zip) unpacks to, found by unpacking each of its files - never past
 * `limits.maxBytes`: once the files declare or unpack to more, a number over the limit is
 * answered and nothing more is unpacked. The guard against a zip bomb: a zip's directory can
 * declare small sizes for files that unpack to gigabytes, and the workbook reader would only notice
 * once it had unpacked them, so the sizes are measured here with every file's output capped at
 * what is left of the limit. Null when the zip cannot be read this way: no directory, more than
 * `maxEntries` files, ZIP64 (which no uploaded workbook needs), encryption, or a compression other
 * than stored or deflated.
 */
export function zipUnpackedBytes(buf: Buffer, limits: ZipLimits): number | null {
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
  if (entries === 0xffff || dirStart === 0xffffffff || entries > limits.maxEntries || dirStart + dirSize > eocd) return null;

  // The declared sizes first: a zip that says it is too big is refused without unpacking anything.
  let declared = 0;
  for (let n = 0, p = dirStart; n < entries; n++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== CEN) return null;
    const size = buf.readUInt32LE(p + 24);
    if (size === 0xffffffff) return null;
    declared += size;
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  if (declared > limits.maxBytes) return declared;

  // Then what the files really unpack to, each capped at what is left of the limit.
  let total = 0;
  for (let n = 0, p = dirStart; n < entries; n++) {
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const packed = buf.readUInt32LE(p + 20);
    const local = buf.readUInt32LE(p + 42);
    if (flags & 0x1 || packed === 0xffffffff || local === 0xffffffff) return null;
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== LOC) return null;
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (dataStart + packed > buf.length) return null;
    const data = buf.subarray(dataStart, dataStart + packed);
    if (method === STORED) {
      total += packed;
    } else if (method === DEFLATED) {
      try {
        total += inflateRawSync(data, { maxOutputLength: limits.maxBytes - total + 1 }).length;
      } catch (err) {
        // Past the cap: more than the limit, however much more.
        if ((err as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE") return limits.maxBytes + 1;
        return null;
      }
    } else {
      return null;
    }
    if (total > limits.maxBytes) return total;
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return total;
}
