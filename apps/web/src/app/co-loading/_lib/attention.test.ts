import { describe, expect, it } from "vitest";
import { byCutoff, freeWords, sailingAttention, serviceAttention } from "./attention";

const TODAY = "2026-11-24";
const meter = (pct: number, state: "room" | "nearly_full" | "over" | "beyond" = "room") => ({ pct, state });
const fill = (more = {}) => ({ volume: meter(40), weight: meter(30), fullPct: 40, shipments: 3, missing: 0, ...more });
const sailing = (more = {}) => ({ cutoffDate: "2026-12-03", departureDate: "2026-12-10", fill: fill(), cancelled: 0, dangerous: 0, ...more });
const texts = (flags: { text: string }[]) => flags.map((f) => f.text);

describe("what needs a look on a sailing (Council Outlay 14, A7)", () => {
  it("is nothing on a sailing in good order, and nothing on one that has left", () => {
    expect(sailingAttention(sailing(), TODAY)).toEqual([]);
    expect(sailingAttention(sailing({ cutoffDate: "2026-11-10", departureDate: "2026-11-19", stage: "departed", fill: fill({ missing: 2 }) }), TODAY)).toEqual([]);
    // Left by its date, its stage never moved on: that alone is marked (C3).
    expect(sailingAttention(sailing({ cutoffDate: "2026-11-10", departureDate: "2026-11-19", fill: fill({ missing: 2 }) }), TODAY)).toEqual([{ key: "stage", tone: "amber", text: "Departure date passed, still open" }]);
  });

  it("marks a cut-off amber from 3 days before and red once passed", () => {
    expect(sailingAttention(sailing({ cutoffDate: "2026-11-26" }), TODAY)).toEqual([{ key: "cutoff", tone: "amber", text: "Cut-off in 2 days" }]);
    expect(sailingAttention(sailing({ cutoffDate: TODAY }), TODAY)).toEqual([{ key: "cutoff", tone: "amber", text: "Cut-off today" }]);
    expect(sailingAttention(sailing({ cutoffDate: "2026-11-21" }), TODAY)).toEqual([{ key: "cutoff", tone: "red", text: "Cut-off passed 3 days ago" }]);
    expect(sailingAttention(sailing({ cutoffDate: "2026-11-28" }), TODAY)).toEqual([]);
  });

  it("says what the box holds that wants a look, the most pressing first", () => {
    const flags = sailingAttention(sailing({ cutoffDate: "2026-11-25", departureDate: null, fill: fill({ weight: meter(104, "over"), missing: 4 }), cancelled: 1, dangerous: 2 }), TODAY);
    expect(texts(flags)).toEqual(["Over the limit", "Cut-off tomorrow", "4 without weight or volume", "2 dangerous shipments", "1 cancelled shipment still linked", "No departure date"]);
    expect(flags.map((f) => f.tone)).toEqual(["red", "amber", "amber", "amber", "slate", "slate"]);
  });

  it("tells managers of missing box costs only close to departure, and nobody else ever", () => {
    const soon = sailing({ cutoffDate: null, departureDate: "2026-11-27" });
    expect(texts(sailingAttention(soon, TODAY, false))).toEqual(["No box costs yet"]);
    expect(sailingAttention(soon, TODAY, true)).toEqual([]);
    expect(sailingAttention(soon, TODAY)).toEqual([]);
    expect(sailingAttention(sailing({ cutoffDate: null, departureDate: "2026-11-28" }), TODAY, false)).toEqual([]);
    expect(sailingAttention(sailing({ cutoffDate: null, departureDate: null }), TODAY, false).map((f) => f.key)).toEqual(["departure"]);
  });
});

describe("what needs a look on a service", () => {
  it("names waiting shipments, and a weekly service with no sailing ahead", () => {
    expect(serviceAttention({ frequency: "weekly", waiting: 0 }, 2)).toEqual([]);
    expect(texts(serviceAttention({ frequency: "weekly", waiting: 3 }, 1))).toEqual(["3 waiting for a sailing"]);
    expect(texts(serviceAttention({ frequency: "weekly", waiting: 0 }, 0))).toEqual(["No sailing ahead"]);
    expect(serviceAttention({ frequency: "bi_weekly", waiting: 2 }, 0).map((f) => [f.text, f.tone])).toEqual([["No sailing ahead", "amber"], ["2 waiting for a sailing", "amber"]]);
  });

  it("leaves a service that sails as needed alone until something waits", () => {
    expect(serviceAttention({ frequency: "ad_hoc", waiting: 0 }, 0)).toEqual([]);
    expect(texts(serviceAttention({ frequency: "ad_hoc", waiting: 1 }, 0))).toEqual(["No sailing ahead", "1 waiting for a sailing"]);
  });
});

describe("the board's order and words", () => {
  it("goes by cut-off, then by departure where there is none, the ones with neither last", () => {
    const s = (id: string, cutoffDate: string | null, departureDate: string | null) => ({ id, cutoffDate, departureDate, createdAt: "2026-11-01T08:00:00Z" });
    expect(byCutoff([s("none", null, null), s("b", "2026-12-03", "2026-12-10"), s("a", "2026-11-26", "2026-12-03"), s("dep", null, "2026-11-30")]).map((x) => x.id)).toEqual(["a", "dep", "b", "none"]);
  });

  it("says the room left, or by how much a box is over", () => {
    expect(freeWords({ cbm: 55.82, kg: 24250 })).toBe("55.8 cbm · 24,250 kg");
    expect(freeWords({ cbm: -2.14, kg: 1200 })).toBe("over by 2.1 cbm · 1,200 kg");
    expect(freeWords({ cbm: null, kg: 800 })).toBe("800 kg");
    expect(freeWords({ cbm: null, kg: null })).toBe("—");
  });
});
