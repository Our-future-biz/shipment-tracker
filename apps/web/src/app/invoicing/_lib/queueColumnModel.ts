import type { ColumnsType } from "antd/es/table";
import type { HTMLAttributes } from "react";
import type { interfaces } from "@/lib/api/client";
import { matchesGridFilters, type GridFilterColumn } from "@/components/gridFilters";
import { DROPDOWN_OPTIONS } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";
import { moneyCz } from "@/lib/money";
import { statusLabel } from "@/lib/shipmentStatus";

// The Invoicing queue's columns as data: which ones exist, which are shown in what order, and the
// text each cell shows, which the "Filter by column" rows match against. No JSX here (queueColumns.tsx draws them).

export type QueueRow = interfaces.BillingQueueItem;

/** Which date a job is billed by: ETD for exports, ETA otherwise. */
export const serviceDateKey = (r: QueueRow) =>
  (r.tradeDirection ?? "").toLowerCase() === "export" ? ("estimatedDeparture" as const) : ("estimatedArrival" as const);

/** The date a job is billed by: ETD for exports, ETA otherwise. */
export const serviceDateOf = (r: QueueRow) => r[serviceDateKey(r)] ?? "";

export const invoicingStatusOf = (r: QueueRow) => r.invoicingStatus || "Not Invoiced";

/** The Customer filter's value for rows without a customer. */
export const NO_CUSTOMER = "__none__";

/** Always shown and always first. */
export const FIRST_QUEUE_COLUMN = "jobNumber";
/** The open-shipment icon: always last, not offered in the picker. */
export const ACTIONS_COLUMN_KEY = "__open";

/** The columns the picker and the filters offer, in table order. */
export const QUEUE_COLUMN_META: (GridFilterColumn & { title: string })[] = [
  { key: "jobNumber", title: "Internal Reference" },
  { key: "customer", title: "Customer" },
  { key: "tradeDirection", title: "Trade Direction", options: DROPDOWN_OPTIONS["Trade Direction"] },
  { key: "serviceDate", title: "ETD / ETA" },
  { key: "invoices", title: "Invoices" },
  { key: "invoicingStatus", title: "Invoicing Status", options: DROPDOWN_OPTIONS["Invoicing Status"] },
];

// A module constant: useColumnPrefs needs a stable array.
export const QUEUE_DEFAULT_COLUMNS: string[] = QUEUE_COLUMN_META.map((c) => c.key);

export const isQueueColumn = (key: string) => QUEUE_COLUMN_META.some((c) => c.key === key);

// Columns with a fixed set of values: a filter must equal the value, so "Invoiced" keeps no "Not Invoiced".
const EXACT_KEYS = new Set(["tradeDirection", "status", "invoicingStatus"]);
export const isExactQueueFilter = (key: string) => EXACT_KEYS.has(key);

/** Known keys once each, in the order given, Internal Reference first; anything else gives just that column. */
export function normalizeQueueColumns(keys: unknown): string[] {
  const list = Array.isArray(keys) ? keys : [];
  const known = list.filter((k): k is string => typeof k === "string" && isQueueColumn(k));
  const rest = Array.from(new Set(known)).filter((k) => k !== FIRST_QUEUE_COLUMN);
  return [FIRST_QUEUE_COLUMN, ...rest];
}

/** A cell's text as the queue shows it. */
export function queueCellText(r: QueueRow, key: string, flagMissingLines: boolean): string {
  switch (key) {
    case "jobNumber":
      return r.jobNumber;
    case "customer":
      return r.customer ?? "";
    case "tradeDirection":
      return r.tradeDirection ?? "";
    case "serviceDate":
      return formatDate(serviceDateOf(r));
    case "status":
      return statusLabel(r.shipmentStatus);
    case "selling":
      if (r.billingState === "none") return flagMissingLines ? "No selling lines" : "";
      if (r.rowsToBill === 0) return "";
      // cs-CZ groups digits with a non-breaking space; a typed "12 500" has a plain one
      return `${moneyCz(r.amountToBill)} ${r.billingCurrency}`.replace(/[  ]/g, " ");
    case "invoices":
      if (r.invoiceNumbers.length > 0) return r.invoiceNumbers.join(", ");
      if (r.rowsToBill > 0) return `${r.rowsToBill} line${r.rowsToBill !== 1 ? "s" : ""}`;
      return "";
    case "invoicingStatus":
      return invoicingStatusOf(r);
    default:
      return "";
  }
}

interface QueueFilters {
  status: string;
  customer: string;
  columnFilters: readonly { key: string; value: string }[];
  flagMissingLines: boolean;
}

/** The rows the toolbar selects and the column filters keep, all together, in the queue's default order. */
export function filterQueueRows(rows: QueueRow[], o: QueueFilters): QueueRow[] {
  const kept = rows.filter(
    (r) =>
      (!o.status || statusLabel(r.shipmentStatus) === o.status) &&
      (!o.customer || (o.customer === NO_CUSTOMER ? !r.customer : r.customer === o.customer)) &&
      matchesGridFilters(r, o.columnFilters, (row, k) => queueCellText(row, k, o.flagMissingLines), isExactQueueFilter),
  );
  // Default order: the billing date (the ETD / ETA column), oldest first, missing dates last.
  // Sorted here because the column's default arrow makes antd sort only the page shown;
  // DataTable sorts all the rows once a header is clicked.
  return [...kept].sort((a, b) => (serviceDateOf(a) || "9999").localeCompare(serviceDateOf(b) || "9999"));
}

/**
 * The columns shown, in `visible` order, with the actions column last. While reordering, every header but
 * Internal Reference carries its key as id, so DraggableHeaderCell can drag it.
 */
export function arrangeQueueColumns(
  columns: ColumnsType<QueueRow>,
  visible: readonly string[],
  reordering: boolean,
): ColumnsType<QueueRow> {
  const byKey = new Map(columns.map((c) => [String(c.key), c] as const));
  const shown: ColumnsType<QueueRow> = [];
  for (const key of visible) {
    const col = byKey.get(key);
    if (!col || key === ACTIONS_COLUMN_KEY) continue;
    shown.push(
      reordering && key !== FIRST_QUEUE_COLUMN
        ? { ...col, onHeaderCell: (c) => ({ ...col.onHeaderCell?.(c), id: key }) as HTMLAttributes<HTMLTableCellElement> }
        : col,
    );
  }
  const actions = byKey.get(ACTIONS_COLUMN_KEY);
  return actions ? [...shown, actions] : shown;
}
