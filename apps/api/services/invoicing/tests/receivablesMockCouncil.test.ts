import { describe, expect, it } from "vitest";
import { entryAllocationState, matchEntry, payableFromOf, waitingPaymentsOf, type OpenInvoice } from "../lib/bankMatch";
import { asAtOf, countsAt, paymentProblem, releaseCheckOf, settledDisputeReason, switchOnDayOnSave, takeBackProblem } from "../lib/receivables";
import { bankStatementsStale, switchOnDayToSet } from "../lib/reminderRules";

// The mock test council's Accounts Receivable fixes (19 Nov 2026), the pure rules: an early payment on prepayment or
// on an invoice issued again (Y2), the switch-on day (P3), a take-back by mistake or reversed (P8), recent bank
// statements before the reminders (P11), the dispute's own close (n5), the stop before any invoice in the public check
// (n6).

const invoice = (over: Partial<OpenInvoice> = {}): OpenInvoice => ({
  invoiceId: "i-1",
  number: "INV2026CZ00000031-001",
  customer: "Gama Elektro a.s.",
  jobNumber: "CZ00000031",
  leftToPay: 1210,
  currency: "CZK",
  dueDate: "2026-11-20",
  version: 1,
  ...over,
});
const credit = { credit: true, amount: 1210, currency: "CZK", variableSymbol: "31", endToEndId: "", message: "" };

describe("an early payment (Y2)", () => {
  it("may be booked from the issue day; any day on prepayment; from the replaced invoice's day when issued again", () => {
    expect(payableFromOf({ issueDate: "2026-11-12" })).toBe("2026-11-12");
    expect(payableFromOf({ issueDate: "2026-11-12", prepayment: true })).toBeNull();
    expect(payableFromOf({ issueDate: "2026-11-12", issuedAgainFrom: "2026-11-03" })).toBe("2026-11-03");
    // A "replaced" day after its own issue day says nothing.
    expect(payableFromOf({ issueDate: "2026-11-12", issuedAgainFrom: "2026-11-15" })).toBe("2026-11-12");
    expect(payableFromOf({ issueDate: null })).toBeNull();
  });

  it("is not proposed for an invoice its booking day is too early for; an entry of no known day is", () => {
    expect(matchEntry({ ...credit, day: "2026-11-05" }, [invoice({ payableFrom: "2026-11-12" })]).status).toBe("no_match");
    expect(matchEntry({ ...credit, day: "2026-11-12" }, [invoice({ payableFrom: "2026-11-12" })]).status).toBe("proposed");
    expect(matchEntry({ ...credit, day: "2026-11-05" }, [invoice({ payableFrom: null })]).status).toBe("proposed");
    expect(matchEntry({ ...credit, day: null }, [invoice({ payableFrom: "2026-11-12" })]).status).toBe("proposed");
  });

  it("holds a prepayment invoice issued after the entry was booked, and one issued again after a credit note", () => {
    const entry = { ...credit, statementId: "st-1", fileName: "vypis.xml", bookingDate: "2026-11-05" };
    const later = { ...invoice(), issueDate: "2026-11-12" };
    expect(waitingPaymentsOf([entry], [later], "2026-11-19").size).toBe(0);
    expect([...waitingPaymentsOf([entry], [{ ...later, prepayment: true }], "2026-11-19").keys()]).toEqual(["i-1"]);
    expect([...waitingPaymentsOf([entry], [{ ...later, issuedAgainFrom: "2026-11-01" }], "2026-11-19").keys()]).toEqual(["i-1"]);
    expect(waitingPaymentsOf([{ ...entry, bookingDate: "2026-10-30" }], [{ ...later, issuedAgainFrom: "2026-11-01" }], "2026-11-19").size).toBe(0);
  });

  it("is noted on an invoice issued again from the replaced invoice's issue day, not before", () => {
    const base = { invoiceStatus: "issued", amount: 100, leftToPay: 1210, currency: "CZK", issueDate: "2026-11-12", today: "2026-11-19" };
    expect(paymentProblem({ ...base, paidOn: "2026-11-05" })).toBe("The day it was paid cannot be before the invoice was issued (2026-11-12)");
    expect(paymentProblem({ ...base, paidOn: "2026-11-05", issuedAgainFrom: "2026-11-03" })).toBeNull();
    expect(paymentProblem({ ...base, paidOn: "2026-11-02", issuedAgainFrom: "2026-11-03" })).toBe("The day it was paid cannot be before the invoice this one replaces was issued (2026-11-03)");
    expect(paymentProblem({ ...base, paidOn: "2026-10-01", prepayment: true })).toBeNull();
  });
});

