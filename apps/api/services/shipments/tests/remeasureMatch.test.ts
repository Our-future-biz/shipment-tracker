import { describe, expect, it, vi } from "vitest";

// lib/remeasureNotice reads lib/personPick, which names encore.dev/api: the real one loads the Encore runtime.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { informedComparedWith, judgedCharge, matchesNow, shownCargo, type CargoRows } from "../lib/remeasureMatch";

// "Matches now": whether a shipment's Cargo Details, as the shipment shows them, say what the
// warehouse remeasured - the judgement the Alerts tab and Shipments → Managers share (Y4).

const NO_ROWS: CargoRows = { containers: [], items: [], dimensions: [] };
const line = (over = {}) => ({ pieces: "10", lengthCm: "100", widthCm: "100", heightCm: "50", weightPerPcKg: "120", volumePerPcM3: "", ...over });
const item = (over = {}) => ({ pieces: "8", grossWeight: "960", packageType: "Pallets", hsCode: "", cargoDescription: "", ...over });
const box = (over = {}) => ({ packages: "12", grossWeight: "1500", volume: "6", teu: "2", type: "40' HC", packageType: "Pallets", ...over });
const concept = (figures: object) => JSON.stringify({ ...figures, comparedWith: "declared", source: "warehouseConcept" });
const warehouse = (figures: object) => JSON.stringify({ ...figures, comparedWith: "dimensions" });

describe("shownCargo: the shipment as its page shows it", () => {
  it("takes the Pcs from the detail rows - containers first, then cargo items, then dimension lines - and the stored Pcs only with no rows", () => {
    const stored = { pcs: "10", totalWeightTons: "1.2000", totalVolumeCbm: "5.0000" };
    expect(shownCargo(stored, NO_ROWS)).toEqual({ pcs: "10", totalWeightTons: "1.2000", totalVolumeCbm: "5.0000", cargoDimensions: [] });
    expect(shownCargo(stored, { ...NO_ROWS, dimensions: [line({ pieces: "7" })] }).pcs).toBe("7");
    expect(shownCargo(stored, { ...NO_ROWS, items: [item()], dimensions: [line()] }).pcs).toBe("8");
    expect(shownCargo(stored, { containers: [box()], items: [item()], dimensions: [line()] }).pcs).toBe("12");
    // Rows that count no pieces show none: the stored Pcs is not shown beside them.
    expect(shownCargo(stored, { ...NO_ROWS, items: [item({ pieces: "" })] }).pcs).toBe("");
  });

  it("keeps Total Weight and Total Volume as stored, and nothing for a field the row did not carry", () => {
    expect(shownCargo({}, NO_ROWS)).toEqual({ pcs: null, totalWeightTons: null, totalVolumeCbm: null, cargoDimensions: [] });
    const dims = [line()];
    expect(shownCargo({ totalWeightTons: "2.0000", totalVolumeCbm: null }, { ...NO_ROWS, dimensions: dims })).toEqual({ pcs: "10", totalWeightTons: "2.0000", totalVolumeCbm: null, cargoDimensions: dims });
  });
});

describe("informedComparedWith", () => {
  it("reads what the warehouse's screen compared with; the dimension lines for anything else", () => {
    expect(informedComparedWith(concept({ colli: 1 }))).toBe("declared");
    expect(informedComparedWith(warehouse({ colli: 1 }))).toBe("dimensions");
    expect(informedComparedWith(JSON.stringify({ colli: 1 }))).toBe("dimensions");
    expect(informedComparedWith("{")).toBe("dimensions");
    expect(informedComparedWith(null)).toBe("dimensions");
  });
});

