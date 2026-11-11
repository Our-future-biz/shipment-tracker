import { afterEach, describe, expect, it, vi } from "vitest";
import { computeCargo } from "@/app/sales/_lib/salesQuote";
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

describe("shipment → quote volume", () => {
  const dim = (over: Partial<interfaces.CargoDimensionLine>): interfaces.CargoDimensionLine => ({
    pieces: "2",
    lengthCm: "120",
    widthCm: "80",
    heightCm: "100",
    weightPerPcKg: "300",
    volumePerPcM3: "",
    packageType: "Pallet(s)",
    stackable: "",
    ...over,
  });
  const quoteOf = (cargoDimensions: interfaces.CargoDimensionLine[], totalVolumeM3: string) =>
    shipmentToQuoteData({ cargoDimensions, totalVolumeM3 } as unknown as interfaces.ShipmentItem);

  it("keeps the sizes of the packages when every row has them, the quote working out its volume from them", () => {
    const data = quoteOf([dim({})], "1.92");
    expect(data.packages).toEqual([{ qty: 2, type: "Pallets", length: 120, width: 80, height: 100, weight: 300, stackable: undefined }]);
    expect(computeCargo(data)).toMatchObject({ cbm: 1.92, cbmFromLines: true });
  });

  it("takes the shipment's volume, typed rows counted, when a row has an m³ typed instead of its sizes", () => {
    // 2 × 1.92 m³ worked out + 4 × 0.6 m³ typed = 4.32 m³, the shipment's total.
    const data = quoteOf([dim({}), dim({ pieces: "4", lengthCm: "", widthCm: "", heightCm: "", volumePerPcM3: "0.6" })], "4.32");
    expect(data.packages?.map((p) => [p.qty, p.length, p.width, p.height, p.weight])).toEqual([
      [2, undefined, undefined, undefined, 300],
      [4, undefined, undefined, undefined, 300],
    ]);
    expect(computeCargo(data)).toMatchObject({ cbm: 4.32, cbmFromLines: false, totalPackages: 6, grossWeight: 1800 });
  });

  it("goes by the sizes where a typed m³ sits beside all three", () => {
    const data = quoteOf([dim({ volumePerPcM3: "9" })], "1.92");
    expect(data.packages?.[0]).toMatchObject({ length: 120, width: 80, height: 100 });
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

describe("quote ↔ shipment dangerous goods", () => {
  const ADR = { adrUn: "UN 1203", adrClass: "3", adrPackingGroup: "II" as const, adrLimitedQuantity: true };
  const pallet = { qty: 2, type: "Pallets", weight: 400 };

  it("marks the shipment Dangerous and puts the ADR details on its one cargo line, the UN number as four digits", () => {
    const req = quoteToCreateRequest("QCZ1", { dangerous: true, adr: ADR, packages: [pallet] }, NO_RATES);
    expect(req.dangerous).toBe("Yes");
    expect(req.cargoDimensions?.[0]).toMatchObject({ adrUn: "1203", adrClass: "3", adrPackingGroup: "II", adrLimitedQuantity: true });
  });

  it("prefills them on every cargo line when there are several", () => {
    const several = quoteToCreateRequest("QCZ1", { dangerous: true, adr: ADR, packages: [pallet, { ...pallet, qty: 3 }] }, NO_RATES);
    expect(several.dangerous).toBe("Yes");
    expect(several.cargoDimensions).toHaveLength(2);
    expect(several.cargoDimensions?.every((d) => d.adrUn === "1203" && d.adrPackingGroup === "II")).toBe(true);
  });

  it("gives a container quote, which has no package lines, one cargo line carrying them", () => {
    const req = quoteToCreateRequest("QCZ1", { dangerous: true, adr: ADR, containers: [{ qty: 3, type: "40' HC", weight: 15000 }] }, NO_RATES);
    expect(req.containers).toHaveLength(3);
    expect(req.cargoDimensions).toEqual([
      { containerId: null, pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "", stackable: "", adrUn: "1203", adrClass: "3", adrPackingGroup: "II", adrLimitedQuantity: true },
    ]);
  });

  it("adds no cargo line for a dangerous quote that names no ADR details, and leaves out a UN number the shipment would refuse", () => {
    const bare = quoteToCreateRequest("QCZ1", { dangerous: true, containers: [{ qty: 1, type: "20' DC" }] }, NO_RATES);
    expect(bare.dangerous).toBe("Yes");
    expect(bare.cargoDimensions).toBeUndefined();
    const badUn = quoteToCreateRequest("QCZ1", { dangerous: true, adr: { ...ADR, adrUn: "12" }, packages: [pallet] }, NO_RATES);
    expect(badUn.cargoDimensions?.[0]).toMatchObject({ adrUn: null, adrClass: "3" });
  });

  it("takes nothing of ADR details left on a quote that is not dangerous", () => {
    const req = quoteToCreateRequest("QCZ1", { dangerous: false, adr: ADR, packages: [pallet] }, NO_RATES);
    expect(req.dangerous).toBeUndefined();
    expect(req.cargoDimensions?.[0]?.adrUn).toBeUndefined();
  });

  it("ticks Dangerous goods on a quote copied from a shipment with ADR details on a cargo line, and takes them", () => {
    const line = { pieces: "1", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "Pallet(s)", stackable: "" };
    const data = shipmentToQuoteData({
      cargoDimensions: [line, { ...line, adrUn: "1203", adrClass: "3", adrPackingGroup: "II", adrLimitedQuantity: false }],
    } as unknown as interfaces.ShipmentItem);
    expect(data).toMatchObject({ dangerous: true, adr: { adrUn: "1203", adrClass: "3", adrPackingGroup: "II", adrLimitedQuantity: false } });
    expect(shipmentToQuoteData({ dangerous: "No", cargoDimensions: [line] } as unknown as interfaces.ShipmentItem).dangerous).toBeUndefined();
  });
});

describe("quote → shipment Customer's PIC", () => {
  it("gives the shipment the quote's contact person with the contact's id", () => {
    const data = { customerId: "k1", customerName: "Acme", customerContact: "Petr Masák", customerContactId: "c1" };
    const req = quoteToCreateRequest("QCZ1", data, NO_RATES);
    expect(req).toMatchObject({ customerId: "k1", customerPic: "Petr Masák", customerPicContactId: "c1" });
  });

  it("sends no contact id for a quote that keeps none", () => {
    const req = quoteToCreateRequest("QCZ1", { customerId: "k1", customerContact: "Petr" }, NO_RATES);
    expect(req.customerPic).toBe("Petr");
    expect(req).not.toHaveProperty("customerPicContactId");
    const cleared = quoteToCreateRequest("QCZ1", { customerContact: "Petr", customerContactId: null }, NO_RATES);
    expect(cleared).not.toHaveProperty("customerPicContactId");
  });
});

describe("quote → shipment Validity Status", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts the day on the company's calendar: past midnight in Prague a quote valid until yesterday is to be checked", () => {
    // 00:30 on 11 November in Prague, still 10 November in UTC
    vi.useFakeTimers({ now: new Date("2026-11-10T23:30:00Z") });
    expect(quoteToCreateRequest("QCZ1", { validUntil: "2026-11-10" }, NO_RATES).validityStatus).toBe("Check");
    expect(quoteToCreateRequest("QCZ1", { validUntil: "2026-11-11" }, NO_RATES).validityStatus).toBe("Ok");
  });
});
