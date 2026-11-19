import { describe, expect, it } from "vitest";
import {
  addAllocation,
  checkAllocations,
  countsText,
  entryStatusLabel,
  fileProblem,
  firstEntryTab,
  freeAmount,
  ignoreProblem,
  inEntryTab,
  isOpenEntry,
  withFreshFacts,
  periodText,
  prefillAllocations,
  startAmount,
  type AllocationRow,
  type InvoiceChoice,
} from "./bank";

const inv = (over: Partial<InvoiceChoice> = {}): InvoiceChoice => ({
  invoiceId: "i1",
  number: "2026CZ00000028-001",
  customer: "ACME s.r.o.",
  currency: "CZK",
  leftToPay: 1000,
  version: 3,
  ...over,
});
const row = (over: Partial<AllocationRow> = {}): AllocationRow => ({ ...inv(), amountText: "1000.00", ...over });
const money = (amount: number) => ({ amount, reopened: false, unallocated: 0 });
const entry = { ...money(1500), currency: "CZK" };

describe("entry words", () => {
  it("says money out and reversals are not customer payments", () => {
    expect(entryStatusLabel({ status: "not_incoming", credit: false })).toBe("Money out (not a customer payment)");
    expect(entryStatusLabel({ status: "not_incoming", credit: true })).toBe("Not a customer payment (a reversal)");
    expect(entryStatusLabel({ status: "proposed", credit: true })).toBe("To confirm");
    expect(entryStatusLabel({ status: "ignored", credit: true })).toBe("Set aside");
  });
  it("is open only for money in still to decide", () => {
    expect(isOpenEntry({ status: "proposed", credit: true })).toBe(true);
    expect(isOpenEntry({ status: "no_match", credit: true })).toBe(true);
    expect(isOpenEntry({ status: "confirmed", credit: true })).toBe(false);
    expect(isOpenEntry({ status: "proposed", credit: false })).toBe(false);
  });
  it("writes a period and counts", () => {
    expect(periodText("2026-11-01", "2026-11-30")).toBe("01.11.2026 – 30.11.2026");
    expect(periodText("2026-11-01", "2026-11-01")).toBe("01.11.2026");
    expect(periodText(null, null)).toBe("—");
    expect(countsText({ toDecide: 2, confirmed: 1, ignored: 0, notIncoming: 3, seenBefore: 0 })).toBe("2 to decide · 1 confirmed · 3 money out (not customer payments)");
    expect(countsText({ toDecide: 0, confirmed: 0, ignored: 0, notIncoming: 0, seenBefore: 0 })).toBe("No entries");
  });
});

describe("prefill and adding invoices", () => {
  it("starts with the best candidate at min(entry, left to pay)", () => {
    expect(prefillAllocations(money(1500), [inv({ leftToPay: 1000 }), inv({ invoiceId: "i2" })])).toEqual([{ ...inv({ leftToPay: 1000 }), amountText: "1000.00" }]);
    expect(prefillAllocations(money(400.5), [inv({ leftToPay: 1000 })])[0]!.amountText).toBe("400.50");
    expect(prefillAllocations(money(400), [])).toEqual([]);
  });
  it("gives a second invoice what is left of the entry", () => {
    const rows = addAllocation([row({ amountText: "1000" })], entry, inv({ invoiceId: "i2", number: "B", leftToPay: 800 }));
    expect(rows[1]!.amountText).toBe("500.00");
    expect(addAllocation(rows, entry, inv({ invoiceId: "i2" }))).toHaveLength(2);
    expect(startAmount(100, 100, 50)).toBe("");
    expect(startAmount(100, 120, 50)).toBe("");
  });
});

