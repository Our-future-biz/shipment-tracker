import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import {
  chargeChanged,
  chargeKindOf,
  declaredFigures,
  differenceText,
  dimensionFigures,
  dimensionFiguresFilled,
  informedCharge,
  informedSource,
  remeasureNotice,
  remeasureVerdict,
  shipmentFiguresFor,
  withinConceptTolerance,
} from "../lib/remeasureNotice";

const users = [
  { id: "u1", email: "lukas@ourfuture.biz", displayName: "Lukáš" },
  { id: "u2", email: "marek@ourfuture.biz", displayName: "" },
  { id: "u3", email: "martin@ourfuture.biz", displayName: "Martin" },
];
const shipment = { colli: 20, weightKg: 3000, volumeCbm: 10 };
const remeasured = { colli: 11, weightKg: 2750, volumeCbm: 31.68 };

describe("remeasureNotice", () => {
  it("says the cargo was remeasured, both sets of figures, and tags Person in Charge and Holiday Cover", () => {
    const n = remeasureNotice({ personInCharge: "lukas@ourfuture.biz", holidayCover: "Marek@OurFuture.biz" }, users, shipment, remeasured);
    expect(n.message).toBe(
      [
        "Cargo has been remeasured by the warehouse.",
        "Shipment values: 20 colli · 3,000.0 kg · 10.000 CBM",
        "Remeasured values: 11 colli · 2,750.0 kg · 31.680 CBM",
        "Difference: colli −9 · weight −250.0 kg · volume +21.680 CBM",
        "@Lukáš @marek@ourfuture.biz",
      ].join("\n"),
    );
    expect(n.tagged.map((u) => u.id)).toEqual(["u1", "u2"]);
  });

  it("tags someone named in both fields once", () => {
    expect(remeasureNotice({ personInCharge: "lukas@ourfuture.biz", holidayCover: "lukas@ourfuture.biz" }, users, shipment, remeasured).tagged.map((u) => u.id)).toEqual(["u1"]);
  });

  it("tags nobody for empty fields or people who are no users, and still writes the message - with the note", () => {
    const n = remeasureNotice({ personInCharge: "", holidayCover: "someone@else.com" }, users, shipment, { colli: 0, weightKg: 0, volumeCbm: 0 }, "  pallets re-wrapped ");
    expect(n.tagged).toEqual([]);
    expect(n.message).toBe(
      [
        "Cargo has been remeasured by the warehouse.",
        "Shipment values: 20 colli · 3,000.0 kg · 10.000 CBM",
        "Remeasured values: — colli · — kg · — CBM",
        "Note: pallets re-wrapped",
      ].join("\n"),
    );
  });

  it("reads who from a value carrying a stamp's date", () => {
    expect(remeasureNotice({ personInCharge: "martin@ourfuture.biz — 26. 10. 2026 14:03:05" }, users, shipment, remeasured).tagged.map((u) => u.id)).toEqual(["u3"]);
  });
});

describe("the shipment's figures", () => {
  const dims = [
    { pieces: "20", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "150", volumePerPcM3: "0.5" },
    { pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "250", volumePerPcM3: "" },
  ];

  it("adds up the cargo dimension lines: a piece's volume from its sizes, else its typed m³", () => {
    expect(dimensionFigures(dims)).toEqual({ colli: 22, weightKg: 3500, volumeCbm: 11.92 });
    expect(dimensionFigures([])).toEqual({ colli: 0, weightKg: 0, volumeCbm: 0 });
  });

  it("takes what the shipment declares, the lines filling in a missing figure", () => {
    expect(declaredFigures({ pcs: "1,250", totalWeightTons: "4.2", totalVolumeCbm: "12", cargoDimensions: dims })).toEqual({ colli: 1250, weightKg: 4200, volumeCbm: 12 });
    expect(declaredFigures({ pcs: "", totalWeightTons: "", totalVolumeCbm: null, cargoDimensions: dims })).toEqual({ colli: 22, weightKg: 3500, volumeCbm: 11.92 });
  });
});

