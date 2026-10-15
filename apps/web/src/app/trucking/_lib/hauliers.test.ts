import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { expiresWithin, formatPsc, HAULIER_CHIPS, HAULIER_STATUS_CHIP, issueSummary, profileProblems, pscDigits, pscRangeProblem, sortIssues, type LaneDraft } from "./hauliers";

const issue = (code: interfaces.HaulierIssueCode, severity: "block" | "warn", message: string = code): interfaces.HaulierIssue => ({ code, severity, message });

describe("haulier status chip", () => {
  it("names every status in words, not by colour only", () => {
    expect(HAULIER_STATUS_CHIP.ok).toMatchObject({ label: "OK", tone: "green" });
    expect(HAULIER_STATUS_CHIP.warning).toMatchObject({ label: "Warning", tone: "amber" });
    expect(HAULIER_STATUS_CHIP.blocked).toMatchObject({ label: "Blocked", tone: "red" });
  });
});

describe("issues", () => {
  it("puts block issues first", () => {
    const sorted = sortIssues([issue("vat_check_due", "warn"), issue("missing_licence", "block"), issue("insurance_expiring", "warn"), issue("blocked", "block")]);
    expect(sorted.map((i) => i.code)).toEqual(["missing_licence", "blocked", "vat_check_due", "insurance_expiring"]);
  });

  it("summarises as the first issue and how many more", () => {
    expect(issueSummary([])).toBeNull();
    expect(issueSummary([issue("vat_check_due", "warn", "VAT check due"), issue("missing_insurance", "block", "No insurance")])).toEqual({ first: "No insurance", more: 1 });
  });
});

describe("postcodes (PSČ)", () => {
  it("shows 5 digits as 3 + 2", () => {
    expect(formatPsc("11000")).toBe("110 00");
    expect(formatPsc("110")).toBe("110");
  });

  it("keeps only the digits typed, at most 5", () => {
    expect(pscDigits("110 00")).toBe("11000");
    expect(pscDigits("7 0 2 0 0 9")).toBe("70200");
  });

  it("checks a range", () => {
    expect(pscRangeProblem("10000", "19999")).toBeNull();
    expect(pscRangeProblem("10000", "10000")).toBeNull();
    expect(pscRangeProblem("1000", "19999")).toMatch(/5 digits/);
    expect(pscRangeProblem("20000", "10000")).toMatch(/after/);
  });
});

describe("expiry", () => {
  it("counts dates from today up to 30 days ahead", () => {
    expect(expiresWithin("2026-10-15", "2026-10-15")).toBe(true);
    expect(expiresWithin("2026-11-14", "2026-10-15")).toBe(true);
    expect(expiresWithin("2026-11-15", "2026-10-15")).toBe(false);
    expect(expiresWithin("2026-10-14", "2026-10-15")).toBe(false);
    expect(expiresWithin(null, "2026-10-15")).toBe(false);
  });
});

describe("quick filters", () => {
  const base: interfaces.HaulierListItem = {
    customerId: "c1",
    companyName: "Haul s.r.o.",
    ico: "12345678",
    city: "Praha",
    hasProfile: true,
    status: "ok",
    issues: [],
    insuranceValidTo: "2027-06-30",
    licenceValidTo: null,
    adrCapable: false,
    vehicleTypes: [],
    preferredLaneCount: 0,
  };
  const chip = (id: string) => HAULIER_CHIPS.find((c) => c.id === id)!;

  it("match what their label says", () => {
    expect(chip("attention").match({ ...base, status: "warning" }, "2026-10-15")).toBe(true);
    expect(chip("attention").match(base, "2026-10-15")).toBe(false);
    expect(chip("expiring").match({ ...base, licenceValidTo: "2026-10-20" }, "2026-10-15")).toBe(true);
    expect(chip("expiring").match(base, "2026-10-15")).toBe(false);
    expect(chip("adr").match({ ...base, adrCapable: true }, "2026-10-15")).toBe(true);
    expect(chip("noProfile").match({ ...base, hasProfile: false }, "2026-10-15")).toBe(true);
  });
});

describe("profileProblems", () => {
  const lane: LaneDraft = { key: "a", originPostcodeFrom: "10000", originPostcodeTo: "19999", destPostcodeFrom: "60000", destPostcodeTo: "69999", serviceKind: "ANY", note: "" };

  it("passes a complete profile", () => {
    expect(profileProblems({ insuranceLimit: 1_000_000, paymentDays: 30, preferredLanes: [lane] })).toEqual([]);
  });

  it("names each problem", () => {
    expect(
      profileProblems({ insuranceLimit: -1, paymentDays: 1.5, preferredLanes: [{ ...lane, destPostcodeFrom: "70000" }, { ...lane, originPostcodeTo: "123" }] }),
    ).toEqual([
      "Insurance limit cannot be negative",
      "Payment days must be a whole number, 0 or more",
      "Lane 1 destination: “from” must not be after “to”",
      "Lane 2 origin: postcodes have 5 digits",
    ]);
  });
});
