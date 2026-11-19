import { describe, expect, it } from "vitest";
import {
  asAtDayProblem,
  asAtOf,
  batchCurrencyProblem,
  batchProblem,
  confirmProblem,
  countsAt,
  countsNow,
  customerListStateOf,
  isWaiting,
  lastPaidOnOf,
  leftToPayOf,
  mayConfirm,
  paidOf,
  prepaymentInvoicesOf,
  prepaymentUnpaidOf,
  receivableStateOf,
  settingsProblem,
  settledOther,
  settledOtherOf,
  statusOf,
  takeBackProblem,
  unbilledOf,
  writeOffProblem,
  type AsAtInput,
  type ReceivableInput,
} from "../lib/receivables";

// Accounts Receivable step 7's pure rules (18 Nov 2026): write-offs and bank charges that count once a second manager
// confirms them (D13), the status Written off and its marks, one bank payment over several invoices, month-end as at a
// day, the prepayment stop, the work not yet invoiced and the reminder settings.

const TODAY = "2026-11-18";
const INV = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6a";
const INV_B = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6b";
const NOW = new Date("2026-11-18T10:00:00Z");

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

describe("what counts toward the invoice", () => {
  const lines = [
    { kind: "payment", amount: "1000.00", takenBackAt: null, confirmedAt: NOW },
    { kind: "carried_over", amount: "10.00", takenBackAt: null, confirmedAt: NOW },
    { kind: "write_off", amount: "150.00", takenBackAt: null, confirmedAt: NOW },
    { kind: "bank_charge", amount: "25.00", takenBackAt: null, confirmedAt: NOW },
    { kind: "write_off", amount: "20.00", takenBackAt: null, confirmedAt: null },
    { kind: "bank_charge", amount: "5.00", takenBackAt: NOW, confirmedAt: NOW },
    { kind: "write_off", amount: "7.00", takenBackAt: NOW, confirmedAt: null },
  ];

  it("money is payments and carried over; write-offs and bank charges count apart, only confirmed and live", () => {
    expect(paidOf(lines)).toBe(1010);
    expect(settledOtherOf(lines)).toEqual({ writtenOff: 150, bankCharges: 25, waiting: 20 });
    expect(settledOther({ writtenOff: 150, bankCharges: 25 })).toBe(175);
    expect(settledOther({})).toBe(0);
  });

  it("a line counts now when live and money or confirmed; one waits when it is a write-off neither confirmed nor taken back", () => {
    expect(lines.map(countsNow)).toEqual([true, true, true, true, false, false, false]);
    expect(lines.map(isWaiting)).toEqual([false, false, false, false, true, false, false]);
    // A line with no kind is a payment (as before step 7).
    expect(countsNow({ amount: 1, takenBackAt: null })).toBe(true);
  });

  it("the last day paid is money's, never a write-off's", () => {
    expect(
      lastPaidOnOf([
        { kind: "payment", paidOn: "2026-11-10", takenBackAt: null },
        { kind: "write_off", paidOn: "2026-11-18", takenBackAt: null },
        { kind: "bank_charge", paidOn: "2026-11-17", takenBackAt: null },
      ]),
    ).toBe("2026-11-10");
  });

  it("what is left takes confirmed write-offs off too, and the customer's list is told it is settled", () => {
    expect(leftToPayOf({ invoiceStatus: "issued", gross: 1210, credited: 0, paid: 1000, settledOther: 210 })).toBe(0);
    expect(customerListStateOf({ invoiceStatus: "issued", gross: 1210, credited: 0, paid: 1000, settledOther: 210 })).toEqual({ leftToPay: 0, settled: true });
    expect(customerListStateOf({ invoiceStatus: "issued", gross: 1210, credited: 0, paid: 1000 })).toEqual({ leftToPay: 210, settled: false });
  });
});

