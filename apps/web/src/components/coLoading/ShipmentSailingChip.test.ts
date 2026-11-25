import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/date";
import { sailingChipWords } from "./ShipmentSailingChip";

describe("the sailing in a shipment's header, in words (Council Outlay 14, A1)", () => {
  it("names the sailing, its cut-off and how full its box is", () => {
    expect(sailingChipWords({ vessel: "WEEK 51", voyage: "", cutoffDate: "2026-12-03", fill: { fullPct: 13 } }, formatDate)).toBe("WEEK 51 · cut-off 03.12.2026 · box 13%");
    expect(sailingChipWords({ vessel: "MSC Anna", voyage: "445W", cutoffDate: null, fill: { fullPct: 104 } })).toBe("MSC Anna 445W · box 104%");
  });

  it("leaves out what is not known: no cut-off, a box not read, a box with no measure", () => {
    expect(sailingChipWords({ vessel: "WEEK 51", voyage: "", cutoffDate: null })).toBe("WEEK 51");
    expect(sailingChipWords({ vessel: "WEEK 51", voyage: "", cutoffDate: "2026-12-03", fill: { fullPct: null } })).toBe("WEEK 51 · cut-off 2026-12-03");
  });
});
