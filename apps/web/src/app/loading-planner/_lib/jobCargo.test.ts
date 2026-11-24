import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { CONTAINERS } from "./containers";
import { jobHref, linesFromSailing, plannerTypeOf } from "./jobCargo";

const line = (over: Partial<interfaces.SailingPlanLine> = {}): interfaces.SailingPlanLine => ({
  packageType: "Pallet",
  pieces: 2,
  lengthCm: 120,
  widthCm: 80,
  heightCm: 100,
  weightPerPcKg: 300,
  stackable: true,
  dangerous: false,
  adrUn: "",
  adrClass: "",
  ...over,
});

describe("a sailing's box as planner cargo (Council Outlay 14, C1)", () => {
  const box = {
    sailingId: "s1",
    reference: "WEEK 51",
    containerType: "40' HC",
    containerCount: 1,
    shipments: [
      { shipmentId: "a", jobNumber: "CZLCL1", totalsOnly: false, lines: [line(), line({ packageType: "Crate", dangerous: true, stackable: false, adrUn: "UN 1263", adrClass: "3" })] },
      { shipmentId: "b", jobNumber: "CZLCL2", totalsOnly: true, lines: [line({ packageType: "", lengthCm: 0, widthCm: 0, heightCm: 0 })] },
    ],
  } as unknown as interfaces.SailingPlanCargo;

  it("puts each shipment's lines under its job number", () => {
    let n = 0;
    const lines = linesFromSailing(box, () => `id${++n}`);
    expect(lines.map((l) => [l.name, l.group])).toEqual([
      ["CZLCL1 · Pallet", "CZLCL1"],
      ["CZLCL1 · Crate", "CZLCL1"],
      ["CZLCL2 · no sizes yet", "CZLCL2"],
    ]);
    expect(lines[0]).toMatchObject({ lengthMm: 1200, widthMm: 800, heightMm: 1000, weightKg: 300, colli: 2, stackable: true });
    // The line's UN number and class go with it, cleaned (P11).
    expect(lines[1]).toMatchObject({ dg: true, stackable: false, un: "1263", dgClass: "3" });
    expect(lines[0]).not.toHaveProperty("un");
    expect(new Set(lines.map((l) => l.id)).size).toBe(3);
  });

  it("finds the planner's container type by the sailing's, and none for a type it has no sizes for", () => {
    expect(plannerTypeOf("40' HC", CONTAINERS)).toBe(CONTAINERS.find((c) => c.name === "40' HC")?.id);
    expect(plannerTypeOf("no such box", CONTAINERS)).toBeNull();
  });

  it("opens a linked sailing on its own page", () => {
    expect(jobHref("sailing", "s1", "WEEK 51")).toBe("/co-loading/-/sailings/s1");
  });
});
