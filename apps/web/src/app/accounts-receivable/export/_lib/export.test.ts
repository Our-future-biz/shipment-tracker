import { describe, expect, it } from "vitest";
import { base64ToBytes, periodProblem, previousMonth, skippedOfDetails } from "./export";

describe("previousMonth", () => {
  it("is the month before today's, first to last day", () => {
    expect(previousMonth("2026-11-18")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(previousMonth("2027-01-01")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
    expect(previousMonth("2028-03-31")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("periodProblem", () => {
  it("says what the server would", () => {
    expect(periodProblem("2026-10-01", "2026-10-31", "2026-11-18")).toBe("");
    expect(periodProblem("", "2026-10-31", "2026-11-18")).toBe("Choose the first and the last issue day of the export");
    expect(periodProblem("2026-11-02", "2026-11-01", "2026-11-18")).toBe("The first day is after the last one");
    expect(periodProblem("2025-01-01", "2026-01-02", "2026-11-18")).toBe("At most a year in one file: choose a shorter period");
    expect(periodProblem("2025-01-01", "2025-12-31", "2026-11-18")).toBe("");
    expect(periodProblem("2026-11-19", "2026-11-30", "2026-11-18")).toBe("Nothing is issued after today: choose a period that has begun");
  });
});

describe("skippedOfDetails", () => {
  it("reads the documents a refusal names, and nothing from anything else", () => {
    const skipped = [{ number: "2026CZ1", kind: "credit_note", issueDate: "2026-10-03", reason: "Exported to Pohoda on 01.11.2026 (f.xml)" }];
    expect(skippedOfDetails({ skipped })).toEqual(skipped);
    expect(skippedOfDetails({ skipped: [{ number: 1 }, null, { number: "A", reason: "r" }] })).toEqual([{ number: "A", kind: "invoice", issueDate: "", reason: "r" }]);
    expect(skippedOfDetails(undefined)).toEqual([]);
    expect(skippedOfDetails({ skipped: "no" })).toEqual([]);
  });
});

describe("base64ToBytes", () => {
  it("keeps the Windows-1250 bytes as they are, never re-encoded as UTF-8", () => {
    // "Příliš" in Windows-1250: P=0x50, ř=0xF8, í=0xED, l=0x6C, i=0x69, š=0x9A
    const cp1250 = [0x50, 0xf8, 0xed, 0x6c, 0x69, 0x9a];
    const base64 = btoa(String.fromCharCode(...cp1250));
    expect([...base64ToBytes(base64)]).toEqual(cp1250);
  });
  it("takes line breaks, an empty file, and refuses what is not base64", () => {
    expect([...base64ToBytes("QU\nJD")]).toEqual([0x41, 0x42, 0x43]);
    expect(base64ToBytes("")).toHaveLength(0);
    expect(() => base64ToBytes("not base64!")).toThrow("The file did not arrive whole");
  });
});
