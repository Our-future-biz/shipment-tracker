import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { blockedLeftOut, vehicleOptions, vehicleWarning, warningsOf } from "./planTrip";

const issue = (code: interfaces.HaulierIssueCode, severity: "block" | "warn", message: string = code): interfaces.HaulierIssue => ({ code, severity, message });

const haulier = (customerId: string, companyName: string, status: interfaces.HaulierStatus, issues: interfaces.HaulierIssue[] = []) => ({ customerId, companyName, status, issues });

describe("Plan trip: the blocked hauliers named under the agreed-price picker (T3)", () => {
  const list = [
    haulier("h1", "Žlutá doprava", "blocked", [issue("missing_insurance", "block", "No carrier liability insurance on file")]),
    haulier("h2", "Alfa", "ok"),
    haulier("h3", "Bravo", "blocked", [issue("blocked", "block", "Blocked: late twice")]),
    haulier("h4", "Cyril", "warning", [issue("vat_check_due", "warn")]),
    haulier("h5", "Delta", "blocked", [issue("vat_unreliable", "block")]),
  ];

  it("lists every blocked haulier by name, with its issues, also when no buy tariff prices the lane", () => {
    const out = blockedLeftOut(list, []);
    expect(out.map((h) => h.companyName)).toEqual(["Bravo", "Delta", "Žlutá doprava"]);
    expect(out[2]!.issues[0]!.message).toBe("No carrier liability insurance on file");
  });

  it("leaves out those already listed apart by the buy tariffs", () => {
    expect(blockedLeftOut(list, [{ customerId: "h3" }]).map((h) => h.customerId)).toEqual(["h5", "h1"]);
  });
});

describe("Plan trip: the picked haulier's warnings (T10)", () => {
  const list = [
    haulier("h1", "Alfa", "warning", [issue("no_bank_account", "warn", "No bank account from the VAT register listed — its invoices will be blocked")]),
    haulier("h2", "Bravo", "blocked", [issue("missing_licence", "block"), issue("insurance_expiring", "warn")]),
  ];

  it("gives the warnings only, never the blocks", () => {
    expect(warningsOf(list, "h1").map((i) => i.message)).toEqual(["No bank account from the VAT register listed — its invoices will be blocked"]);
    expect(warningsOf(list, "h2").map((i) => i.code)).toEqual(["insurance_expiring"]);
  });

  it("gives none when nobody or an unknown haulier is picked", () => {
    expect(warningsOf(list, null)).toEqual([]);
    expect(warningsOf(list, "nobody")).toEqual([]);
  });
});

describe("Plan trip: the vehicle types of the haulier picked (user council T16)", () => {
  const vehicles = [
    { code: "van", label: "Van" },
    { code: "solo_72", label: "Solo truck 7.2 m" },
    { code: "tautliner_136", label: "Tautliner 13.6 m" },
  ];

  it("offers the haulier's own types first, the others under their own heading", () => {
    expect(vehicleOptions(vehicles, ["tautliner_136", "van"])).toEqual([
      { label: "This haulier's vehicles", options: [{ value: "van", label: "Van" }, { value: "tautliner_136", label: "Tautliner 13.6 m" }] },
      { label: "Other types", options: [{ value: "solo_72", label: "Solo truck 7.2 m" }] },
    ]);
    expect(vehicleOptions(vehicles, ["van", "solo_72", "tautliner_136"])).toEqual([{ label: "This haulier's vehicles", options: vehicles.map((v) => ({ value: v.code, label: v.label })) }]);
  });

  it("offers them all as one list when the haulier lists none, or only types no longer offered", () => {
    const all = vehicles.map((v) => ({ value: v.code, label: v.label }));
    expect(vehicleOptions(vehicles, undefined)).toEqual(all);
    expect(vehicleOptions(vehicles, [])).toEqual(all);
    expect(vehicleOptions(vehicles, ["mega_136"])).toEqual(all);
  });

  it("warns, never refuses, when the type picked is not the haulier's", () => {
    expect(vehicleWarning(vehicles, ["van"], "solo_72")).toBe("Solo truck 7.2 m is not among the haulier's vehicles on its Trucking profile — check it can send one.");
    expect(vehicleWarning(vehicles, ["van"], "van")).toBe("");
    expect(vehicleWarning(vehicles, [], "solo_72")).toBe("");
    expect(vehicleWarning(vehicles, ["van"], null)).toBe("");
  });
});
