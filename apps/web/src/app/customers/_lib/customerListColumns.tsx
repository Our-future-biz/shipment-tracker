import type { ReactNode } from "react";
import type { CustomerItem } from "@/hooks/useCustomers";
import { businessDayOf, formatDate } from "@/lib/date";
import { CustomerAccountTypeBadge } from "../_components/CustomerAccountTypeBadge";
import { CustomerStatusDot } from "../_components/CustomerStatusDot";
import { SalesOwnerText } from "../_components/SalesOwnerText";
import { CUSTOMER_LABELS, CUSTOMER_STATUSES, PAYMENT_TERMS } from "./constants";
import { fmtMoney, marginPct } from "./customerMoney";
import { EMPTY_CELL } from "./customerTable";

// The columns of the Customer Database list, in their order. Each says how its cell looks (`render`) and
// what text the "Filter by column" filters match in it (`text`); `options` give a filter a list of values to
// pick from. Only this list uses them: nothing here is shared with the shipment grids.

/** The keys the list can be sorted by (?sort=, a leading "-" for descending). */
export const SORT_KEYS = ["name", "revenue", "margin", "activity"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export interface CustomerListColumn {
  key: string;
  title: string;
  width: number;
  align?: "right";
  /** Sortable by this key; the first click sorts this way. */
  sort?: { key: SortKey; firstClick: "ascend" | "descend" };
  render: (customer: CustomerItem) => ReactNode;
  text: (customer: CustomerItem) => string;
  options?: readonly string[];
}

const money = (value: number, currency: string) => (
  <span className="text-slate-600 tabular-nums">{fmtMoney(value, currency)}</span>
);
const plain = (value: string) => value || EMPTY_CELL;

/** Always shown, first: the customer's name, which opens its page. Rendered by the list itself. */
export const NAME_COLUMN_KEY = "companyName";

export const CUSTOMER_LIST_COLUMNS: CustomerListColumn[] = [
  {
    key: NAME_COLUMN_KEY,
    title: "Customer",
    width: 230,
    sort: { key: "name", firstClick: "ascend" },
    // The list draws this cell itself (logo and link); the column still needs a fallback.
    render: (c) => c.companyName || c.ico,
    text: (c) => c.companyName,
  },
  {
    key: "ico",
    title: "IČO / Reg. no.",
    width: 110,
    render: (c) => <span className="font-mono text-xs">{plain(c.ico)}</span>,
    text: (c) => c.ico,
  },
  {
    key: "dic",
    title: "DIČ / VAT ID",
    width: 120,
    render: (c) => <span className="font-mono text-xs">{plain(c.dic)}</span>,
    text: (c) => c.dic,
  },
  {
    key: "country",
    title: "Country",
    width: 78,
    render: (c) => plain(c.country),
    text: (c) => c.country,
  },
  { key: "city", title: "City", width: 120, render: (c) => plain(c.city), text: (c) => c.city },
  {
    key: "salesOwner",
    title: "Sales Owner",
    width: 130,
    // The owner user's e-mail; a typed name no user was matched to is marked, so it is picked again.
    render: (c) => (c.salesOwner.trim() ? <SalesOwnerText owner={c.salesOwner} linked={!!c.salesOwnerUserId} /> : EMPTY_CELL),
    text: (c) => c.salesOwner,
  },
  {
    key: "label",
    title: "Account Type",
    width: 146,
    render: (c) => <CustomerAccountTypeBadge label={c.label} />,
    text: (c) => c.label,
    options: CUSTOMER_LABELS,
  },
  {
    key: "status",
    title: "Status",
    width: 100,
    render: (c) => <CustomerStatusDot status={c.status} />,
    text: (c) => c.status,
    options: CUSTOMER_STATUSES,
  },
  {
    key: "paymentTerms",
    title: "Payment Terms",
    width: 120,
    render: (c) => plain(c.paymentTerms),
    text: (c) => c.paymentTerms,
    options: PAYMENT_TERMS,
  },
  {
    key: "currency",
    title: "Currency",
    width: 84,
    render: (c) => plain(c.currency),
    text: (c) => c.currency,
  },
  {
    key: "creditLimit",
    title: "Credit Limit",
    width: 116,
    align: "right",
    render: (c) => (c.creditLimit > 0 ? money(c.creditLimit, c.currency) : EMPTY_CELL),
    // Filters match the text as shown ("12 500,00 EUR"), so what the user reads is what they can type.
    text: (c) => (c.creditLimit > 0 ? fmtMoney(c.creditLimit, c.currency) : ""),
  },
  // Revenue / Profit here are the stored rollups (summed from the shipments' selling and buying figures as
  // entered, not converted). They are labelled as such and sorted per currency; the per-job figures worked
  // out from Costs at ČNB rates are on the customer's Shipments tab.
  {
    key: "totalRevenue",
    title: "Revenue (rollup)",
    width: 116,
    align: "right",
    sort: { key: "revenue", firstClick: "descend" },
    render: (c) => money(c.totalRevenue, c.currency),
    text: (c) => fmtMoney(c.totalRevenue, c.currency),
  },
  {
    key: "totalProfit",
    title: "Profit (rollup)",
    width: 116,
    align: "right",
    render: (c) => money(c.totalProfit, c.currency),
    text: (c) => fmtMoney(c.totalProfit, c.currency),
  },
  {
    key: "margin",
    title: "Margin",
    width: 90,
    align: "right",
    sort: { key: "margin", firstClick: "descend" },
    render: (c) => (
      <span className="text-slate-600 tabular-nums">
        {marginPct(c.totalRevenue, c.totalProfit)}%
      </span>
    ),
    text: (c) => String(marginPct(c.totalRevenue, c.totalProfit)),
  },
  {
    key: "totalShipments",
    title: "Shipments",
    width: 96,
    align: "right",
    render: (c) => c.totalShipments,
    text: (c) => String(c.totalShipments),
  },
  {
    key: "lastActivityDate",
    title: "Last activity",
    width: 118,
    sort: { key: "activity", firstClick: "descend" },
    render: (c) => formatDate(c.lastActivityDate) || EMPTY_CELL,
    text: (c) => formatDate(c.lastActivityDate),
  },
  {
    key: "createdAt",
    title: "Created",
    width: 110,
    // A timestamp: its day on the company's (Prague) calendar, not the viewer's.
    render: (c) => formatDate(businessDayOf(c.createdAt)) || EMPTY_CELL,
    text: (c) => formatDate(businessDayOf(c.createdAt)),
  },
  {
    key: "companyWebsite",
    title: "Website",
    width: 160,
    render: (c) => plain(c.companyWebsite),
    text: (c) => c.companyWebsite,
  },
];

export const CUSTOMER_COLUMN_MAP = new Map(CUSTOMER_LIST_COLUMNS.map((c) => [c.key, c]));

/** The columns a user sees until they choose their own (as Martin laid the list out on 2026-10-15). */
export const DEFAULT_CUSTOMER_COLUMNS = [
  NAME_COLUMN_KEY,
  "country",
  "status",
  "label",
  "salesOwner",
  "city",
  "totalShipments",
  "lastActivityDate",
  "paymentTerms",
  "totalProfit",
  "createdAt",
];

/** A stored column list as the list uses it: known keys only, each once, the name first. */
export function normalizeCustomerColumns(keys: readonly string[]): string[] {
  const known = keys.filter(
    (key, i) => CUSTOMER_COLUMN_MAP.has(key) && keys.indexOf(key) === i && key !== NAME_COLUMN_KEY,
  );
  return [NAME_COLUMN_KEY, ...known];
}

/** The text of a customer's cell in a column, for the filters. */
export const customerCellText = (customer: CustomerItem, key: string): string =>
  CUSTOMER_COLUMN_MAP.get(key)?.text(customer) ?? "";
