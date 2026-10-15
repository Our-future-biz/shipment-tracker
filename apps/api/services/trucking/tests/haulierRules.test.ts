import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { cleanLane, cleanProfileInput, defaultProfile, formatDay, haulierIssues, haulierStatus, normaliseCzPostcode } from "../lib/haulierRules";
import type { HaulierProfile, HaulierProfileInput, PreferredLaneInput } from "../interfaces/interfaces";

const TODAY = "2026-10-15";

// A profile with nothing to report on TODAY.
const good = (over: Partial<HaulierProfile> = {}): HaulierProfile => ({
  ...defaultProfile("c1"),
  insuranceLimit: 300000,
  insuranceValidTo: "2027-06-30",
  licenceNo: "KON-123",
  licenceUnlimited: true,
  vatCheckedAt: "2026-10-01",
  version: 1,
  ...over,
});

const codes = (p: HaulierProfile) => haulierIssues(p, TODAY).map((i) => `${i.code}:${i.severity}`);

describe("haulier issues and status", () => {
  it("is ok with valid insurance, an unlimited licence and a recent VAT check", () => {
    expect(haulierIssues(good(), TODAY)).toEqual([]);
    expect(haulierStatus(haulierIssues(good(), TODAY))).toBe("ok");
  });

  it("blocks on an expired insurance and says when it expired", () => {
    const issues = haulierIssues(good({ insuranceValidTo: "2026-09-30" }), TODAY);
    expect(issues).toEqual([{ code: "insurance_expired", severity: "block", message: "Carrier liability insurance expired on 30 Sep 2026" }]);
    expect(haulierStatus(issues)).toBe("blocked");
  });

  it("warns when insurance or licence expire within 30 days (today counts as valid)", () => {
    expect(codes(good({ insuranceValidTo: TODAY }))).toEqual(["insurance_expiring:warn"]);
    expect(codes(good({ insuranceValidTo: "2026-11-14" }))).toEqual(["insurance_expiring:warn"]);
    expect(codes(good({ insuranceValidTo: "2026-11-15" }))).toEqual([]);
    expect(codes(good({ licenceUnlimited: false, licenceValidTo: "2026-11-01" }))).toEqual(["licence_expiring:warn"]);
    expect(haulierStatus(haulierIssues(good({ insuranceValidTo: "2026-11-01" }), TODAY))).toBe("warning");
  });

  it("ignores the licence end date when the licence is unlimited", () => {
    expect(codes(good({ licenceUnlimited: true, licenceValidTo: "2020-01-01" }))).toEqual([]);
    expect(codes(good({ licenceUnlimited: false, licenceValidTo: "2026-10-14" }))).toEqual(["licence_expired:block"]);
    expect(codes(good({ licenceUnlimited: false, licenceValidTo: null }))).toEqual(["missing_licence:block"]);
  });

  it("blocks on missing insurance (no end date or no limit) and on a missing licence", () => {
    expect(codes(good({ insuranceLimit: null }))).toEqual(["missing_insurance:block"]);
    expect(codes(good({ insuranceValidTo: null }))).toEqual(["missing_insurance:block"]);
    expect(codes(good({ licenceNo: "" }))).toEqual(["missing_licence:block"]);
  });

  it("blocks a blocked haulier and an unreliable VAT payer", () => {
    expect(haulierIssues(good({ blocked: true, blockReason: "Damaged cargo twice" }), TODAY)[0]).toEqual({
      code: "blocked",
      severity: "block",
      message: "Blocked: Damaged cargo twice",
    });
    expect(codes(good({ vatUnreliable: true }))).toEqual(["vat_unreliable:block"]);
  });

  it("warns that a VAT check is due when never done or older than 30 days", () => {
    expect(codes(good({ vatCheckedAt: null }))).toEqual(["vat_check_due:warn"]);
    expect(codes(good({ vatCheckedAt: "2026-09-15" }))).toEqual([]);
    expect(codes(good({ vatCheckedAt: "2026-09-14" }))).toEqual(["vat_check_due:warn"]);
  });

  it("a block issue wins over warnings", () => {
    expect(haulierStatus(haulierIssues(good({ vatCheckedAt: null, vatUnreliable: true }), TODAY))).toBe("blocked");
  });

  it("formats days in plain English", () => {
    expect(formatDay("2026-01-05")).toBe("5 Jan 2026");
  });
});

