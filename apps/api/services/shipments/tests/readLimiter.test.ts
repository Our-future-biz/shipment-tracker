import { describe, expect, it } from "vitest";
import { readLimiter, unlimited } from "../lib/readLimiter";

/** A read that runs until it is let go, and says how many ran beside it at most. */
function bench() {
  let running = 0;
  let peak = 0;
  const started: string[] = [];
  const release = new Map<string, () => void>();
  const read = (name: string) => async () => {
    peak = Math.max(peak, ++running);
    started.push(name);
    await new Promise<void>((done) => release.set(name, done));
    running -= 1;
    return name;
  };
  // Lets the microtasks run: what could start has started.
  const settle = () => new Promise((done) => setTimeout(done, 0));
  return { read, started, finish: (name: string) => release.get(name)!(), settle, peak: () => peak };
}

describe("the limiter of an answer's reads", () => {
  it("runs at most so many at once, the rest as room is freed, in the order they were asked for", async () => {
    const b = bench();
    const run = readLimiter(2);
    const all = ["a", "b", "c", "d"].map((name) => run(b.read(name)));
    await b.settle();
    expect(b.started).toEqual(["a", "b"]);
    b.finish("b");
    await b.settle();
    expect(b.started).toEqual(["a", "b", "c"]);
    b.finish("a");
    b.finish("c");
    await b.settle();
    b.finish("d");
    expect(await Promise.all(all)).toEqual(["a", "b", "c", "d"]);
    expect(b.peak()).toBe(2);
  });

  it("hands the room of a read that ends straight to the one waiting longest: a read asked for meanwhile does not jump the queue", async () => {
    const b = bench();
    const run = readLimiter(1);
    const first = run(b.read("first"));
    const second = run(b.read("second"));
    await b.settle();
    b.finish("first");
    // Asked for at the very moment the room is freed.
    const third = run(b.read("third"));
    await b.settle();
    expect(b.started).toEqual(["first", "second"]);
    b.finish("second");
    await b.settle();
    b.finish("third");
    expect(await Promise.all([first, second, third])).toEqual(["first", "second", "third"]);
    expect(b.peak()).toBe(1);
  });

  it("frees the room of a read that failed", async () => {
    const run = readLimiter(1);
    await expect(run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await run(async () => "next")).toBe("next");
  });

  it("is no limit at all when a reader is handed none", async () => {
    const b = bench();
    const all = ["a", "b", "c"].map((name) => unlimited(b.read(name)));
    await b.settle();
    expect(b.started).toEqual(["a", "b", "c"]);
    for (const name of ["a", "b", "c"]) b.finish(name);
    expect(await Promise.all(all)).toEqual(["a", "b", "c"]);
  });
});
