import { describe, expect, it } from "vitest";
import { isOverdue, isPrepayment, owedByCustomer, receivablePatch, reminderContact, type OwedEntry, type ReminderCandidate } from "../lib/receivable";
import type { InvoiceStatus } from "../interfaces/interfaces";

const TODAY = "2026-11-18";
const A = "0b6a1c1e-1111-4a4a-8a8a-000000000001";
const B = "0b6a1c1e-2222-4a4a-8a8a-000000000002";

const entry = (over: Partial<OwedEntry> = {}): OwedEntry => ({
  customerId: A, currency: "EUR", amount: 1000, leftToPay: null, status: "Open", dueDate: "2026-12-01", ...over,
});

describe("what a customer owes (the customer's invoice list netted)", () => {
  it("before Accounts Receivable sends a word: the invoice's amount less its partial credit note's minus entry", () => {
    const invoice = entry({ amount: 1000 });
    const creditNote = entry({ amount: -200 });
    expect(owedByCustomer([invoice, creditNote], TODAY)).toEqual([{ customerId: A, currency: "EUR", amount: 800, overdue: 0, oldestDue: null }]);
  });

  it("after it: what is left to pay on the invoice (credit note and payment netted in), the credit note's entry owing nothing", () => {
    // 1000 invoiced, 200 credited, 300 paid: 500 left. The credit note's entry is set to 0 so it is not counted twice.
    const invoice = entry({ amount: 1000, leftToPay: 500 });
    const creditNote = entry({ amount: -200, leftToPay: 0 });
    expect(owedByCustomer([invoice, creditNote], TODAY)).toEqual([{ customerId: A, currency: "EUR", amount: 500, overdue: 0, oldestDue: null }]);
  });

  it("counts an invoice past its due day as overdue, but never a partial credit note's minus entry due with it", () => {
    const invoice = entry({ amount: 1000, leftToPay: 500, dueDate: "2026-11-01" });
    const creditNote = entry({ amount: -200, dueDate: "2026-11-01" });
    expect(isOverdue(creditNote, TODAY)).toBe(false);
    expect(owedByCustomer([invoice, creditNote], TODAY)).toEqual([{ customerId: A, currency: "EUR", amount: 300, overdue: 1, oldestDue: "2026-11-01" }]);
  });

  it("is not overdue once nothing is left to pay, even marked Overdue", () => {
    expect(isOverdue(entry({ status: "Overdue", leftToPay: 0, dueDate: "2026-10-01" }), TODAY)).toBe(false);
    expect(isOverdue(entry({ status: "Overdue", dueDate: null }), TODAY)).toBe(true);
    expect(isOverdue(entry({ dueDate: TODAY }), TODAY)).toBe(false);
    expect(isOverdue(entry({ dueDate: null }), TODAY)).toBe(false);
  });

  it("keeps currencies and customers apart, never adds Paid, Credited or Cancelled, and leaves out a currency where nothing is owed", () => {
    const rows = [
      entry({ amount: 100.1 }),
      entry({ amount: 200.2, dueDate: "2026-10-30" }),
      entry({ amount: 50, dueDate: "2026-11-02" }),
      entry({ currency: "CZK", amount: 5000 }),
      entry({ customerId: B, amount: 70 }),
      entry({ status: "Paid", amount: 999 }),
      entry({ status: "Credited", amount: 999 }),
      entry({ status: "Cancelled", amount: 999 }),
      entry({ currency: "USD", amount: 400, leftToPay: 0 }),
    ];
    expect(owedByCustomer(rows, TODAY)).toEqual([
      { customerId: A, currency: "EUR", amount: 350.3, overdue: 2, oldestDue: "2026-10-30" },
      { customerId: A, currency: "CZK", amount: 5000, overdue: 0, oldestDue: null },
      { customerId: B, currency: "EUR", amount: 70, overdue: 0, oldestDue: null },
    ]);
  });
});

