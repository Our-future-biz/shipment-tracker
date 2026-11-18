import { describe, expect, it } from "vitest";
import { businessDay } from "../../../lib/businessDate";
import {
  agingBucketOf,
  agingByCustomer,
  amountProblem,
  carriedOverAmount,
  creditedOf,
  customerListStateOf,
  daysOverdue,
  isOverdue,
  isPrepayment,
  lastPaidOnOf,
  leftToPayOf,
  noteProblem,
  overdueMilestone,
  paidNotice,
  paidOf,
  parseNoticeKey,
  paymentProblem,
  receivableStateOf,
  releaseWarning,
  statusOf,
  takeBackProblem,
  type ReceivableInput,
  type ReleaseRow,
} from "../lib/receivables";

// Accounts Receivable's pure rules (Council Outlay 10, D1–D26): what an invoice is owed after its credit notes and
// payments, its status, marks and age, when a payment, a take-back or a note may be written, the release warning and
// the bell.

const TODAY = "2026-11-18";
const INV = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6a";

const input = (over: Partial<ReceivableInput> = {}): ReceivableInput => ({
  invoiceStatus: "issued",
  gross: 1210,
  credited: 0,
  paid: 0,
  dueDate: "2026-11-30",
  paymentTerms: "14 days",
  promisedOn: null,
  disputed: false,
  reminderLevel: 0,
  customerListFailed: false,
  ...over,
});

describe("credited, paid and left to pay", () => {
  it("takes the credit notes' negative gross as a positive credit, rounded", () => {
    expect(creditedOf(["-100.10", -0.2])).toBe(100.3);
    expect(creditedOf([])).toBe(0);
  });

  it("counts live payments only", () => {
    expect(paidOf([{ amount: "100.10", takenBackAt: null }, { amount: 0.2, takenBackAt: null }, { amount: "500", takenBackAt: new Date() }])).toBe(100.3);
  });

  it("knows the last day paid, leaving out taken-back payments and one carried over with no day", () => {
    expect(
      lastPaidOnOf([
        { paidOn: "2026-11-10", takenBackAt: null },
        { paidOn: "2026-11-15", takenBackAt: "2026-11-16T10:00:00Z" },
        { paidOn: null, takenBackAt: null },
      ]),
    ).toBe("2026-11-10");
    expect(lastPaidOnOf([{ paidOn: null, takenBackAt: null }])).toBeNull();
  });

  it("is the invoice with VAT less credit notes less payments, and may go below 0", () => {
    expect(leftToPayOf({ invoiceStatus: "issued", gross: 2380, credited: 476, paid: 0 })).toBe(1904);
    expect(leftToPayOf({ invoiceStatus: "issued", gross: 0.3, credited: 0.1, paid: 0.2 })).toBe(0);
    expect(leftToPayOf({ invoiceStatus: "credited", gross: 1000, credited: 1000, paid: 300 })).toBe(-300);
  });

  it("owes nothing on a cancelled invoice", () => {
    expect(leftToPayOf({ invoiceStatus: "cancelled", gross: 12100, credited: 0, paid: 0 })).toBe(0);
  });
});

describe("statusOf (D3)", () => {
  it("takes Credited and Cancelled from the invoice itself", () => {
    expect(statusOf({ invoiceStatus: "cancelled", leftToPay: 0, paid: 0 })).toBe("cancelled");
    expect(statusOf({ invoiceStatus: "credited", leftToPay: -300, paid: 300 })).toBe("credited");
  });

  it("is Unpaid, Part paid or Paid from what is left", () => {
    expect(statusOf({ invoiceStatus: "issued", leftToPay: 100, paid: 0 })).toBe("unpaid");
    expect(statusOf({ invoiceStatus: "issued", leftToPay: 100, paid: 20 })).toBe("part_paid");
    expect(statusOf({ invoiceStatus: "issued", leftToPay: 0, paid: 120 })).toBe("paid");
  });

  it("is Credited when partial credit notes left nothing and nothing was paid", () => {
    expect(statusOf({ invoiceStatus: "issued", leftToPay: 0, paid: 0 })).toBe("credited");
  });
});

