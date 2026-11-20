import { describe, expect, it } from "vitest";
import { compareMczNumbers, existingMczNumbers, matchesMczSearch, newMasterJobNumber, nextMczNumber, sameMczNumber } from "./mcz";

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

describe("finding a master job by its reference (the Master Job dialog's Link to existing)", () => {
  it("finds it typed without its letters, or with other ones, in any case", () => {
    expect(matchesMczSearch("MCZCONSOL00000007", "mcz00000007")).toBe(true);
    expect(matchesMczSearch("MCZCONSOL00000007", "MCZ00000007")).toBe(true);
    expect(matchesMczSearch("MCZCONSOL00000007", "mczfull00000007")).toBe(true);
    expect(matchesMczSearch("MCZ00000007", "MCZCONSOL00000007")).toBe(true);
    expect(matchesMczSearch("MCZCONSOL00000008", "mcz00000007")).toBe(false);
  });

  it("finds it typed with its letters, by any part of it, or by digits still being typed", () => {
    expect(matchesMczSearch("MCZCONSOL00000007", "mczconsol00000007")).toBe(true);
    expect(matchesMczSearch("MCZCONSOL00000007", "consol")).toBe(true);
    expect(matchesMczSearch("MCZCONSOL00000007", "07")).toBe(true);
    expect(matchesMczSearch("MCZCONSOL00000017", "mcz0000001")).toBe(true);
    expect(matchesMczSearch("MCZCONSOL00000007", "full")).toBe(false);
  });

  it("lists every master job while nothing is typed", () => {
    expect(matchesMczSearch("MCZ00000001", "  ")).toBe(true);
  });
});

// Mock council S4-6: the dialog says the number the new master job really gets.
describe("newMasterJobNumber", () => {
  it("takes the letters of the Load Type the chosen shipments share", () => {
    expect(newMasterJobNumber("MCZ00000010", ["Consolidation", "Consolidation"])).toBe("MCZCONSOL00000010");
    expect(newMasterJobNumber("MCZ00000010", ["Full Load"])).toBe("MCZFULL00000010");
    expect(newMasterJobNumber("MCZ00000010", ["Project Shipment"])).toBe("MCZPROJECT00000010");
  });

  it("stays plain while they differ, one has none, or none is chosen", () => {
    expect(newMasterJobNumber("MCZ00000010", ["Consolidation", "Full Load"])).toBe("MCZ00000010");
    expect(newMasterJobNumber("MCZ00000010", ["Consolidation", ""])).toBe("MCZ00000010");
    expect(newMasterJobNumber("MCZ00000010", [])).toBe("MCZ00000010");
  });
});