describe("the day automatic reminders start (P3)", () => {
  const before = { autoReminders: false, autoRemindersSince: null };
  it("is never stored by a save while e-mail from the app is off", () => {
    expect(switchOnDayOnSave({ autoReminders: true, emailOn: false, before }, "2026-11-19")).toBeNull();
    expect(switchOnDayOnSave({ autoReminders: true, emailOn: false, before: { autoReminders: true, autoRemindersSince: "2026-11-02" } }, "2026-11-19")).toBeNull();
    expect(switchOnDayOnSave({ autoReminders: false, emailOn: true, before }, "2026-11-19")).toBeNull();
  });

  it("is today when switched on with e-mail on, and stays while they stay on", () => {
    expect(switchOnDayOnSave({ autoReminders: true, emailOn: true, before }, "2026-11-19")).toBe("2026-11-19");
    expect(switchOnDayOnSave({ autoReminders: true, emailOn: true, before: { autoReminders: true, autoRemindersSince: "2026-11-02" } }, "2026-11-19")).toBe("2026-11-02");
  });

  it("is set by the first run that finds them on, e-mail on and no day", () => {
    expect(switchOnDayToSet({ autoReminders: true, emailOn: true, autoRemindersSince: null }, "2026-11-19")).toBe("2026-11-19");
    expect(switchOnDayToSet({ autoReminders: true, emailOn: true, autoRemindersSince: "2026-11-02" }, "2026-11-19")).toBeNull();
    expect(switchOnDayToSet({ autoReminders: true, emailOn: false, autoRemindersSince: null }, "2026-11-19")).toBeNull();
    expect(switchOnDayToSet({ autoReminders: false, emailOn: true, autoRemindersSince: null }, "2026-11-19")).toBeNull();
  });
});

describe("recent bank statements before the reminders (P11)", () => {
  it("are read since the previous working day; never read at all, the run goes as before", () => {
    // Monday 23 Nov: the previous working day is Friday the 20th.
    expect(bankStatementsStale("2026-11-20", "2026-11-23")).toBe(false);
    expect(bankStatementsStale("2026-11-23", "2026-11-23")).toBe(false);
    expect(bankStatementsStale("2026-11-19", "2026-11-23")).toBe(true);
    // Wednesday 18 Nov: the 17th is a holiday, so Monday the 16th will do.
    expect(bankStatementsStale("2026-11-16", "2026-11-18")).toBe(false);
    // A company's own holiday counts too.
    expect(bankStatementsStale("2026-11-19", "2026-11-23", ["2026-11-20"])).toBe(false);
    expect(bankStatementsStale(null, "2026-11-23")).toBe(false);
  });
});