describe("how the remeasured figures stand to the shipment's", () => {
  // CZLCL00000052: 1 piece, 300 kg, 0.960 CBM declared; the warehouse found 500 kg, 6.292 CBM.
  const declared = { colli: 1, weightKg: 300, volumeCbm: 0.96 };
  const found = { colli: 1, weightKg: 500, volumeCbm: 6.292 };

  it("differs when a figure known on both sides is more or less, and says by how much", () => {
    expect(remeasureVerdict(declared, found)).toBe("differs");
    expect(differenceText(declared, found)).toBe("weight +200.0 kg · volume +5.332 CBM");
    expect(differenceText(found, declared)).toBe("weight −200.0 kg · volume −5.332 CBM");
    expect(remeasureVerdict(declared, { ...declared, colli: 2 })).toBe("differs");
  });

  it("matches when every figure known on both sides is the same, to 0.001", () => {
    expect(remeasureVerdict(declared, { ...declared })).toBe("matches");
    expect(remeasureVerdict(declared, { ...declared, volumeCbm: 0.9605 })).toBe("matches");
    expect(remeasureVerdict(declared, { colli: 1, weightKg: 0, volumeCbm: 0 })).toBe("matches");
    expect(differenceText(declared, { ...declared })).toBe("");
  });

  it("is unknown when no figure is known on both sides and nothing new changes the charge", () => {
    expect(remeasureVerdict(declared, { colli: 0, weightKg: 0, volumeCbm: 0 })).toBe("unknown");
    // A Full Load charged per container, the shipment with no figures at all.
    expect(remeasureVerdict({ colli: 0, weightKg: 0, volumeCbm: 0 }, found, "warehouse", "container")).toBe("unknown");
  });

  // Mock test council Y9: CZ job of 5 pcs and 1,000 kg with no volume; the warehouse measured 4.8 m³.
  describe("a figure only the remeasurement has", () => {
    const ship = { colli: 5, weightKg: 1000, volumeCbm: 0 };
    const re = { colli: 5, weightKg: 1000, volumeCbm: 4.8 };

    it("differs when it changes W/M (1.000 → 4.800) - an Alert - and says what it adds", () => {
      expect(remeasureVerdict(ship, re, "warehouse", "wm")).toBe("differs");
      expect(differenceText(ship, re)).toBe("volume +4.800 CBM");
      expect(remeasureNotice({}, [], ship, re, "", "warehouse", "wm").message).toContain("Difference: volume +4.800 CBM");
    });

    it("differs on an air job when it changes the chargeable weight, and matches when the gross weight still rules", () => {
      // 4.8 m³ is 800 kg volumetric: 1,000 kg stays chargeable.
      expect(remeasureVerdict(ship, re, "warehouse", "air")).toBe("matches");
      expect(remeasureNotice({}, [], ship, re, "", "warehouse", "air").message).toContain("New: volume +4.800 CBM - the shipment values had none; the charge stays the same.");
      expect(remeasureVerdict(ship, { ...re, volumeCbm: 7.2 }, "warehouse", "air")).toBe("differs");
    });

    it("is no difference on a Full Load charged per container, and either charge counts when the job's is not known", () => {
      expect(remeasureVerdict(ship, re, "warehouse", "container")).toBe("matches");
      expect(remeasureVerdict(ship, re)).toBe("differs");
      expect(chargeChanged(ship, { ...re, volumeCbm: 0.5 })).toBe(false);
    });

    it("differs on a shipment with no figures at all, whatever it is charged by", () => {
      const none = { colli: 0, weightKg: 0, volumeCbm: 0 };
      expect(remeasureVerdict(none, found, "warehouse", "wm")).toBe("differs");
      expect(remeasureVerdict(none, found, "warehouse", "air")).toBe("differs");
      expect(remeasureVerdict(none, found)).toBe("differs");
    });

    it("from Warehouse Concept, counts when it moves the charge by more than the tolerance", () => {
      expect(remeasureVerdict(ship, re, "warehouseConcept", "wm")).toBe("differs");
      expect(remeasureVerdict(ship, { ...re, volumeCbm: 1.04 }, "warehouseConcept", "wm")).toBe("matches");
    });
  });

  it("knows what a job is charged by: rail Full Load per container as sea Full Load (P18)", () => {
    expect(chargeKindOf("Air Freight", "Full Load")).toBe("air");
    expect(chargeKindOf("Sea Freight", "Full Load")).toBe("container");
    expect(chargeKindOf(" rail freight ", "full load")).toBe("container");
    expect(chargeKindOf("Sea Freight", "Part Load")).toBe("wm");
    expect(chargeKindOf("Road Freight", "Full Load")).toBe("wm");
    expect(informedCharge(JSON.stringify({ charge: "air" }))).toBe("air");
    expect(informedCharge(JSON.stringify({ colli: 1 }))).toBeUndefined();
    expect(informedCharge("nonsense")).toBeUndefined();
  });

  it("is said in the chat message", () => {
    const users = [{ id: "u1", email: "lukas@ourfuture.biz", displayName: "Lukáš" }];
    expect(remeasureNotice({ personInCharge: "lukas@ourfuture.biz" }, users, declared, { ...declared }).message).toBe(
      [
        "Cargo has been remeasured by the warehouse.",
        "Shipment values: 1 colli · 300.0 kg · 0.960 CBM",
        "Remeasured values: 1 colli · 300.0 kg · 0.960 CBM",
        "The remeasured values match the shipment values.",
        "@Lukáš",
      ].join("\n"),
    );
    expect(remeasureNotice({}, users, declared, found).message).toContain("Difference: weight +200.0 kg · volume +5.332 CBM");
  });
});

