import { describe, expect, it } from "vitest";
import { keepsReleasedDay } from "../lib/gateReleasedDay";

describe("keepsReleasedDay", () => {
  it("lets the gate's day go over an empty day", () => {
    expect(keepsReleasedDay(null, [])).toBe(true);
    expect(keepsReleasedDay("  ", [])).toBe(true);
  });
  it("lets it go over a day the gate wrote itself (a voided release, restamped)", () => {
    expect(keepsReleasedDay("2026-11-18", ["2026-11-18"])).toBe(true);
  });
  it("keeps a day a person set in Shipments", () => {
    expect(keepsReleasedDay("2026-11-19", ["2026-11-18"])).toBe(false);
    expect(keepsReleasedDay("2026-11-19", [])).toBe(false);
  });
});
