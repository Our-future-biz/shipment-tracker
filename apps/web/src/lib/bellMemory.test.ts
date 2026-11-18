import { describe, expect, it } from "vitest";
import { rememberNew } from "./bellMemory";

describe("the bell's memory", () => {
  it("remembers the backlog found on load without announcing it", () => {
    const first = rememberNew(null, ["a", "b"]);
    expect(first.fresh).toEqual([]);
    expect([...first.seen]).toEqual(["a", "b"]);
  });

  it("announces only a key never met before", () => {
    const first = rememberNew(null, ["a", "b"]);
    const next = rememberNew(first.seen, ["a", "b", "c"]);
    expect(next.fresh).toEqual(["c"]);
  });

  it("keeps every key through a poll that comes back empty, so the old ones are not announced again", () => {
    const first = rememberNew(null, ["a", "b"]);
    const empty = rememberNew(first.seen, []);
    expect(empty.fresh).toEqual([]);
    const back = rememberNew(empty.seen, ["a", "b", "c"]);
    expect(back.fresh).toEqual(["c"]);
  });

  it("announces a key once, even when it is listed twice", () => {
    const next = rememberNew(new Set(), ["c", "c"]);
    expect(next.fresh).toEqual(["c"]);
  });

  it("leaves the memory it was given as it was", () => {
    const seen = new Set(["a"]);
    rememberNew(seen, ["b"]);
    expect([...seen]).toEqual(["a"]);
  });
});