const lane = (over: Partial<PreferredLaneInput> = {}): PreferredLaneInput => ({
  originPostcodeFrom: "110 00",
  originPostcodeTo: "199 00",
  destPostcodeFrom: "60000",
  destPostcodeTo: "69999",
  serviceKind: "ANY",
  note: " daily ",
  ...over,
});

describe("preferred lanes", () => {
  it("normalises CZ postcodes to 5 digits", () => {
    expect(normaliseCzPostcode(" 110 00 ")).toBe("11000");
    expect(normaliseCzPostcode("1100")).toBeNull();
    expect(normaliseCzPostcode("11000a")).toBeNull();
    expect(cleanLane(lane(), 1)).toEqual({
      originPostcodeFrom: "11000",
      originPostcodeTo: "19900",
      destPostcodeFrom: "60000",
      destPostcodeTo: "69999",
      serviceKind: "ANY",
      note: "daily",
    });
  });

  it("refuses postcodes that are not 5 digits", () => {
    expect(() => cleanLane(lane({ destPostcodeTo: "6999" }), 2)).toThrow("Lane 2: the destination to postcode must be 5 digits, like 110 00");
  });

  it("refuses a range that runs from high to low", () => {
    expect(() => cleanLane(lane({ originPostcodeFrom: "20000", originPostcodeTo: "19999" }), 1)).toThrow(/origin postcode range must run from the lower/);
    expect(() => cleanLane(lane({ destPostcodeFrom: "70000" }), 1)).toThrow(/destination postcode range/);
    expect(cleanLane(lane({ originPostcodeFrom: "11000", originPostcodeTo: "11000" }), 1).originPostcodeTo).toBe("11000");
  });
});

const input = (over: Partial<HaulierProfileInput> = {}): HaulierProfileInput => ({
  insurer: " Kooperativa ",
  insurancePolicyNo: "P-1",
  insuranceLimit: 300000,
  insuranceCurrency: "eur",
  insuranceValidTo: "2027-06-30",
  licenceNo: "KON-1",
  licenceValidTo: "2030-01-01",
  licenceUnlimited: true,
  adrCapable: true,
  vehicleTypes: ["van", "van"],
  paymentDays: 30,
  currency: "CZK",
  vatUnreliable: false,
  bankAccountPublished: true,
  vatCheckedAt: "2026-10-15",
  costSplitBasis: "ldm",
  notes: "",
  preferredLanes: [lane()],
  ...over,
});

describe("profile save checks", () => {
  it("trims, normalises and drops the licence end date of an unlimited licence", () => {
    const p = cleanProfileInput(input(), ["van"], TODAY);
    expect(p).toMatchObject({ insurer: "Kooperativa", insuranceCurrency: "EUR", licenceValidTo: null, vehicleTypes: ["van"] });
    expect(p.preferredLanes[0].originPostcodeFrom).toBe("11000");
  });

  it("refuses unknown vehicle types, bad dates, a future VAT check and bad numbers", () => {
    expect(() => cleanProfileInput(input({ vehicleTypes: ["rocket"] }), ["van"], TODAY)).toThrow("Unknown vehicle type: rocket");
    expect(() => cleanProfileInput(input({ insuranceValidTo: "2026-02-31" }), ["van"], TODAY)).toThrow(/insurance end date must be a date/);
    expect(() => cleanProfileInput(input({ vatCheckedAt: "2026-10-16" }), ["van"], TODAY)).toThrow(/cannot be in the future/);
    expect(() => cleanProfileInput(input({ paymentDays: -1 }), ["van"], TODAY)).toThrow(/Payment days/);
    expect(() => cleanProfileInput(input({ insuranceLimit: 0 }), ["van"], TODAY)).toThrow(/insurance limit/);
    expect(() => cleanProfileInput(input({ currency: "USD" }), ["van"], TODAY)).toThrow("The payment currency must be CZK or EUR");
  });
});
