import { describe, expect, it, vi } from "vitest";

// The engine is pure; only the default service levels come from the settings rules, which load encore.dev/api.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
import {
  applyDiscount,
  chargeable,
  findZone,
  fuelIndexFor,
  isPriced,
  laneMatches,
  margin,
  promise,
  rateOnVersion,
  roundToStep,
  roundUpToStep,
  sortBuy,
  bandStart,
  ratePrice,
  type RatingTariff,
  type Shipment,
} from "../lib/rateEngine";
import { DEFAULT_SERVICE_LEVELS } from "../lib/settingsRules";
import type { PricedSide, ServiceLevelCode, TariffSurcharge, TariffVersionInput, Unpriced } from "../interfaces/interfaces";

const input = (over: Partial<TariffVersionInput> = {}): TariffVersionInput => ({
  validFrom: "2026-01-01",
  validTo: null,
  factors: { kgPerLdm: 1750, kgPerCbm: 250, kgPerPalletPlace: 400 },
  rounding: { weightStepKg: 1, moneyStep: 0.01 },
  zones: [
    { code: "1", label: "Praha", postcodeFrom: "10000", postcodeTo: "19999", remote: false },
    { code: "6", label: "Brno region", postcodeFrom: "60000", postcodeTo: "69999", remote: false },
    { code: "6R", label: "Brno remote", postcodeFrom: "67900", postcodeTo: "67999", remote: true },
  ],
  bands: [
    { id: "b1", basis: "KG", fromExcl: 0, toIncl: 100 },
    { id: "b2", basis: "KG", fromExcl: 100, toIncl: 500 },
    { id: "b3", basis: "KG", fromExcl: 500, toIncl: 1000 },
    { id: "b4", basis: "KG", fromExcl: 1000, toIncl: null },
    { id: "p1", basis: "PALLET", fromExcl: 0, toIncl: 3 },
    { id: "p2", basis: "PALLET", fromExcl: 3, toIncl: null },
    { id: "l1", basis: "LDM", fromExcl: 0, toIncl: 13.6 },
  ],
  rates: [
    { serviceLevel: "D1", zoneCode: "1", bandId: "b1", amount: 500, priceType: "FLAT" },
    { serviceLevel: "D1", zoneCode: "1", bandId: "b2", amount: 4, priceType: "PER_UNIT" },
    { serviceLevel: "D1", zoneCode: "1", bandId: "b3", amount: 3, priceType: "PER_UNIT" },
    { serviceLevel: "D1", zoneCode: "1", bandId: "b4", amount: 250, priceType: "PER_100KG" },
    { serviceLevel: "D1", zoneCode: "6", bandId: "b1", amount: 800, priceType: "FLAT" },
    { serviceLevel: "D1", zoneCode: "6", bandId: "b2", amount: 1200, priceType: "FLAT" },
    { serviceLevel: "D1", zoneCode: "6R", bandId: "b1", amount: 900, priceType: "FLAT" },
    { serviceLevel: "D2", zoneCode: "1", bandId: "p1", amount: 700, priceType: "PER_UNIT" },
    { serviceLevel: "D2", zoneCode: "1", bandId: "p2", amount: 600, priceType: "PER_UNIT" },
    { serviceLevel: "D3", zoneCode: "1", bandId: "b1", amount: 400, priceType: "FLAT" },
    { serviceLevel: "D4", zoneCode: "1", bandId: "l1", amount: 2000, priceType: "PER_UNIT" },
  ],
  minCharges: [{ serviceLevel: "D1", zoneCode: "1", amount: 600 }],
  surcharges: [],
  notes: "",
  ...over,
});

const tariff = (over: Partial<RatingTariff> = {}): RatingTariff => ({
  id: "t1",
  name: "Standard LTL",
  ownerCustomerId: null,
  ownerName: null,
  currency: "CZK",
  zoneBy: "DESTINATION",
  ...over,
});

