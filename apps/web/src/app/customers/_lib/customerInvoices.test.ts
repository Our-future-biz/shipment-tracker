import { describe, expect, it } from "vitest";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import type { ReceivableItem } from "@/hooks/useReceivables";
import { convert } from "@/lib/fx";
import {
  daysOverdue,
  effectiveStatus,
  handTyped,
  isOverdue,
  isOwedIssued,
  isSettled,
  leftToPayText,
  summarizeInvoices,
  typedStatusMark,
  unconvertedReason,
} from "./customerInvoices";

const TODAY = "2026-10-13";
const rates = { CZK: 1, EUR: 25, USD: 22 };

const inv = (over: Partial<InvoiceItem>): InvoiceItem => ({
  id: "i",
  customerId: "c",
  invoiceNumber: "X",
  amount: 0,
  currency: "EUR",
  dueDate: "2026-10-30",
  status: "Open",
  issuedAt: "2026-10-01",
  source: "typed",
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...over,
});

const ar = (over: Partial<ReceivableItem>): ReceivableItem => ({
  id: "r",
  number: "INV-1",
  customerId: "c",
  customer: "Acme",
  shipmentId: "s",
  jobNumber: "J1",
  issueDate: "2026-10-01",
  duzp: "2026-10-01",
  dueDate: "2026-10-30",
  currency: "EUR",
  net: 0,
  vat: 0,
  gross: 0,
  grossCzk: 0,
  credited: 0,
  paid: 0,
  writtenOff: 0,
  bankCharges: 0,
  leftToPay: 0,
  status: "unpaid",
  marks: [],
  daysOverdue: 0,
  agingBucket: null,
  paymentTerms: "30 days",
  promisedOn: null,
  disputed: false,
  reminderLevel: 0,
  lastRemindedOn: null,
  lastPaidOn: null,
  creditNoteNumbers: [],
  creditNotes: [],
  personInCharge: "",
  holidayCover: "",
  salesOwner: "",
  mine: false,
  myCustomer: false,
  issuedBy: "",
  version: 1,
  ...over,
});

const typedOnly = (typed: InvoiceItem[]) => ({ issued: [], typed });

describe("summarizeInvoices: rows typed by hand", () => {
  it("converts invoices in other currencies into the customer's currency", () => {
    const s = summarizeInvoices(
      typedOnly([inv({ id: "a", amount: 1000, currency: "EUR" }), inv({ id: "b", amount: 2500, currency: "CZK" })]),
      { currency: "EUR", rates },
      TODAY,
    );
    expect(s.outstanding).toBe(1100);
    expect(s.openAmount).toBe(1100);
    expect(s.byCurrency).toEqual([
      { currency: "EUR", amount: 1000, count: 1 },
      { currency: "CZK", amount: 2500, count: 1 },
    ]);
    expect(s.unconverted).toEqual([]);
  });

  it("puts converted overdue amounts into the aging buckets", () => {
    const s = summarizeInvoices(typedOnly([inv({ id: "a", amount: 25000, currency: "CZK", dueDate: "2026-09-01" })]), { currency: "EUR", rates }, TODAY);
    expect(s.overdueAmount).toBe(1000);
    expect(s.oldestOverdueDays).toBe(42);
    expect(s.aging.find((b) => b.key === "31-60")).toMatchObject({ amount: 1000, count: 1 });
  });

  it("nets a credit note typed by hand against its invoice", () => {
    const s = summarizeInvoices(
      typedOnly([inv({ id: "a", amount: 29999.5, currency: "CZK" }), inv({ id: "b", amount: -29999.5, currency: "CZK" })]),
      { currency: "CZK", rates },
      TODAY,
    );
    expect(s.outstanding).toBe(0);
  });

  it("leaves out and reports invoices in a currency without a rate", () => {
    const s = summarizeInvoices(
      typedOnly([inv({ id: "a", amount: 100, currency: "GBP" }), inv({ id: "b", amount: 50, currency: "EUR" })]),
      { currency: "EUR", rates },
      TODAY,
    );
    expect(s.outstanding).toBe(50);
    expect(s.unconverted).toEqual([{ currency: "GBP", amount: 100, count: 1 }]);
  });

  it("ignores paid invoices and treats a missing currency as the customer's", () => {
    const s = summarizeInvoices(typedOnly([inv({ id: "a", amount: 500, status: "Paid" }), inv({ id: "b", amount: 70, currency: "" })]), { currency: "USD", rates }, TODAY);
    expect(s.outstanding).toBe(70);
    expect(s.byCurrency).toEqual([{ currency: "USD", amount: 70, count: 1 }]);
  });

  it("treats an invoice cancelled by a credit note as settled, not overdue", () => {
    const s = summarizeInvoices(
      typedOnly([inv({ id: "a", amount: 300, currency: "", status: "Credited", dueDate: "2020-01-01" }), inv({ id: "b", amount: 70, currency: "" })]),
      { currency: "USD", rates },
      TODAY,
    );
    expect(s.outstanding).toBe(70);
  });

  it("treats an invoice cancelled on its issue day as settled: not owed, never overdue", () => {
    const cancelled = inv({ id: "a", amount: 300, currency: "", status: "Cancelled", dueDate: "2020-01-01" });
    const s = summarizeInvoices(typedOnly([cancelled, inv({ id: "b", amount: 70, currency: "" })]), { currency: "USD", rates }, TODAY);
    expect(s.outstanding).toBe(70);
    expect(s.overdueCount).toBe(0);
    expect(isSettled(cancelled)).toBe(true);
    expect(isOverdue(cancelled, TODAY)).toBe(false);
    expect(daysOverdue(cancelled, TODAY)).toBe(0);
    expect(effectiveStatus(cancelled, TODAY)).toBe("Cancelled");
  });

  it("puts a row marked overdue by hand, not yet past its due day, in the youngest past-due bucket", () => {
    const s = summarizeInvoices(typedOnly([inv({ amount: 10, status: "Overdue", dueDate: "2026-12-01" })]), { currency: "EUR", rates }, TODAY);
    expect(s.overdueCount).toBe(1);
    expect(s.oldestOverdueDays).toBe(0);
    expect(s.aging.find((b) => b.key === "1-30")).toMatchObject({ amount: 10, count: 1 });
  });
});