// Council finding N1: lines with pieces and sizes but no kg per piece - the weight only in Total Weight.
describe("the shipment's figures a remeasurement on Shipments → Warehouse is compared with", () => {
  const sized = [{ pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "", volumePerPcM3: "" }];

  it("are its cargo lines' totals, a figure they lack from its Pcs, Total Weight or Total Volume", () => {
    expect(dimensionFiguresFilled({ pcs: "3", totalWeightTons: "0.45", totalVolumeCbm: "9", cargoDimensions: sized })).toEqual({ colli: 2, weightKg: 450, volumeCbm: 1.92 });
    expect(dimensionFiguresFilled({ pcs: "1,200", totalWeightTons: null, totalVolumeCbm: null, cargoDimensions: [] })).toEqual({ colli: 1200, weightKg: 0, volumeCbm: 0 });
    expect(shipmentFiguresFor({ pcs: "3", totalWeightTons: "0.45", totalVolumeCbm: "9", cargoDimensions: sized }, "declared")).toEqual({ colli: 3, weightKg: 450, volumeCbm: 9 });
  });

  it("so a heavier remeasurement differs, where the empty weight would have been skipped", () => {
    const ours = dimensionFiguresFilled({ pcs: "", totalWeightTons: "0.45", totalVolumeCbm: null, cargoDimensions: sized });
    expect(remeasureVerdict(ours, { colli: 2, weightKg: 600, volumeCbm: 1.92 })).toBe("differs");
  });
});

// Council finding L6: Warehouse Concept's tolerance - any piece, more than 5 % on weight, volume or W/M.
describe("a remeasurement from Warehouse Concept", () => {
  const ours = { colli: 10, weightKg: 1000, volumeCbm: 2 };

  it("within its tolerance matches - only the chat message - and the message says so", () => {
    expect(withinConceptTolerance(ours, { colli: 10, weightKg: 1050, volumeCbm: 1.9 })).toBe(true);
    expect(remeasureVerdict(ours, { colli: 10, weightKg: 1040, volumeCbm: 2.05 }, "warehouseConcept")).toBe("matches");
    // The Warehouse's own remeasurement has no tolerance.
    expect(remeasureVerdict(ours, { colli: 10, weightKg: 1040, volumeCbm: 2.05 })).toBe("differs");
    const message = remeasureNotice({}, [], ours, { colli: 10, weightKg: 1040, volumeCbm: 2 }, "", "warehouseConcept").message;
    expect(message).toContain("Difference: weight +40.0 kg - within the 5 % tolerance.");
  });

  it("differs on any piece, or more than 5 % on weight, volume or W/M", () => {
    expect(remeasureVerdict(ours, { ...ours, colli: 11 }, "warehouseConcept")).toBe("differs");
    expect(remeasureVerdict(ours, { ...ours, weightKg: 1051 }, "warehouseConcept")).toBe("differs");
    expect(remeasureVerdict(ours, { ...ours, volumeCbm: 1.89 }, "warehouseConcept")).toBe("differs");
    expect(remeasureVerdict({ colli: 1, weightKg: 3800, volumeCbm: 3.9 }, { colli: 1, weightKg: 3950, volumeCbm: 4.09 }, "warehouseConcept")).toBe("matches");
  });

  it("reads where an Inform Operations came from, the Warehouse for an old record", () => {
    expect(informedSource(JSON.stringify({ source: "warehouseConcept" }))).toBe("warehouseConcept");
    expect(informedSource(JSON.stringify({ colli: 1 }))).toBe("warehouse");
    expect(informedSource("nonsense")).toBe("warehouse");
  });
});
