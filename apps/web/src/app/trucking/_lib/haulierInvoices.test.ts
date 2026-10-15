import { describe, expect, it } from "vitest";
import { differenceText, entryProblems, entrySummary, invoiceDecisionState, lineDifference, vatBlockers, type EntryHeader, type EntryLine } from "./haulierInvoices";

const target = (id: string, expected: number, currency: "CZK" | "EUR" = "CZK") => ({ kind: "TRIP" as const, id, ref: `LCZ${id}`, date: "2026-10-01", expected, claimed: 0, currency, alreadyInvoiced: false });
const header: EntryHeader = { invoiceNumber: "FV-1", issueDate: "2026-10-10", currency: "CZK", totalNet: 15000, vatAmount: 3150, totalGross: 18150, bankAccount: "19-2000145399/0800" };

describe("invoice difference", () => {
  it("is invoiced minus expected, per line and in words", () => {
    expect(lineDifference(10250, 10000)).toBe(250);
    expect(lineDifference(null, 10000)).toBe(-10000);
    expect(differenceText(250, "CZK")).toBe("+250 CZK");
    expect(differenceText(-100.5, "EUR")).toBe("−100.50 EUR");
    expect(differenceText(0.001, "CZK")).toBe("Exact");
  });

  it("is exact only when every line and the net total match", () => {
    const lines: EntryLine[] = [
      { target: target("1", 10000), invoiced: 10000, note: "" },
      { target: target("2", 5000), invoiced: 5000, note: "" },
    ];
    expect(entrySummary(lines, header)).toEqual({ expected: 15000, invoiced: 15000, difference: 0, netDiffers: false, exact: true });
    expect(entrySummary(lines, { totalNet: 15100 }).exact).toBe(false);
    const off = [lines[0]!, { ...lines[1]!, invoiced: 5200 }];
    expect(entrySummary(off, { totalNet: 15200 })).toMatchObject({ difference: 200, exact: false });
    // Two differences that cancel out are still not an exact match.
    expect(entrySummary([{ ...lines[0]!, invoiced: 10100 }, { ...lines[1]!, invoiced: 4900 }], header).exact).toBe(false);
  });
});

describe("invoice entry", () => {
  const lines: EntryLine[] = [{ target: target("1", 15000), invoiced: 15000, note: "" }];

  it("is ready with haulier, header, lines and a valid account", () => {
    expect(entryProblems("h1", header, lines)).toEqual([]);
  });

  it("says what is missing", () => {
    expect(entryProblems(null, { ...header, invoiceNumber: "" }, [])).toEqual(["Choose the haulier", "Enter the invoice number", "Tick at least one trip or partner delivery"]);
    expect(entryProblems("h1", { ...header, totalGross: 18000 }, lines)).toEqual(["Net + VAT does not give the gross total"]);
    expect(entryProblems("h1", header, [{ ...lines[0]!, target: target("1", 600, "EUR") }])).toEqual(["Every line must be in CZK, the invoice currency"]);
    expect(entryProblems("h1", { ...header, bankAccount: "124/0800" }, lines)[0]).toMatch(/check digit/);
  });
});

describe("VAT-register block", () => {
  const ok = { vatUnreliable: false, bankAccountPublished: true, bankAccounts: ["19-2000145399/0800"], blocked: false };

  it("finds nothing for a clean haulier paid to a published account", () => {
    expect(vatBlockers(ok, "CZ65 0800 0000 1920 0014 5399")).toEqual([]);
  });

  it("names each reason with how to fix it", () => {
    const all = vatBlockers({ vatUnreliable: true, bankAccountPublished: false, bankAccounts: [], blocked: true }, "2000145399/0800");
    expect(all.map((b) => b.problem)).toEqual([
      "The haulier is blocked",
      "The haulier is an unreliable VAT payer",
      "The haulier's bank account is not published in the VAT register",
      "The invoice's bank account is not one of the haulier's published accounts",
    ]);
    expect(all[3]!.fix).toMatch(/Published bank accounts/);
  });
});

describe("approve / reject", () => {
  it("lets only a manager decide an invoice that needs approval, and nobody approve a blocked one", () => {
    expect(invoiceDecisionState({ status: "NEEDS_APPROVAL" }, true)).toEqual({ approve: null, reject: null });
    expect(invoiceDecisionState({ status: "NEEDS_APPROVAL" }, false).approve).toMatch(/Only a manager/);
    expect(invoiceDecisionState({ status: "BLOCKED" }, true).approve).toMatch(/nobody can approve/);
    expect(invoiceDecisionState({ status: "BLOCKED" }, true).reject).toBeNull();
    expect(invoiceDecisionState({ status: "APPROVED" }, true).approve).toBe("Already decided");
  });
});
