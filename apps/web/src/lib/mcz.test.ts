import { describe, expect, it } from "vitest";
import { compareMczNumbers, existingMczNumbers, nextMczNumber, sameMczNumber } from "./mcz";

describe("master job references with letters", () => {
  it("goes on from the highest number, whatever its letters", () => {
    expect(nextMczNumber([], ["MCZ00000002", "MCZCONSOL00000007", "MCZFULL00000006", "MCZPROJECT00000004"])).toBe("MCZ00000008");
    expect(nextMczNumber([])).toBe("MCZ00000001");
  });

  it("orders by number, not by letters", () => {
    const list = ["MCZCONSOL00000007", "MCZPROJECT00000004", "MCZ00000002", "MCZFULL00000006"];
    expect([...list].sort(compareMczNumbers)).toEqual(["MCZ00000002", "MCZPROJECT00000004", "MCZFULL00000006", "MCZCONSOL00000007"]);
    expect(existingMczNumbers([], list)).toEqual(["MCZ00000002", "MCZPROJECT00000004", "MCZFULL00000006", "MCZCONSOL00000007"]);
  });

  it("knows a plain reference is the same job once it has letters", () => {
    expect(sameMczNumber("MCZ00000007", "MCZCONSOL00000007")).toBe(true);
    expect(sameMczNumber("MCZ00000007", "MCZCONSOL00000008")).toBe(false);
    expect(sameMczNumber("", undefined)).toBe(false);
    expect(sameMczNumber("OLD-7", "OLD-7")).toBe(true);
  });
});