const NO_EXTRAS = { adr: false, tailLift: false, avizace: false, timeWindow: false, b2c: false, nonStackable: false, waitingHours: 0, declaredValueCzk: null };

const ship = (over: Partial<Shipment> = {}): Shipment => ({
  fromPostcode: "11000",
  toPostcode: "11000",
  pickupDate: "2026-10-15",
  palletPlaces: 0,
  ldm: 0,
  weightKg: 300,
  cbm: 0,
  extras: NO_EXTRAS,
  ...over,
});

const rate = (
  s: Partial<Shipment> = {},
  v: Partial<TariffVersionInput> = {},
  level: ServiceLevelCode = "D1",
  t: Partial<RatingTariff> = {},
  fuel: { month: string; percent: number }[] = [],
  fx: { rate: number; date: string } | null = null,
) => rateOnVersion(tariff(t), { id: "v1", versionNo: 3, input: input(v) }, level, ship(s), fuel, fx);

const priced = (r: PricedSide | Unpriced): PricedSide => {
  if (!isPriced(r)) throw new Error(`Unpriced: ${r.reason}`);
  return r;
};
const line = (r: PricedSide, code: string) => r.lines.find((l) => l.code === code);
const surcharge = (over: Partial<TariffSurcharge>): TariffSurcharge => ({ code: "FUEL", calc: "FLAT", value: 0, min: null, onBasePlusSurcharges: false, ...over });

describe("chargeable weight", () => {
  it("names the actual weight when it wins (and on a tie)", () => {
    expect(chargeable("KG", ship({ weightKg: 900, palletPlaces: 1 }), input())).toEqual({ basis: "KG", quantity: 900, explanation: "900 kg (actual weight)" });
    expect(chargeable("KG", ship({ weightKg: 400, palletPlaces: 1 }), input()).explanation).toBe("400 kg (actual weight)");
  });

  it("lets pallet places, loading metres or cubic metres win, saying which", () => {
    expect(chargeable("KG", ship({ weightKg: 900, palletPlaces: 3 }), input())).toMatchObject({ quantity: 1200, explanation: "1 200 kg (3 pallets × 400 kg beats 900 kg actual)" });
    expect(chargeable("KG", ship({ weightKg: 900, ldm: 2.4 }), input())).toMatchObject({ quantity: 4200, explanation: "4 200 kg (2.4 ldm × 1 750 kg beats 900 kg actual)" });
    expect(chargeable("KG", ship({ weightKg: 900, cbm: 5.5 }), input())).toMatchObject({ quantity: 1375, explanation: "1 375 kg (5.5 cbm × 250 kg beats 900 kg actual)" });
  });

  it("rounds up to the weight step", () => {
    expect(chargeable("KG", ship({ weightKg: 100.2 }), input()).quantity).toBe(101);
    expect(chargeable("KG", ship({ weightKg: 1201 }), input({ rounding: { weightStepKg: 50, moneyStep: 1 } })).quantity).toBe(1250);
    expect(chargeable("KG", ship({ weightKg: 1250 }), input({ rounding: { weightStepKg: 50, moneyStep: 1 } })).quantity).toBe(1250);
    expect(chargeable("KG", ship({ weightKg: 0, cbm: 0.7 }), input()).quantity).toBe(175); // 0.7 × 250 is 174.99999… in binary
  });

  it("reads pallets as they are, LDM rounded up to 0.1, and a trip as 1", () => {
    expect(chargeable("PALLET", ship({ palletPlaces: 3, weightKg: 5000 }), input())).toEqual({ basis: "PALLET", quantity: 3, explanation: "3 pallet places" });
    expect(chargeable("LDM", ship({ ldm: 2.41 }), input())).toEqual({ basis: "LDM", quantity: 2.5, explanation: "2.5 ldm" });
    expect(chargeable("LDM", ship({ ldm: 2.4 }), input()).quantity).toBe(2.4);
    expect(chargeable("TRIP", ship(), input())).toEqual({ basis: "TRIP", quantity: 1, explanation: "1 trip" });
  });
});

