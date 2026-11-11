import { describe, expect, it } from "vitest";
import { giveWay } from "../lib/versionGiveWay";

describe("how an active version gives way to a draft approved over its dates", () => {
  it("keeps pricing the days after a shorter draft that starts the same day: it now starts after it", () => {
    // v1 Jan-Dec, v2 Jan-Jun: v1 prices Jul-Dec still, never left without prices.
    expect(giveWay({ validFrom: "2026-01-01", validTo: "2026-12-31" }, "2026-01-01", "2026-06-30")).toEqual({ kind: "start", validFrom: "2026-07-01" });
    expect(giveWay({ validFrom: "2026-03-01", validTo: null }, "2026-01-01", "2026-06-30")).toEqual({ kind: "start", validFrom: "2026-07-01" });
  });

  it("ends one that started earlier the day before the draft starts", () => {
    expect(giveWay({ validFrom: "2026-01-01", validTo: null }, "2026-07-01", null)).toEqual({ kind: "end", validTo: "2026-06-30" });
    expect(giveWay({ validFrom: "2026-01-01", validTo: "2026-08-31" }, "2026-03-01", "2026-12-31")).toEqual({ kind: "end", validTo: "2026-02-28" });
  });

  it("supersedes one the draft covers wholly", () => {
    expect(giveWay({ validFrom: "2026-02-01", validTo: "2026-05-31" }, "2026-01-01", "2026-06-30")).toEqual({ kind: "supersede" });
    expect(giveWay({ validFrom: "2026-01-01", validTo: null }, "2026-01-01", null)).toEqual({ kind: "supersede" });
  });

  it("refuses a draft that would split an earlier version in two", () => {
    expect(giveWay({ validFrom: "2026-01-01", validTo: "2026-12-31" }, "2026-03-01", "2026-06-30")).toEqual({ kind: "refuse" });
  });
});
