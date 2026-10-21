"use client";

import { createContext, useContext } from "react";
import Link from "next/link";
import { Popover } from "antd";
import { EMPTY_CELL } from "@/components/EmptyCell";
import { LINK_CLASS } from "@/components/linkClass";
import type { QuoteShipment } from "@/hooks/useQuoteShipments";
import type { SalesQuote } from "../_lib/salesQuote";

// The shipments of the quotes on screen, by reference, as the list read them for its page;
// undefined while they are not here. Provided by the list, so a column's cell can read them.
export const QuoteShipmentsContext = createContext<Map<string, QuoteShipment[]> | undefined>(undefined);

interface QuoteShipmentsCellProps {
  quote: SalesQuote;
}

// How many shipments name the quote as their Sales Reference; a click on the number lists them,
// each opening its shipment. Until the count is here the quote's own link stands in: the oldest
// shipment, which a quote keeps.
export function QuoteShipmentsCell({ quote }: QuoteShipmentsCellProps) {
  const counted = useContext(QuoteShipmentsContext)?.get(quote.quoteNumber);
  const shipments: QuoteShipment[] =
    counted ?? (quote.shipmentId ? [{ id: quote.shipmentId, jobNumber: quote.shipmentJobNumber ?? "", status: "" }] : []);
  if (!shipments.length) return EMPTY_CELL;

  const list = (
    <ul className="m-0 p-0 list-none flex flex-col gap-1.5 min-w-[180px]">
      {shipments.map((shipment) => (
        <li key={shipment.id} className="flex items-center justify-between gap-4">
          <Link href={`/shipments/${shipment.id}`} className={`font-mono text-xs font-semibold ${LINK_CLASS}`}>
            {shipment.jobNumber || "Shipment"}
          </Link>
          {shipment.status && <span className="text-xs text-slate-500">{shipment.status}</span>}
        </li>
      ))}
    </ul>
  );

  return (
    // A click on the row opens the quote; the number only opens its list.
    <span onClick={(e) => e.stopPropagation()}>
      <Popover content={list} title={`Shipments of ${quote.quoteNumber}`} trigger="click" placement="bottom">
        <button
          type="button"
          aria-label={`${shipments.length} shipment${shipments.length === 1 ? "" : "s"} - show them`}
          className={`bg-transparent border-none p-0 cursor-pointer font-semibold tabular-nums ${LINK_CLASS}`}
        >
          {shipments.length}
        </button>
      </Popover>
    </span>
  );
}
