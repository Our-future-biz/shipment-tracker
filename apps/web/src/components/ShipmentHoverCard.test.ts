import { describe, expect, it } from "vitest";
import type { ShipmentItem } from "@/hooks/useShipments";
import { cargoLine, cargoTotals, piecesText, volumeText, weightText } from "./ShipmentHoverCard";

type Container = NonNullable<ShipmentItem["containers"]>[number];
type Item = NonNullable<ShipmentItem["cargoItems"]>[number];
type Dim = NonNullable<ShipmentItem["cargoDimensions"]>[number];

// Only the fields the card reads; the rest of a ShipmentItem does not matter here.
const ship = (o: Partial<ShipmentItem> = {}): ShipmentItem =>
  ({
    customer: "RAVAK a.s.",
    freightMode: "Sea Freight",
    loadType: "Consolidation",
    tradeDirection: "Import",
    pcs: "",
    typeOfPackages: "",
    totalWeightTons: null,
    totalVolumeCbm: null,
    containers: [],
    cargoItems: [],
    cargoDimensions: [],
    ...o,
  }) as ShipmentItem;

const box = (type: string, grossWeight = "", o: Partial<Container> = {}): Container => ({
  containerNumber: "", sealNumber: "", type, teu: "", packages: "", packageType: "", grossWeight, volume: "", ...o,
});
const item = (pieces: string, packageType: string, grossWeight: string): Item => ({
  containerId: null, cargoDescription: "", hsCode: "", pieces, packageType, grossWeight, commercialInvoiceValue: "", currency: "",
});
const dim = (pieces: string, l: string, w: string, h: string, kgPerPc: string, packageType: string): Dim => ({
  containerId: null, pieces, lengthCm: l, widthCm: w, heightCm: h, weightPerPcKg: kgPerPc, packageType, stackable: "",
});

describe("cargoTotals", () => {
  it("counts from the dimension lines when there is nothing else", () => {
    const t = cargoTotals(ship({ cargoDimensions: [dim("10", "60", "50", "115", "264.4", "Cartons")] }));
    expect(t.pcs).toBe(10);
    expect(Math.round(t.kg)).toBe(2644);
    expect(t.m3).toBeCloseTo(3.45, 2);
  });
  it("prefers containers, then cargo items, as the API does", () => {
    const t = cargoTotals(
      ship({
        containers: [box("40' HC", "9000", { packages: "20" }), box("20' DC", "1450", { packages: "5", volume: "12.5" })],
        cargoItems: [item("99", "Cartons", "1")],
        cargoDimensions: [dim("1", "100", "100", "100", "5", "Cartons")],
      }),
    );
    expect(t).toEqual({ pcs: 25, kg: 10450, m3: 12.5 });
    const i = cargoTotals(ship({ cargoItems: [item("6", "Pallet(s)", "4200")] }));
    expect(i.pcs).toBe(6);
    expect(i.kg).toBe(4200);
  });
  it("falls back to the stored pcs, tons and cbm without any rows", () => {
    expect(cargoTotals(ship({ pcs: "1,353", totalWeightTons: "4,2", totalVolumeCbm: "9.6" }))).toEqual({ pcs: 1353, kg: 4200, m3: 9.6 });
  });
});

describe("piecesText / weightText / volumeText", () => {
  it("formats each part and leaves out what is missing", () => {
    expect(piecesText(10)).toBe("10 pcs");
    expect(piecesText(0)).toBe("");
    expect(weightText(2644.4)).toBe("2644 kg");
    expect(weightText(18450)).toBe("18450 kg");
    expect(weightText(2.5)).toBe("2.5 kg");
    expect(weightText(0)).toBe("");
    expect(volumeText(3.4512)).toBe("3.45 cbm");
    expect(volumeText(0.004)).toBe("<0.01 cbm");
    expect(volumeText(0)).toBe("");
  });
});

describe("cargoLine", () => {
  it("reads pieces, total weight and total cbm", () => {
    expect(cargoLine(ship({ cargoDimensions: [dim("10", "60", "50", "115", "264.4", "Cartons")] }))).toBe("10 pcs, 2644 kg, 3.45 cbm");
  });
  it("leaves out the parts without a value, and is empty with no cargo", () => {
    expect(cargoLine(ship({ cargoItems: [item("6", "Pallet(s)", "4200")] }))).toBe("6 pcs, 4200 kg");
    expect(cargoLine(ship())).toBe("");
  });
});
