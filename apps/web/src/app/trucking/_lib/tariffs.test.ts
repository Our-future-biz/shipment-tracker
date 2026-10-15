import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import {
  bandLabel,
  buildLevelMatrices,
  discountLabel,
  formatMoney,
  formatPercent,
  formatQty,
  heatStep,
  isPriced,
  isUnpriced,
  modeLabel,
  ownerLabel,
  pscRangeLabel,
  sortFindings,
  tariffListStatus,
  validityLabel,
  VERSION_STATUS_CHIP,
} from "./tariffs";

const band = (basis: interfaces.BandBasis, fromExcl: number, toIncl: number | null, id = "b") => ({ id, basis, fromExcl, toIncl });

describe("band labels", () => {
  it("reads weight bands as whole kilograms", () => {
    expect(bandLabel(band("KG", 1000, 1500))).toBe("1 001 – 1 500 kg");
    expect(bandLabel(band("KG", 0, 500))).toBe("up to 500 kg");
    expect(bandLabel(band("KG", 5000, null))).toBe("over 5 000 kg");
  });

  it("reads pallets, LDM and trips", () => {
    expect(bandLabel(band("PALLET", 2, 4))).toBe("3 – 4 pallets");
    expect(bandLabel(band("PALLET", 2, 3))).toBe("3 pallets");
    expect(bandLabel(band("PALLET", 0, 1))).toBe("up to 1 pallet");
    expect(bandLabel(band("LDM", 1, 2))).toBe("1.1 – 2 LDM");
    expect(bandLabel(band("LDM", 0.5, 1))).toBe("0.6 – 1 LDM");
    expect(bandLabel(band("TRIP", 0, null))).toBe("Per trip");
  });

  it("keeps a lower end that is not a whole step as 'over'", () => {
    expect(bandLabel(band("KG", 999.5, 1500))).toBe("over 999.5 – 1 500 kg");
  });
});

describe("money, percent and quantities", () => {
  it("shows cents only when there are some", () => {
    expect(formatMoney(1250, "CZK")).toBe("1 250 CZK");
    expect(formatMoney(1250.5, "EUR")).toBe("1 250.50 EUR");
    expect(formatMoney(-300, "CZK")).toBe("−300 CZK");
    expect(formatMoney(null, "CZK")).toBe("—");
  });

  it("shows percentages with a sign when asked", () => {
    expect(formatPercent(12.5)).toBe("12.5 %");
    expect(formatPercent(-5)).toBe("−5 %");
    expect(formatPercent(3, true)).toBe("+3 %");
    expect(formatPercent(null)).toBe("—");
  });

  it("formats quantities without needless decimals", () => {
    expect(formatQty(1250)).toBe("1 250");
    expect(formatQty(2.5)).toBe("2.5");
    expect(formatQty(0.25)).toBe("0.25");
  });
});

