import { describe, expect, it } from "vitest";
import { allocationProblem, decidableProblem, ignoreProblem, invoiceNumberIn, matchEntry, sameSymbol, storedCandidate, type OpenInvoice } from "../lib/bankMatch";

// Which invoices a bank entry may pay (the bank statement import): a proposal only, never a payment.

const inv = (over: Partial<OpenInvoice> = {}): OpenInvoice => ({
  invoiceId: "i-31a",
  number: "INV2026CZ00000031-001",
  customer: "Gama Elektro a.s.",
  jobNumber: "CZ00000031",
  leftToPay: 1210,
  currency: "CZK",
  dueDate: "2026-11-30",
  version: 2,
  ...over,
});

const entry = (over: Partial<Parameters<typeof matchEntry>[0]> = {}) => ({
  credit: true,
  amount: 1210,
  currency: "CZK",
  variableSymbol: "",
  endToEndId: "",
  message: "",
  ...over,
});

describe("sameSymbol", () => {
  it("compares as numbers: banks drop leading zeros", () => {
    expect(sameSymbol("31", "00000031")).toBe(true);
    expect(sameSymbol("0000000031", "00000031")).toBe(true);
    expect(sameSymbol("310", "00000031")).toBe(false);
    expect(sameSymbol("0", "0000")).toBe(false);
    expect(sameSymbol("", "31")).toBe(false);
    expect(sameSymbol("31a", "31")).toBe(false);
  });
});

describe("invoiceNumberIn", () => {
  const n = "INV2026CZ00000028-001";
  it("finds it whatever the case, spaces or dashes, also without the INV prefix", () => {
    expect(invoiceNumberIn(n, ["Invoice INV2026CZ00000028-001"])).toBe(true);
    expect(invoiceNumberIn(n, ["inv 2026cz00000028 001, thanks"])).toBe(true);
    expect(invoiceNumberIn(n, ["faktura č.2026CZ00000028-001"])).toBe(true);
    expect(invoiceNumberIn(n, ["2026CZ00000028-001"])).toBe(true);
  });
  it("never inside a longer number, never a credit note's number", () => {
    expect(invoiceNumberIn(n, ["INV2026CZ00000028-0012"])).toBe(false);
    expect(invoiceNumberIn(n, ["CN2026CZ00000028-001"])).toBe(false);
    expect(invoiceNumberIn(n, ["INV2026CZ00000028-002"])).toBe(false);
    expect(invoiceNumberIn(n, [""])).toBe(false);
  });
});

describe("matchEntry", () => {
  it("money out is not incoming, with no candidates", () => {
    expect(matchEntry(entry({ credit: false, variableSymbol: "31" }), [inv()])).toEqual({ status: "not_incoming", candidates: [] });
  });

  it("no symbol and no number in the message: no match", () => {
    expect(matchEntry(entry({ message: "thanks" }), [inv()])).toEqual({ status: "no_match", candidates: [] });
  });

  it("the variable symbol names every owed invoice of the job, in the entry's currency only", () => {
    const r = matchEntry(entry({ variableSymbol: "0000000031", amount: 500 }), [
      inv(),
      inv({ invoiceId: "i-31b", number: "INV2026CZ00000031-002", leftToPay: 800, dueDate: "2026-11-20" }),
      inv({ invoiceId: "i-31eur", number: "INV2026CZ00000031-003", currency: "EUR" }),
      inv({ invoiceId: "i-31paid", number: "INV2026CZ00000031-004", leftToPay: 0 }),
      inv({ invoiceId: "i-32", number: "INV2026CZ00000032-001", jobNumber: "CZ00000032" }),
    ]);
    expect(r.status).toBe("proposed");
    // Same score: the one due first first.
    expect(r.candidates.map((c) => c.invoiceId)).toEqual(["i-31b", "i-31a"]);
    expect(r.candidates[0]).toMatchObject({ reasons: ["Variable symbol 31"], score: 1, version: 2, dueDate: "2026-11-20" });
  });

  it("ranks the invoice number in the message above an exact amount above the symbol alone", () => {
    const r = matchEntry(entry({ variableSymbol: "31", amount: 800, message: "INV2026CZ00000031-001" }), [
      inv({ invoiceId: "exact", number: "INV2026CZ00000031-002", leftToPay: 800 }),
      inv({ invoiceId: "named" }),
      inv({ invoiceId: "symbol", number: "INV2026CZ00000031-003", leftToPay: 50 }),
    ]);
    expect(r.candidates.map((c) => [c.invoiceId, c.score])).toEqual([
      ["named", 5],
      ["exact", 3],
      ["symbol", 1],
    ]);
    expect(r.candidates[0]!.reasons).toEqual(["Invoice number in the payment", "Variable symbol 31"]);
  });

  it("the invoice number in the end-to-end id counts too, without any symbol (a EUR payment from abroad)", () => {
    const r = matchEntry(entry({ currency: "EUR", amount: 520.3, endToEndId: "INV2026CZ00000028-001" }), [inv({ number: "INV2026CZ00000028-001", jobNumber: "CZ00000028", currency: "EUR", leftToPay: 520.3 })]);
    expect(r.candidates[0]).toMatchObject({ score: 6, reasons: ["Invoice number in the payment", "Exact amount left to pay"] });
  });

  it("stores the candidate without the version and due day", () => {
    const [c] = matchEntry(entry({ variableSymbol: "31" }), [inv()]).candidates;
    expect(storedCandidate(c!)).toEqual({ invoiceId: "i-31a", number: "INV2026CZ00000031-001", customer: "Gama Elektro a.s.", jobNumber: "CZ00000031", leftToPay: 1210, currency: "CZK", reasons: ["Exact amount left to pay", "Variable symbol 31"], score: 3 });
  });
});