describe("zone", () => {
  it("takes the narrowest range holding the postcode", () => {
    const zones = input().zones;
    expect(findZone(zones, "67950")?.code).toBe("6R");
    expect(findZone(zones, "60200")?.code).toBe("6");
    expect(findZone(zones, "79001")).toBeNull();
  });

  it("zones by destination by default and by origin when the tariff says so", () => {
    expect(priced(rate({ fromPostcode: "11000", toPostcode: "60200" })).zoneCode).toBe("6");
    expect(priced(rate({ fromPostcode: "11000", toPostcode: "60200" }, {}, "D1", { zoneBy: "ORIGIN" })).zoneCode).toBe("1");
  });

  it("is unpriced when no zone holds the postcode", () => {
    expect(rate({ toPostcode: "79001" })).toEqual({ reason: "No zone for postcode 790 01 in Standard LTL" });
  });

  it("is unpriced when the level or the zone has no prices", () => {
    expect(rate({}, {}, "EXP_1000")).toEqual({ reason: "Standard LTL has no EXP_1000 prices" });
    expect(rate({ toPostcode: "60200" }, {}, "D2")).toEqual({ reason: "Standard LTL has no D2 price for zone 6" });
  });
});

describe("band and freight", () => {
  it("picks the band where fromExcl < q <= toIncl", () => {
    expect(priced(rate({ weightKg: 100 })).bandLabel).toBe("1–100 kg");
    expect(priced(rate({ weightKg: 101 })).bandLabel).toBe("101–500 kg");
  });

  it("prices PER_UNIT as amount × quantity", () => {
    const r = priced(rate({ weightKg: 200 }));
    expect(line(r, "FREIGHT")).toMatchObject({ qty: 200, unit: "kg", unitPrice: 4, amount: 800 });
    expect(r.total).toBe(800);
  });

  it("prices PER_100KG per started 100 kg, in the open top band", () => {
    const r = priced(rate({ weightKg: 1250 }));
    expect(r.bandLabel).toBe("over 1 000 kg");
    expect(line(r, "FREIGHT")).toMatchObject({ qty: 13, unit: "100 kg", unitPrice: 250, amount: 3250 });
  });

  it("prices FLAT as the amount, raised to the minimum charge", () => {
    expect(line(priced(rate({ weightKg: 50 })), "FREIGHT")).toMatchObject({ amount: 600, label: "Freight D1, zone 1, 1–100 kg — minimum charge" });
    expect(line(priced(rate({ toPostcode: "60200", weightKg: 50 })), "FREIGHT")).toMatchObject({ amount: 800, qty: 1, unitPrice: 800 });
  });

  it("charges the next band's lower price at a break-point, and says so", () => {
    // 480 × 4 = 1 920; the next band "501–1 000 kg" holds 501 kg at least: 501 × 3 = 1 503
    const r = priced(rate({ weightKg: 480 }));
    expect(line(r, "FREIGHT")).toMatchObject({ amount: 1503 });
    expect(line(r, "FREIGHT")!.label).toContain("break-point");
    expect(line(priced(rate({ weightKg: 300 })), "FREIGHT")).toMatchObject({ amount: 1200 }); // 300 × 4 is cheaper
  });

  it("looks for the break-point over every higher band, not only the next one", () => {
    // 480 kg × 4 = 1 920; the next band (500 kg × 3.9 = 1 950) is dearer, but 1 000 kg flat 1 700 is cheaper.
    const v = {
      rates: [
        { serviceLevel: "D1" as const, zoneCode: "1", bandId: "b2", amount: 4, priceType: "PER_UNIT" as const },
        { serviceLevel: "D1" as const, zoneCode: "1", bandId: "b3", amount: 3.9, priceType: "PER_UNIT" as const },
        { serviceLevel: "D1" as const, zoneCode: "1", bandId: "b4", amount: 1700, priceType: "FLAT" as const },
      ],
    };
    const r = priced(rate({ weightKg: 480 }, v));
    expect(line(r, "FREIGHT")).toMatchObject({ amount: 1700, label: expect.stringContaining("over 1 000 kg price (break-point") });
  });

  it("starts a higher band one step above its exclusive lower limit", () => {
    expect(bandStart({ id: "x", basis: "KG", fromExcl: 1000, toIncl: 1500 }, 1)).toBe(1001);
    expect(bandStart({ id: "x", basis: "KG", fromExcl: 1000, toIncl: 1500 }, 10)).toBe(1010);
    expect(bandStart({ id: "x", basis: "LDM", fromExcl: 2.5, toIncl: 5 }, 1)).toBe(2.6);
    expect(bandStart({ id: "x", basis: "PALLET", fromExcl: 3, toIncl: null }, 1)).toBe(4);
    // PER_100KG at 1 001 kg charges 11 hundreds, not 10
    expect(ratePrice({ amount: 100, priceType: "PER_100KG" }, bandStart({ id: "x", basis: "KG", fromExcl: 1000, toIncl: null }, 1))).toBe(1100);
  });

  it("prices pallets and loading metres on their own basis", () => {
    const pal = priced(rate({ palletPlaces: 4, weightKg: 100 }, {}, "D2"));
    expect(pal.chargeable).toEqual({ basis: "PALLET", quantity: 4, explanation: "4 pallet places" });
    expect(line(pal, "FREIGHT")).toMatchObject({ qty: 4, unit: "pallet", amount: 2400 });
    expect(line(priced(rate({ ldm: 2.41 }, {}, "D4")), "FREIGHT")).toMatchObject({ qty: 2.5, unit: "ldm", amount: 5000 });
  });

  it("prices a trip once", () => {
    const v = { bands: [{ id: "t", basis: "TRIP" as const, fromExcl: 0, toIncl: null }], rates: [{ serviceLevel: "D1" as const, zoneCode: "1", bandId: "t", amount: 14500, priceType: "FLAT" as const }], minCharges: [] };
    const r = priced(rate({ weightKg: 12000 }, v));
    expect(r.chargeable.explanation).toBe("1 trip");
    expect(line(r, "FREIGHT")).toMatchObject({ qty: 1, unit: "trip", amount: 14500 });
  });

  it("is unpriced above the top band and with nothing to charge", () => {
    expect(rate({ weightKg: 150 }, {}, "D3")).toEqual({ reason: "Above the top band — price on request" });
    expect(rate({ palletPlaces: 0 }, {}, "D2")).toEqual({ reason: "Nothing to charge: give the pallet places" });
  });
});

