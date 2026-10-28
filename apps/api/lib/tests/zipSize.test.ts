import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { zipUnpackedBytes } from "../zipSize";

interface ZipFile {
  name: string;
  data: Buffer;
  /** Stored instead of deflated. */
  stored?: boolean;
  /** The unpacked size the directory declares, when it lies. */
  declared?: number;
}

// A zip built by hand: local headers with the files, the central directory, its end record.
function zipOf(files: ZipFile[], { flags = 0 }: { flags?: number } = {}): Buffer {
  const locals: Buffer[] = [];
  const dir: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const packed = f.stored ? f.data : deflateRawSync(f.data);
    const method = f.stored ? 0 : 8;
    const size = f.declared ?? f.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(flags, 8);
    cen.writeUInt16LE(method, 10);
    cen.writeUInt32LE(packed.length, 20);
    cen.writeUInt32LE(size, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    locals.push(local, name, packed);
    dir.push(cen, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(dir);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const LIMITS = { maxEntries: 10, maxBytes: 1024 * 1024 };

describe("zipUnpackedBytes", () => {
  it("adds up what the files unpack to, deflated or stored", () => {
    const zip = zipOf([
      { name: "a.xml", data: Buffer.alloc(5000, "a") },
      { name: "b.bin", data: Buffer.from("plain"), stored: true },
    ]);
    expect(zipUnpackedBytes(zip, LIMITS)).toBe(5005);
  });

  it("answers more than the limit for a zip that declares too much, without unpacking it", () => {
    const zip = zipOf([{ name: "a.xml", data: Buffer.from("small"), declared: 2 * 1024 * 1024 }]);
    expect(zipUnpackedBytes(zip, LIMITS)).toBeGreaterThan(LIMITS.maxBytes);
  });

  it("catches a zip bomb whose directory declares small sizes: the files are measured unpacked, capped at the limit", () => {
    // 8 MB of zeros packs to a few KB; the directory claims 10 bytes.
    const zip = zipOf([{ name: "bomb.xml", data: Buffer.alloc(8 * 1024 * 1024), declared: 10 }]);
    expect(zip.length).toBeLessThan(64 * 1024);
    expect(zipUnpackedBytes(zip, LIMITS)).toBeGreaterThan(LIMITS.maxBytes);
  });

  it("counts the limit over all the files together", () => {
    const part = { data: Buffer.alloc(600 * 1024), declared: 1 };
    expect(zipUnpackedBytes(zipOf([{ name: "a.xml", ...part }, { name: "b.xml", ...part }]), LIMITS)).toBeGreaterThan(LIMITS.maxBytes);
  });

  it("cannot read what is no plain zip: garbage, too many files, encrypted or corrupt data", () => {
    expect(zipUnpackedBytes(Buffer.from("not a zip at all"), LIMITS)).toBeNull();
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `${i}.xml`, data: Buffer.from("x") }));
    expect(zipUnpackedBytes(zipOf(many), LIMITS)).toBeNull();
    expect(zipUnpackedBytes(zipOf([{ name: "a.xml", data: Buffer.from("secret") }], { flags: 0x1 }), LIMITS)).toBeNull();
    const corrupt = zipOf([{ name: "a.xml", data: Buffer.alloc(100, "a") }]);
    corrupt.fill(0xff, 30 + "a.xml".length, 30 + "a.xml".length + 4);
    expect(zipUnpackedBytes(corrupt, LIMITS)).toBeNull();
  });
});
