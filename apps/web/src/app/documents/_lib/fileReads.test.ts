import { describe, expect, it, vi } from "vitest";
import { READ_FILE_MAX_BYTES, readEachFile, readFileProblem } from "./fileReads";

describe("a file read on its own", () => {
  it("is read while its base64 request stays within the server's 50 MB", () => {
    expect(readFileProblem({ name: "bl.pdf", size: READ_FILE_MAX_BYTES })).toBeNull();
    // base64 is 4 bytes for every 3, and the request carries the file name besides.
    expect((Math.ceil(READ_FILE_MAX_BYTES / 3) * 4) / (1024 * 1024)).toBeLessThan(49.5);
  });

  it("is refused above that, saying how large it is and what can be read", () => {
    expect(readFileProblem({ name: "scan.pdf", size: 40 * 1024 * 1024 })).toBe(
      "scan.pdf is 40.0 MB; a file of at most 37.0 MB can be read. Split it, or save it smaller.",
    );
    expect(readFileProblem({ name: "scan.pdf", size: READ_FILE_MAX_BYTES + 1 })).not.toBeNull();
  });
});

describe("several files read for one review", () => {
  const files = [{ uid: "a" }, { uid: "b" }, { uid: "c" }];

  it("keeps the reads of the files that worked when one fails, and names the one that failed", async () => {
    const failure = new Error("model overloaded");
    const read = vi.fn(async (f: { uid: string }) => {
      if (f.uid === "b") throw failure;
      return `read ${f.uid}`;
    });
    const { reads, failed } = await readEachFile(files, read);
    expect([...reads]).toEqual([
      ["a", "read a"],
      ["c", "read c"],
    ]);
    expect(failed).toEqual([{ file: { uid: "b" }, error: failure }]);
  });

  it("reads again only the files the earlier reading has no read of", async () => {
    const read = vi.fn(async (f: { uid: string }) => `again ${f.uid}`);
    const earlier = new Map([
      ["a", "read a"],
      ["c", "read c"],
    ]);
    const { reads, failed } = await readEachFile(files, read, earlier);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledWith({ uid: "b" });
    expect(reads.get("b")).toBe("again b");
    expect(reads.get("a")).toBe("read a");
    expect(failed).toEqual([]);
  });

  it("leaves out a file no longer among those to read", async () => {
    const { reads } = await readEachFile([{ uid: "a" }], async () => "new", new Map([["gone", "old"]]));
    expect([...reads.keys()]).toEqual(["a"]);
  });
});
