import { describe, expect, it } from "vitest";
import { CHECK_KEY, knownFilters, matchesTableFilters, normalizeColumns } from "@/lib/tableModel";
import { CUSTOMER_TABLE, customerCellText, customerRowsOf, RECEIVABLE_DEFAULT_COLUMNS, receivableCellText, receivableTable } from "./receivableColumns";
import { limitStates, limitUsedPct, type ReceivableCustomer, type ReceivableRow } from "./receivables";
import { formatAmount } from "@/lib/money";

const row = (over: Partial<ReceivableRow> = {}): ReceivableRow => ({
  id: "inv-1",
  number: "INV2026CZFCL00000023-001",
  customerId: "c-alfa",
  customer: "Alfa Trading s.r.o.",
  shipmentId: "s-23",
  jobNumber: "CZFCL00000023",
  issueDate: "2026-10-20",
  duzp: "2026-10-19",
  dueDate: "2026-11-03",
  currency: "CZK",
  net: 40000,
  vat: 8400,
  gross: 48400,
  grossCzk: 48400,
  credited: 0,
  paid: 0,
  writtenOff: 0,
  bankCharges: 0,
  leftToPay: 48400,
  status: "unpaid",
  marks: ["overdue", "reminded"],
  daysOverdue: 15,
  agingBucket: "1-30",
  paymentTerms: "14 days",
  promisedOn: null,
  disputed: false,
  reminderLevel: 1,
  lastRemindedOn: "2026-11-12",
  lastPaidOn: null,
  creditNoteNumbers: [],
  creditNotes: [],
  personInCharge: "jana@example.com",
  holidayCover: "tom@example.com",
  salesOwner: "petr@example.com",
  mine: false,
  myCustomer: false,
  issuedBy: "libor@example.com",
  version: 1,
  ...over,
});

const TABLE = receivableTable("2026-11-18");
const check = (value: string) => ({ key: CHECK_KEY, value });

describe("the invoices' Filter panel", () => {
  it("matches a column's text as the row shows it, and the status and the age exactly", () => {
    const r = row();
    expect(matchesTableFilters(TABLE, r, [{ key: "customer", value: "alfa" }])).toBe(true);
    expect(matchesTableFilters(TABLE, r, [{ key: "due", value: "15 days overdue" }])).toBe(true);
    expect(matchesTableFilters(TABLE, r, [{ key: "status", value: "Unpaid" }])).toBe(true);
    expect(matchesTableFilters(TABLE, r, [{ key: "status", value: "Unpa" }])).toBe(false);
    expect(matchesTableFilters(TABLE, r, [{ key: "aging", value: "1–30 days" }])).toBe(true);
    expect(matchesTableFilters(TABLE, r, [{ key: "pic", value: "tom@" }])).toBe(true);
    expect(receivableCellText(r, "reminder")).toBe("Reminder 1 12.11.2026");
    expect(receivableCellText(row({ paid: 20000, lastPaidOn: "2026-11-14" }), "paid")).toBe("20,000.00 CZK · 14.11.2026");
  });

  it("finds an invoice by a credit note's number in the number column", () => {
    expect(matchesTableFilters(TABLE, row({ creditNoteNumbers: ["CN2026CZFCL00000023-001"] }), [{ key: "number", value: "CN2026" }])).toBe(true);
    expect(matchesTableFilters(TABLE, row(), [{ key: "number", value: "CN2026" }])).toBe(false);
  });

  it("keeps the rows every check holds for, by the day it was made for", () => {
    const dueSoon = row({ dueDate: "2026-11-20", daysOverdue: 0, marks: [], agingBucket: "current" });
    expect(matchesTableFilters(TABLE, dueSoon, [check("Due this week")])).toBe(true);
    expect(matchesTableFilters(TABLE, row(), [check("Due this week")])).toBe(false);
    expect(matchesTableFilters(receivableTable("2026-11-21"), dueSoon, [check("Due this week")])).toBe(false);
    expect(matchesTableFilters(TABLE, row({ daysOverdue: 75 }), [check("over 60 days overdue")])).toBe(true);
    expect(matchesTableFilters(TABLE, row({ daysOverdue: 75 }), [check("Over 60 days overdue"), check("Prepayment")])).toBe(false);
  });

  it("ignores a saved check since renamed, and drops it from a saved set", () => {
    expect(matchesTableFilters(TABLE, row(), [check("Something old")])).toBe(true);
    expect(knownFilters(TABLE, [check("Something old"), check("To refund"), { key: "gone", value: "x" }, { key: "job", value: "CZ" }])).toEqual([check("To refund"), { key: "job", value: "CZ" }]);
  });
});