describe("surcharges", () => {
  it("adds FLAT, PER_KG, PER_PALLET and PER_HOUR amounts only when their extra is asked for", () => {
    const surcharges = [
      surcharge({ code: "ADR", calc: "FLAT", value: 300 }),
      surcharge({ code: "AVIZACE", calc: "PER_KG", value: 0.1, min: 50 }),
      surcharge({ code: "NON_STACKABLE", calc: "PER_PALLET", value: 150 }),
      surcharge({ code: "WAITING_TIME", calc: "PER_HOUR", value: 500 }),
      surcharge({ code: "TAIL_LIFT", calc: "FLAT", value: 400 }),
    ];
    const none = priced(rate({ weightKg: 200 }, { surcharges }));
    expect(none.lines.map((l) => l.code)).toEqual(["FREIGHT"]);
    const extras = { ...NO_EXTRAS, adr: true, avizace: true, nonStackable: true, waitingHours: 1.5 };
    const all = priced(rate({ weightKg: 200, palletPlaces: 2, extras }, { surcharges }));
    // 2 pallets × 400 kg = 800 kg chargeable, band 501–1 000 kg at 3 per kg
    expect(all.lines.map((l) => [l.code, l.amount])).toEqual([
      ["FREIGHT", 2400],
      ["ADR", 300],
      ["AVIZACE", 80],
      ["NON_STACKABLE", 300],
      ["WAITING_TIME", 750],
    ]);
    expect(all.total).toBe(2400 + 300 + 80 + 300 + 750);
  });

  it("respects each surcharge's minimum", () => {
    const surcharges = [surcharge({ code: "AVIZACE", calc: "PER_KG", value: 0.1, min: 50 })];
    const r = priced(rate({ weightKg: 200, extras: { ...NO_EXTRAS, avizace: true } }, { surcharges }));
    expect(line(r, "AVIZACE")).toMatchObject({ amount: 50, label: "Delivery notice (avizace) — minimum" });
  });

  it("charges insurance as a % of the declared value only when a value is declared", () => {
    const surcharges = [surcharge({ code: "INSURANCE", calc: "PCT_OF_VALUE", value: 0.3, min: 200 })];
    expect(line(priced(rate({}, { surcharges })), "INSURANCE")).toBeUndefined();
    expect(line(priced(rate({ extras: { ...NO_EXTRAS, declaredValueCzk: 500000 } }, { surcharges })), "INSURANCE")).toMatchObject({ amount: 1500 });
    expect(line(priced(rate({ extras: { ...NO_EXTRAS, declaredValueCzk: 10000 } }, { surcharges })), "INSURANCE")).toMatchObject({ amount: 200 });
  });

  it("adds the remote-area surcharge only in a remote zone", () => {
    const surcharges = [surcharge({ code: "REMOTE_AREA", calc: "FLAT", value: 250 })];
    expect(line(priced(rate({ toPostcode: "60200", weightKg: 50 }, { surcharges })), "REMOTE_AREA")).toBeUndefined();
    expect(line(priced(rate({ toPostcode: "67950", weightKg: 50 }, { surcharges })), "REMOTE_AREA")).toMatchObject({ amount: 250 });
  });

  it("puts a PCT on freight only, or on freight + amount surcharges", () => {
    const flat = surcharge({ code: "ADR", calc: "FLAT", value: 200 });
    const extras = { ...NO_EXTRAS, adr: true };
    const onFreight = priced(rate({ weightKg: 200, extras }, { surcharges: [surcharge({ code: "TOLL", calc: "PCT", value: 10 }), flat] }));
    expect(onFreight.lines.map((l) => l.code)).toEqual(["FREIGHT", "ADR", "TOLL"]); // amounts first, then percentages
    expect(line(onFreight, "TOLL")).toMatchObject({ amount: 80, label: "Toll 10 %" });
    const onAll = priced(rate({ weightKg: 200, extras }, { surcharges: [surcharge({ code: "TOLL", calc: "PCT", value: 10, onBasePlusSurcharges: true }), flat] }));
    expect(line(onAll, "TOLL")).toMatchObject({ amount: 100 });
  });

  it("applies FUEL and TOLL always", () => {
    const surcharges = [surcharge({ code: "FUEL", calc: "PCT", value: 12.5 }), surcharge({ code: "TOLL", calc: "FLAT", value: 99 })];
    expect(priced(rate({ weightKg: 200 }, { surcharges })).lines.map((l) => [l.code, l.amount])).toEqual([["FREIGHT", 800], ["TOLL", 99], ["FUEL", 100]]);
  });

  it("takes the fuel index of the pickup month, else the latest earlier month, else 0 %", () => {
    const surcharges = [surcharge({ code: "FUEL", calc: "FUEL_INDEX" })];
    const months = [{ month: "2026-08", percent: 10 }, { month: "2026-10", percent: 12 }, { month: "2026-11", percent: 50 }];
    expect(line(priced(rate({ weightKg: 200 }, { surcharges }, "D1", {}, months)), "FUEL")).toMatchObject({ amount: 96, label: "Fuel surcharge 12 % (index 2026-10)" });
    const earlier = line(priced(rate({ weightKg: 200, pickupDate: "2026-09-20" }, { surcharges }, "D1", {}, months)), "FUEL");
    expect(earlier).toMatchObject({ amount: 80, label: "Fuel surcharge 10 % (index 2026-08; 2026-09 not set)" });
    const none = line(priced(rate({ weightKg: 200, pickupDate: "2026-07-01" }, { surcharges: [surcharge({ code: "FUEL", calc: "FUEL_INDEX", min: 100 })] }, "D1", {}, months)), "FUEL");
    expect(none).toMatchObject({ amount: 0, label: "Fuel surcharge — Fuel index not set" });
    expect(fuelIndexFor([], "2026-10-01")).toBeNull();
  });

  it("reports a missing or an earlier month's fuel index as a finding; none when the month has its own", () => {
    const surcharges = [surcharge({ code: "FUEL", calc: "FUEL_INDEX" })];
    const months = [{ month: "2026-08", percent: 10 }, { month: "2026-10", percent: 12 }];
    expect(priced(rate({ weightKg: 200 }, { surcharges }, "D1", {}, months)).findings).toBeUndefined();
    expect(priced(rate({ weightKg: 200, pickupDate: "2026-09-20" }, { surcharges }, "D1", {}, months)).findings).toEqual([
      "Fuel index for 2026-09 not set: the 2026-08 index (10 %) was used",
    ]);
    expect(priced(rate({ weightKg: 200, pickupDate: "2026-07-01" }, { surcharges }, "D1", {}, months)).findings).toEqual([
      "No fuel index for 2026-07: the fuel surcharge is priced at 0",
    ]);
    // A tariff without a fuel-index surcharge has nothing to report.
    expect(priced(rate({ weightKg: 200, pickupDate: "2026-07-01" }, {}, "D1", {}, months)).findings).toBeUndefined();
  });

  it("never charges a redelivery at rating", () => {
    expect(line(priced(rate({}, { surcharges: [surcharge({ code: "REDELIVERY", calc: "FLAT", value: 500 })] })), "REDELIVERY")).toBeUndefined();
  });
});

