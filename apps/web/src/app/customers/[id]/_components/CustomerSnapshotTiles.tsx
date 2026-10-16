"use client";

import type { ReactNode } from "react";
import {
  CommentOutlined,
  ContainerOutlined,
  CreditCardOutlined,
  WalletOutlined,
} from "@ant-design/icons";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import { useCustomerNotes } from "@/hooks/useCustomerNotes";
import type { NoteItem } from "@/hooks/useCustomerNotes";
import { useCustomerShipments } from "@/hooks/useCustomerShipments";
import type { ShipmentItem } from "@/hooks/useCustomerShipments";
import { useCustomer } from "@/hooks/useCustomers";
import { isActiveStatus } from "@/lib/enums";
import type { CustomerItem } from "@/hooks/useCustomers";
import { ATTENTION_RULES } from "../../_lib/customerAttention";
import { daysSince, relativeDayLabel } from "../../_lib/customerDates";
import { useLatestRates, type Rates } from "@/lib/fx";
import { summarizeInvoices } from "../../_lib/customerInvoices";
import { fmtMoney } from "../../_lib/customerMoney";
import { EMPTY_CELL } from "../../_lib/customerTable";
import type { KpiTone } from "./CustomerKpiTile";

// What one tile shows: its figure only; the label and the tab it opens are fixed in the markup below.
interface TileContent {
  value: ReactNode;
  tone?: KpiTone;
}

const VALUE_TONE: Record<KpiTone, string> = {
  red: "text-red-600",
  green: "text-green-600",
  amber: "text-amber-600",
};

interface SnapshotTileProps extends TileContent {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

// One tile of the snapshot row, centred from top to bottom: an icon, the name on one line under it (the icon
// sits above rather than beside it, so the name has the whole width of the tile), then the figure large. All four
// share one height, so the row stays even whatever the figures are; the whole tile opens the tab the figure
// comes from.
function SnapshotTile({ label, icon, value, tone, onClick }: SnapshotTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-col items-center justify-center min-w-0 h-[116px] px-3",
        "bg-white border border-slate-200 rounded-xl shadow-sm text-center cursor-pointer",
        "transition-colors hover:border-indigo-300 hover:bg-indigo-50/40",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
      ].join(" ")}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center justify-center w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 text-[15px]"
      >
        {icon}
      </span>
      {/* One line: a tile too narrow for the whole name cuts it with "…" rather than wrapping it. */}
      <span
        className="mt-1.5 max-w-full truncate text-[12px] font-bold uppercase tracking-wide text-slate-700"
        title={label}
      >
        {label}
      </span>
      <span
        className={`mt-2 max-w-full truncate text-2xl font-bold tabular-nums leading-none ${tone ? VALUE_TONE[tone] : "text-slate-900"}`}
      >
        {value}
      </span>
    </button>
  );
}

// Stands in for a tile's figure while its data is on the way or could not be loaded, so a tile never
// shows "0" or "Never" for something that is simply not known yet.
function placeholderTile(isLoading: boolean, isError: boolean): TileContent | null {
  if (isLoading) return { value: "…" };
  if (isError) return { value: EMPTY_CELL };
  return null;
}

// Green while the customer has shipments under way, red when it has none.
function activeShipmentsTile(shipments: ShipmentItem[]): TileContent {
  const active = shipments.filter((shipment) => isActiveStatus(shipment.status)).length;
  return { value: active, tone: active > 0 ? "green" : "red" };
}

// The general payment terms; prepayment (no credit at all) in red, as in the Payment terms card on Finance.
const paymentTermsTile = (customer: CustomerItem): TileContent => ({
  value: customer.paymentTerms || EMPTY_CELL,
  tone: customer.paymentTerms === "PREPAYMENT" ? "red" : undefined,
});

// The other way round from the shipments tile: green when the customer owes nothing, red while it owes anything.
// Invoices in a currency without a rate can't be added in; they are shown beside the sum ("+ 1 200,00 USD")
// and the tile is never green while they are open.
function outstandingTile(invoices: InvoiceItem[], currency: string, rates: Rates): TileContent {
  const { outstanding, unconverted } = summarizeInvoices(invoices, { currency, rates });
  const rest = unconverted.map((u) => `+ ${fmtMoney(u.amount, u.currency)}`).join(" ");
  const owes = outstanding > 0 || unconverted.length > 0;
  return { value: rest ? `${fmtMoney(outstanding, currency)} ${rest}` : fmtMoney(outstanding, currency), tone: owes ? "red" : "green" };
}

// Contact fresher than this many days shows green.
const RECENT_CONTACT_DAYS = 7;

// How fresh the last contact is: green within a week, amber up to the "no contact" limit (30 days), red past it
// and when nothing was ever logged.
function contactTone(days: number | null): KpiTone | undefined {
  if (days === null) return undefined;
  if (days < RECENT_CONTACT_DAYS) return "green";
  return days > ATTENTION_RULES.noContactDays ? "red" : "amber";
}

function lastContactTile(notes: NoteItem[]): TileContent {
  // The API returns notes newest first.
  const lastNote = notes[0];
  if (!lastNote) return { value: "Never", tone: "red" };
  const days = daysSince(lastNote.createdAt);
  return { value: days === null ? EMPTY_CELL : relativeDayLabel(days), tone: contactTone(days) };
}

interface CustomerSnapshotTilesProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// Where the customer stands right now: one figure per tile, each tile leading to where it is dealt with.
export function CustomerSnapshotTiles({ customerId, onSelectTab }: CustomerSnapshotTilesProps) {
  const { customer, isLoading: customerLoading } = useCustomer(customerId);
  const {
    shipments,
    isLoading: shipmentsLoading,
    isError: shipmentsError,
  } = useCustomerShipments(customerId);
  const {
    invoices,
    isLoading: invoicesLoading,
    isError: invoicesError,
  } = useCustomerInvoices(customerId);
  const { notes, isLoading: notesLoading, isError: notesError } = useCustomerNotes(customerId);
  // The outstanding invoices are summed in the customer's currency at today's rates.
  const { rates, isLoading: ratesLoading } = useLatestRates();

  const shipmentsTile =
    placeholderTile(shipmentsLoading, shipmentsError) ?? activeShipmentsTile(shipments);
  const termsTile = placeholderTile(customerLoading, !customer) ?? paymentTermsTile(customer!);
  // The amounts are in the customer's currency, so this tile needs the customer as well as the invoices.
  const financeTile =
    placeholderTile(customerLoading || invoicesLoading || ratesLoading, invoicesError || !customer) ??
    outstandingTile(invoices, customer!.currency, rates);
  const contactTile = placeholderTile(notesLoading, notesError) ?? lastContactTile(notes);

  return (
    // Four in a row once the column is wide enough for the names, two by two below that.
    <div className="@container">
      <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-3">
        <SnapshotTile
          label="Active shipments"
          icon={<ContainerOutlined />}
          {...shipmentsTile}
          onClick={() => onSelectTab("shipments")}
        />
        <SnapshotTile
          label="Payment terms"
          icon={<CreditCardOutlined />}
          {...termsTile}
          onClick={() => onSelectTab("finance")}
        />
        <SnapshotTile
          label="Outstanding invoices"
          icon={<WalletOutlined />}
          {...financeTile}
          onClick={() => onSelectTab("finance")}
        />
        <SnapshotTile
          label="Last contact"
          icon={<CommentOutlined />}
          {...contactTile}
          onClick={() => onSelectTab("communication")}
        />
      </div>
    </div>
  );
}