describe("receivableStateOf", () => {
  it("an unpaid invoice due later: current, no marks", () => {
    expect(receivableStateOf(input(), TODAY)).toEqual({ credited: 0, paid: 0, writtenOff: 0, bankCharges: 0, leftToPay: 1210, status: "unpaid", daysOverdue: 0, agingBucket: "current", marks: [] });
  });

  it("a part credited invoice keeps the rest owed and shows Part credited", () => {
    const s = receivableStateOf(input({ gross: 2380, credited: 476 }), TODAY);
    expect(s).toMatchObject({ leftToPay: 1904, status: "unpaid", marks: ["part_credited"] });
  });

  it("part credited and part paid", () => {
    const s = receivableStateOf(input({ gross: 2380, credited: 476, paid: 904 }), TODAY);
    expect(s).toMatchObject({ leftToPay: 1000, status: "part_paid", marks: ["part_credited"] });
  });

  it("paid in full after a partial credit note: Paid, nothing aged", () => {
    const s = receivableStateOf(input({ gross: 2380, credited: 476, paid: 1904, dueDate: "2026-11-01" }), TODAY);
    expect(s).toMatchObject({ leftToPay: 0, status: "paid", daysOverdue: 0, agingBucket: null, marks: ["part_credited"] });
  });

  it("a full credit note after a payment keeps the payment: Credited, to refund (D14)", () => {
    const s = receivableStateOf(input({ invoiceStatus: "credited", gross: 1000, credited: 1000, paid: 300, dueDate: "2026-11-01" }), TODAY);
    expect(s).toMatchObject({ leftToPay: -300, status: "credited", daysOverdue: 0, agingBucket: null, marks: ["to_refund"] });
  });

  it("credited in full with no payment: Credited, nothing to refund, no Part credited", () => {
    const s = receivableStateOf(input({ invoiceStatus: "credited", gross: 1000, credited: 1000, dueDate: "2026-11-01" }), TODAY);
    expect(s).toMatchObject({ leftToPay: 0, status: "credited", marks: [] });
  });

  it("a cancelled invoice is never overdue nor aged", () => {
    const s = receivableStateOf(input({ invoiceStatus: "cancelled", dueDate: "2026-10-01" }), TODAY);
    expect(s).toMatchObject({ leftToPay: 0, status: "cancelled", daysOverdue: 0, agingBucket: null, marks: [] });
  });

  it("an overdue invoice: the mark, its days and its bucket", () => {
    const s = receivableStateOf(input({ dueDate: "2026-11-03" }), TODAY);
    expect(s).toMatchObject({ status: "unpaid", daysOverdue: 15, agingBucket: "1-30", marks: ["overdue"] });
  });

  it("prepayment, promised, disputed, reminded and not in the customer's list", () => {
    const s = receivableStateOf(
      input({ paymentTerms: "PREPAYMENT", promisedOn: "2026-11-25", disputed: true, reminderLevel: 2, customerListFailed: true, dueDate: "2026-11-17" }),
      TODAY,
    );
    expect(s.marks).toEqual(["overdue", "prepayment", "promised", "disputed", "reminded", "not_in_customer_list"]);
  });

  it("a promise is kept until its day and broken after it, only while something is owed", () => {
    expect(receivableStateOf(input({ promisedOn: TODAY }), TODAY).marks).toEqual(["promised"]);
    expect(receivableStateOf(input({ promisedOn: "2026-11-17" }), TODAY).marks).toEqual(["promise_broken"]);
    expect(receivableStateOf(input({ promisedOn: "2026-11-17", paid: 1210 }), TODAY).marks).toEqual([]);
  });
});

