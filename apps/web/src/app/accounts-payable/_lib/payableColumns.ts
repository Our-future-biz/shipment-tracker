import { matchesGridFilters, storedGridFilters, type GridFilterColumn } from "@/components/gridFilters";
import type { ColumnViewScope } from "@/hooks/useColumnPrefs";
import { INVOICE_STATUS_CHIP } from "@/app/trucking/_lib/haulierInvoices";
import { chargeLabel } from "@/lib/chargeCodes";
import { formatDate } from "@/lib/date";
import { fold } from "@/lib/fold";
import { formatAmount } from "@/lib/money";
import {
  amountsText,
  EXPECTED_CHECKS,
  expectedCheck,
  haulierChip,
  INVOICE_CHECKS,
  invoiceCheck,
  rowMarks,
  statusChip,
  supplierNameOf,
  type CheckDef,
  type PayableExpected,
  type PayableRow,
} from "./payables";

// Finance → Accounts Payable's Filter and Columns, the bar Finance → Invoicing has (Council Outlay 9, the page: "the
// same bar: … Filter and Columns, saved filters and columns"). The app's shared pieces do the work - the "Filter by
// column" rows and their templates (user preferences), the column picker, its templates (auth service) and the columns
// kept per user in this browser - each under its own scope, so nothing is shared with Invoicing's queue. The
// operator's checks (differs from estimate, arrived after billing…) are a filter column of their own, so a saved
// filter set keeps them too. Pure, so it is unit-tested.

/** The filter column of the operator's checks: one row per check, every one of them must hold. */
export const CHECK_KEY = "check";

type Column = GridFilterColumn & { title: string };

export interface TableModel<R, K extends string> {
  /** The scope of the columns, the column templates and the filter templates */
  scope: string;
  /** Every column the table can show, in table order; the picker offers them and the filters match their text */
  columns: Column[];
  /** Always shown, never unticked */
  first: string;
  /** For useColumnPrefs: one stable object, every column shown at first */
  view: ColumnViewScope;
  checks: CheckDef<K>[];
  /** What the Filter panel offers: the checks first, then the columns */
  filterColumns: GridFilterColumn[];
  cellText: (row: R, key: string) => string;
  passesCheck: (row: R, check: K) => boolean;
}

function model<R, K extends string>(m: Omit<TableModel<R, K>, "view" | "filterColumns"> & { checksTitle: string }): TableModel<R, K> {
  const { checksTitle, ...rest } = m;
  return {
    ...rest,
    view: { scope: m.scope, defaults: m.columns.map((c) => c.key) },
    filterColumns: [{ key: CHECK_KEY, title: checksTitle, options: m.checks.map((c) => c.label) }, ...m.columns],
  };
}

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

export const INVOICE_TABLE = model<PayableRow, (typeof INVOICE_CHECKS)[number]["key"]>({
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

export const EXPECTED_TABLE = model<PayableExpected, (typeof EXPECTED_CHECKS)[number]["key"]>({
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

/** The check a filter row names (by its words, as saved), or none: a check since renamed narrows nothing. */
export const checkOf = <K extends string>(m: Pick<TableModel<never, K>, "checks">, value: string): CheckDef<K> | undefined =>
  m.checks.find((c) => fold(c.label) === fold(value.trim()));

/** The filters the table knows: on one of its columns, or a check it has. A saved set's other rows are dropped. */
export function knownFilters<K extends string>(m: Pick<TableModel<never, K>, "checks" | "columns">, filters: readonly { key: string; value: string }[]): { key: string; value: string }[] {
  return filters.filter((f) => (f.key === CHECK_KEY ? !!checkOf(m, f.value) : m.columns.some((c) => c.key === f.key)));
}

/** Whether a row passes the Filter panel: every check named, and every column row (contains; Status equals). */
export function matchesTableFilters<R, K extends string>(m: TableModel<R, K>, row: R, filters: readonly { key: string; value: string }[]): boolean {
  const active = storedGridFilters(filters);
  for (const f of active) {
    if (f.key !== CHECK_KEY) continue;
    const check = checkOf(m, f.value);
    if (check && !m.passesCheck(row, check.key)) return false;
  }
  const columns = active.filter((f) => f.key !== CHECK_KEY && m.columns.some((c) => c.key === f.key));
  return matchesGridFilters(row, columns, m.cellText, (key) => !!m.columns.find((c) => c.key === key)?.options);
}

/** The columns shown, in table order, the first always among them; anything unknown is dropped. */
export function normalizeColumns(m: Pick<TableModel<never, string>, "columns" | "first">, keys: unknown): string[] {
  const list = new Set(Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : []);
  return m.columns.map((c) => c.key).filter((k) => k === m.first || list.has(k));
}

/** The table's columns (antd's, each with its key) that are shown, in table order. */
export const shownColumns = <C extends { key?: unknown }>(columns: readonly C[], visible: readonly string[]): C[] => columns.filter((c) => visible.includes(String(c.key)));
