import { describe, expect, it } from "vitest";
import { civByCurrency, dimensionVolumePerPiece, fmtNum, num, projectCargo, teuForType } from "../services/cargoProjection";
import type { CargoDimensionLine, CargoItemLine, ContainerLine } from "../interfaces/interfaces";

const container = (over: Partial<ContainerLine> = {}): ContainerLine => ({
  containerNumber: "",
  sealNumber: "",
  type: "",
  teu: "",
  packages: "",
  packageType: "",
  grossWeight: "",
  volume: "",
  ...over,
});

const item = (over: Partial<CargoItemLine> = {}): CargoItemLine => ({
  cargoDescription: "",
  hsCode: "",
  pieces: "",
  packageType: "",
  grossWeight: "",
  commercialInvoiceValue: "",
  currency: "",
  ...over,
});

const dim = (over: Partial<CargoDimensionLine> = {}): CargoDimensionLine => ({
  pieces: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  weightPerPcKg: "",
  packageType: "",
  stackable: "",
  ...over,
});

describe("num", () => {
  it("parses free-text numbers", () => {
    expect(num("1 353.5")).toBe(1353.5);
    expect(num("1,5")).toBe(1.5);
    expect(num("abc")).toBe(0);
    expect(num("")).toBe(0);
    expect(num(undefined)).toBe(0);
  });
});

describe("fmtNum", () => {
  it("formats en-US, integers without decimals, otherwise max 2", () => {
    expect(fmtNum(12500)).toBe("12,500");
    expect(fmtNum(1353.456)).toBe("1,353.46");
  });
});

describe("teuForType", () => {
  it("derives TEU from the type prefix", () => {
    expect(teuForType("20' GP")).toBe("1");
    expect(teuForType("40' HC")).toBe("2");
    expect(teuForType("")).toBe("");
    expect(teuForType("45' HC")).toBe("");
  });
});

describe("dimensionVolumePerPiece", () => {
  it("computes L×W×H in m³", () => {
    expect(dimensionVolumePerPiece(dim({ lengthCm: "120", widthCm: "100", heightCm: "88" }))).toBeCloseTo(1.056, 3);
  });
});

describe("civByCurrency", () => {
  it("sums per currency, defaulting empty currency to USD", () => {
    const items = [
      item({ commercialInvoiceValue: "12 500", currency: "" }),
      item({ commercialInvoiceValue: "3000", currency: "eur" }),
      item({ commercialInvoiceValue: "500", currency: "USD" }),
    ];
    expect(civByCurrency(items)).toBe("13,000 USD, 3,000 EUR");
  });

  it("skips zero/empty values", () => {
    expect(civByCurrency([item({ commercialInvoiceValue: "", currency: "EUR" })])).toBe("");
  });
});

describe("projectCargo", () => {
  it("prefers container declarations", () => {
    const p = projectCargo(
      [
        container({ type: "40' HC", teu: "2", packages: "10", grossWeight: "1000", volume: "20", packageType: "Cartons" }),
        container({ type: "40' HC", teu: "2", packages: "1", grossWeight: "353", volume: "5.5" }),
        container({ type: "20' GP", teu: "1" }),
      ],
      [item({ pieces: "99", grossWeight: "9999", packageType: "Pallet(s)", hsCode: "8531", cargoDescription: "Speakers" })],
      [dim({ pieces: "99", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "1" })],
    );
    expect(p.pcs).toBe("11");
    expect(p.totalGrossWeightKg).toBe("1,353");
    expect(p.totalVolumeM3).toBe("25.5");
    expect(p.totalTeu).toBe("5");
    expect(p.containerTypeSummary).toBe("2× 40' HC, 1× 20' GP");
    // items before containers, unique values only
    expect(p.typeOfPackages).toBe("Pallet(s), Cartons");
  });

  it("falls back to cargo items, then dimensions", () => {
    const items = [
      item({ pieces: "4", grossWeight: "40", hsCode: "8531", cargoDescription: "A" }),
      item({ pieces: "6", grossWeight: "60", hsCode: "8531", cargoDescription: "B" }),
    ];
    const dims = [dim({ pieces: "10", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "5" })];
    const p = projectCargo([], items, dims);
    expect(p.pcs).toBe("10"); // from items
    expect(p.totalGrossWeightKg).toBe("100"); // from items
    expect(p.totalVolumeM3).toBe("10"); // from dims — items never provide volume
    expect(p.hsCode).toBe("8531");
    expect(p.cargoDescription).toBe("A; B");

    const dimsOnly = projectCargo([], [], dims);
    expect(dimsOnly.pcs).toBe("10");
    expect(dimsOnly.totalGrossWeightKg).toBe("50");
  });

  it("returns empty strings when there is no data", () => {
    const p = projectCargo([], [], []);
    expect(p.pcs).toBe("");
    expect(p.totalTeu).toBe("");
    expect(p.totalGrossWeightKg).toBe("");
    expect(p.totalVolumeM3).toBe("");
    expect(p.containerTypeSummary).toBe("");
    expect(p.civByCurrency).toBe("");
  });
});