describe("the status with write-offs (step 7)", () => {
  it("is Written off when only write-offs or bank charges closed it, Paid when money was paid too", () => {
    expect(statusOf({ invoiceStatus: "issued", leftToPay: 0, paid: 0, settledOther: 1210 })).toBe("written_off");
    expect(statusOf({ invoiceStatus: "issued", leftToPay: 0, paid: 1000, settledOther: 210 })).toBe("paid");
    expect(statusOf({ invoiceStatus: "issued", leftToPay: 0, paid: 0, settledOther: 0 })).toBe("credited");
  });

  it("is Part paid when a write-off counts and something is left", () => {
    expect(statusOf({ invoiceStatus: "issued", leftToPay: 1000, paid: 0, settledOther: 210 })).toBe("part_paid");
  });

  it("keeps Credited and Cancelled from the invoice itself", () => {
    expect(statusOf({ invoiceStatus: "credited", leftToPay: 0, paid: 0, settledOther: 100 })).toBe("credited");
    expect(statusOf({ invoiceStatus: "cancelled", leftToPay: 0, paid: 0, settledOther: 100 })).toBe("cancelled");
  });
});

describe("the row's state and marks with write-offs", () => {
  it("a short payment closed by a confirmed write-off: Paid, Part written off, nothing aged", () => {
    const s = receivableStateOf(input({ paid: 1200, writtenOff: 10, dueDate: "2026-11-01" }), TODAY);
    expect(s).toMatchObject({ paid: 1200, writtenOff: 10, bankCharges: 0, leftToPay: 0, status: "paid", agingBucket: null, daysOverdue: 0, marks: ["part_written_off"] });
  });

  it("a bank charge the bank kept: the Bank charge mark", () => {
    const s = receivableStateOf(input({ paid: 1185, bankCharges: 25 }), TODAY);
    expect(s).toMatchObject({ leftToPay: 0, status: "paid", marks: ["bank_charge"] });
  });

  it("written off in full: Written off, no Part written off (no money was paid)", () => {
    const s = receivableStateOf(input({ writtenOff: 1210 }), TODAY);
    expect(s).toMatchObject({ leftToPay: 0, status: "written_off", marks: [] });
  });

  it("a write-off waiting for a second manager counts for nothing yet: still owed and overdue, with its mark", () => {
    const s = receivableStateOf(input({ paid: 1000, waiting: 210, dueDate: "2026-11-10" }), TODAY);
    expect(s).toMatchObject({ leftToPay: 210, status: "part_paid", marks: ["overdue", "write_off_waiting"] });
  });
});

describe("writeOffProblem (D13)", () => {
  const ok = { kind: "write_off", invoiceStatus: "issued", amount: 10, reason: "short paid by the bank", leftToPay: 10, waiting: 0, currency: "EUR" };

  it("lets a write-off or a bank charge of up to what is left through", () => {
    expect(writeOffProblem(ok)).toBeNull();
    expect(writeOffProblem({ ...ok, kind: "bank_charge" })).toBeNull();
  });

  it("needs a known kind, a reason and an amount above 0", () => {
    expect(writeOffProblem({ ...ok, kind: "payment" })).toMatch(/write-off or a bank charge/);
    expect(writeOffProblem({ ...ok, reason: " ab " })).toBe("Say why the write-off closes what is left");
    expect(writeOffProblem({ ...ok, kind: "bank_charge", reason: "" })).toBe("Say why the bank charge closes what is left");
    expect(writeOffProblem({ ...ok, amount: 0 })).toBe("The amount must be above 0");
    expect(writeOffProblem({ ...ok, amount: 1.234 })).toMatch(/2 decimal/);
  });

  it("refuses a credited or cancelled invoice, nothing left, and more than is left", () => {
    expect(writeOffProblem({ ...ok, invoiceStatus: "credited" })).toMatch(/credited/);
    expect(writeOffProblem({ ...ok, invoiceStatus: "cancelled" })).toMatch(/cancelled/);
    expect(writeOffProblem({ ...ok, leftToPay: 0 })).toBe("Nothing is left to pay on this invoice");
    expect(writeOffProblem({ ...ok, amount: 10.01 })).toBe("More than is left to pay (10.00 EUR)");
  });

  it("counts what already waits: two waiting lines can't close more than is owed", () => {
    expect(writeOffProblem({ ...ok, waiting: 4, amount: 6 })).toBeNull();
    expect(writeOffProblem({ ...ok, waiting: 4, amount: 6.01 })).toBe("More than is left to pay once what waits for a second manager is counted (6.00 EUR)");
    expect(writeOffProblem({ ...ok, waiting: 10 })).toMatch(/already waits/);
  });
});

