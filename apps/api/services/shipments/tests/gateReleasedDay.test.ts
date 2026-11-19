import { describe, expect, it } from "vitest";
import { keepsReleasedDay, releaseGoesBackToGateDay } from "../lib/gateReleasedDay";

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

describe("releaseGoesBackToGateDay", () => {
  const gate = new Set(["2026-11-18"]);
  const line = (oldValue: string | null, newValue: string | null) => ({ oldValue, newValue });

  it("takes a day edited in Shipments from one the gate wrote for the gate's release (review)", () => {
    // The gate wrote 18.11. from empty; after its void a user changed it to 20.11.
    expect(releaseGoesBackToGateDay([line("2026-11-18", "2026-11-20"), line(null, "2026-11-18")], gate, true)).toBe(true);
    expect(releaseGoesBackToGateDay([line("2026-11-19", "2026-11-20"), line("2026-11-18", "2026-11-19"), line("", "2026-11-18")], gate, true)).toBe(true);
  });

  it("takes a day set from empty in Shipments for a release made there, edited or not, though the gate wrote another before", () => {
    expect(releaseGoesBackToGateDay([line(null, "2026-11-20")], gate, true)).toBe(false);
    expect(releaseGoesBackToGateDay([line("2026-11-20", "2026-11-21"), line(null, "2026-11-20")], gate, true)).toBe(false);
    // The gate's day cleared, and set again from empty - a release the stop held in Shipments.
    expect(releaseGoesBackToGateDay([line(null, "2026-11-20"), line("2026-11-18", null), line(null, "2026-11-18")], gate, true)).toBe(false);
  });

  it("takes a day set before its history was kept for none of the gate's, and one with more history than was read for the gate's", () => {
    expect(releaseGoesBackToGateDay([], gate, true)).toBe(false);
    expect(releaseGoesBackToGateDay([line("2026-11-10", "2026-11-20")], gate, true)).toBe(false);
    expect(releaseGoesBackToGateDay([line("2026-11-19", "2026-11-20")], gate, false)).toBe(true);
  });

  it("never when the gate wrote no day to the job", () => {
    expect(releaseGoesBackToGateDay([line("2026-11-18", "2026-11-20"), line(null, "2026-11-18")], new Set(), true)).toBe(false);
    expect(releaseGoesBackToGateDay([line("2026-11-19", "2026-11-20")], new Set(), false)).toBe(false);
  });
});
