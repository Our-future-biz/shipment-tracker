import { INVOICE_STATUS_CHIP } from "@/app/trucking/_lib/haulierInvoices";
import { amountsText } from "@/lib/amounts";
import { chargeLabel } from "@/lib/chargeCodes";
import { formatDate } from "@/lib/date";
import { formatAmount } from "@/lib/money";
import { tableModel } from "@/lib/tableModel";
import {
  EXPECTED_CHECKS,
  expectedCheck,
  haulierChip,
  INVOICE_CHECKS,
  invoiceCheck,
  rowMarks,
  statusChip,
  supplierNameOf,
  type PayableExpected,
  type PayableRow,
} from "./payables";

// Finance → Accounts Payable's Filter and Columns, the bar Finance → Invoicing has (Council Outlay 9, the page: "the
// same bar: … Filter and Columns, saved filters and columns"). The app's shared pieces do the work - the "Filter by
// column" rows and their templates (user preferences), the column picker, its templates (auth service) and the columns
// kept per user in this browser - each under its own scope, so nothing is shared with Invoicing's queue. The
// operator's checks (differs from estimate, arrived after billing…) are a filter column of their own, so a saved
// filter set keeps them too. Pure, so it is unit-tested. The generic model and its rules are in @/lib/tableModel;
// only Accounts Payable's own columns and checks are here.

const day = (v: string | null | undefined) => (v ? formatDate(v) : "");

// The status as the row shows it: the four of Accounts Payable, then Trucking's for haulier invoices (D3, D17).
const STATUS_OPTIONS = [...new Set(["Booked", "Approved", "Refused", "Paid", ...Object.values(INVOICE_STATUS_CHIP).map((c) => c.label)])];

/** A cell's text in the invoices table, as the row shows it. */
export function invoiceCellText(r: PayableRow, key: string): string {
  if (r.source === "haulier") {
    const h = r.haulier;
    switch (key) {
      case "supplier":
        return h.haulierName;
      case "number":
        return h.invoiceNumber;
      case "jobs":
        return h.refs.join(" ");
      case "issue":
        return day(h.issueDate);
      case "due":
        return day(h.dueDate);
      case "amount":
        return formatAmount(h.gross, h.currency);
      case "status":
        return haulierChip(h).label;
      case "marks":
        return [h.daysOverdue > 0 ? `${h.daysOverdue} ${h.daysOverdue === 1 ? "day" : "days"} overdue` : "", h.claimed > 0 ? "Claimed" : ""].filter(Boolean).join(" · ");
      default:
        return "";
    }
  }
  const i = r.invoice;
  switch (key) {
    case "supplier":
      return supplierNameOf(r);
    case "number":
      return i.kind === "credit_note" ? `${i.invoiceNumber} Credit note` : i.invoiceNumber;
    case "jobs":
      return i.jobs.join(" ");
    case "booked":
      return day(i.bookedOn);
    case "issue":
      return day(i.issueDate);
    case "due":
      return day(i.due);
    case "amount":
      return amountsText(i.amounts);
    case "status":
      return statusChip(i).label;
    case "marks":
      return rowMarks(i)
        .map((m) => m.label)
        .join(" · ");
    default:
      return "";
  }
}

export const INVOICE_TABLE = tableModel<PayableRow, (typeof INVOICE_CHECKS)[number]["key"]>({
  scope: "accounts-payable",
  columns: [
    { key: "supplier", title: "Supplier" },
    { key: "number", title: "Invoice number" },
    { key: "jobs", title: "Jobs" },
    { key: "booked", title: "Booked on" },
    { key: "issue", title: "Issue date" },
    { key: "due", title: "Due" },
    { key: "amount", title: "Amount" },
    { key: "status", title: "Status", options: STATUS_OPTIONS },
    { key: "marks", title: "Marks" },
  ],
  first: "supplier",
  checks: INVOICE_CHECKS,
  checksTitle: "Show only",
  cellText: invoiceCellText,
  passesCheck: invoiceCheck,
});

/** A cell's text in the Expected table. */
export function expectedCellText(e: PayableExpected, key: string): string {
  switch (key) {
    case "job":
      return e.jobBilled ? `${e.jobNumber} Job billed` : e.jobNumber;
    case "customer":
      return e.customer;
    case "charge":
      return e.category ? chargeLabel(e.category) : "";
    case "description":
      return e.description;
    case "vendor":
      return e.vendor;
    case "estimate":
      return formatAmount(e.estimate, e.currency);
    case "status":
      return e.jobStatus;
    case "created":
      return day(e.createdOn);
    default:
      return "";
  }
}

export const EXPECTED_TABLE = tableModel<PayableExpected, (typeof EXPECTED_CHECKS)[number]["key"]>({
  scope: "accounts-payable-expected",
  columns: [
    { key: "job", title: "Job" },
    { key: "customer", title: "Customer" },
    { key: "charge", title: "Charge" },
    { key: "description", title: "Description" },
    { key: "vendor", title: "Vendor" },
    { key: "estimate", title: "Estimate" },
    { key: "status", title: "Job status" },
    { key: "created", title: "Created" },
  ],
  first: "job",
  checks: EXPECTED_CHECKS,
  checksTitle: "Show only",
  cellText: expectedCellText,
  passesCheck: expectedCheck,
});