describe("a take-back: noted by mistake, or reversed on a day (P8)", () => {
  const base = { reason: "bank return", takenBackAt: null, kind: "payment", paidOn: "2026-11-10", today: "2026-11-19" };
  it("asks a day for a reversal: not before it was paid, not after today; a mistake has none", () => {
    expect(takeBackProblem({ ...base })).toBeNull();
    expect(takeBackProblem({ ...base, takeBackKind: "mistake" })).toBeNull();
    expect(takeBackProblem({ ...base, takeBackKind: "mistake", reversedOn: "2026-11-12" })).toBe("A payment noted by mistake has no day it went back");
    expect(takeBackProblem({ ...base, takeBackKind: "reversed", reversedOn: "2026-11-12" })).toBeNull();
    expect(takeBackProblem({ ...base, takeBackKind: "reversed" })).toBe("Give the day the payment went back (the bank return or the refund)");
    expect(takeBackProblem({ ...base, takeBackKind: "reversed", reversedOn: "12.11.2026" })).toBe("The day it went back must be a date (yyyy-mm-dd)");
    expect(takeBackProblem({ ...base, takeBackKind: "reversed", reversedOn: "2026-11-20" })).toBe("The day it went back cannot be after today");
    expect(takeBackProblem({ ...base, takeBackKind: "reversed", reversedOn: "2026-11-09" })).toBe("The day it went back cannot be before it was paid (2026-11-10)");
    expect(takeBackProblem({ ...base, takeBackKind: "lost" })).toBe("A take-back is noted by mistake or reversed on a day");
  });

  it("never reverses a write-off or a bank charge: no money moved", () => {
    expect(takeBackProblem({ ...base, kind: "write_off", takeBackKind: "reversed", reversedOn: "2026-11-12" })).toBe("Only a payment is reversed: a write-off taken back is a mistake");
    expect(takeBackProblem({ ...base, kind: "write_off" })).toBeNull();
  });

  it("counts a reversed payment at month-end from its day up to the day before it went back; a mistake never", () => {
    const line = { kind: "payment", amount: "1210.00", paidOn: "2026-10-20", confirmedAt: new Date("2026-10-20T10:00:00Z"), takenBackAt: new Date("2026-11-05T10:00:00Z") };
    const reversed = { ...line, takenBackKind: "reversed", reversedOn: "2026-11-03" };
    expect(countsAt(reversed, "2026-10-19")).toBe(false);
    expect(countsAt(reversed, "2026-10-31")).toBe(true);
    expect(countsAt(reversed, "2026-11-02")).toBe(true);
    expect(countsAt(reversed, "2026-11-03")).toBe(false);
    expect(countsAt({ ...line, takenBackKind: "mistake" }, "2026-10-31")).toBe(false);
    // Taken back before migration 0039 (no kind): a mistake.
    expect(countsAt(line, "2026-10-31")).toBe(false);
    const asAt = (lines: (typeof line)[]) =>
      asAtOf({ invoiceStatus: "issued", issueDate: "2026-10-15", dueDate: "2026-10-29", gross: 1210, fxRate: 1, creditNotes: [], lines }, "2026-10-31");
    expect(asAt([reversed])).toMatchObject({ paid: 1210, leftToPay: 0, listed: false });
    expect(asAt([{ ...line, takenBackKind: "mistake" } as typeof line])).toMatchObject({ paid: 0, leftToPay: 1210, listed: true });
  });

  it("frees a bank entry's amount only when a payment was noted by mistake - a reversed one went back to the customer", () => {
    const entry = { status: "confirmed" as const, amount: 2000, allocations: [{ invoiceId: "i-1", number: "INV-1", amount: 1210, paymentId: "p-1" }] };
    expect(entryAllocationState(entry, new Set(["p-1"]))).toMatchObject({ free: 2000, reopened: true });
    expect(entryAllocationState(entry, new Set(["p-1"]), new Set(["p-1"]))).toMatchObject({ free: 790, reopened: false });
  });
});

describe("a dispute closed by itself, worded from what settled it (n5)", () => {
  it("says paid only when money alone settled it, else names each part with its amount", () => {
    expect(settledDisputeReason({ invoiceStatus: "issued", status: "paid", paid: 1000, currency: "EUR" })).toBe("Closed by itself: the invoice is paid");
    expect(settledDisputeReason({ invoiceStatus: "issued", status: "paid", paid: 700, credited: 300, currency: "EUR" })).toBe(
      "Closed by itself: nothing is left to pay (paid 700.00, credited 300.00 EUR)",
    );
    expect(settledDisputeReason({ invoiceStatus: "issued", status: "paid", paid: 990, writtenOff: 5, bankCharges: 5, currency: "CZK" })).toBe(
      "Closed by itself: nothing is left to pay (paid 990.00, written off 5.00, bank charges 5.00 CZK)",
    );
    expect(settledDisputeReason({ invoiceStatus: "issued", status: "written_off", writtenOff: 1000 })).toBe("Closed by itself: what was left is written off");
    expect(settledDisputeReason({ invoiceStatus: "credited", status: "credited", paid: 100, credited: 1000 })).toBe("Closed by itself: the invoice was credited in full");
    expect(settledDisputeReason({ invoiceStatus: "issued", status: "paid" })).toBe("Closed by itself: the invoice is paid");
  });
});

describe("the public release check and the stop before any invoice (n6)", () => {
  const warning = { warn: false, customer: "", prepayment: false, customerOverdueCount: 0, unpaid: [] };
  it("turns the warning on, as prepayment, with what is not invoiced", () => {
    expect(releaseCheckOf(warning, [{ currency: "EUR", amount: 825 }])).toEqual({ ...warning, warn: true, prepayment: true, prepaymentUninvoiced: [{ currency: "EUR", amount: 825 }] });
    expect(releaseCheckOf(warning, [{ currency: "EUR", amount: 0 }])).toEqual({ ...warning, prepaymentUninvoiced: [] });
    expect(releaseCheckOf({ ...warning, warn: true, customerOverdueCount: 2 }, [])).toEqual({ ...warning, warn: true, customerOverdueCount: 2, prepaymentUninvoiced: [] });
  });
});