describe("allocationProblem", () => {
  const invoices = new Map([
    ["a", { number: "INV-A", leftToPay: 1000, currency: "CZK", owed: true }],
    ["b", { number: "INV-B", leftToPay: 500, currency: "CZK", owed: true }],
    ["e", { number: "INV-E", leftToPay: 500, currency: "EUR", owed: true }],
    ["p", { number: "INV-P", leftToPay: 0, currency: "CZK", owed: false }],
  ]);
  const e = { amount: 1500, currency: "CZK" };

  it("one payment over two invoices, up to the entry's amount (less is fine)", () => {
    expect(allocationProblem(e, [{ invoiceId: "a", amount: 1000 }, { invoiceId: "b", amount: 500 }], invoices)).toBeNull();
    expect(allocationProblem(e, [{ invoiceId: "a", amount: 999.99 }], invoices)).toBeNull();
  });

  it("refuses what would note money that did not come or is not owed", () => {
    expect(allocationProblem(e, [], invoices)).toBe("Choose at least one invoice this payment pays");
    expect(allocationProblem({ amount: 1200, currency: "CZK" }, [{ invoiceId: "a", amount: 1000 }, { invoiceId: "b", amount: 200.01 }], invoices)).toBe("Together more than the payment (1200.00 CZK)");
    expect(allocationProblem(e, [{ invoiceId: "b", amount: 500.01 }], invoices)).toBe("More than is left to pay on INV-B (500.00 CZK)");
    expect(allocationProblem(e, [{ invoiceId: "e", amount: 10 }], invoices)).toBe("INV-E is in EUR, the payment in CZK");
    expect(allocationProblem(e, [{ invoiceId: "p", amount: 10 }], invoices)).toBe("INV-P is not owed any more: open the statement again");
    expect(allocationProblem(e, [{ invoiceId: "x", amount: 10 }], invoices)).toBe("An invoice chosen is not owed any more: open the statement again");
    expect(allocationProblem(e, [{ invoiceId: "a", amount: 10 }, { invoiceId: "a", amount: 20 }], invoices)).toBe("An invoice is chosen twice: give it one amount");
    expect(allocationProblem(e, [{ invoiceId: "a", amount: 0 }], invoices)).toBe("Each amount must be above 0");
    expect(allocationProblem(e, [{ invoiceId: "a", amount: 10.005 }], invoices)).toBe("An amount has at most 2 decimals");
    expect(allocationProblem(e, Array.from({ length: 101 }, (_, i) => ({ invoiceId: `x${i}`, amount: 1 })), invoices)).toBe("At most 100 invoices in one payment");
  });

  it("adds in cents (0.1 + 0.2 is not above 0.30)", () => {
    const small = new Map([
      ["a", { number: "A", leftToPay: 1, currency: "CZK", owed: true }],
      ["b", { number: "B", leftToPay: 1, currency: "CZK", owed: true }],
    ]);
    expect(allocationProblem({ amount: 0.3, currency: "CZK" }, [{ invoiceId: "a", amount: 0.1 }, { invoiceId: "b", amount: 0.2 }], small)).toBeNull();
  });
});

describe("decidableProblem and ignoreProblem", () => {
  it("only an open entry is decided, once", () => {
    expect(decidableProblem({ status: "proposed", decidedBy: "", decidedOn: null })).toBeNull();
    expect(decidableProblem({ status: "no_match", decidedBy: "", decidedOn: null })).toBeNull();
    expect(decidableProblem({ status: "confirmed", decidedBy: "jana@cto.cz", decidedOn: "18.11.2026" })).toBe("This entry was confirmed already by jana@cto.cz on 18.11.2026");
    expect(decidableProblem({ status: "ignored", decidedBy: "jana@cto.cz", decidedOn: null })).toBe("This entry was set aside already by jana@cto.cz");
    expect(decidableProblem({ status: "not_incoming", decidedBy: "", decidedOn: null })).toMatch(/money out/);
  });
  it("a reason of at least 3 characters", () => {
    expect(ignoreProblem(" ab ")).toBe("Say why this entry is set aside");
    expect(ignoreProblem("Loan from the owner")).toBeNull();
  });
});