describe("confirmProblem (D13: a second manager)", () => {
  const line = { kind: "write_off", amount: "10.00", byUserId: "u-eva", confirmedAt: null, takenBackAt: null };
  const ok = { line, confirmerUserId: "u-boss", anotherManager: true, invoiceStatus: "issued", leftToPay: 10, currency: "CZK" };

  it("lets another manager confirm it", () => {
    expect(confirmProblem(ok)).toEqual({ problem: null, selfConfirmed: false });
  });

  it("refuses the manager who wrote it while another manager exists", () => {
    expect(confirmProblem({ ...ok, confirmerUserId: "u-eva" })).toEqual({ problem: "You wrote this write-off: another manager confirms it", selfConfirmed: false });
  });

  it("lets the writer confirm it only when the company has no other manager, marked self-confirmed", () => {
    expect(confirmProblem({ ...ok, confirmerUserId: "u-eva", anotherManager: false })).toEqual({ problem: null, selfConfirmed: true });
    // Someone else confirming is never a self-confirmation, other managers or not.
    expect(confirmProblem({ ...ok, anotherManager: false })).toEqual({ problem: null, selfConfirmed: false });
  });

  it("refuses one taken back, confirmed already, not a write-off, or on an invoice credited since", () => {
    expect(confirmProblem({ ...ok, line: { ...line, takenBackAt: NOW } }).problem).toBe("This write-off was taken back");
    expect(confirmProblem({ ...ok, line: { ...line, kind: "bank_charge", confirmedAt: NOW } }).problem).toBe("This bank charge is confirmed already");
    expect(confirmProblem({ ...ok, line: { ...line, kind: "payment" } }).problem).toMatch(/Only a write-off/);
    expect(confirmProblem({ ...ok, invoiceStatus: "credited" }).problem).toMatch(/credited: take the write-off back/);
  });

  it("refuses it when it no longer fits what is left (a payment noted meanwhile)", () => {
    expect(confirmProblem({ ...ok, leftToPay: 4 }).problem).toBe("More than is left to pay now (4.00 CZK): take the write-off back and write it again");
    expect(confirmProblem({ ...ok, leftToPay: -5 }).problem).toMatch(/\(0\.00 CZK\)/);
  });

  it("shows the confirm button to a manager, and to the writer only with no other manager", () => {
    expect(mayConfirm({ manager: true, byUserId: "u-eva", userId: "u-boss", anotherManager: true })).toBe(true);
    expect(mayConfirm({ manager: true, byUserId: "u-eva", userId: "u-eva", anotherManager: true })).toBe(false);
    expect(mayConfirm({ manager: true, byUserId: "u-eva", userId: "u-eva", anotherManager: false })).toBe(true);
    expect(mayConfirm({ manager: false, byUserId: "u-eva", userId: "u-boss", anotherManager: true })).toBe(false);
  });

  it("names a write-off's take-back by its kind", () => {
    expect(takeBackProblem({ reason: "no", takenBackAt: null, kind: "write_off" })).toBe("Say why the write-off is taken back");
    expect(takeBackProblem({ reason: "wrong amount", takenBackAt: NOW, kind: "bank_charge" })).toBe("This bank charge was taken back already");
    expect(takeBackProblem({ reason: "noted twice", takenBackAt: NOW })).toBe("This payment was taken back already");
  });
});