describe("the overdue rule of a typed row: the business day, from the day after the due day", () => {
  it("is not overdue on its due day, and one day overdue the day after", () => {
    const row = inv({ dueDate: "2026-10-13" });
    expect(isOverdue(row, "2026-10-13")).toBe(false);
    expect(daysOverdue(row, "2026-10-13")).toBe(0);
    expect(isOverdue(row, "2026-10-14")).toBe(true);
    expect(daysOverdue(row, "2026-10-14")).toBe(1);
    expect(effectiveStatus(row, "2026-10-14")).toBe("Overdue");
  });

  it("counts whole calendar days across a change of summer time", () => {
    expect(daysOverdue(inv({ dueDate: "2026-10-24" }), "2026-10-26")).toBe(2);
    expect(daysOverdue(inv({ dueDate: "2026-03-28" }), "2026-03-30")).toBe(2);
  });

  it("is never overdue by days without a readable due day", () => {
    expect(daysOverdue(inv({ dueDate: "" }), TODAY)).toBe(0);
    expect(isOverdue(inv({ dueDate: "" }), TODAY)).toBe(false);
    expect(isOverdue(inv({ dueDate: "", status: "Overdue" }), TODAY)).toBe(true);
  });
});

describe("the words of the customer's invoices", () => {
  it("shows a typed row's stored Open as Unpaid, in Accounts Receivable's tone", () => {
    expect(typedStatusMark("Open")).toEqual({ label: "Unpaid", tone: "indigo" });
    expect(typedStatusMark(effectiveStatus(inv({ dueDate: "2026-10-13" }), "2026-10-14"))).toEqual({ label: "Overdue", tone: "red" });
    expect(typedStatusMark("Paid")).toEqual({ label: "Paid", tone: "green" });
    expect(typedStatusMark("Credited")).toEqual({ label: "Credited", tone: "slate" });
    expect(typedStatusMark("Cancelled")).toEqual({ label: "Cancelled", tone: "slate" });
    for (const s of ["Open", "Overdue", "Paid", "Credited", "Cancelled"] as const) expect(typedStatusMark(s).label).not.toBe("Open");
  });

  it("says a negative left to pay as the amount to refund", () => {
    expect(leftToPayText(1450, "EUR")).toBe("1,450 EUR");
    expect(leftToPayText(-476.5, "CZK")).toBe("476.50 CZK to refund");
  });
});

