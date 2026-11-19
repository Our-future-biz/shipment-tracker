import { describe, expect, it } from "vitest";
import { TAKEN_BACK_RULE } from "../month-end/_lib/monthEnd";
import { receivableTable } from "./receivableColumns";
import {
  earliestPaidOn,
  notAutoReminded,
  passesCheck,
  paymentProblem,
  RECEIVABLE_CHECKS,
  receivableNoticeText,
  takeBackFormProblem,
  takenBackText,
  type ReceivableRow,
} from "./receivables";

// The mock test council's Accounts Receivable fixes on the page (19 Nov 2026): the bell's "payment may be waiting"
// (n1), "Not reminded by the app" (P18), a take-back by mistake or reversed (P8), a payment on an invoice issued again
// (Y2).

const row = (over: Partial<ReceivableRow> = {}) => ({ status: "unpaid", leftToPay: 1210, dueDate: "2026-11-05", marks: [], ...over }) as unknown as ReceivableRow;

describe("the bell's line (n1)", () => {
  it("says a payment may be waiting on a bank statement for an overdue notice the server marks", () => {
    const n = { jobNumber: "CZ00000031", milestone: "overdue_14", leftToPay: 1210, currency: "CZK" };
    expect(receivableNoticeText(n)).toBe("CZ00000031 · 1,210 CZK left to pay");
    expect(receivableNoticeText({ ...n, paymentWaiting: true })).toBe("CZ00000031 · 1,210 CZK left to pay · a payment may be waiting on a bank statement");
    expect(receivableNoticeText({ ...n, milestone: "paid", paymentWaiting: true })).toBe("CZ00000031");
  });
});

describe("Not reminded by the app (P18)", () => {
  it("lists the owed invoices due before the day the automatic reminders start - every owed one while there is none", () => {
    expect(notAutoReminded(row({ dueDate: "2026-11-05" }), "2026-11-10")).toBe(true);
    expect(notAutoReminded(row({ dueDate: "2026-11-10" }), "2026-11-10")).toBe(false);
    expect(notAutoReminded(row(), null)).toBe(true);
    expect(notAutoReminded(row({ status: "paid", leftToPay: 0 }), "2026-11-10")).toBe(false);
  });

  it("is a check of the Filter panel, read with the server's day", () => {
    expect(RECEIVABLE_CHECKS.find((c) => c.key === "not_auto_reminded")?.label).toBe("Not reminded by the app");
    expect(passesCheck(row(), "not_auto_reminded", "2026-11-19", "2026-11-10")).toBe(true);
    expect(passesCheck(row({ dueDate: "2026-11-12" }), "not_auto_reminded", "2026-11-19", "2026-11-10")).toBe(false);
    const table = receivableTable("2026-11-19", "2026-11-10");
    expect(table.passesCheck!(row({ dueDate: "2026-11-12" }), "not_auto_reminded")).toBe(false);
    expect(receivableTable("2026-11-19").passesCheck!(row({ dueDate: "2026-11-12" }), "not_auto_reminded")).toBe(true);
  });
});

describe("taking a payment back (P8)", () => {
  const base = { reason: "bank return", kind: "reversed" as const, reversedOn: "2026-11-12", paidOn: "2026-11-10", today: "2026-11-19" };
  it("asks a reason, and for a reversal the day it went back - not before it was paid, not after today", () => {
    expect(takeBackFormProblem(base)).toBe("");
    expect(takeBackFormProblem({ ...base, kind: "mistake", reversedOn: "" })).toBe("");
    expect(takeBackFormProblem({ ...base, reason: "no" })).toBe("Say why it is taken back");
    expect(takeBackFormProblem({ ...base, reversedOn: "" })).toBe("Give the day the payment went back");
    expect(takeBackFormProblem({ ...base, reversedOn: "2026-11-20" })).toBe("The day it went back cannot be after today");
    expect(takeBackFormProblem({ ...base, reversedOn: "2026-11-09" })).toBe("The day it went back cannot be before it was paid (10.11.2026)");
  });

  it("reads in the drawer as a mistake or a reversal on its day, and the month-end says how each counts", () => {
    expect(takenBackText({ kind: "mistake", reversedOn: null })).toBe("Taken back: noted by mistake");
    expect(takenBackText({ kind: "reversed", reversedOn: "2026-11-12" })).toBe("Reversed on 12.11.2026");
    expect(TAKEN_BACK_RULE).toMatch(/noted by mistake never counts.*reversed.*counts as paid up to the day before it went back/);
  });
});

describe("a payment on an invoice issued again after a credit note (Y2)", () => {
  const base = { amountText: "100", today: "2026-11-19", issueDate: "2026-11-12", leftToPay: 1210, currency: "CZK" };
  it("may be from the day the replaced invoice was issued", () => {
    expect(earliestPaidOn({ issueDate: "2026-11-12" })).toBe("2026-11-12");
    expect(earliestPaidOn({ issueDate: "2026-11-12", prepayment: true })).toBeNull();
    expect(earliestPaidOn({ issueDate: "2026-11-12", issuedAgainFrom: "2026-11-03" })).toBe("2026-11-03");
    expect(paymentProblem({ ...base, day: "2026-11-05", issuedAgainFrom: "2026-11-03" })).toBe("");
    expect(paymentProblem({ ...base, day: "2026-11-02", issuedAgainFrom: "2026-11-03" })).toBe("The day it was paid cannot be before the invoice this one replaces was issued (03.11.2026)");
    expect(paymentProblem({ ...base, day: "2026-11-05" })).toBe("The day it was paid cannot be before the invoice was issued (12.11.2026)");
  });
});