describe("one bank payment over several invoices", () => {
  const items = [
    { invoiceId: INV, version: 2, amount: 100 },
    { invoiceId: INV_B, version: 1, amount: 50.5 },
  ];

  it("takes 1 to 100 invoices, each once, with a version and an amount", () => {
    expect(batchProblem({ paidOn: "2026-11-14", items })).toBeNull();
    expect(batchProblem({ paidOn: "2026-11-14", items: [] })).toBe("Choose at least one invoice the payment pays");
    expect(batchProblem({ paidOn: "2026-11-14", items: Array.from({ length: 101 }, () => items[0]!) })).toBe("One payment covers at most 100 invoices");
    expect(batchProblem({ paidOn: "2026-11-14", items: [items[0]!, { ...items[0]!, amount: 1 }] })).toBe("The same invoice is twice in one payment: give it one amount");
    expect(batchProblem({ paidOn: "2026-11-14", items: [{ ...items[0]!, invoiceId: "nope" }] })).toBe("An invoice of the payment is not there");
    expect(batchProblem({ paidOn: "2026-11-14", items: [{ ...items[0]!, version: 1.5 }] })).toMatch(/version/);
    expect(batchProblem({ paidOn: "2026-11-14", items: [{ ...items[0]!, amount: 0 }] })).toBe("The amount must be above 0");
    expect(batchProblem({ paidOn: "14.11.2026", items })).toMatch(/must be a date/);
  });

  it("is in one currency, and in the bank's when it is given", () => {
    expect(batchCurrencyProblem(["EUR", "EUR"])).toBeNull();
    expect(batchCurrencyProblem(["EUR", "CZK"])).toBe("One payment is in one currency: these invoices are in CZK and EUR");
    expect(batchCurrencyProblem(["EUR"], "EUR")).toBeNull();
    expect(batchCurrencyProblem(["EUR"], "CZK")).toBe("The payment is in CZK: every invoice it pays must be in CZK");
  });
});

describe("the prepayment stop (D20, step 7)", () => {
  const row = { status: "unpaid" as const, leftToPay: 1210, paymentTerms: "PREPAYMENT" };
  it("applies to an owed invoice on prepayment only", () => {
    expect(prepaymentUnpaidOf([row])).toBe(true);
    expect(prepaymentUnpaidOf([{ ...row, status: "part_paid", leftToPay: 10 }])).toBe(true);
    expect(prepaymentUnpaidOf([{ ...row, paymentTerms: "14 days" }])).toBe(false);
    expect(prepaymentUnpaidOf([{ ...row, status: "paid", leftToPay: 0 }])).toBe(false);
    expect(prepaymentUnpaidOf([{ ...row, status: "written_off", leftToPay: 0 }])).toBe(false);
    expect(prepaymentUnpaidOf([])).toBe(false);
  });

  it("names the owed invoices on prepayment only, not the job's other owed ones", () => {
    const base = { invoiceId: "i1", number: "INV-1", customerId: "c", customer: "Alfa", currency: "CZK", daysOverdue: 0, ...row };
    expect(
      prepaymentInvoicesOf([
        base,
        { ...base, invoiceId: "i2", number: "INV-2", paymentTerms: "14 days" },
        { ...base, invoiceId: "i3", number: "INV-3", status: "paid", leftToPay: 0 },
      ]),
    ).toEqual([{ invoiceId: "i1", number: "INV-1", leftToPay: 1210, currency: "CZK" }]);
  });
});