describe("summarizeInvoices: invoices issued in Invoicing (Accounts Receivable)", () => {
  it("counts what is left to pay, not the invoice's gross", () => {
    const s = summarizeInvoices(
      { issued: [ar({ gross: 1000, paid: 400, leftToPay: 600, status: "part_paid", agingBucket: "current" })], typed: [] },
      { currency: "EUR", rates },
      TODAY,
    );
    expect(s.outstanding).toBe(600);
    expect(s.openAmount).toBe(600);
    expect(s.openCount).toBe(1);
    expect(s.aging.find((b) => b.key === "current")).toMatchObject({ amount: 600, count: 1 });
  });

  it("takes overdue, its days and its aging bucket from the server", () => {
    const s = summarizeInvoices(
      {
        issued: [ar({ leftToPay: 100, status: "unpaid", marks: ["overdue"], daysOverdue: 45, agingBucket: "31-60", dueDate: "2026-12-01" })],
        typed: [],
      },
      { currency: "EUR", rates },
      TODAY,
    );
    expect(s.overdueAmount).toBe(100);
    expect(s.overdueCount).toBe(1);
    expect(s.oldestOverdueDays).toBe(45);
    expect(s.aging.find((b) => b.key === "31-60")).toMatchObject({ amount: 100, count: 1 });
  });

  it("leaves out paid, credited, cancelled and to-refund invoices", () => {
    const s = summarizeInvoices(
      {
        issued: [
          ar({ id: "1", status: "paid", leftToPay: 0 }),
          ar({ id: "2", status: "credited", leftToPay: 0 }),
          ar({ id: "3", status: "cancelled", leftToPay: 0 }),
          ar({ id: "4", status: "paid", leftToPay: -50, marks: ["to_refund"] }),
        ],
        typed: [],
      },
      { currency: "EUR", rates },
      TODAY,
    );
    expect(s.outstanding).toBe(0);
    expect(s.byCurrency).toEqual([]);
  });

  it("adds issued invoices and typed rows up per currency, converted for the limit", () => {
    const s = summarizeInvoices(
      {
        issued: [ar({ leftToPay: 100, currency: "EUR" }), ar({ id: "r2", leftToPay: 2500, currency: "CZK", marks: ["overdue"], daysOverdue: 3, agingBucket: "1-30" })],
        typed: [inv({ amount: 50, currency: "EUR" })],
      },
      { currency: "EUR", rates },
      TODAY,
    );
    expect(s.outstanding).toBe(250);
    expect(s.overdueAmount).toBe(100);
    expect(s.byCurrency).toEqual([
      { currency: "EUR", amount: 150, count: 2 },
      { currency: "CZK", amount: 2500, count: 1 },
    ]);
  });

  it("isOwedIssued follows the server: something left to pay, unpaid or part paid", () => {
    expect(isOwedIssued({ status: "unpaid", leftToPay: 1 })).toBe(true);
    expect(isOwedIssued({ status: "part_paid", leftToPay: 0.01 })).toBe(true);
    expect(isOwedIssued({ status: "paid", leftToPay: 0 })).toBe(false);
    expect(isOwedIssued({ status: "credited", leftToPay: 10 })).toBe(false);
    expect(isOwedIssued({ status: "unpaid", leftToPay: 0 })).toBe(false);
  });
});

describe("handTyped", () => {
  it("keeps the rows typed by hand and leaves out the ones Invoicing posted", () => {
    const typed = inv({ id: "t", invoiceNumber: "OLD-1" });
    const posted = inv({ id: "p", invoiceNumber: "INV-9", source: "invoicing" });
    expect(handTyped([typed, posted], [])).toEqual([typed]);
  });

  it("leaves out an older copy of an issued invoice or of its credit note, by number", () => {
    const rows = [inv({ id: "a", invoiceNumber: " inv-1 " }), inv({ id: "b", invoiceNumber: "CN-1" }), inv({ id: "c", invoiceNumber: "OLD-7" })];
    expect(handTyped(rows, [ar({ number: "INV-1", creditNoteNumbers: ["CN-1"] })]).map((r) => r.id)).toEqual(["c"]);
  });
});

describe("unconvertedReason", () => {
  const unconverted = [{ currency: "EUR", amount: 100, count: 1 }, { currency: "GBP", amount: 5, count: 1 }];

  it("names the currencies ČNB has no rate for", () => {
    expect(unconvertedReason(unconverted, false)).toBe("ČNB publishes no rate for EUR, GBP");
  });

  it("says the rates could not be loaded when only CZK is known for that", () => {
    expect(unconvertedReason(unconverted, true)).toBe("Today's exchange rates could not be loaded");
  });
});

describe("fx", () => {
  it("converts through CZK and refuses unknown currencies", () => {
    expect(convert(1000, "EUR", "CZK", rates)).toBe(25000);
    expect(convert(2200, "CZK", "USD", rates)).toBe(100);
    expect(convert(10, "EUR", "USD", rates)).toBeCloseTo(11.3636, 4);
    expect(convert(1, "GBP", "CZK", rates)).toBeNull();
  });
});
