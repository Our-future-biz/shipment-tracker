"use client";

import type { ComponentProps } from "react";
import dayjs from "dayjs";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import { useCustomerNotes } from "@/hooks/useCustomerNotes";
import type { NoteItem } from "@/hooks/useCustomerNotes";
import { useCustomerQuotes } from "@/hooks/useCustomerQuotes";
import { useCustomerShipments } from "@/hooks/useCustomerShipments";
import type { ShipmentItem } from "@/hooks/useCustomerShipments";
import { useCustomer } from "@/hooks/useCustomers";
import { formatDate } from "@/lib/date";
import { isCompletedStatus } from "@/lib/enums";
import type { SalesQuote } from "@/app/sales/_lib/salesQuote";
import { ATTENTION_RULES } from "../../_lib/customerAttention";
import { daysSince, relativeDayLabel } from "../../_lib/customerDates";
import { summarizeInvoices } from "../../_lib/customerInvoices";
import { fmtMoney } from "../../_lib/customerMoney";
import { quoteBucket, sellingByCurrency } from "../../_lib/customerQuotes";
import { EMPTY_CELL } from "../../_lib/customerTable";
import { CustomerKpiTile } from "./CustomerKpiTile";

// What one tile shows; the label and the tab it opens are fixed in the markup below.
type TileContent = Pick<ComponentProps<typeof CustomerKpiTile>, "value" | "tone" | "hint" | "hintTone">;

const DAY_KEY = "YYYY-MM-DD";

// A non-breaking space: an empty hint that still takes up its line, so a tile is the same height with
// or without a hint and the row neither jumps when the data arrives nor sits uneven while it loads.
const BLANK_HINT = "\u00a0";

// Stands in for a tile's figure while its data is on the way or could not be loaded, so a tile never
// shows "0" or "Never" for something that is simply not known yet.
function placeholderTile(isLoading: boolean, isError: boolean): TileContent | null {
  if (isLoading) return { value: "…", hint: BLANK_HINT };
  if (isError) return { value: EMPTY_CELL, hint: BLANK_HINT };
  return null;
}

// The soonest arrival that is today or later. Arrivals are compared as calendar days on the viewer's
// clock, the same reading of the date that formatDate displays.
function nextArrival(shipments: ShipmentItem[]): string | null {
  const today = dayjs().format(DAY_KEY);
  let next: { day: string; eta: string } | null = null;
  for (const { estimatedArrival } of shipments) {
    if (!estimatedArrival) continue;
    const arrival = dayjs(estimatedArrival);
    if (!arrival.isValid()) continue;
    const day = arrival.format(DAY_KEY);
    if (day >= today && (!next || day < next.day)) next = { day, eta: estimatedArrival };
  }
  return next ? next.eta : null;
}

function activeShipmentsTile(shipments: ShipmentItem[]): TileContent {
  const active = shipments.filter((shipment) => !isCompletedStatus(shipment.status));
  if (active.length === 0) return { value: 0, hint: "None in progress" };
  const eta = nextArrival(active);
  return { value: active.length, hint: eta ? `Next ETA ${formatDate(eta)}` : "No upcoming arrival" };
}

function openQuotesTile(quotes: SalesQuote[]): TileContent {
  const open = quotes.filter((quote) => quoteBucket(quote) === "open");
  if (open.length === 0) return { value: 0, hint: "None open" };
  const selling = sellingByCurrency(open);
  // Several currencies can outgrow the tile, so the full figure is also the tooltip.
  return { value: open.length, hint: selling ? <span title={selling}>{selling}</span> : "No value yet" };
}

function outstandingTile(invoices: InvoiceItem[], currency?: string): TileContent {
  const { outstanding, overdueAmount } = summarizeInvoices(invoices);
  const value = fmtMoney(outstanding, currency);
  if (overdueAmount > 0) return { value, hint: `${fmtMoney(overdueAmount, currency)} overdue`, hintTone: "red" };
  return { value, hint: "Nothing overdue" };
}

function lastContactTile(notes: NoteItem[]): TileContent {
  // The API returns notes newest first.
  const lastNote = notes[0];
  if (!lastNote) return { value: "Never", hint: "No interaction logged", tone: "amber" };
  const days = daysSince(lastNote.createdAt);
  return {
    value: days === null ? EMPTY_CELL : relativeDayLabel(days),
    hint: [lastNote.type, lastNote.author].filter(Boolean).join(" · "),
    tone: days !== null && days > ATTENTION_RULES.noContactDays ? "amber" : undefined,
  };
}

interface CustomerSnapshotTilesProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// Where the customer stands right now, one tile per tab, each opening that tab. The all-time totals
// (Revenue, Profit, Margin, Shipments) are in the page header and are deliberately not repeated here.
export function CustomerSnapshotTiles({ customerId, onSelectTab }: CustomerSnapshotTilesProps) {
  const { customer, isLoading: customerLoading } = useCustomer(customerId);
  const { shipments, isLoading: shipmentsLoading, isError: shipmentsError } = useCustomerShipments(customerId);
  const { quotes, isLoading: quotesLoading, isError: quotesError } = useCustomerQuotes(customerId);
  const { invoices, isLoading: invoicesLoading, isError: invoicesError } = useCustomerInvoices(customerId);
  const { notes, isLoading: notesLoading, isError: notesError } = useCustomerNotes(customerId);

  const shipmentsTile = placeholderTile(shipmentsLoading, shipmentsError) ?? activeShipmentsTile(shipments);
  const quotesTile = placeholderTile(quotesLoading, quotesError) ?? openQuotesTile(quotes);
  // The amounts are in the customer's currency, so this tile needs the customer as well as the invoices.
  const financeTile =
    placeholderTile(customerLoading || invoicesLoading, invoicesError || !customer) ?? outstandingTile(invoices, customer?.currency);
  const contactTile = placeholderTile(notesLoading, notesError) ?? lastContactTile(notes);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <CustomerKpiTile label="Active shipments" {...shipmentsTile} onClick={() => onSelectTab("shipments")} />
      <CustomerKpiTile label="Open quotes" {...quotesTile} onClick={() => onSelectTab("quotes")} />
      <CustomerKpiTile label="Outstanding" {...financeTile} onClick={() => onSelectTab("finance")} />
      <CustomerKpiTile label="Last contact" {...contactTile} onClick={() => onSelectTab("communication")} />
    </div>
  );
}
