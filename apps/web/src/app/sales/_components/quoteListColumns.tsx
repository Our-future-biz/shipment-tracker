"use client";

import Link from "next/link";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { LINK_CLASS } from "@/components/linkClass";
import { formatDate } from "@/lib/date";
import {
  businessDay,
  businessToday,
  cargoReadyDay,
  computeCargo,
  computeTotals,
  daysOpen,
  quoteCurrency,
  type CsvColumn,
  type SalesQuote,
  type QuotePricing,
} from "../_lib/salesQuote";
import { QUOTE_STATUS_MAP } from "../_lib/types";
import { CustomerLink } from "./CustomerLink";
import { QuoteRefLink } from "./QuoteRefLink";
import { QuoteRoute } from "./QuoteRoute";
import { QuoteSelling } from "./QuoteSelling";
import { QuoteStatusPill } from "./QuoteStatusPill";

export type SortDirection = "ascend" | "descend";

export interface QuoteColumn {
  key: string;
  // The column's name: in the Columns panel, in the CSV and - unless `header` says otherwise - in the table's head.
  title: string;
  header?: React.ReactNode;
  width?: number;
  // What the server sorts by when the header is clicked; a column without it cannot be sorted.
  sortBy?: string;
  // The direction of the first click: dates start with the newest, everything else with A or the earliest.
  firstSort?: SortDirection;
  // `pricing` is today's ČNB fixing and ROE %, which money columns convert a draft with.
  render: (q: SalesQuote, pricing: QuotePricing) => React.ReactNode;
}

// How a quote's validity reads in the list. Red is for a quote that is Expired - the status a
// Quoted or Feedback quote has once its date has passed. On any other quote a past date is a fact
// about it, not an alarm: the quote was won or lost, or is being reworked and gets a new date
// when it is sent again.
function validityMark(q: SalesQuote): { label: string; dot: string; ring?: string; text?: string } {
  if (q.status === "expired") return { label: "Expired", dot: "bg-red-500", ring: "ring-2 ring-red-100", text: "text-red-600" };
  // Counted by the day the server counts validity by: Prague's, wherever the viewer sits.
  if (q.validUntil && q.validUntil < businessToday()) return { label: "Validity ended", dot: "bg-slate-300" };
  return { label: "Valid until", dot: "bg-green-500", ring: "ring-2 ring-green-100" };
}

interface ValidityDotProps {
  quote: SalesQuote;
}

// The dot in the first column of a row, so that validity is seen at a glance: green while the
// quote is valid, red once it has expired, grey for a quote without a validity date or with a
// date that has passed on a quote that is closed or being reworked.
export function ValidityDot({ quote }: ValidityDotProps) {
  if (!quote.validUntil) return <span role="img" aria-label="No validity date" title="No validity date" className="inline-block w-2.5 h-2.5 rounded-full bg-slate-300" />;
  const mark = validityMark(quote);
  return (
    <span
      role="img"
      aria-label={mark.label}
      title={`${mark.label}: ${formatDate(quote.validUntil)}`}
      className={`inline-block w-2.5 h-2.5 rounded-full ${mark.dot} ${mark.ring ?? ""}`}
    />
  );
}

interface ValidUntilProps {
  quote: SalesQuote;
}

// The validity date itself; what it means for the quote is the dot at the start of the row.
function ValidUntil({ quote }: ValidUntilProps) {
  if (!quote.validUntil) return EMPTY_CELL;
  return <span className={validityMark(quote).text}>{formatDate(quote.validUntil)}</span>;
}

// The day (YYYY-MM-DD) of a moment, as the CSV holds a date. It is the day the server filters
// "Created between" by: Prague's, wherever the viewer sits.
const isoDayOf = (at: string | null) => (at ? businessDay(new Date(at)) : "");

// The same day, as the list shows a date.
const dayOf = (at: string | null) => formatDate(isoDayOf(at)) || EMPTY_CELL;

// A weight or a volume of the cargo with its unit. A figure nobody entered is a dash, not a
// stated "0 kg".
const withUnit = (figure: number, unit: string) => (figure ? `${figure} ${unit}` : EMPTY_CELL);

interface CutProps {
  full?: string;
  maxWidthClass: string;
  children: React.ReactNode;
}

