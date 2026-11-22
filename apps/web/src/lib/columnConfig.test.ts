import { describe, expect, it } from "vitest";
import {
  CLEARABLE_DROPDOWNS,
  COLUMN_MAP,
  computeDimensionTotals,
  dateTimeUpdate,
  getRowConditionalStyle,
  gridFilterOptions,
  incotermOptionsFor,
  joinDateTime,
  splitDateTime,
  summarizeDimensions,
  waitsForOriginalBl,
} from "./columnConfig";

describe("summarizeDimensions", () => {
  it("writes each line in the unit it was typed in", () => {
    const rows = [
      { pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "" },
      { pieces: "", lengthCm: "111.76", widthCm: "102.87", heightCm: "25.4", weightPerPcKg: "", dimensionUnit: "in" },
    ];
    expect(summarizeDimensions(rows)).toBe("2× 120×80×100 cm, 1× 44×40.5×10 in");
  });
  it("leaves out lines without sizes", () => {
    expect(summarizeDimensions([{ pieces: "3", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "5" }])).toBe("");
  });
  it("writes a line without sizes by the volume typed for it", () => {
    expect(summarizeDimensions([{ pieces: "3", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "5", volumePerPcM3: "0.4" }])).toBe("3× 0.4 m³");
  });
  it("reads the typed volume as the totals do: a decimal comma is a point, a size short still counts it", () => {
    expect(summarizeDimensions([{ pieces: "2", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", volumePerPcM3: "0,5" }])).toBe("2× 0.5 m³");
    expect(summarizeDimensions([{ pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "", weightPerPcKg: "", volumePerPcM3: "0,5" }])).toBe("2× 0.5 m³");
    expect(summarizeDimensions([{ pieces: "2", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", volumePerPcM3: "abc" }])).toBe("");
  });
});

describe("computeDimensionTotals", () => {
  it("counts a typed volume where a line has no sizes, the sizes where it has them", () => {
    const rows = [
      { pieces: "2", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "10", volumePerPcM3: "5" },
      { pieces: "3", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "20", volumePerPcM3: "0.5" },
    ];
    const t = computeDimensionTotals(rows);
    expect(t.volumeCbm).toBeCloseTo(3.5, 6);
    expect(t.weightKg).toBe(80);
  });
});

describe("date + time columns", () => {
  it("join a date and its time into one value, and split it back", () => {
    expect(joinDateTime("2026-11-20", "12:00")).toBe("2026-11-20 12:00");
    expect(joinDateTime("2026-11-20", "")).toBe("2026-11-20");
    expect(joinDateTime(null, "12:00")).toBe("");
    // a time the old date-typed time columns stored is no time
    expect(joinDateTime("2026-11-20", "2026-11-05")).toBe("2026-11-20");
    expect(splitDateTime("2026-11-20 12:00")).toEqual({ date: "2026-11-20", time: "12:00" });
    expect(splitDateTime("2026-11-20")).toEqual({ date: "2026-11-20", time: "" });
    expect(splitDateTime("")).toEqual({ date: "", time: "" });
  });

  it("save the date and the time to their own fields", () => {
    const closing = COLUMN_MAP.get("closingDate")!;
    expect(dateTimeUpdate(closing, "2026-11-20 12:00")).toEqual({ closingDate: "2026-11-20", closingTime: "12:00" });
    // clearing the date clears its time too
    expect(dateTimeUpdate(closing, "")).toEqual({ closingDate: "", closingTime: "" });
    expect(dateTimeUpdate(COLUMN_MAP.get("isfDeadline")!, "2026-11-18")).toEqual({ isfDeadline: "2026-11-18", isfDeadlineTime: "" });
    // Pick-Up Date keeps its time in the Pickup Time field Trucking fills too
    expect(dateTimeUpdate(COLUMN_MAP.get("pickupDate")!, "2026-11-05 08:00")).toEqual({ pickupDate: "2026-11-05", pickupTime: "08:00" });
    expect(COLUMN_MAP.has("pickupTime")).toBe(false);
    expect(COLUMN_MAP.has("plannedDeliveryTime")).toBe(false);
    // a column without a time is saved as it was
    expect(dateTimeUpdate(COLUMN_MAP.get("estimatedDeparture")!, "2026-11-22")).toEqual({ estimatedDeparture: "2026-11-22" });
  });
});

describe("an OBL row in red (K28)", () => {
  const row = (over: Record<string, string>) => ({ tradeDirection: "Import", houseBolType: "", masterBolType: "", originalsReceivedDate: "", telexReleaseReceivedDate: "", ...over });

  it("is an import's only: an export's OBL is ours to release, it waits for none (mock council R20)", () => {
    expect(getRowConditionalStyle(row({ tradeDirection: "Export", houseBolType: "OBL", masterBolType: "OBL" }))).toBeNull();
    expect(waitsForOriginalBl(row({ tradeDirection: "Domestic", masterBolType: "OBL" }))).toBe(false);
    expect(waitsForOriginalBl(row({ tradeDirection: "", masterBolType: "OBL" }))).toBe(false);
    expect(waitsForOriginalBl(row({ tradeDirection: " import ", masterBolType: "OBL" }))).toBe(true);
  });

  it("is red while an OBL is not in hand, by the rule Shipments → Managers says it", () => {
    expect(getRowConditionalStyle(row({ masterBolType: "OBL" }))).toEqual({ color: "#b91c1c" });
    expect(getRowConditionalStyle(row({ houseBolType: "OBL" }))).toEqual({ color: "#b91c1c" });
    expect(waitsForOriginalBl(row({ masterBolType: " obl " }))).toBe(true);
  });

  it("is no longer red once Originals Received or Telex Release Received has a day", () => {
    expect(getRowConditionalStyle(row({ masterBolType: "OBL", originalsReceivedDate: "2026-11-16" }))).toBeNull();
    expect(getRowConditionalStyle(row({ houseBolType: "OBL", telexReleaseReceivedDate: "2026-11-17" }))).toBeNull();
    expect(getRowConditionalStyle(row({ masterBolType: "SWB" }))).toBeNull();
    expect(getRowConditionalStyle({})).toBeNull();
  });
});

// Mock council S4-5: a job's Incoterms as its quote's picker offers them.
describe("incotermOptionsFor", () => {
  it("offers every term by sea, or while no Freight Mode is set", () => {
    expect(incotermOptionsFor("Sea Freight")).toContain("FOB");
    expect(incotermOptionsFor("Sea Break Bulk")).toContain("CIF");
    expect(incotermOptionsFor("")).toHaveLength(11);
  });

  it("leaves out the sea-only terms on an air, rail or road job, a term already held still offered", () => {
    for (const mode of ["Air Freight", "Rail Freight", "Road Freight"]) {
      const offered = incotermOptionsFor(mode);
      for (const code of ["FAS", "FOB", "CFR", "CIF"]) expect(offered, `${mode} ${code}`).not.toContain(code);
      expect(offered).toEqual(expect.arrayContaining(["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP"]));
    }
    expect(incotermOptionsFor("Air Freight", "FOB").at(-1)).toBe("FOB");
  });
});

// Review of system-23: Service Name became a list (owner's answer 22 Nov), and the values typed before it did
// still show in their cells.
describe("gridFilterOptions", () => {
  it("offers Service Name's list and the other values the loaded rows hold, each once", () => {
    const held = ["ISHA", "", "  Express Rail ", "express rail", "Domestic", "isha", "Barge"];
    expect(gridFilterOptions("serviceName", () => held)).toEqual(["ISHA", "Domestic", "Barge", "Express Rail"]);
    expect(gridFilterOptions("serviceName", () => [])).toEqual(["ISHA", "Domestic"]);
  });

  it("offers a column never typed in its list only, without reading the rows", () => {
    const rows = () => {
      throw new Error("not read");
    };
    expect(gridFilterOptions("invoicingStatus", rows)).toEqual(COLUMN_MAP.get("invoicingStatus")!.options);
    // Load Type also offers Single Shipment, an air Full Load as its cell reads.
    expect(gridFilterOptions("loadType", rows)).toContain("Single Shipment");
  });
});

describe("CLEARABLE_DROPDOWNS", () => {
  it("lets a Service Name be emptied, as when it was typed", () => {
    expect(CLEARABLE_DROPDOWNS.has("serviceName")).toBe(true);
    expect(CLEARABLE_DROPDOWNS.has("status")).toBe(false);
  });
});
