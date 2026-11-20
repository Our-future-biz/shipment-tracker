import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { blockedLeftOut, warningsOf } from "./planTrip";

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