describe("the invoices' Columns", () => {
  it("shows the mock's columns at first, the optional ones off", () => {
    expect(TABLE.view.defaults).toEqual(RECEIVABLE_DEFAULT_COLUMNS);
    expect(TABLE.view.defaults).not.toContain("duzp");
    expect(TABLE.view.defaults).not.toContain("czk");
    expect(TABLE.columns.map((c) => c.key)).toEqual(expect.arrayContaining(["duzp", "czk", "credited", "salesOwner", "pic", "issuedBy", "terms", "reminder"]));
    // One stable defaults array, whatever the day: the saved columns are read once.
    expect(receivableTable("2026-11-19").view).toBe(TABLE.view);
  });

  it("puts Status right after the number and Issued after Paid (A5), and keeps a set saved in the old order whole", () => {
    expect(RECEIVABLE_DEFAULT_COLUMNS).toEqual(["number", "status", "customer", "job", "due", "gross", "left", "currency", "paid", "issued"]);
    expect(TABLE.columns.slice(0, 10).map((c) => c.key)).toEqual(RECEIVABLE_DEFAULT_COLUMNS);
    // A set saved before the move (the old defaults, in their old order): nothing lost, nothing added - only the order is the table's.
    const saved = ["number", "customer", "job", "issued", "due", "gross", "left", "currency", "status", "paid"];
    expect(normalizeColumns(TABLE, saved)).toEqual(RECEIVABLE_DEFAULT_COLUMNS);
    expect(normalizeColumns(TABLE, ["number", "customer", "status", "czk"])).toEqual(["number", "status", "customer", "czk"]);
  });

  it("keeps the shown columns in table order, the number always among them", () => {
    expect(normalizeColumns(TABLE, ["czk", "customer", "nope"])).toEqual(["number", "customer", "czk"]);
    expect(normalizeColumns(TABLE, null)).toEqual(["number"]);
  });
});

describe("By customer's Filter panel", () => {
  const zeta: ReceivableCustomer = {
    customerId: "c-zeta",
    customer: "Zeta Logistik s.r.o.",
    salesOwner: "eva@example.com",
    currency: "CZK",
    unpaid: 184200,
    current: 0,
    d1to30: 60500,
    d31to60: 91200,
    d61to90: 32500,
    d90plus: 0,
    oldestDue: "2026-09-08",
    invoices: 4,
    creditLimit: 150000,
    creditCurrency: "CZK",
  };

  it("checks Over limit and debt over 60 days", () => {
    const [over] = customerRowsOf([zeta], limitStates([zeta], { CZK: 1 }));
    const [under] = customerRowsOf([{ ...zeta, creditLimit: 500000 }], limitStates([{ ...zeta, creditLimit: 500000 }], { CZK: 1 }));
    expect(matchesTableFilters(CUSTOMER_TABLE, over!, [check("Over limit")])).toBe(true);
    expect(matchesTableFilters(CUSTOMER_TABLE, under!, [check("Over limit")])).toBe(false);
    expect(matchesTableFilters(CUSTOMER_TABLE, under!, [check("Owes over 60 days")])).toBe(true);
    expect(matchesTableFilters(CUSTOMER_TABLE, { ...under!, d61to90: 0 }, [check("Owes over 60 days")])).toBe(false);
    expect(customerCellText(over!, "customer")).toBe("Zeta Logistik s.r.o. Over limit");
    expect(over!.key).toBe("c-zeta|CZK");
  });

  it("shows the credit limit and the share of it used, for who is close (A15)", () => {
    const [over] = customerRowsOf([zeta], limitStates([zeta], { CZK: 1 }));
    const [under] = customerRowsOf([{ ...zeta, creditLimit: 200000 }], limitStates([{ ...zeta, creditLimit: 200000 }], { CZK: 1 }));
    expect(customerCellText(over!, "creditLimit")).toBe(`${formatAmount(150000, "CZK")} · 123 % used`);
    expect(customerCellText(under!, "creditLimit")).toBe(`${formatAmount(200000, "CZK")} · 92 % used`);
    expect(limitUsedPct(under!.limit!)).toBe(92);
    // no limit: nothing to show
    const [none] = customerRowsOf([{ ...zeta, creditLimit: 0 }], limitStates([{ ...zeta, creditLimit: 0 }], { CZK: 1 }));
    expect(customerCellText(none!, "creditLimit")).toBe("");
    // what has no rate today is named, not counted
    const eur = { ...zeta, currency: "EUR", unpaid: 1000 };
    const [part] = customerRowsOf([zeta, eur], limitStates([{ ...zeta, creditLimit: 200000 }, { ...eur, creditLimit: 200000 }], { CZK: 1 }));
    expect(customerCellText(part!, "creditLimit")).toBe(`${formatAmount(200000, "CZK")} · 92 % used (without ${formatAmount(1000, "EUR")})`);
  });
});