describe("tariff labels", () => {
  const item = (p: Partial<interfaces.TariffListItem>): interfaces.TariffListItem => ({
    id: "t",
    side: "SELL",
    scope: "LTL",
    mode: "MATRIX",
    name: "T",
    ownerCustomerId: null,
    ownerName: null,
    currency: "CZK",
    zoneBy: "DESTINATION",
    discountPercent: null,
    activeVersion: null,
    nextVersion: null,
    draftCount: 0,
    ...p,
  });
  const version = (p: Partial<interfaces.TariffVersionSummary>): interfaces.TariffVersionSummary => ({
    id: "v",
    versionNo: 2,
    status: "ACTIVE",
    validFrom: "2026-10-01",
    validTo: null,
    createdAt: "",
    createdBy: null,
    activatedAt: null,
    activatedBy: null,
    serviceLevels: [],
    zoneCount: 0,
    warningCount: 0,
    ...p,
  });

  it("reads a discount as a change on the Standard list", () => {
    expect(discountLabel(5)).toBe("−5 % on Standard");
    expect(discountLabel(-3)).toBe("+3 % on Standard");
    expect(modeLabel({ mode: "MATRIX", discountPercent: null })).toBe("Matrix");
    expect(modeLabel({ mode: "DISCOUNT", discountPercent: 5 })).toBe("−5 % on Standard");
  });

  it("names the owner, Standard or Operations", () => {
    expect(ownerLabel(item({ ownerCustomerId: "c1", ownerName: "ACME" }))).toBe("ACME");
    expect(ownerLabel(item({}))).toBe("Standard");
    expect(ownerLabel(item({ side: "INTERNAL" }))).toBe("Operations");
  });

  it("gives the list status from what prices today", () => {
    expect(tariffListStatus(item({ activeVersion: version({}) })).label).toBe("Active");
    expect(tariffListStatus(item({ nextVersion: version({ status: "SCHEDULED" }) })).label).toBe("Scheduled");
    expect(tariffListStatus(item({ draftCount: 1 })).label).toBe("Draft only");
    expect(tariffListStatus(item({}))).toMatchObject({ label: "No versions", tone: "red" });
    expect(tariffListStatus(item({ mode: "DISCOUNT", discountPercent: 5 })).label).toBe("Follows Standard");
  });

  it("reads validity and postcode ranges", () => {
    expect(validityLabel("2026-11-01", "2026-12-31")).toBe("01.11.2026 – 31.12.2026");
    expect(validityLabel("2026-11-01", null)).toBe("from 01.11.2026");
    expect(pscRangeLabel("11000", "19999")).toBe("110 00 – 199 99");
    expect(pscRangeLabel("79001", "79001")).toBe("790 01");
  });

  it("names every version status in words", () => {
    expect(Object.values(VERSION_STATUS_CHIP).map((c) => c.label)).toEqual(["Draft", "Scheduled", "Active", "Expired", "Superseded"]);
    expect(VERSION_STATUS_CHIP.ACTIVE.tone).toBe("green");
  });
});

describe("findings and rate sides", () => {
  it("puts errors first", () => {
    const sorted = sortFindings([
      { severity: "warning" as const, message: "w1", where: "" },
      { severity: "error" as const, message: "e1", where: "" },
      { severity: "warning" as const, message: "w2", where: "" },
    ]);
    expect(sorted.map((f) => f.message)).toEqual(["e1", "w1", "w2"]);
  });

  it("tells a priced side from an unpriced one", () => {
    expect(isUnpriced({ reason: "No zone" })).toBe(true);
    expect(isUnpriced(null)).toBe(false);
    expect(isPriced(null)).toBe(false);
  });
});

describe("price matrix", () => {
  const zone = (code: string, from: string, to: string) => ({ code, label: code, postcodeFrom: from, postcodeTo: to, remote: false });
  const input = {
    zones: [zone("1", "10000", "19999"), zone("2", "20000", "29999")],
    bands: [band("KG", 500, 1000, "b2"), band("KG", 0, 500, "b1")],
    rates: [
      { serviceLevel: "D2" as const, zoneCode: "1", bandId: "b1", amount: 100, priceType: "FLAT" as const },
      { serviceLevel: "D1" as const, zoneCode: "1", bandId: "b1", amount: 120, priceType: "FLAT" as const },
      { serviceLevel: "D1" as const, zoneCode: "2", bandId: "b2", amount: 200, priceType: "FLAT" as const },
    ],
    minCharges: [{ serviceLevel: "D1" as const, zoneCode: "2", amount: 150 }],
  };

  it("builds one matrix per level, bands low to high, zones as columns", () => {
    const [d1, d2] = buildLevelMatrices(input);
    expect(d1!.level).toBe("D1");
    expect(d2!.level).toBe("D2");
    expect(d1!.rows.map((r) => r.label)).toEqual(["up to 500 kg", "501 – 1 000 kg"]);
    expect(d1!.rows[0]!.cells.map((c) => c?.amount ?? null)).toEqual([120, null]);
    expect(d1!.rows[1]!.cells.map((c) => c?.amount ?? null)).toEqual([null, 200]);
    expect(d1!.minRow).toEqual([null, 150]);
    expect(d1!.ranges.FLAT).toEqual({ min: 120, max: 200 });
    expect(d2!.rows).toHaveLength(1);
  });

  it("tints from cheapest to dearest", () => {
    expect(heatStep(120, { min: 120, max: 200 })).toBe(0);
    expect(heatStep(200, { min: 120, max: 200 })).toBe(4);
    expect(heatStep(160, { min: 120, max: 200 })).toBe(2);
    expect(heatStep(5, undefined)).toBe(0);
  });
});
