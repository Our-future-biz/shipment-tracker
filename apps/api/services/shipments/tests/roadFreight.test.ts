import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { dangerousFromAdr, normalizeCargoDimension, normalizeCargoDimensions, normalizePostcode, normalizeStops } from "../lib/roadFreight";
import type { CargoDimensionLine } from "../interfaces/interfaces";

const SITE = "946e01e8-a4ed-4aa7-932b-2c5d5e991c30";

describe("dangerousFromAdr", () => {
  const line = (over: Partial<CargoDimensionLine> = {}) => ({ adrUn: null, adrClass: null, adrPackingGroup: null, adrLimitedQuantity: false, ...over }) as CargoDimensionLine;

  it("makes the shipment Dangerous when any line has any ADR detail", () => {
    for (const adr of [{ adrUn: "1203" }, { adrClass: "3" }, { adrPackingGroup: "II" as const }, { adrLimitedQuantity: true }]) {
      expect(dangerousFromAdr([line(), line(adr)], "")).toEqual({ dangerous: "Yes" });
    }
  });

  it("also switches a No, and leaves a Yes as it is", () => {
    expect(dangerousFromAdr([line({ adrUn: "1203" })], "No")).toEqual({ dangerous: "Yes" });
    expect(dangerousFromAdr([line({ adrUn: "1203" })], "Yes")).toEqual({});
  });

  it("changes nothing when no line has ADR details, or the write does not touch the lines", () => {
    expect(dangerousFromAdr([line()], "Yes")).toEqual({});
    expect(dangerousFromAdr([line()], "")).toEqual({});
    expect(dangerousFromAdr([], "Yes")).toEqual({});
    expect(dangerousFromAdr(undefined, "")).toEqual({});
  });
});

describe("normalizePostcode", () => {
  it("stores a Czech postcode as its five digits", () => {
    expect(normalizePostcode(" 110 00 ", "CZ", "Pick-up")).toBe("11000");
    expect(normalizePostcode("73961", "CZ", "Pick-up")).toBe("73961");
  });

  it("refuses a Czech postcode that is not five digits", () => {
    expect(() => normalizePostcode("1100", "CZ", "Pick-up")).toThrow("Pick-up postcode must be 5 digits for CZ");
    expect(() => normalizePostcode("110 00A", "CZ", "Delivery")).toThrow("Delivery postcode must be 5 digits for CZ");
  });

  it("keeps other postcodes as typed, trimmed, in capitals and single-spaced; blank is null", () => {
    expect(normalizePostcode(" sw1a   1aa ", "GB", "Delivery")).toBe("SW1A 1AA");
    expect(normalizePostcode("01067", null, "Delivery")).toBe("01067");
    expect(normalizePostcode("  ", "CZ", "Delivery")).toBeNull();
    expect(normalizePostcode(null, "CZ", "Delivery")).toBeNull();
  });
});

describe("normalizeStops", () => {
  it("normalises what a create sends: site id, country in capitals, postcode by that country", () => {
    expect(normalizeStops({ pickupSiteId: SITE, pickupCountry: "cz", pickupPostcode: "110 00", deliveryCountry: "de", deliveryPostcode: "01067" })).toEqual({
      pickupSiteId: SITE,
      pickupCountry: "CZ",
      pickupPostcode: "11000",
      deliveryCountry: "DE",
      deliveryPostcode: "01067",
    });
  });

  it("returns only the fields a write carries; blanks clear", () => {
    expect(normalizeStops({})).toEqual({});
    expect(normalizeStops({ deliverySiteId: "" })).toEqual({ deliverySiteId: null });
  });

  it("reads a postcode sent alone by the stored country, and a country sent alone re-checks the stored postcode", () => {
    expect(normalizeStops({ pickupPostcode: "602 00" }, { pickupCountry: "CZ" })).toEqual({ pickupCountry: "CZ", pickupPostcode: "60200" });
    expect(normalizeStops({ deliveryCountry: "CZ" }, { deliveryPostcode: "602 00" })).toEqual({ deliveryCountry: "CZ", deliveryPostcode: "60200" });
    expect(() => normalizeStops({ deliveryCountry: "CZ" }, { deliveryPostcode: "SW1A 1AA" })).toThrow("Delivery postcode must be 5 digits for CZ");
  });

  it("refuses a country that is not a two-letter code and a site id that is not an id", () => {
    expect(() => normalizeStops({ pickupCountry: "Czechia" })).toThrow("Pick-up country must be a two-letter code");
    expect(() => normalizeStops({ deliverySiteId: "site-1" })).toThrow("Delivery site is not a valid id");
  });
});

