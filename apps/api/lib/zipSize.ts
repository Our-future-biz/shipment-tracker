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

// One file as the zip's central directory lists it.
interface ZipEntry {
  flags: number;
  method: number;
  packed: number;
  declared: number;
  local: number;
}

/**
 * The files of a zip as its central directory lists them, read the way the workbook reader
 * (exceljs, through JSZip) reads them - or null when the two could read the zip differently, and
 * so this check could measure other bytes than the reader unpacks. JSZip takes the last end
 * record, walks the directory for as long as it finds a directory record (whatever count the end
 * record gives), and shifts every offset when the directory does not end right where the end
 * record starts. So only a plain zip is read: one disk, no ZIP64, the directory ending exactly at
 * the end record, and exactly as many records there as the end record declares.
 */
function centralDirectory(buf: Buffer, maxEntries: number): ZipEntry[] | null {
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
  const disk = buf.readUInt16LE(eocd + 4);
  const dirDisk = buf.readUInt16LE(eocd + 6);
  const onDisk = buf.readUInt16LE(eocd + 8);
  const count = buf.readUInt16LE(eocd + 10);
  const dirSize = buf.readUInt32LE(eocd + 12);
  const dirStart = buf.readUInt32LE(eocd + 16);
  // 0xffff / 0xffffffff would send JSZip to a ZIP64 record with other numbers.
  if (disk !== 0 || dirDisk !== 0 || onDisk !== count || count === 0xffff || count > maxEntries) return null;
  if (dirSize === 0xffffffff || dirStart === 0xffffffff || dirStart + dirSize !== eocd) return null;

  const entries: ZipEntry[] = [];
  let p = dirStart;
  while (p + 4 <= eocd && buf.readUInt32LE(p) === CEN) {
    if (p + 46 > eocd || entries.length >= count) return null;
    entries.push({
      flags: buf.readUInt16LE(p + 8),
      method: buf.readUInt16LE(p + 10),
      packed: buf.readUInt32LE(p + 20),
      declared: buf.readUInt32LE(p + 24),
      local: buf.readUInt32LE(p + 42),
    });
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return p === eocd && entries.length === count ? entries : null;
}

/**
 * The total size an .xlsx (a zip) unpacks to, found by unpacking each of its files - never past
 * `limits.maxBytes`: once the files declare or unpack to more, a number over the limit is
 * answered and nothing more is unpacked. The guard against a zip bomb: a zip's directory can
 * declare small sizes for files that unpack to gigabytes, and the workbook reader would only notice
 * once it had unpacked them, so the sizes are measured here with every file's output capped at
 * what is left of the limit. Null when the zip cannot be read this way: not a plain zip (see
 * centralDirectory), more than `maxEntries` files, encryption, or a compression other than stored
 * or deflated.
 */
export function zipUnpackedBytes(buf: Buffer, limits: ZipLimits): number | null {
  const entries = centralDirectory(buf, limits.maxEntries);
  if (!entries) return null;

  // The declared sizes first: a zip that says it is too big is refused without unpacking anything.
  let declared = 0;
  for (const e of entries) {
    if (e.declared === 0xffffffff || e.packed === 0xffffffff || e.local === 0xffffffff) return null;
    declared += e.declared;
  }
  if (declared > limits.maxBytes) return declared;

  // Then what the files really unpack to, each capped at what is left of the limit.
  let total = 0;
  for (const e of entries) {
    if (e.flags & 0x1) return null;
    if (e.local + 30 > buf.length || buf.readUInt32LE(e.local) !== LOC) return null;
    const dataStart = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
    if (dataStart + e.packed > buf.length) return null;
    const data = buf.subarray(dataStart, dataStart + e.packed);
    if (e.method === STORED) {
      total += e.packed;
    } else if (e.method === DEFLATED) {
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
  }
  return total;
}