describe("month-end as at a day (step 7)", () => {
  const DAY = "2026-10-31";
  const base = (over: Partial<AsAtInput> = {}): AsAtInput => ({
    invoiceStatus: "issued",
    issueDate: "2026-10-10",
    dueDate: "2026-10-24",
    gross: 1000,
    fxRate: 25.125,
    creditNotes: [],
    lines: [],
    ...over,
  });
  const line = (over: Partial<AsAtInput["lines"][number]> = {}) => ({ kind: "payment", amount: "100.00", paidOn: "2026-10-20", confirmedAt: new Date("2026-10-20T09:00:00Z"), takenBackAt: null, ...over });

  it("counts a payment paid on or before the day, even one noted later; not one paid after it", () => {
    expect(countsAt(line({ paidOn: "2026-10-31", confirmedAt: new Date("2026-11-05T09:00:00Z") }), DAY)).toBe(true);
    expect(countsAt(line({ paidOn: "2026-11-01" }), DAY)).toBe(false);
  });

  it("counts one carried over (its day not known) and flags it", () => {
    const s = asAtOf(base({ lines: [line({ kind: "carried_over", paidOn: null, amount: "400.00" })] }), DAY);
    expect(s).toMatchObject({ paid: 400, leftToPay: 600, carriedOver: true, listed: true });
  });

  it("counts a write-off confirmed on or before the day, by the Prague day of the confirmation", () => {
    // 23:30 UTC on 31 Oct is already 1 Nov in Prague (CET): not counted on 31 Oct.
    expect(countsAt(line({ kind: "write_off", paidOn: "2026-10-31", confirmedAt: new Date("2026-10-31T23:30:00Z") }), DAY)).toBe(false);
    expect(countsAt(line({ kind: "write_off", paidOn: "2026-10-30", confirmedAt: new Date("2026-10-31T22:30:00Z") }), DAY)).toBe(true);
    // Written before the day, confirmed after it: not yet on the day.
    expect(countsAt(line({ kind: "bank_charge", paidOn: "2026-10-28", confirmedAt: new Date("2026-11-03T10:00:00Z") }), DAY)).toBe(false);
    // Waiting: never.
    expect(countsAt(line({ kind: "write_off", confirmedAt: null }), DAY)).toBe(false);
  });

  it("still counts a line taken back after the day, not one taken back on or before it", () => {
    expect(countsAt(line({ takenBackAt: new Date("2026-11-02T10:00:00Z") }), DAY)).toBe(true);
    expect(countsAt(line({ takenBackAt: new Date("2026-10-31T20:00:00Z") }), DAY)).toBe(false);
    expect(countsAt(line({ kind: "write_off", takenBackAt: new Date("2026-11-02T10:00:00Z") }), DAY)).toBe(true);
  });

  it("credits only the credit notes issued on or before the day", () => {
    const s = asAtOf(base({ creditNotes: [{ issueDate: "2026-10-15", gross: "-100.00" }, { issueDate: "2026-11-02", gross: "-900.00" }] }), DAY);
    expect(s).toMatchObject({ credited: 100, leftToPay: 900, listed: true });
  });

  it("is in CZK at the invoice's own rate, rounded, with its age on the day", () => {
    const s = asAtOf(base({ lines: [line({ amount: "300.00" }), line({ kind: "write_off", amount: "100.00", confirmedAt: new Date("2026-10-30T10:00:00Z") })] }), DAY);
    expect(s).toMatchObject({ paid: 300, writtenOff: 100, leftToPay: 600, leftToPayCzk: 15075, daysOverdue: 7, agingBucket: "1-30" });
    expect(asAtOf(base({ gross: 33.33, fxRate: 24.333 }), DAY).leftToPayCzk).toBe(811.02);
  });

  it("lists nothing issued after the day, nothing cancelled, nothing settled on it", () => {
    expect(asAtOf(base({ issueDate: "2026-11-01" }), DAY).listed).toBe(false);
    expect(asAtOf(base({ invoiceStatus: "cancelled" }), DAY).listed).toBe(false);
    expect(asAtOf(base({ lines: [line({ amount: "1000.00" })] }), DAY)).toMatchObject({ leftToPay: 0, listed: false, agingBucket: null, daysOverdue: 0 });
    // Paid after the day: owed on it.
    expect(asAtOf(base({ lines: [line({ amount: "1000.00", paidOn: "2026-11-03" })] }), DAY)).toMatchObject({ leftToPay: 1000, listed: true });
    // Credited in full later, still issued then: owed on the day.
    expect(asAtOf(base({ invoiceStatus: "credited", creditNotes: [{ issueDate: "2026-11-05", gross: "-1000.00" }] }), DAY).listed).toBe(true);
  });

  it("refuses a day that is not one, or after today", () => {
    expect(asAtDayProblem("2026-10-31", TODAY)).toBeNull();
    expect(asAtDayProblem(TODAY, TODAY)).toBeNull();
    expect(asAtDayProblem("2026-11-19", TODAY)).toBe("The day cannot be after today");
    expect(asAtDayProblem("31.10.2026", TODAY)).toMatch(/must be a date/);
    expect(asAtDayProblem("", TODAY)).toMatch(/must be a date/);
  });
});