// A name or a route of any length takes no more of a row than its column's width: what the
// column gets less the cell's padding (16px), which `maxWidthClass` names. A longer one would
// widen the column and push the last columns of the starting set out of view. The rest is cut
// with "…", and pointing at the cell shows it in full. It stays in the middle of a column that
// something else made wider.
function Cut({ full, maxWidthClass, children }: CutProps) {
  return (
    <span className={`block mx-auto truncate ${maxWidthClass}`} title={full || undefined}>
      {children}
    </span>
  );
}

// Every column the list can show, in the order of the Columns panel. A width is the least a
// column gets: the table gives a longer value its room.
export const QUOTE_COLUMNS: QuoteColumn[] = [
  {
    key: "reference",
    title: "Sales Number",
    width: 146,
    sortBy: "quoteNumber",
    render: (q) => <QuoteRefLink quoteNumber={q.quoteNumber} />,
  },
  {
    key: "customer",
    title: "Customer",
    width: 144,
    sortBy: "customer",
    render: (q) => (
      <Cut full={q.data.customerName} maxWidthClass="max-w-32">
        <CustomerLink customerId={q.data.customerId} name={q.data.customerName} />
      </Cut>
    ),
  },
  {
    key: "route",
    title: "Route",
    width: 140,
    render: (q) => (
      <Cut full={[q.data.origin, q.data.destination].filter(Boolean).join(" → ")} maxWidthClass="max-w-[124px]">
        <QuoteRoute origin={q.data.origin} destination={q.data.destination} />
      </Cut>
    ),
  },
  { key: "status", title: "Status", width: 110, sortBy: "status", render: (q) => <QuoteStatusPill status={q.status} /> },
  { key: "validity", title: "Valid until", width: 104, sortBy: "validUntil", render: (q) => <ValidUntil quote={q} /> },
  { key: "owner", title: "Sales Owner", width: 110, sortBy: "owner", render: (q) => q.ownerName || EMPTY_CELL },
  {
    key: "selling",
    title: "Selling total",
    width: 104,
    render: (q, pricing) => {
      const totals = computeTotals(q.data, pricing.rates, pricing);
      // A quote without a price shows a dash - unless the price is only missing an exchange rate.
      if (!totals.selling && !totals.missingSellingRates.length) return EMPTY_CELL;
      return (
        <span className="text-slate-600 tabular-nums">
          <QuoteSelling totals={totals} />
        </span>
      );
    },
  },
  {
    key: "shipment",
    title: "Shipment",
    width: 112,
    // The shipment that carries the quote as its Sales Number - the oldest when there are several.
    // A click on the row opens the quote; the job number opens the shipment.
    render: (q) =>
      q.shipmentId ? (
        <Link
          href={`/shipments/${q.shipmentId}`}
          onClick={(e) => e.stopPropagation()}
          title={`Open shipment ${q.shipmentJobNumber}`}
          className={`font-mono text-xs font-semibold ${LINK_CLASS}`}
        >
          {q.shipmentJobNumber}
        </Link>
      ) : (
        EMPTY_CELL
      ),
  },
  { key: "service", title: "Freight Mode", width: 104, render: (q) => q.data.serviceType || EMPTY_CELL },
  { key: "incoterm", title: "Incoterm", width: 80, render: (q) => q.data.incoterm || EMPTY_CELL },
  { key: "cargoReady", title: "Cargo ready", width: 100, render: (q) => formatDate(cargoReadyDay(q.data)) || EMPTY_CELL },
  { key: "created", title: "Created", width: 110, sortBy: "createdAt", firstSort: "descend", render: (q) => dayOf(q.createdAt) },
  { key: "direction", title: "Trade Direction", width: 130, render: (q) => q.data.direction || EMPTY_CELL },
  { key: "commodity", title: "Cargo Description", width: 180, render: (q) => q.data.commodity || EMPTY_CELL },
  { key: "packages", title: "Pieces (PCS)", width: 110, render: (q) => (q.data.packages?.length ? computeCargo(q.data).totalPackages : EMPTY_CELL) },
  // Weight and volume are the package lines added up, or - for a quote without lines - the totals
  // stored for the whole shipment. Pieces are counted from lines only.
  { key: "weight", title: "Total Gross Weight (kg)", width: 180, render: (q) => withUnit(computeCargo(q.data).grossWeight, "kg") },
  { key: "cbm", title: "Total Volume (m³)", width: 150, render: (q) => withUnit(computeCargo(q.data).cbm, "m³") },
  { key: "method", title: "Method", width: 90, render: (q) => q.data.method || EMPTY_CELL },
  { key: "shippingTerms", title: "Shipping terms", width: 130, render: (q) => q.data.shippingTerms || EMPTY_CELL },
  { key: "sent", title: "Sent Date", width: 110, sortBy: "sentAt", firstSort: "descend", render: (q) => dayOf(q.sentAt) },
  // A quote that never got a sent date has no days to show. Whether a follow-up is due is not
  // said here: that is the dot in front of the reference.
  { key: "daysOpen", title: "Days open", width: 100, render: (q) => daysOpen(q) ?? EMPTY_CELL },
];

