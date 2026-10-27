import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import type { ExchangeRates } from "@/lib/exchangeRates";
import { quoteToCreateRequest, shipmentToQuoteData } from "./quoteToShipment";

const NO_RATES = {} as ExchangeRates;

describe("quote → shipment ports", () => {
  it("takes the quote's POL and POD", () => {
    const req = quoteToCreateRequest("QCZ1", { origin: "Praha (CZPRG)", destination: "Tokyo (JPTYO)", pol: "Hamburg (DEHAM)", pod: "Yokohama (JPYOK)" }, NO_RATES);
    expect(req).toMatchObject({ pol: "Hamburg (DEHAM)", pod: "Yokohama (JPYOK)" });
  });

  it("falls back to origin and destination for a quote without ports", () => {
    const req = quoteToCreateRequest("QCZ1", { origin: "Praha (CZPRG)", destination: "Hamburg (DEHAM)" }, NO_RATES);
    expect(req).toMatchObject({ pol: "Praha (CZPRG)", pod: "Hamburg (DEHAM)" });
  });

  it("copies a shipment's POL and POD back into a quote", () => {
    const data = shipmentToQuoteData({ pol: "Hamburg (DEHAM)", pod: "Yokohama (JPYOK)" } as interfaces.ShipmentItem);
    expect(data).toMatchObject({ pol: "Hamburg (DEHAM)", pod: "Yokohama (JPYOK)" });
  });
});

describe("quote ↔ shipment freight mode", () => {
  it("makes a Sea Break Bulk quote a Sea Break Bulk shipment with no load type, and back", () => {
    const req = quoteToCreateRequest("QCZ1", { serviceType: "Sea Break Bulk" }, NO_RATES);
    expect(req.freightMode).toBe("Sea Break Bulk");
    expect(req.loadType).toBeUndefined();
    expect(shipmentToQuoteData({ freightMode: "Sea Break Bulk", loadType: "" } as interfaces.ShipmentItem).serviceType).toBe("Sea Break Bulk");
  });

  it("reads a sea shipment back as FCL, or LCL when it is a consolidation, never as Break Bulk", () => {
    const quoteOf = (loadType: string) => shipmentToQuoteData({ freightMode: "Sea Freight", loadType } as interfaces.ShipmentItem).serviceType;
    expect(quoteOf("")).toBe("Sea FCL");
    expect(quoteOf("Consolidation")).toBe("Sea LCL");
    expect(quoteOf("Project Shipment")).toBe("Sea FCL");
  });
});

describe("quote ↔ shipment addresses", () => {
  it("gives the shipment the quote's Pickup and Delivery Address", () => {
    const req = quoteToCreateRequest("QCZ1", { pickup: "V jame, Praha 6", delivery: "Dopravni, Praha 11" }, NO_RATES);
    expect(req).toMatchObject({ pickupAddress: "V jame, Praha 6", deliveryAddress: "Dopravni, Praha 11" });
  });

  it("copies a shipment's Pick-up and Delivery Address back into a quote", () => {
    const data = shipmentToQuoteData({ pickupAddress: "V jame, Praha 6", deliveryAddress: "Dopravni, Praha 11" } as interfaces.ShipmentItem);
    expect(data).toMatchObject({ pickup: "V jame, Praha 6", delivery: "Dopravni, Praha 11" });
  });
});

describe("quote ↔ shipment containers", () => {
  const row = (type: string, grossWeight: string): interfaces.ContainerLine => ({
    containerNumber: "",
    sealNumber: "",
    type,
    teu: "",
    packages: "",
    packageType: "",
    grossWeight,
    volume: "",
  });

  it("gives the shipment one container row per box the quote names, with the cargo weight per box", () => {
    const req = quoteToCreateRequest("QCZ1", { serviceType: "Sea FCL", containers: [{ qty: 2, type: "40' HC", weight: 18000 }, { qty: 1, type: "20' GP" }], weight: 36000 }, NO_RATES);
    expect(req.containers).toEqual([row("40' HC", "18000"), row("40' HC", "18000"), row("20' GP", "")]);
    // The boxes carry the weight: the typed total is not sent a second time.
    expect(req.totalWeightTons).toBeUndefined();
  });

  it("counts a shipment's container rows back into the quote's lines", () => {
    const data = shipmentToQuoteData({ containers: [row("40' HC", "18000"), row("40' HC", "18000"), row("20' GP", "")] } as unknown as interfaces.ShipmentItem);
    expect(data.containers).toEqual([{ qty: 2, type: "40' HC", weight: 18000 }, { qty: 1, type: "20' GP" }]);
  });
});

describe("quote → shipment totals", () => {
  it("sends the weight typed for the whole shipment when the package lines carry none, as the quote shows it", () => {
    const req = quoteToCreateRequest("QCZ1", { packages: [{ qty: 2, type: "Pallets", length: 120, width: 80, height: 100 }], weight: 1800 }, NO_RATES);
    expect(req.cargoDimensions).toHaveLength(1);
    expect(req.totalWeightTons).toBe("1.800");
    // the volume is the lines': 2 × 1.2 × 0.8 × 1 = 1.92 cbm
    expect(req.totalVolumeCbm).toBeUndefined();
  });

  it("sends the volume typed for the whole shipment when the package lines have no dimensions", () => {
    const req = quoteToCreateRequest("QCZ1", { packages: [{ qty: 2, type: "Pallets", weight: 300 }], weight: 999, cbm: 2.5 }, NO_RATES);
    expect(req.totalVolumeCbm).toBe("2.5");
    // the weight is the lines': 2 × 300 kg
    expect(req.totalWeightTons).toBeUndefined();
  });

  it("sends neither when the lines give both", () => {
    const req = quoteToCreateRequest("QCZ1", { packages: [{ qty: 1, type: "Pallets", length: 100, width: 100, height: 100, weight: 500 }], weight: 999, cbm: 9 }, NO_RATES);
    expect(req.totalWeightTons).toBeUndefined();
    expect(req.totalVolumeCbm).toBeUndefined();
  });
});

describe("quote ↔ shipment stackable", () => {
  it("gives each dimension row the stackable option of its package line", () => {
    const req = quoteToCreateRequest("QCZ1", { packages: [{ qty: 1, type: "Pallets", stackable: true }, { qty: 1, type: "Pallets", stackable: false }] }, NO_RATES);
    expect(req.cargoDimensions?.map((d) => d.stackable)).toEqual(["Stackable / Overstowable", "Not stackable / Not overstowable"]);
  });

  it("ticks the quote's package lines from the shipment's dimension rows", () => {
    const dim = (stackable: string) => ({ pieces: "1", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "Pallet(s)", stackable });
    const data = shipmentToQuoteData({
      cargoDimensions: [dim("Stackable / Overstowable"), dim("Not stackable / Not overstowable")],
    } as unknown as interfaces.ShipmentItem);
    expect(data.packages?.map((p) => p.stackable)).toEqual([true, false]);
  });
});