describe("money", () => {
  it("rounds each line to the money step and totals the rounded lines", () => {
    const surcharges = [surcharge({ code: "FUEL", calc: "PCT", value: 3.33 })];
    const cents = priced(rate({ weightKg: 201 }, { surcharges })); // 804 × 3.33 % = 26.7732
    expect(line(cents, "FUEL")!.amount).toBe(26.77);
    expect(cents.total).toBe(830.77);
    const whole = priced(rate({ weightKg: 201 }, { surcharges, rounding: { weightStepKg: 1, moneyStep: 1 } }));
    expect(whole.lines.map((l) => l.amount)).toEqual([804, 27]);
    expect(whole.total).toBe(831);
    expect(roundToStep(2.5, 1)).toBe(3);
    expect(roundToStep(-2.5, 1)).toBe(-3);
    expect(roundToStep(1.005, 0.01)).toBe(1.01);
    expect(roundUpToStep(10.01, 0.1)).toBe(10.1);
  });

  it("converts a EUR tariff to CZK at the ČNB rate given, and is unpriced without one", () => {
    const r = priced(rate({ weightKg: 200 }, {}, "D1", { currency: "EUR" }, [], { rate: 24.335, date: "2026-10-14" }));
    expect(r).toMatchObject({ currency: "EUR", total: 800, totalCzk: 19468, fx: { rate: 24.335, date: "2026-10-14" } });
    expect(priced(rate({ weightKg: 200 })).fx).toBeNull();
    expect(rate({ weightKg: 200 }, {}, "D1", { currency: "EUR" })).toEqual({ reason: "No ČNB rate for EUR on 15 Oct 2026" });
  });

  it("charges insurance on a EUR tariff on the declared CZK value converted to EUR", () => {
    const surcharges = [surcharge({ code: "INSURANCE", calc: "PCT_OF_VALUE", value: 1 })];
    const r = priced(rate({ extras: { ...NO_EXTRAS, declaredValueCzk: 25000 } }, { surcharges }, "D1", { currency: "EUR" }, [], { rate: 25, date: "2026-10-14" }));
    expect(line(r, "INSURANCE")!.amount).toBe(10);
  });
});