describe("work not yet invoiced (step 7)", () => {
  it("sums the selling lines with a value that are on no open invoice, per currency, and counts their jobs", () => {
    const rows = [
      { id: "s1", shipmentId: "j1", qty: "2", amount: "100.00", currency: "EUR" },
      { id: "s2", shipmentId: "j1", qty: null, amount: "50.25", currency: "EUR" },
      { id: "s3", shipmentId: "j2", qty: "1", amount: "1000.00", currency: "CZK" },
      { id: "s4", shipmentId: "j2", qty: "1", amount: "0.00", currency: "CZK" },
      { id: "s5", shipmentId: "j3", qty: "1", amount: "700.00", currency: "CZK" },
    ];
    expect(unbilledOf(rows, [{ sourceSellingCostIds: ["s5", null] }])).toEqual({
      amounts: [
        { currency: "CZK", amount: 1000 },
        { currency: "EUR", amount: 250.25 },
      ],
      jobs: 2,
    });
  });

  it("answers nothing when everything is invoiced, and drops a currency that comes to 0", () => {
    expect(unbilledOf([{ id: "s1", shipmentId: "j1", qty: "1", amount: "10", currency: "EUR" }], [{ sourceSellingCostIds: ["s1"] }])).toEqual({ amounts: [], jobs: 0 });
    expect(
      unbilledOf(
        [
          { id: "s1", shipmentId: "j1", qty: "1", amount: "10", currency: "EUR" },
          { id: "s2", shipmentId: "j1", qty: "1", amount: "-10", currency: "EUR" },
        ],
        [],
      ).amounts,
    ).toEqual([]);
  });
});

describe("reminder settings (step 7)", () => {
  it("takes reminder 1 at 1–365 days, reminder 2 after it, and a reply-to e-mail or none", () => {
    expect(settingsProblem({ reminder1Days: 7, reminder2Days: 21, replyTo: "" })).toBeNull();
    expect(settingsProblem({ reminder1Days: 1, reminder2Days: 365, replyTo: "ucetni@cto.cz" })).toBeNull();
    expect(settingsProblem({ reminder1Days: 0, reminder2Days: 21, replyTo: "" })).toMatch(/Reminder 1/);
    expect(settingsProblem({ reminder1Days: 7.5, reminder2Days: 21, replyTo: "" })).toMatch(/Reminder 1/);
    expect(settingsProblem({ reminder1Days: 21, reminder2Days: 21, replyTo: "" })).toMatch(/Reminder 2/);
    expect(settingsProblem({ reminder1Days: 7, reminder2Days: 366, replyTo: "" })).toMatch(/Reminder 2/);
    expect(settingsProblem({ reminder1Days: 7, reminder2Days: 21, replyTo: "ucetni" })).toMatch(/reply-to/);
  });
});