// The columns a list starts with, in their order: at a usual window the first eight are in view
// and the rest is reached by scrolling the table sideways.
export const DEFAULT_QUOTE_COLUMNS = [
  "reference",
  "customer",
  "route",
  "status",
  "validity",
  "owner",
  "selling",
  "shipment",
  "service",
  "incoterm",
  "cargoReady",
  "created",
];

const isKnown = (key: string) => QUOTE_COLUMNS.some((column) => column.key === key);

// The columns to show, out of the set that is stored. That set is the whole company's and may
// have been stored before Origin and Destination became Route, when every row also had its
// validity dot whatever the columns: such a set gets Route where the first of the two stood, and
// Valid until - which carries that dot now - if it lacks it. A key this version does not know is
// left out.
export function shownColumns(stored: string[]): string[] {
  const isOldPlace = (key: string) => key === "origin" || key === "destination";
  const keys = stored.map((key) => (isOldPlace(key) ? "route" : key));
  if (stored.some(isOldPlace) && !keys.includes("validity")) keys.splice(keys.indexOf("status") + 1 || keys.length, 0, "validity");
  return [...new Set(keys)].filter(isKnown);
}

// What the CSV holds for a column, as text.
const CSV_TEXT: Record<string, (q: SalesQuote, pricing: QuotePricing) => string> = {
  reference: (q) => q.quoteNumber,
  customer: (q) => q.data.customerName ?? "",
  status: (q) => QUOTE_STATUS_MAP[q.status]?.label ?? q.status,
  validity: (q) => q.validUntil ?? "",
  owner: (q) => q.ownerName,
  // A plain number for the spreadsheet. A total with lines left out for want of a rate is not
  // exported at all: in a file it would carry no mark and be summed as if it were the price.
  selling: (q, pricing) => {
    const totals = computeTotals(q.data, pricing.rates, pricing);
    return totals.missingSellingRates.length ? "" : totals.selling.toFixed(2);
  },
  shipment: (q) => q.shipmentJobNumber ?? "",
  service: (q) => q.data.serviceType ?? "",
  incoterm: (q) => q.data.incoterm ?? "",
  cargoReady: (q) => cargoReadyDay(q.data),
  // A day, as the list shows one and as Valid until is exported - not the moment to the millisecond.
  created: (q) => isoDayOf(q.createdAt),
  direction: (q) => q.data.direction ?? "",
  commodity: (q) => q.data.commodity ?? "",
  packages: (q) => String(q.data.packages?.length ? computeCargo(q.data).totalPackages : ""),
  weight: (q) => String(computeCargo(q.data).grossWeight || ""),
  cbm: (q) => String(computeCargo(q.data).cbm || ""),
  method: (q) => q.data.method ?? "",
  shippingTerms: (q) => q.data.shippingTerms ?? "",
  sent: (q) => isoDayOf(q.sentAt),
  daysOpen: (q) => String(daysOpen(q) ?? ""),
};

// The CSV of the given columns, in their order. A file is sorted, filtered and added up by
// column, so what the screen draws as one piece is two columns where it is two facts.
export function quoteCsvColumns(keys: string[], pricing: QuotePricing): CsvColumn[] {
  return keys.flatMap((key): CsvColumn[] => {
    if (key === "route") {
      return [
        { title: "Origin", accessor: (q) => q.data.origin ?? "" },
        { title: "Destination", accessor: (q) => q.data.destination ?? "" },
      ];
    }
    const text = CSV_TEXT[key];
    const title = QUOTE_COLUMNS.find((column) => column.key === key)?.title;
    if (!text || !title) return [];
    const column: CsvColumn = { title, accessor: (q) => text(q, pricing) };
    // Quotes differ in currency, and an amount without one cannot be read or added up.
    return key === "selling" ? [column, { title: "Currency", accessor: (q) => quoteCurrency(q.data) }] : [column];
  });
}