describe("customer discount", () => {
  const standard = () => priced(rate({ weightKg: 200 }, { surcharges: [surcharge({ code: "TOLL", calc: "FLAT", value: 100 })] }));
  const customer = { id: "t9", name: "Acme LTL", ownerCustomerId: "c1", ownerName: "Acme s.r.o." };

  it("takes x % off the Standard freight + surcharges as one line, under the customer's tariff", () => {
    const r = applyDiscount(standard(), customer, 10, 0.01);
    expect(r.lines.at(-1)).toMatchObject({ code: "DISCOUNT", label: "Customer discount −10 %", amount: -90 });
    expect(r).toMatchObject({ total: 810, totalCzk: 810, tariffId: "t9", tariffName: "Acme LTL", ownerName: "Acme s.r.o.", tariffVersionId: "v1" });
  });

  it("adds an uplift for a negative discount", () => {
    const r = applyDiscount(standard(), customer, -5, 1);
    expect(r.lines.at(-1)).toMatchObject({ label: "Customer uplift +5 %", amount: 45 });
    expect(r.total).toBe(945);
  });

  it("converts the discounted EUR total at the Standard's rate", () => {
    const eur = priced(rate({ weightKg: 200 }, {}, "D1", { currency: "EUR" }, [], { rate: 25, date: "2026-10-14" }));
    expect(applyDiscount(eur, customer, 25, 0.01)).toMatchObject({ total: 600, totalCzk: 15000 });
  });
});

