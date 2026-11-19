import { describe, expect, it } from "vitest";
import {
  allocationProblem,
  decidableProblem,
  ignoreProblem,
  invoiceNumberIn,
  matchEntry,
  sameSymbol,
  storedCandidate,
  waitingPaymentsOf,
  waitingPaymentText,
  type OpenBankEntry,
  type OpenInvoice,
  type WaitingInvoice,
} from "../lib/bankMatch";

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

describe("waitingPaymentsOf (mock test council X5)", () => {
  const open = (over: Partial<OpenBankEntry> = {}): OpenBankEntry => ({ ...entry({ variableSymbol: "31" }), statementId: "st-1", fileName: "vypis-1.xml", bookingDate: "2026-11-17", ...over });
  const owed = (over: Partial<WaitingInvoice> = {}): WaitingInvoice => ({ ...inv(), issueDate: "2026-11-02", ...over });
  const TODAY = "2026-11-19";

  it("names each owed invoice an undecided incoming entry may pay, with the oldest booked entry first", () => {
    const out = waitingPaymentsOf(
      [open({ statementId: "st-2", fileName: "vypis-2.xml", bookingDate: "2026-11-18" }), open(), open({ variableSymbol: "99", bookingDate: "2026-11-01" })],
      [owed(), owed({ invoiceId: "i-99", jobNumber: "CZ00000099", number: "INV2026CZ00000099-001", currency: "EUR" })],
      TODAY,
    );
    expect([...out.entries()]).toEqual([["i-31a", { statementId: "st-1", fileName: "vypis-1.xml", bookingDate: "2026-11-17", amount: 1210, currency: "CZK" }]]);
  });

  it("never names an invoice for money out, another currency, or with nothing left to pay", () => {
    expect(waitingPaymentsOf([open({ credit: false })], [owed()], TODAY).size).toBe(0);
    expect(waitingPaymentsOf([open({ currency: "EUR" })], [owed()], TODAY).size).toBe(0);
    expect(waitingPaymentsOf([open()], [owed({ leftToPay: 0 })], TODAY).size).toBe(0);
    expect(waitingPaymentsOf([open()], [], TODAY).size).toBe(0);
  });

  it("never holds a job's later invoice with an entry booked before that invoice was issued (the symbol is the job's)", () => {
    // Booked 17.11. for the job's first invoice; the second one, issued 18.11., is not what it paid.
    const later = owed({ invoiceId: "i-31b", number: "INV2026CZ00000031-002", issueDate: "2026-11-18" });
    expect([...waitingPaymentsOf([open()], [later], TODAY).keys()]).toEqual([]);
    // Booked on the issue day, it may be.
    expect([...waitingPaymentsOf([open({ bookingDate: "2026-11-18" })], [later], TODAY).keys()]).toEqual(["i-31b"]);
    // An invoice of no known issue day is held as before.
    expect([...waitingPaymentsOf([open()], [owed({ issueDate: null })], TODAY).keys()]).toEqual(["i-31a"]);
  });

  it("holds nothing with an entry booked more than 30 days ago - nor one with no booking day read that long ago", () => {
    const old = owed({ issueDate: "2026-09-01" });
    expect(waitingPaymentsOf([open({ bookingDate: "2026-10-20" })], [old], TODAY).size).toBe(1);
    expect(waitingPaymentsOf([open({ bookingDate: "2026-10-19" })], [old], TODAY).size).toBe(0);
    expect(waitingPaymentsOf([open({ bookingDate: null, readOn: "2026-10-01" })], [old], TODAY).size).toBe(0);
    expect(waitingPaymentsOf([open({ bookingDate: null, readOn: "2026-11-10" })], [old], TODAY).size).toBe(1);
    // With no booking day its value day is its day, as a confirm notes it: one valued before the invoice was issued
    // does not pay it, read after or not.
    const later = owed({ issueDate: "2026-11-10" });
    expect(waitingPaymentsOf([open({ bookingDate: null, valueDate: "2026-11-05", readOn: "2026-11-15" })], [later], TODAY).size).toBe(0);
    expect(waitingPaymentsOf([open({ bookingDate: null, valueDate: "2026-11-12", readOn: "2026-11-15" })], [later], TODAY).size).toBe(1);
    // A later, recent entry still holds it.
    expect(waitingPaymentsOf([open({ bookingDate: "2026-10-01" }), open({ statementId: "st-2", bookingDate: "2026-11-17" })], [old], TODAY).get("i-31a")?.statementId).toBe("st-2");
  });

  it("says it in the drawer's words", () => {
    expect(waitingPaymentText({ statementId: "st-1", fileName: "vypis-1.xml", bookingDate: "2026-11-17", amount: 1210, currency: "CZK" })).toBe(
      "A payment that may be for this invoice is waiting on bank statement vypis-1.xml (booked 17.11.2026, 1210.00 CZK): a manager confirms it there",
    );
    expect(waitingPaymentText({ statementId: "st-1", fileName: "", bookingDate: null, amount: 5, currency: "EUR" })).toBe(
      "A payment that may be for this invoice is waiting on bank statement (no name) (5.00 EUR): a manager confirms it there",
    );
  });
});
