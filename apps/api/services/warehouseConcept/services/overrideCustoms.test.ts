import { describe, expect, it } from "vitest";
import { customsHolds, MRN_BLANKS, mrnRecorded, releaseGatesFor, transitPassesCustoms } from "./overrideCustoms";

// Pure rule of the transit Customs line (mock council C1, owner's answer R27): runs in the plain
// test run; the release itself (isArmed, armedSql, the stamp) is tested in tests/gateMovement.test.ts.

const gates = [
  { g: "B/L / release order", s: "OK" as const, note: "" },
  { g: "Customs", s: "Pending" as const, note: "Paperwork Verified" },
  { g: "Charges", s: "OK" as const, note: "" },
];
const t1 = { visit: "výdej", customsMode: "T1", mrn: "26CZ5100001234A7" };

describe("transit cargo with an MRN passes the Customs line", () => {
  it("passes outbound T1 / T2L cargo with an MRN recorded, nothing else", () => {
    expect(transitPassesCustoms(t1)).toBe(true);
    expect(transitPassesCustoms({ ...t1, customsMode: "T2L" })).toBe(true);
    // No MRN ("—" is the screens' empty value), another mode, or inbound cargo: Customs still holds.
    expect(transitPassesCustoms({ ...t1, mrn: "" })).toBe(false);
    expect(transitPassesCustoms({ ...t1, mrn: " — " })).toBe(false);
    expect(transitPassesCustoms({ ...t1, customsMode: "SCP" })).toBe(false);
    expect(transitPassesCustoms({ ...t1, customsMode: "RDT" })).toBe(false);
    expect(transitPassesCustoms({ ...t1, visit: "příjem" })).toBe(false);
    expect(transitPassesCustoms({})).toBe(false);
    expect(mrnRecorded(null)).toBe(false);
  });

  it("shows the Customs line OK with the reason, the other lines as they are", () => {
    const read = releaseGatesFor(t1, gates);
    expect(customsHolds(read)).toBe(false);
    expect(read[1]).toEqual({ g: "Customs", s: "OK", note: "T1 transit — MRN recorded, leaves under its transit document" });
    expect(read[0]).toBe(gates[0]);
    // Without the rule the stored gates come back untouched.
    expect(releaseGatesFor({ ...t1, mrn: "" }, gates)).toBe(gates);
    expect(customsHolds(releaseGatesFor({ ...t1, mrn: "" }, gates))).toBe(true);
  });
});

describe("a whitespace-only MRN is no MRN (review of mock council C1)", () => {
  it("is not recorded, whatever the blanks, and a real one keeps counting with blanks around it", () => {
    for (const blank of [" ", "\t", "\n \r", "\u00a0", "\u2003\u202f", "\ufeff", "\u3000 \u2028"]) {
      expect(mrnRecorded(blank)).toBe(false);
      expect(transitPassesCustoms({ ...t1, mrn: blank })).toBe(false);
    }
    expect(mrnRecorded("\u00a0—\t")).toBe(false);
    expect(mrnRecorded("\u00a026CZ5100001234A7\n")).toBe(true);
  });

  it("trims exactly what JavaScript's trim() does, the set the SQL twin passes to btrim", () => {
    for (let c = 0; c <= 0xffff; c++) {
      const ch = String.fromCharCode(c);
      expect(MRN_BLANKS.includes(ch), `U+${c.toString(16)}`).toBe(ch.trim() === "");
    }
  });
});