describe("buy side", () => {
  const side = (over: Partial<PricedSide>): PricedSide => ({ ...priced(rate()), ...over });

  it("matches a preferred lane by both postcodes and the kind of service", () => {
    const lane = { originPostcodeFrom: "10000", originPostcodeTo: "19999", destPostcodeFrom: "60000", destPostcodeTo: "69999", serviceKind: "ANY" };
    expect(laneMatches(lane, "11000", "60200", "LTL")).toBe(true);
    expect(laneMatches(lane, "60200", "11000", "LTL")).toBe(false);
    expect(laneMatches({ ...lane, serviceKind: "FTL" }, "11000", "60200", "LTL")).toBe(false);
    expect(laneMatches({ ...lane, serviceKind: "LTL" }, "11000", "60200", "LTL")).toBe(true);
  });

  it("sorts preferred first, then cheapest in CZK", () => {
    const sorted = sortBuy([
      side({ ownerName: "A", totalCzk: 900, preferred: false }),
      side({ ownerName: "B", totalCzk: 1200, preferred: true }),
      side({ ownerName: "C", totalCzk: 800, preferred: false }),
      side({ ownerName: "D", totalCzk: 1100, preferred: true }),
    ]);
    expect(sorted.map((s) => s.ownerName)).toEqual(["D", "B", "C", "A"]);
  });

  it("computes the margin on the first buy price and flags it below the floor", () => {
    const floor = { percent: 8, minAmountCzk: 300 };
    expect(margin(side({ totalCzk: 10000 }), [side({ totalCzk: 8000 })], floor)).toEqual({ marginCzk: 2000, marginPercent: 20, belowFloor: false });
    expect(margin(side({ totalCzk: 10000 }), [side({ totalCzk: 9500 })], floor)).toEqual({ marginCzk: 500, marginPercent: 5, belowFloor: true });
    expect(margin(side({ totalCzk: 2000 }), [side({ totalCzk: 1800 })], floor)).toEqual({ marginCzk: 200, marginPercent: 10, belowFloor: true });
    expect(margin({ reason: "x" }, [side({})], floor)).toEqual({ marginCzk: null, marginPercent: null, belowFloor: false });
    expect(margin(side({}), [], floor)).toEqual({ marginCzk: null, marginPercent: null, belowFloor: false });
  });
});

