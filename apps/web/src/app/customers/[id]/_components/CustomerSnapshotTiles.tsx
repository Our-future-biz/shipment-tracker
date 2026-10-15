"use client";

import type { ComponentProps } from "react";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import { useCustomerNotes } from "@/hooks/useCustomerNotes";
import type { NoteItem } from "@/hooks/useCustomerNotes";
import { useCustomerQuotes } from "@/hooks/useCustomerQuotes";
import { useCustomerShipments } from "@/hooks/useCustomerShipments";
import type { ShipmentItem } from "@/hooks/useCustomerShipments";
import { useCustomer } from "@/hooks/useCustomers";
import { isActiveStatus } from "@/lib/enums";
import type { SalesQuote } from "@/app/sales/_lib/salesQuote";
import { ATTENTION_RULES } from "../../_lib/customerAttention";
import { daysSince, relativeDayLabel } from "../../_lib/customerDates";
import { useLatestRates, type Rates } from "@/lib/fx";
import { summarizeInvoices } from "../../_lib/customerInvoices";
import { fmtMoney } from "../../_lib/customerMoney";
import { quoteBucket } from "../../_lib/customerQuotes";
import { EMPTY_CELL } from "../../_lib/customerTable";
import { CustomerKpiTile } from "./CustomerKpiTile";

// What one tile shows: its figure only; the label and the tab it opens are fixed in the markup below.
type TileContent = Pick<ComponentProps<typeof CustomerKpiTile>, "value" | "tone">;

// Stands in for a tile's figure while its data is on the way or could not be loaded, so a tile never
// shows "0" or "Never" for something that is simply not known yet.
function placeholderTile(isLoading: boolean, isError: boolean): TileContent | null {
  if (isLoading) return { value: "…" };
  if (isError) return { value: EMPTY_CELL };
  return null;
}

const activeShipmentsTile = (shipments: ShipmentItem[]): TileContent => ({
  value: shipments.filter((shipment) => isActiveStatus(shipment.status)).length,
});

const openQuotesTile = (quotes: SalesQuote[]): TileContent => ({
  value: quotes.filter((quote) => quoteBucket(quote) === "open").length,
});

// Red when part of what is owed is past due.
function outstandingTile(invoices: InvoiceItem[], currency: string, rates: Rates): TileContent {
  const { outstanding, overdueAmount } = summarizeInvoices(invoices, { currency, rates });
  return { value: fmtMoney(outstanding, currency), tone: overdueAmount > 0 ? "red" : undefined };
}

// Amber when nothing was ever logged, or the last contact is older than the "no contact" limit.
function lastContactTile(notes: NoteItem[]): TileContent {
  // The API returns notes newest first.
  const lastNote = notes[0];
  if (!lastNote) return { value: "Never", tone: "amber" };
  const days = daysSince(lastNote.createdAt);
  return {
    value: days === null ? EMPTY_CELL : relativeDayLabel(days),
    tone: days !== null && days > ATTENTION_RULES.noContactDays ? "amber" : undefined,
  };
}

interface CustomerSnapshotTilesProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// Where the customer stands right now: one figure per tile, each tile opening its tab.
export function CustomerSnapshotTiles({ customerId, onSelectTab }: CustomerSnapshotTilesProps) {
  const { customer, isLoading: customerLoading } = useCustomer(customerId);
  const { shipments, isLoading: shipmentsLoading, isError: shipmentsError } = useCustomerShipments(customerId);
  const { quotes, isLoading: quotesLoading, isError: quotesError } = useCustomerQuotes(customerId);
  const { invoices, isLoading: invoicesLoading, isError: invoicesError } = useCustomerInvoices(customerId);
  const { notes, isLoading: notesLoading, isError: notesError } = useCustomerNotes(customerId);
  // The outstanding invoices are summed in the customer's currency at today's rates.
  const { rates } = useLatestRates();

  const shipmentsTile = placeholderTile(shipmentsLoading, shipmentsError) ?? activeShipmentsTile(shipments);
  const quotesTile = placeholderTile(quotesLoading, quotesError) ?? openQuotesTile(quotes);
  // The amounts are in the customer's currency, so this tile needs the customer as well as the invoices.
  const financeTile =
    placeholderTile(customerLoading || invoicesLoading, invoicesError || !customer) ?? outstandingTile(invoices, customer!.currency, rates);
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