describe("checkAllocations", () => {
  it("sends the items with the receivable versions when all holds", () => {
    const c = checkAllocations(entry, [row({ amountText: "1000" }), row({ invoiceId: "i2", number: "B", leftToPay: 600, version: 7, amountText: "499,50" })]);
    expect(c.problem).toBe("");
    expect(c.total).toBe(1499.5);
    expect(c.rest).toBe(0.5);
    expect(c.items).toEqual([
      { invoiceId: "i1", receivableVersion: 3, amount: 1000 },
      { invoiceId: "i2", receivableVersion: 7, amount: 499.5 },
    ]);
  });
  it("refuses together more than the entry", () => {
    const c = checkAllocations(entry, [row({ amountText: "1000" }), row({ invoiceId: "i2", number: "B", amountText: "500.01" })]);
    expect(c.problem).toBe("Together more than the payment (1500.00 CZK)");
    expect(c.items).toEqual([]);
    expect(c.rest).toBe(-0.01);
  });
  it("refuses more than is left to pay on an invoice", () => {
    expect(checkAllocations(entry, [row({ amountText: "1000.01" })]).problem).toBe("More than is left to pay on 2026CZ00000028-001 (1000.00 CZK)");
  });
  it("leaves the rest of the entry on no invoice", () => {
    const c = checkAllocations(entry, [row({ amountText: "1000" })]);
    expect(c.problem).toBe("");
    expect(c.rest).toBe(500);
  });
  it("refuses nothing chosen, twice the same, no amount, a bad amount, zero and another currency", () => {
    expect(checkAllocations(entry, []).problem).toBe("Choose at least one invoice this payment pays");
    expect(checkAllocations(entry, [row({ amountText: "1" }), row({ amountText: "2" })]).problem).toBe("An invoice is chosen twice: give it one amount");
    expect(checkAllocations(entry, [row({ amountText: " " })]).problem).toBe("Give the amount paid on 2026CZ00000028-001");
    expect(checkAllocations(entry, [row({ amountText: "1.234" })]).problem).toBe("The amount on 2026CZ00000028-001 must be a number with at most 2 decimals");
    expect(checkAllocations(entry, [row({ amountText: "0" })]).problem).toBe("Each amount must be above 0");
    expect(checkAllocations(entry, [row({ currency: "EUR", amountText: "10" })]).problem).toBe("2026CZ00000028-001 is in EUR, the payment in CZK");
  });
});

describe("a reopened entry", () => {
  // A 10,000 payment confirmed before, 6,000 of it still on an invoice and 4,000 taken back: only the 4,000 is free.
  const reopened = { amount: 10000, currency: "CZK", reopened: true, unallocated: 4000 };
  it("is decided again only for the part still free", () => {
    expect(freeAmount(reopened)).toBe(4000);
    expect(freeAmount(entry)).toBe(1500);
  });
  it("prefills and adds at most what is free", () => {
    const rows = prefillAllocations(reopened, [inv({ leftToPay: 9000 })]);
    expect(rows[0]!.amountText).toBe("4000.00");
    expect(addAllocation([row({ leftToPay: 9000, amountText: "3000" })], reopened, inv({ invoiceId: "i2", leftToPay: 9000 }))[1]!.amountText).toBe("1000.00");
  });
  it("refuses together more than what is free, in the server's words", () => {
    const c = checkAllocations(reopened, [row({ leftToPay: 9000, amountText: "9000" })]);
    expect(c.problem).toBe("Together more than the payment (4000.00 CZK)");
    expect(c.items).toEqual([]);
    expect(checkAllocations(reopened, [row({ leftToPay: 9000, amountText: "4000" })])).toMatchObject({ problem: "", total: 4000, rest: 0 });
  });
});

describe("tabs and fresh facts", () => {
  it("lists each entry under its tab", () => {
    expect(inEntryTab({ status: "no_match", credit: true }, "decide")).toBe(true);
    expect(inEntryTab({ status: "not_incoming", credit: false }, "out")).toBe(true);
    expect(inEntryTab({ status: "not_incoming", credit: false }, "decide")).toBe(false);
    expect(inEntryTab({ status: "confirmed", credit: true }, "all")).toBe(true);
    expect(firstEntryTab([{ status: "confirmed", credit: true }])).toBe("all");
    expect(firstEntryTab([{ status: "proposed", credit: true }])).toBe("decide");
  });
  it("checks against each invoice as it is now, keeping the typed amount", () => {
    const fresh = new Map([["i1", inv({ leftToPay: 300, version: 4 })]]);
    const rows = withFreshFacts([row({ amountText: "400" }), row({ invoiceId: "gone", number: "G" })], fresh);
    expect(rows[0]).toMatchObject({ leftToPay: 300, version: 4, amountText: "400" });
    expect(rows[1]).toMatchObject({ invoiceId: "gone", leftToPay: 1000, version: 3 });
    expect(checkAllocations(entry, rows.slice(0, 1)).problem).toBe("More than is left to pay on 2026CZ00000028-001 (300.00 CZK)");
  });
});

describe("files and reasons", () => {
  it("takes an .xml file up to 10 MB", () => {
    expect(fileProblem({ name: "vypis.XML", size: 10 })).toBe("");
    expect(fileProblem({ name: "vypis.pdf", size: 10 })).toBe("Choose the bank's CAMT.053 statement: an .xml file");
    expect(fileProblem({ name: "a.xml", size: 0 })).toBe("The file is empty");
    expect(fileProblem({ name: "a.xml", size: 10 * 1024 * 1024 + 1 })).toBe("The file is larger than 10 MB");
  });
  it("needs a reason to set aside", () => {
    expect(ignoreProblem(" ab ")).toBe("Say why this entry is set aside");
    expect(ignoreProblem("Our own transfer")).toBe("");
  });
});