describe("matchesNow", () => {
  const remeasured = { colli: 10, weightKg: 1200, volumeCbm: 5 };

  it("matches a Warehouse Concept remeasurement once the Cargo Details lines say the same, with nothing stored in Pcs or Total Weight", () => {
    const shown = shownCargo({ pcs: "", totalWeightTons: null, totalVolumeCbm: null }, { ...NO_ROWS, dimensions: [line()] });
    expect(matchesNow(shown, concept(remeasured))).toBe(true);
    // Within Warehouse Concept's 5 % on weight it matches too; a piece more never does.
    expect(matchesNow(shown, concept({ ...remeasured, weightKg: 1250 }))).toBe(true);
    expect(matchesNow(shown, concept({ ...remeasured, colli: 11 }))).toBe(false);
  });

  it("does not take a stale stored Pcs for the shipment's: the lines it shows are what counts", () => {
    const stored = { pcs: "10", totalWeightTons: "1.2000", totalVolumeCbm: "5.0000" };
    expect(matchesNow(shownCargo(stored, NO_ROWS), concept(remeasured))).toBe(true);
    expect(matchesNow(shownCargo(stored, { ...NO_ROWS, items: [item()] }), concept(remeasured))).toBe(false);
  });

  it("says no when no figure is known on both sides", () => {
    expect(matchesNow(shownCargo({}, NO_ROWS), concept(remeasured))).toBe(false);
    expect(matchesNow(shownCargo({ pcs: "10" }, NO_ROWS), "{")).toBe(false);
  });

  it("compares a remeasurement of Shipments → Warehouse with the dimension lines' totals, with no tolerance", () => {
    const shown = shownCargo({ pcs: "10", totalWeightTons: "1.0000", totalVolumeCbm: "5.0000" }, { ...NO_ROWS, dimensions: [line()] });
    // The lines hold 1,200 kg though Total Weight still says 1 t: compared with the lines, it matches.
    expect(matchesNow(shown, warehouse(remeasured))).toBe(true);
    expect(matchesNow(shown, warehouse({ ...remeasured, weightKg: 1210 }))).toBe(false);
  });

  // The stored Total Weight holds 0.1 kg and the Total Volume is compared to 0.001 m³; the informed
  // figures are rounded the same before the two are compared.
  it("rounds the remeasured figures as a shipment stores them, to 0.1 kg and 0.001 m³", () => {
    // 7 × 13.25 kg = 92.75 kg and 48.5104 m³ informed; Cargo Details took over 92.8 kg and 48.510 m³.
    const informed = warehouse({ colli: 7, weightKg: 92.75, volumeCbm: 48.5104 });
    const shown = (pcs: string, tons: string, cbm: string) => shownCargo({ pcs, totalWeightTons: tons, totalVolumeCbm: cbm }, NO_ROWS);
    expect(matchesNow(shown("7", "0.0928", "48.5100"), informed)).toBe(true);
    // Another tenth of a kilo, or another litre, is another figure.
    expect(matchesNow(shown("7", "0.0927", "48.5100"), informed)).toBe(false);
    expect(matchesNow(shown("7", "0.0928", "48.5120"), informed)).toBe(false);
    expect(matchesNow(shown("8", "0.0928", "48.5100"), informed)).toBe(false);
  });

  it("reads a Pcs shown with thousands separators", () => {
    expect(matchesNow(shownCargo({ pcs: "1,200" }, NO_ROWS), concept({ colli: 1200, weightKg: 0, volumeCbm: 0 }))).toBe(true);
  });
});

// A Sea Full Load job with no volume typed, where the warehouse measured 20 m³: charged per
// container, the volume moves no charge, so Alerts and the chat said it matches. Judged without a
// charge it read as a W/M change - "differs" - on every reader that did not pass one.
describe("matchesNow: the charge the inform is judged by", () => {
  const shown = shownCargo({ pcs: "10", totalWeightTons: "1.0000", totalVolumeCbm: null }, NO_ROWS);
  const figures = { colli: 10, weightKg: 1000, volumeCbm: 20 };

  it("takes the job's own charge for an entry written before the charge was kept", () => {
    expect(matchesNow(shown, concept(figures), "container")).toBe(true);
    // An LCL job is charged by W/M: 20 m³ against 1 t is a new charge.
    expect(matchesNow(shown, concept(figures), "wm")).toBe(false);
    // A reader that knows neither stays cautious.
    expect(matchesNow(shown, concept(figures))).toBe(false);
  });

  it("goes by the charge kept on the entry over the job's: what Alerts and the chat said when the warehouse informed", () => {
    expect(matchesNow(shown, concept({ ...figures, charge: "wm" }), "container")).toBe(false);
    expect(matchesNow(shown, concept({ ...figures, charge: "container" }), "wm")).toBe(true);
  });

  it("judgedCharge: the entry's charge, else the job's, else none", () => {
    expect(judgedCharge(JSON.stringify({ charge: "air" }), "wm")).toBe("air");
    expect(judgedCharge(JSON.stringify({ charge: "nonsense" }), "container")).toBe("container");
    expect(judgedCharge("{", "wm")).toBe("wm");
    expect(judgedCharge(null)).toBeUndefined();
  });
});
