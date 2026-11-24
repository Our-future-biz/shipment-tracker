import { describe, expect, it } from "vitest";
import { STACKABLE } from "../lib/cargoProjection";
import { planCargoOf, planLinesOf, sailingReference } from "../lib/coLoadingPlanCargo";

const row = (more = {}) => ({ pieces: "4", lengthCm: "120", widthCm: "80", heightCm: "150", weightPerPcKg: "450", volumePerPcM3: null, stackable: STACKABLE, adrUn: null, adrClass: null, packageType: " Pallet ", ...more });
const job = (n: number, more = {}) => ({ id: `id${n}`, jobNumber: `CZLCL0000000${n}`, dangerous: "", pcs: "", totalWeightTons: null as string | null, cargoDimensions: [row()], cancelled: false, ...more });
const sailing = { id: "s1", serviceId: "svc", vessel: "WEEK 51", voyage: "", containerType: "40' HC", containerCount: 1 };

describe("a sailing's box for the Loading Planner (Council Outlay 14, C1)", () => {
  it("names the sailing for a plan, within the planner's limit", () => {
    expect(sailingReference({ vessel: "MSC Anna", voyage: "445W" }, "Import from Shanghai")).toBe("MSC Anna 445W · Import from Shanghai");
    expect(sailingReference({ vessel: "WEEK 51", voyage: "" }, "")).toBe("WEEK 51");
    expect(sailingReference({ vessel: "V".repeat(80), voyage: "" }, "Service").length).toBe(60);
  });

  it("gives each Dimensions row as a line: type, pieces, sizes in cm, weight per piece", () => {
    expect(planLinesOf(job(1))).toEqual({
      totalsOnly: false,
      lines: [{ packageType: "Pallet", pieces: 4, lengthCm: 120, widthCm: 80, heightCm: 150, weightPerPcKg: 450, stackable: true, dangerous: false }],
    });
  });

  it("marks a line dangerous when it names a UN number or a class, or the shipment is ticked so", () => {
    expect(planLinesOf(job(1, { cargoDimensions: [row({ adrUn: "1263" }), row()] })).lines.map((l) => l.dangerous)).toEqual([true, false]);
    expect(planLinesOf(job(1, { dangerous: "Yes" })).lines[0]!.dangerous).toBe(true);
  });

  it("keeps a row with pieces but no sizes as a line to finish, and leaves an empty row out", () => {
    const { lines } = planLinesOf(job(1, { cargoDimensions: [row({ lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "" }), row({ pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "" })] }));
    expect(lines).toEqual([{ packageType: "Pallet", pieces: 4, lengthCm: 0, widthCm: 0, heightCm: 0, weightPerPcKg: 0, stackable: true, dangerous: false }]);
  });

  it("gives a shipment with totals only one line with no sizes: its colli and its weight a piece, never a guessed size", () => {
    expect(planLinesOf(job(1, { cargoDimensions: [], pcs: "8", totalWeightTons: "1.95" }))).toEqual({
      totalsOnly: true,
      lines: [{ packageType: "", pieces: 8, lengthCm: 0, widthCm: 0, heightCm: 0, weightPerPcKg: 243.8, stackable: false, dangerous: false }],
    });
    expect(planLinesOf(job(1, { cargoDimensions: [], pcs: "", totalWeightTons: null })).lines[0]).toMatchObject({ pieces: 1, weightPerPcKg: 0 });
  });

  it("holds the counted shipments by job number, with the sailing's containers; a cancelled one is not in the box", () => {
    const box = planCargoOf({ ...sailing, containerCount: 2 }, "Import from Shanghai", [job(3), job(1), job(2, { cancelled: true })]);
    expect(box).toMatchObject({ sailingId: "s1", serviceId: "svc", reference: "WEEK 51 · Import from Shanghai", containerType: "40' HC", containerCount: 2 });
    expect(box.shipments.map((s) => s.jobNumber)).toEqual(["CZLCL00000001", "CZLCL00000003"]);
  });
});