describe("overdue on the Prague day (D10)", () => {
  it("is overdue from the day after the due day", () => {
    const owed = { status: "unpaid" as const, leftToPay: 10 };
    expect(isOverdue({ ...owed, dueDate: "2026-11-18" }, "2026-11-18")).toBe(false);
    expect(isOverdue({ ...owed, dueDate: "2026-11-17" }, "2026-11-18")).toBe(true);
  });

  it("is never overdue with nothing left, nor when credited or paid", () => {
    expect(isOverdue({ status: "paid", leftToPay: 0, dueDate: "2026-01-01" }, TODAY)).toBe(false);
    expect(isOverdue({ status: "credited", leftToPay: -5, dueDate: "2026-01-01" }, TODAY)).toBe(false);
  });

  it("counts the day in Prague: at 23:30 UTC on the due day it is already the next day there", () => {
    const lateEvening = new Date("2026-11-17T23:30:00Z");
    expect(businessDay(lateEvening)).toBe("2026-11-18");
    const s = receivableStateOf(input({ dueDate: "2026-11-17" }), businessDay(lateEvening));
    expect(s).toMatchObject({ daysOverdue: 1, marks: ["overdue"] });
    // In summer (UTC+2) the Prague day turns at 22:00 UTC.
    expect(businessDay(new Date("2026-07-14T21:59:00Z"))).toBe("2026-07-14");
    expect(businessDay(new Date("2026-07-14T22:01:00Z"))).toBe("2026-07-15");
  });

  it("counts whole days across a clock change", () => {
    expect(daysOverdue("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysOverdue("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("agingBucketOf", () => {
  it("sorts what is left by days overdue", () => {
    expect(agingBucketOf(10, 0)).toBe("current");
    expect(agingBucketOf(10, 1)).toBe("1-30");
    expect(agingBucketOf(10, 30)).toBe("1-30");
    expect(agingBucketOf(10, 31)).toBe("31-60");
    expect(agingBucketOf(10, 60)).toBe("31-60");
    expect(agingBucketOf(10, 61)).toBe("61-90");
    expect(agingBucketOf(10, 90)).toBe("61-90");
    expect(agingBucketOf(10, 91)).toBe("90+");
  });

  it("has no bucket when nothing is left or something is to refund", () => {
    expect(agingBucketOf(0, 40)).toBeNull();
    expect(agingBucketOf(-5, 40)).toBeNull();
  });
});

describe("agingByCustomer (D7)", () => {
  it("adds up what each customer owes per currency, by age, with the oldest due day", () => {
    const rows = agingByCustomer([
      { customerId: "a", customer: "Alfa", currency: "CZK", status: "unpaid", leftToPay: 48400, agingBucket: "1-30", dueDate: "2026-11-03" },
      { customerId: "a", customer: "Alfa", currency: "CZK", status: "part_paid", leftToPay: 100.1, agingBucket: "current", dueDate: "2026-11-30" },
      { customerId: "a", customer: "Alfa", currency: "EUR", status: "unpaid", leftToPay: 50, agingBucket: "90+", dueDate: "2026-07-01" },
      { customerId: "b", customer: "Beta", currency: "CZK", status: "paid", leftToPay: 0, agingBucket: null, dueDate: "2026-10-01" },
      { customerId: "b", customer: "Beta", currency: "CZK", status: "credited", leftToPay: -20, agingBucket: null, dueDate: "2026-10-01" },
    ]);
    expect(rows).toEqual([
      { customerId: "a", customer: "Alfa", currency: "CZK", unpaid: 48500.1, current: 100.1, d1to30: 48400, d31to60: 0, d61to90: 0, d90plus: 0, oldestDue: "2026-11-03", invoices: 2 },
      { customerId: "a", customer: "Alfa", currency: "EUR", unpaid: 50, current: 0, d1to30: 0, d31to60: 0, d61to90: 0, d90plus: 50, oldestDue: "2026-07-01", invoices: 1 },
    ]);
  });
});

describe("prepayment (D22)", () => {
  it("reads the payment terms", () => {
    expect(isPrepayment("PREPAYMENT")).toBe(true);
    expect(isPrepayment("prepay before loading")).toBe(true);
    expect(isPrepayment("14 days")).toBe(false);
    expect(isPrepayment(null)).toBe(false);
  });
});

describe("carried over (D15) and the customer's list state", () => {
  it("carries over what is owed after the credit notes, or nothing", () => {
    expect(carriedOverAmount(2380, 476)).toBe(1904);
    expect(carriedOverAmount(1000, 1000)).toBeNull();
  });

  it("tells the customer's list what is left and whether it is settled", () => {
    expect(customerListStateOf({ invoiceStatus: "issued", gross: 1000, credited: 200, paid: 300 })).toEqual({ leftToPay: 500, settled: false });
    expect(customerListStateOf({ invoiceStatus: "issued", gross: 1000, credited: 200, paid: 800 })).toEqual({ leftToPay: 0, settled: true });
    expect(customerListStateOf({ invoiceStatus: "credited", gross: 1000, credited: 1000, paid: 300 })).toEqual({ leftToPay: -300, settled: true });
  });
});

describe("paymentProblem (D11, D12)", () => {
  const ok = { invoiceStatus: "issued", paidOn: "2026-11-14", amount: 100, leftToPay: 1210, currency: "CZK", issueDate: "2026-11-02", today: TODAY };

  it("lets a payment of up to what is left through", () => {
    expect(paymentProblem(ok)).toBeNull();
    expect(paymentProblem({ ...ok, amount: 1210 })).toBeNull();
    expect(paymentProblem({ ...ok, paidOn: TODAY })).toBeNull();
    expect(paymentProblem({ ...ok, paidOn: "2026-11-02" })).toBeNull();
  });

  it("refuses an invoice that is credited or cancelled", () => {
    expect(paymentProblem({ ...ok, invoiceStatus: "credited" })).toBe("This invoice is credited: no payment is noted on it");
    expect(paymentProblem({ ...ok, invoiceStatus: "cancelled" })).toBe("This invoice was cancelled: it is not owed");
  });

  it("refuses a day that is not a date, after today or before the invoice was issued", () => {
    expect(paymentProblem({ ...ok, paidOn: "2026-02-31" })).toBe("The day it was paid must be a date (yyyy-mm-dd)");
    expect(paymentProblem({ ...ok, paidOn: "2026-11-19" })).toBe("The day it was paid cannot be after today");
    expect(paymentProblem({ ...ok, paidOn: "2026-11-01" })).toBe("The day it was paid cannot be before the invoice was issued (2026-11-02)");
    // A prepayment customer often pays before the invoice is issued: an earlier day is allowed then (never after today).
    expect(paymentProblem({ ...ok, paidOn: "2026-10-20", prepayment: true })).toBeNull();
    expect(paymentProblem({ ...ok, paidOn: "2099-01-01", prepayment: true })).toBe("The day it was paid cannot be after today");
  });

  it("refuses an amount of 0, below 0, with 3 decimals, and more than is left to pay", () => {
    expect(paymentProblem({ ...ok, amount: 0 })).toBe("The amount must be above 0");
    expect(paymentProblem({ ...ok, amount: -5 })).toBe("The amount must be above 0");
    expect(paymentProblem({ ...ok, amount: 10.005 })).toBe("The amount may have at most 2 decimal places");
    expect(paymentProblem({ ...ok, amount: 1210.01 })).toBe("More than is left to pay (1210.00 CZK)");
    expect(paymentProblem({ ...ok, amount: 5, leftToPay: 0 })).toBe("Nothing is left to pay on this invoice");
  });

  it("checks the amount on its own too", () => {
    expect(amountProblem(Number.NaN)).toBe("The amount must be a number");
    expect(amountProblem(Number.POSITIVE_INFINITY)).toBe("The amount must be a number");
    expect(amountProblem(1e12)).toBe("The amount is too large");
    expect(amountProblem(0.1 + 0.2)).toBeNull();
  });
});

describe("takeBackProblem", () => {
  it("needs a reason of 3 characters and a live payment", () => {
    expect(takeBackProblem({ reason: " no ", takenBackAt: null })).toBe("Say why the payment is taken back");
    expect(takeBackProblem({ reason: "noted twice", takenBackAt: new Date() })).toBe("This payment was taken back already");
    expect(takeBackProblem({ reason: "noted twice", takenBackAt: null })).toBeNull();
  });
});

describe("noteProblem (D16, D17)", () => {
  const base = { text: "", today: TODAY, manager: false, status: "unpaid" as const, leftToPay: 100, disputed: false };

  it("a note needs its text", () => {
    expect(noteProblem({ ...base, kind: "note" })).toEqual({ kind: "invalid", message: "Write the note" });
    expect(noteProblem({ ...base, kind: "note", text: "Called them" })).toBeNull();
  });

  it("a promise needs a real day from today on, while something is owed", () => {
    expect(noteProblem({ ...base, kind: "promise" })).toEqual({ kind: "invalid", message: "Give the day the customer promised to pay by" });
    expect(noteProblem({ ...base, kind: "promise", promisedOn: "2026-13-01" })).toEqual({ kind: "invalid", message: "The promised day must be a date (yyyy-mm-dd)" });
    expect(noteProblem({ ...base, kind: "promise", promisedOn: "2026-11-17" })).toEqual({ kind: "invalid", message: "The promised day cannot be before today" });
    expect(noteProblem({ ...base, kind: "promise", promisedOn: TODAY })).toBeNull();
    expect(noteProblem({ ...base, kind: "promise", promisedOn: TODAY, status: "paid", leftToPay: 0 })).toMatchObject({ kind: "state" });
  });

  it("a dispute needs a reason, once; its end needs a reason and a dispute", () => {
    expect(noteProblem({ ...base, kind: "dispute", text: "no" })).toEqual({ kind: "invalid", message: "Say why the customer disputes the invoice" });
    expect(noteProblem({ ...base, kind: "dispute", text: "wrong rate" })).toBeNull();
    expect(noteProblem({ ...base, kind: "dispute", text: "wrong rate", disputed: true })).toEqual({ kind: "state", message: "This invoice is disputed already" });
    expect(noteProblem({ ...base, kind: "dispute_closed", text: "ok" })).toEqual({ kind: "invalid", message: "Say how the dispute ended" });
    expect(noteProblem({ ...base, kind: "dispute_closed", text: "credit note agreed" })).toEqual({ kind: "state", message: "This invoice is not disputed" });
    expect(noteProblem({ ...base, kind: "dispute_closed", text: "credit note agreed", disputed: true })).toBeNull();
  });

  it("a reminder of level 1 or 2 by anyone, the final notice by managers only, to an e-mail", () => {
    const reminder = { ...base, kind: "reminder", recipient: "ucetni@gama.cz" };
    expect(noteProblem({ ...reminder, reminderLevel: 1 })).toBeNull();
    expect(noteProblem({ ...reminder, reminderLevel: 2 })).toBeNull();
    expect(noteProblem({ ...reminder, reminderLevel: 3 })).toEqual({ kind: "forbidden", message: "Only a manager sends the final notice (reminder 3)" });
    expect(noteProblem({ ...reminder, reminderLevel: 3, manager: true })).toBeNull();
    expect(noteProblem({ ...reminder, reminderLevel: 4 })).toEqual({ kind: "invalid", message: "A reminder is of level 1, 2 or 3 (the final notice)" });
    expect(noteProblem({ ...reminder, reminderLevel: null })).toMatchObject({ kind: "invalid" });
    expect(noteProblem({ ...reminder, reminderLevel: 1, recipient: "gama" })).toEqual({ kind: "invalid", message: "Give the e-mail the reminder was sent to" });
  });

  it("no reminder on an invoice paid or disputed (a dispute leaves the reminders)", () => {
    const reminder = { ...base, kind: "reminder", recipient: "ucetni@gama.cz", reminderLevel: 1 };
    expect(noteProblem({ ...reminder, status: "paid", leftToPay: 0 })).toMatchObject({ kind: "state" });
    expect(noteProblem({ ...reminder, disputed: true })).toEqual({ kind: "state", message: "This invoice is disputed: close the dispute before sending a reminder" });
  });

  it("refuses a kind it does not know", () => {
    expect(noteProblem({ ...base, kind: "chat", text: "x" })).toMatchObject({ kind: "invalid" });
  });
});

describe("releaseWarning (D20)", () => {
  const row = (over: Partial<ReleaseRow> = {}): ReleaseRow => ({
    invoiceId: INV,
    number: "INV2026CZ00000031-001",
    customerId: "c1",
    customer: "Gama Elektro a.s.",
    currency: "CZK",
    status: "unpaid",
    leftToPay: 100,
    daysOverdue: 0,
    paymentTerms: "14 days",
    ...over,
  });

  it("warns for an owed invoice on prepayment", () => {
    expect(releaseWarning([row({ paymentTerms: "PREPAYMENT" })], new Map())).toMatchObject({ warn: true, prepayment: true, customer: "Gama Elektro a.s.", customerOverdueCount: 0 });
  });

  it("warns for an owed invoice whose customer has an overdue one", () => {
    expect(releaseWarning([row()], new Map([["c1", 2]]))).toMatchObject({ warn: true, prepayment: false, customerOverdueCount: 2 });
  });

  it("does not warn for an owed invoice on terms with nothing overdue, nor for paid or credited ones", () => {
    const answer = releaseWarning([row(), row({ invoiceId: "x", status: "paid", leftToPay: 0, paymentTerms: "PREPAYMENT" })], new Map());
    expect(answer).toMatchObject({ warn: false, prepayment: false });
    expect(answer.unpaid).toEqual([{ invoiceId: INV, number: "INV2026CZ00000031-001", leftToPay: 100, currency: "CZK", daysOverdue: 0 }]);
    expect(releaseWarning([row({ status: "credited", leftToPay: -5, paymentTerms: "PREPAYMENT" })], new Map([["c1", 3]]))).toMatchObject({ warn: false, unpaid: [] });
  });
});

describe("the bell (D18)", () => {
  it("tells the highest milestone reached", () => {
    expect(overdueMilestone(0)).toBeNull();
    expect(overdueMilestone(1)).toBe("overdue_1");
    expect(overdueMilestone(13)).toBe("overdue_1");
    expect(overdueMilestone(14)).toBe("overdue_14");
    expect(overdueMilestone(29)).toBe("overdue_14");
    expect(overdueMilestone(30)).toBe("overdue_30");
    expect(overdueMilestone(200)).toBe("overdue_30");
  });

  it("tells a payment only when it settled an invoice overdue on the day it was paid, noted in the last 7 days", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const payment = { kind: "payment", paidOn: "2026-11-17", createdAt: new Date("2026-11-17T09:00:00Z") };
    expect(paidNotice({ status: "paid", dueDate: "2026-11-10", lastPayment: payment, now })).toBe(true);
    // Paid on its due day: it was not overdue.
    expect(paidNotice({ status: "paid", dueDate: "2026-11-17", lastPayment: payment, now })).toBe(false);
    expect(paidNotice({ status: "part_paid", dueDate: "2026-11-10", lastPayment: payment, now })).toBe(false);
    expect(paidNotice({ status: "paid", dueDate: "2026-11-10", lastPayment: { ...payment, createdAt: new Date("2026-11-10T09:00:00Z") }, now })).toBe(false);
    expect(paidNotice({ status: "paid", dueDate: "2026-11-10", lastPayment: { ...payment, kind: "carried_over", paidOn: null }, now })).toBe(false);
    expect(paidNotice({ status: "paid", dueDate: "2026-11-10", lastPayment: null, now })).toBe(false);
  });

  it("reads a key back, and refuses one that is not", () => {
    expect(parseNoticeKey(`${INV}:overdue_14`)).toEqual({ invoiceId: INV, milestone: "overdue_14" });
    expect(parseNoticeKey(`${INV}:paid`)).toEqual({ invoiceId: INV, milestone: "paid" });
    expect(parseNoticeKey(`${INV}:overdue_2`)).toBeNull();
    expect(parseNoticeKey("nope:paid")).toBeNull();
    expect(parseNoticeKey("paid")).toBeNull();
  });
});