describe("Accounts Receivable's word on an invoice's entry", () => {
  // An entry Accounts Receivable wrote to before (left to pay set), and one it never wrote to (null).
  const written = (status: InvoiceStatus) => ({ status, leftToPay: "300.00" });
  const untouched = (status: InvoiceStatus) => ({ status, leftToPay: null });

  it("makes a settled invoice Paid, with the day of its last payment", () => {
    expect(receivablePatch(untouched("Open"), { leftToPay: 0, lastPaidOn: "2026-11-17", settled: true })).toEqual({ status: "Paid", leftToPay: 0, paidOn: "2026-11-17" });
    expect(receivablePatch(written("Overdue"), { leftToPay: -20, lastPaidOn: "2026-11-17", settled: true })).toEqual({ status: "Paid", leftToPay: -20, paidOn: "2026-11-17" });
  });

  it("puts a Paid invoice back to Open when a payment is taken back", () => {
    expect(receivablePatch(written("Paid"), { leftToPay: 300, lastPaidOn: null, settled: false })).toEqual({ status: "Open", leftToPay: 300, paidOn: null });
  });

  it("never turns an old Paid it has not written to back to Open (the carry-over still finds it)", () => {
    expect(receivablePatch(untouched("Paid"), { leftToPay: 1000, lastPaidOn: null, settled: false })).toBeNull();
    expect(receivablePatch(untouched("Paid"), { leftToPay: 0, lastPaidOn: null, settled: true })).toEqual({ status: "Paid", leftToPay: 0, paidOn: null });
  });

  it("leaves the status of an invoice part paid as it is, with what is left (to the cent)", () => {
    expect(receivablePatch(untouched("Open"), { leftToPay: 120.004, lastPaidOn: "2026-11-10", settled: false })).toEqual({ status: "Open", leftToPay: 120, paidOn: "2026-11-10" });
    expect(receivablePatch(written("Overdue"), { leftToPay: 120, lastPaidOn: null, settled: false })).toEqual({ status: "Overdue", leftToPay: 120, paidOn: null });
  });

  it("makes a credited invoice's entry Credited and a cancelled one's Cancelled, never Paid", () => {
    expect(receivablePatch(written("Open"), { leftToPay: -300, lastPaidOn: "2026-11-17", settled: true, invoiceStatus: "credited" })).toEqual({ status: "Credited", leftToPay: -300, paidOn: "2026-11-17" });
    expect(receivablePatch(untouched("Paid"), { leftToPay: 0, lastPaidOn: null, settled: true, invoiceStatus: "credited" })).toEqual({ status: "Credited", leftToPay: 0, paidOn: null });
    expect(receivablePatch(untouched("Overdue"), { leftToPay: 0, lastPaidOn: null, settled: true, invoiceStatus: "cancelled" })).toEqual({ status: "Cancelled", leftToPay: 0, paidOn: null });
    expect(receivablePatch(written("Open"), { leftToPay: 0, lastPaidOn: null, settled: true, invoiceStatus: "issued" })).toMatchObject({ status: "Paid" });
  });

  it("never touches a Credited or Cancelled entry", () => {
    expect(receivablePatch(written("Credited"), { leftToPay: 0, lastPaidOn: "2026-11-17", settled: true })).toBeNull();
    expect(receivablePatch(untouched("Cancelled"), { leftToPay: 500, lastPaidOn: null, settled: false })).toBeNull();
    expect(receivablePatch(written("Credited"), { leftToPay: 0, lastPaidOn: null, settled: true, invoiceStatus: "cancelled" })).toBeNull();
    expect(receivablePatch(written("Cancelled"), { leftToPay: 0, lastPaidOn: null, settled: true, invoiceStatus: "credited" })).toBeNull();
  });
});

describe("whom a payment reminder goes to", () => {
  let n = 0;
  const contact = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
    id: `k${++n}`, name: `Contact ${n}`, email: `c${n}@example.cz`, role: "Logistics Manager", isMain: false, createdAt: new Date(`2026-01-0${(n % 9) + 1}T08:00:00Z`), ...over,
  });

  it("is the Accounts payable contact first", () => {
    const ap = contact({ role: "Accounts payable", name: "Eva AP", email: " eva@example.cz " });
    const picked = reminderContact([contact({ isMain: true }), contact({ role: "Finance / Accounting" }), ap]);
    expect(picked).toEqual({ name: "Eva AP", email: "eva@example.cz", role: "Accounts payable" });
  });

  it("then Finance / Accounting, then the main contact", () => {
    const fin = contact({ role: "Finance / Accounting", name: "Petr Finance" });
    const main = contact({ isMain: true, name: "Jana Main", role: "Sales" });
    expect(reminderContact([main, fin])?.name).toBe("Petr Finance");
    expect(reminderContact([main, contact()])).toEqual({ name: "Jana Main", email: main.email, role: "Sales" });
  });

  it("needs an e-mail: one without is passed over, and with none at all there is nobody", () => {
    const ap = contact({ role: "Accounts payable", email: "  " });
    const main = contact({ isMain: true, name: "Jana Main" });
    expect(reminderContact([ap, main])?.name).toBe("Jana Main");
    expect(reminderContact([contact({ isMain: true, email: "" })])).toBeNull();
    expect(reminderContact([contact()])).toBeNull();
    expect(reminderContact([])).toBeNull();
  });

  it("among several of a role is the main contact, then the oldest", () => {
    const older = contact({ role: "Accounts payable", name: "Older", createdAt: new Date("2025-01-01T00:00:00Z") });
    const newer = contact({ role: "Accounts payable", name: "Newer", createdAt: new Date("2026-01-01T00:00:00Z") });
    expect(reminderContact([newer, older])?.name).toBe("Older");
    expect(reminderContact([older, { ...newer, isMain: true }])?.name).toBe("Newer");
  });
});

describe("prepayment terms", () => {
  it("are told by the word prepay, in any case", () => {
    expect(isPrepayment("Prepayment")).toBe(true);
    expect(isPrepayment("100 % PREPAYMENT before loading")).toBe(true);
    expect(isPrepayment("30 days")).toBe(false);
    expect(isPrepayment("")).toBe(false);
  });
});
