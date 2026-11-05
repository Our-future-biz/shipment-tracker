import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { declaredFigures, dimensionFigures, remeasureNotice } from "../lib/remeasureNotice";

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