describe("promised date", () => {
  const level = (code: ServiceLevelCode) => DEFAULT_SERVICE_LEVELS.find((l) => l.code === code)!;

  it("counts D1..D4 in working days from the pickup day before the cut-off", () => {
    // Thu 15 Oct 2026; Wed 28 Oct is a holiday
    expect(promise(level("D1"), "2026-10-15", "09:00", "FTL", []).promisedDate).toBe("2026-10-16");
    expect(promise(level("D2"), "2026-10-15", null, "FTL", []).promisedDate).toBe("2026-10-19");
    expect(promise(level("D4"), "2026-10-26", null, "FTL", []).promisedDate).toBe("2026-11-02");
  });

  it("starts the next working day after the cut-off, and says so", () => {
    const p = promise(level("D1"), "2026-10-15", "12:01", "FTL", []);
    expect(p).toEqual({ promisedDate: "2026-10-19", promisedTime: null, promiseNote: "Ordered after the 12:00 cut-off: counted from 16 Oct 2026" });
    expect(promise(level("D1"), "2026-10-15", "12:00", "FTL", []).promisedDate).toBe("2026-10-16");
  });

  it("skips Easter and Christmas", () => {
    // Thu 2 Apr 2026: Good Friday 3 Apr and Easter Monday 6 Apr
    expect(promise(level("D1"), "2026-04-02", null, "FTL", []).promisedDate).toBe("2026-04-07");
    expect(promise(level("D3"), "2026-04-02", null, "FTL", []).promisedDate).toBe("2026-04-09");
    // Wed 23 Dec 2026: 24, 25, 26 Dec are holidays, 27 is Sunday
    expect(promise(level("D2"), "2026-12-23", null, "FTL", []).promisedDate).toBe("2026-12-29");
    const sat = promise(level("D1"), "2026-12-26", null, "FTL", []);
    expect(sat).toMatchObject({ promisedDate: "2026-12-29", promiseNote: "26 Dec 2026 is not a working day: counted from 28 Dec 2026" });
  });

  it("knows the company's extra holidays", () => {
    expect(promise(level("D1"), "2026-10-15", null, "FTL", ["2026-10-16"]).promisedDate).toBe("2026-10-19");
  });

  it("gives express levels their time and the fixed level no date", () => {
    expect(promise(level("EXP_SAMEDAY"), "2026-10-15", "09:00", "FTL", [])).toMatchObject({ promisedDate: "2026-10-15", promisedTime: "same day" });
    expect(promise(level("EXP_SAMEDAY"), "2026-10-15", "10:30", "FTL", [])).toMatchObject({ promisedDate: "2026-10-16", promisedTime: "same day" });
    expect(promise(level("EXP_1000"), "2026-10-15", "14:00", "FTL", [])).toMatchObject({ promisedDate: "2026-10-16", promisedTime: "by 10:00" });
    expect(promise(level("EXP_1200"), "2026-10-16", "16:00", "FTL", [])).toMatchObject({ promisedDate: "2026-10-20", promisedTime: "by 12:00" });
    expect(promise(level("EXP_FIXED"), "2026-10-15", null, "FTL", [])).toEqual({ promisedDate: null, promisedTime: null, promiseNote: "Date agreed per order" });
  });

  it("says an LTL promise assumes gate-in on the start day", () => {
    expect(promise(level("D1"), "2026-10-15", null, "LTL", []).promiseNote).toBe("Counted from 15 Oct 2026. LTL: assumes gate-in at our warehouse on 15 Oct 2026");
  });
});
