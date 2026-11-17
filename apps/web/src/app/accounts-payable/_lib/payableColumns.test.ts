import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import {
  CHECK_KEY,
  EXPECTED_TABLE,
  INVOICE_TABLE,
  expectedCellText,
  invoiceCellText,
  knownFilters,
  matchesTableFilters,
  normalizeColumns,
  shownColumns,
} from "./payableColumns";
import { apRow, haulierRow, type PayableExpected, type PayableHaulier, type PayableInvoice } from "./payables";

const invoice = (over: Partial<PayableInvoice> = {}): PayableInvoice => ({
  id: "inv-1",
  supplierCustomerId: "sup-1",
  haulierId: null,
  supplier: "MSC Czech s.r.o.",
  vendor: "MSC Czech",
  invoiceNumber: "FV-2026-0417",
  kind: "invoice",
  issueDate: "2026-11-03",
  due: "2026-11-17",
  dueSource: "invoice",
  daysOverdue: 0,
  bookedOn: "2026-11-03",
  paidNotBefore: "2026-11-03",
  amounts: [{ currency: "EUR", amount: 12500 }],
  totalNet: null,
  vatAmount: null,
  totalGross: null,
  currency: "EUR",
  status: "booked",
  paidOn: null,
  paidBy: "",
  decidedBy: "",
  decidedAt: null,
  decisionReason: "",
  selfDecision: false,
  source: "reading",
  enteredBy: "",
  document: null,
  lines: [],
  jobs: ["CZFCL00000023"],
  marks: [],
  claims: [],
  claimed: false,
  mine: false,
  aboveEstimate: false,
  jobBilled: false,
  arrivedAfterBilling: false,
  version: 1,
  ...over,
});

const haulier = (over: Partial<PayableHaulier> = {}): PayableHaulier => ({
  id: "h-1",
  haulierCustomerId: "hc-1",
  haulierName: "Haulier XY s.r.o.",
  invoiceNumber: "2611004",
  issueDate: "2026-11-05",
  dueDate: "2026-12-05",
  currency: "CZK",
  net: 25620,
  vat: 5380,
  gross: 31000,
  status: "APPROVED",
  paidOn: null,
  claimed: 0,
  refs: ["TCZ2026000022"],
  daysOverdue: 0,
  ...over,
});

const expected = (over: Partial<PayableExpected> = {}): PayableExpected => ({
  lineId: "l-1",
  shipmentId: "s-1",
  jobNumber: "CZFCL00000047",
  customer: "Škoda Auto",
  category: "ocean_freight",
  description: "40HC Hamburg",
  vendor: "Hapag-Lloyd",
  supplierCustomerId: null,
  estimate: 1800,
  currency: "USD",
  jobStatus: "In transit",
  createdOn: "2026-11-01",
  mine: true,
  jobBilled: false,
  ...over,
});

const differing: interfaces.PayableLineItem = {
  lineId: "ln-1",
  kind: "job",
  shipmentId: "s-23",
  masterJobId: null,
  jobNumber: "CZFCL00000023",
  customer: "",
  category: "ocean_freight",
  description: "",
  estimate: 4000,
  estCurrency: "EUR",
  amount: 4200,
  currency: "EUR",
  difference: 200,
  jobInvoicingStatus: "",
};

const check = (value: string) => ({ key: CHECK_KEY, value });

describe("the Filter panel", () => {
  it("keeps the rows every check holds for", () => {
    const after = apRow(invoice({ arrivedAfterBilling: true, jobBilled: true }));
    const plain = apRow(invoice());
    expect(matchesTableFilters(INVOICE_TABLE, after, [check("Arrived after billing")])).toBe(true);
    expect(matchesTableFilters(INVOICE_TABLE, plain, [check("Arrived after billing")])).toBe(false);
    expect(matchesTableFilters(INVOICE_TABLE, plain, [check("arrived on a job not yet billed")])).toBe(true);
    expect(matchesTableFilters(INVOICE_TABLE, plain, [check("Arrived on a job not yet billed"), check("Differs from estimate")])).toBe(false);
    expect(matchesTableFilters(INVOICE_TABLE, apRow(invoice({ lines: [differing] })), [check("Differs from estimate")])).toBe(true);
    expect(matchesTableFilters(INVOICE_TABLE, haulierRow(haulier()), [check("Differs from estimate")])).toBe(false);
  });

  it("matches a column's text as the row shows it, and the status exactly", () => {
    const row = apRow(invoice({ status: "approved" }));
    expect(matchesTableFilters(INVOICE_TABLE, row, [{ key: "supplier", value: "msc" }])).toBe(true);
    expect(matchesTableFilters(INVOICE_TABLE, row, [{ key: "due", value: "17.11" }])).toBe(true);
    expect(matchesTableFilters(INVOICE_TABLE, row, [{ key: "status", value: "Approved" }])).toBe(true);
    expect(matchesTableFilters(INVOICE_TABLE, row, [{ key: "status", value: "Appro" }])).toBe(false);
    expect(matchesTableFilters(INVOICE_TABLE, haulierRow(haulier()), [{ key: "jobs", value: "TCZ2026" }])).toBe(true);
    expect(invoiceCellText(haulierRow(haulier({ daysOverdue: 1 })), "marks")).toBe("1 day overdue");
  });

  it("ignores a saved check since renamed, and drops it from a saved set", () => {
    expect(matchesTableFilters(INVOICE_TABLE, apRow(invoice()), [check("Something old")])).toBe(true);
    expect(knownFilters(INVOICE_TABLE, [check("Something old"), check("Arrived after billing"), { key: "gone", value: "x" }, { key: "jobs", value: "CZ" }])).toEqual([
      check("Arrived after billing"),
      { key: "jobs", value: "CZ" },
    ]);
  });

  it("keeps on the Expected tab the costs whose job is billed", () => {
    expect(matchesTableFilters(EXPECTED_TABLE, expected({ jobBilled: true }), [check("Job billed, cost still expected")])).toBe(true);
    expect(matchesTableFilters(EXPECTED_TABLE, expected(), [check("Job billed, cost still expected")])).toBe(false);
    expect(matchesTableFilters(EXPECTED_TABLE, expected(), [{ key: "customer", value: "skoda" }])).toBe(true);
    expect(expectedCellText(expected(), "estimate")).toContain("USD");
  });

  it("offers the checks first, then the columns", () => {
    expect(INVOICE_TABLE.filterColumns[0]).toMatchObject({ key: CHECK_KEY, options: ["Differs from estimate", "Arrived on a job not yet billed", "Arrived after billing"] });
    expect(EXPECTED_TABLE.filterColumns[0]).toMatchObject({ key: CHECK_KEY, options: ["Job billed, cost still expected"] });
  });
});

describe("Columns", () => {
  it("shows the known columns in table order, the first always among them", () => {
    expect(normalizeColumns(INVOICE_TABLE, ["marks", "amount", "nope", "amount"])).toEqual(["supplier", "amount", "marks"]);
    expect(normalizeColumns(INVOICE_TABLE, null)).toEqual(["supplier"]);
    expect(INVOICE_TABLE.view.defaults).toEqual(INVOICE_TABLE.columns.map((c) => c.key));
    expect(shownColumns([{ key: "supplier" }, { key: "jobs" }, { key: "due" }], ["due", "supplier"])).toEqual([{ key: "supplier" }, { key: "due" }]);
  });
});