describe("normalizeCargoDimension", () => {
  const line = (over: Partial<CargoDimensionLine> = {}): CargoDimensionLine => ({
    pieces: "2",
    lengthCm: "120",
    widthCm: "80",
    heightCm: "100",
    weightPerPcKg: "300",
    packageType: "Pallet",
    stackable: "No",
    ...over,
  });

  it("stores a line without road-freight fields with them empty", () => {
    expect(normalizeCargoDimension(line(), 1)).toEqual({
      ...line(),
      volumePerPcM3: "",
      palletType: null,
      adrUn: null,
      adrClass: null,
      adrPackingGroup: null,
      adrLimitedQuantity: false,
    });
  });

  it("stores pallet type and packing group in capitals and the UN number as its four digits", () => {
    const sent = { palletType: "eur", adrUn: "UN 1203", adrClass: " 3 ", adrPackingGroup: "ii", adrLimitedQuantity: true } as unknown as Partial<CargoDimensionLine>;
    expect(normalizeCargoDimension(line(sent), 1)).toMatchObject({
      palletType: "EUR",
      adrUn: "1203",
      adrClass: "3",
      adrPackingGroup: "II",
      adrLimitedQuantity: true,
    });
  });

  it("refuses a UN number that is not four digits, an unknown packing group or pallet type - naming the line", () => {
    expect(() => normalizeCargoDimensions([line(), line({ adrUn: "120" })])).toThrow("Cargo line 2: UN number must be 4 digits");
    expect(() => normalizeCargoDimension(line({ adrUn: "12034" }), 1)).toThrow("UN number must be 4 digits");
    expect(() => normalizeCargoDimension(line({ adrPackingGroup: "IV" as never }), 3)).toThrow("Cargo line 3: packing group must be I, II or III");
    expect(() => normalizeCargoDimension(line({ palletType: "CHEP" as never }), 1)).toThrow("pallet type must be one of EUR, INDUSTRIAL, HALF, QUARTER, OTHER");
  });

  it("leaves a write without lines alone", () => {
    expect(normalizeCargoDimensions(undefined)).toBeUndefined();
  });

  describe("the volume typed for a piece", () => {
    const unsized = (volumePerPcM3: string) => line({ lengthCm: "120", widthCm: "", heightCm: "", volumePerPcM3 });
    const stored = (volumePerPcM3: string) => normalizeCargoDimension(unsized(volumePerPcM3), 1).volumePerPcM3;

    it("is not kept beside all three sizes, nor read then", () => {
      expect(normalizeCargoDimension(line({ volumePerPcM3: "0.5" }), 1).volumePerPcM3).toBe("");
      expect(normalizeCargoDimension(line({ volumePerPcM3: "-2 m3" }), 1).volumePerPcM3).toBe("");
    });

    it("is stored as a plain number with a point, blank as empty", () => {
      expect(stored("0.5")).toBe("0.5");
      expect(stored(" 0,50 ")).toBe("0.5");
      expect(stored(".5")).toBe("0.5");
      expect(stored("007")).toBe("7");
      expect(stored("2.")).toBe("2");
      expect(stored("0")).toBe("0");
      expect(stored("1000")).toBe("1000");
      expect(stored("  ")).toBe("");
      expect(normalizeCargoDimension(line({ heightCm: "" }), 1).volumePerPcM3).toBe("");
    });

    it("refuses a negative number, one with a unit or an exponent, and more than 1000 m³ - naming the line", () => {
      expect(() => normalizeCargoDimensions([line(), unsized("-2")])).toThrow("Cargo line 2: volume per piece cannot be negative");
      expect(() => stored("0.5 m3")).toThrow("Cargo line 1: volume per piece must be a number of m³");
      expect(() => stored("1e5")).toThrow("must be a number of m³");
      expect(() => stored("abc")).toThrow("must be a number of m³");
      expect(() => stored(".")).toThrow("must be a number of m³");
      expect(() => stored("1,000.5")).toThrow("must be a number of m³");
      expect(() => stored("Infinity")).toThrow("must be a number of m³");
      expect(() => stored("1000.01")).toThrow("Cargo line 1: volume per piece cannot be more than 1000 m³");
    });

    it("says, when refused, what one piece and what all the line's pieces hold - a volume typed for all pieces is stored per piece", () => {
      // 5,000 m³ typed for 2 pieces in Cargo Details' "All pieces" is 2,500 m³ a piece.
      const refused = () => normalizeCargoDimension({ ...unsized("2500"), pieces: "2" }, 3);
      expect(refused).toThrow("Cargo line 3: volume per piece cannot be more than 1000 m³ (2500 m³ for one piece, 5000 m³ for its 2 pieces together) — check the volume and the pieces");
      expect(() => normalizeCargoDimension({ ...unsized("1200.123456789"), pieces: "" }, 1)).toThrow("(1200.12 m³ for one piece) — check");
    });

    it("keeps the share of a total spread over many pieces exactly as sent, long as it is", () => {
      expect(stored("0.00233333333333")).toBe("0.00233333333333");
      expect(stored("0.000000333333333333")).toBe("0.000000333333333333");
    });
  });
});
