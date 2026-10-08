"use client";

import Link from "next/link";
import { Tag } from "antd";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerShipments } from "@/hooks/useCustomerShipments";
import { formatDate } from "@/lib/date";
import { statusTagColor } from "@/lib/shipmentStatus";
import { EMPTY_CELL } from "../../_lib/customerTable";

const RECENT_COUNT = 5;

// Each row is a grid of its own with the same tracks, so the columns line up from row to row without a
// table. A narrow card gets two lines per row — job number and ETA, then route and status — and from
// 42rem of card width everything sits on one line. Statuses are the longest text of a row, so their
// column gets the larger share; every track that holds free text can shrink to nothing instead of
// pushing the row out of the card.
const ROW_CLASS = [
  "grid grid-cols-[minmax(0,1fr)_fit-content(60%)] items-center gap-x-3 gap-y-1 py-2 text-[13px]",
  "@2xl:grid-cols-[minmax(7rem,auto)_minmax(0,2fr)_minmax(0,3fr)_minmax(7rem,auto)]",
].join(" ");

const JOB_CLASS = [
  "col-start-1 row-start-1 justify-self-start [overflow-wrap:anywhere]",
  "font-mono font-semibold text-indigo-600 hover:underline",
].join(" ");

const ROUTE_CLASS = "col-start-1 row-start-2 min-w-0 truncate text-slate-600 @2xl:col-start-2 @2xl:row-start-1";

const STATUS_CLASS = "col-start-2 row-start-2 flex min-w-0 justify-end @2xl:col-start-3 @2xl:row-start-1 @2xl:justify-start";

// Statuses run to 50+ characters: the tag is cut to its column and keeps the full text as a tooltip.
const STATUS_TAG_CLASS = "!m-0 max-w-full truncate";

const ETA_CLASS = "col-start-2 row-start-1 text-right text-xs text-slate-500 tabular-nums whitespace-nowrap @2xl:col-start-4";

interface CustomerRecentShipmentsCardProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// Teaser of the Shipments tab: the newest few shipments, each linking to its own page.
export function CustomerRecentShipmentsCard({ customerId, onSelectTab }: CustomerRecentShipmentsCardProps) {
  const { shipments, isLoading, isError } = useCustomerShipments(customerId);
  // The hook returns shipments newest first.
  const recent = shipments.slice(0, RECENT_COUNT);

  let emptyText = "No shipments for this customer yet";
  if (isLoading) emptyText = "Loading…";
  if (isError) emptyText = "Could not load shipments.";

  return (
    <SectionCard
      title="Recent shipments"
      bodyClassName="px-4 py-2 @container"
      extra={
        <button
          type="button"
          onClick={() => onSelectTab("shipments")}
          className="bg-transparent border-0 p-0 text-xs font-semibold text-indigo-600 whitespace-nowrap cursor-pointer hover:underline"
        >
          View all
        </button>
      }
    >
      {recent.length > 0 ? (
        <ul className="divide-y divide-slate-100">
          {recent.map((shipment) => {
            const hasRoute = Boolean(shipment.pol || shipment.pod);
            const eta = formatDate(shipment.estimatedArrival);

            return (
              <li key={shipment.id} className={ROW_CLASS}>
                {/* The shipment page is addressed by the shipment ID, not by the job number. */}
                <Link href={`/shipments/${shipment.id}`} className={JOB_CLASS}>
                  {shipment.jobNumber}
                </Link>
                <span className={ROUTE_CLASS} title={hasRoute ? `${shipment.pol || "—"} → ${shipment.pod || "—"}` : undefined}>
                  {hasRoute ? (
                    <>
                      {shipment.pol || "—"} <span className="text-slate-300">→</span> {shipment.pod || "—"}
                    </>
                  ) : (
                    EMPTY_CELL
                  )}
                </span>
                <span className={STATUS_CLASS}>
                  {shipment.status ? (
                    <Tag color={statusTagColor(shipment.status)} title={shipment.status} className={STATUS_TAG_CLASS}>
                      {shipment.status}
                    </Tag>
                  ) : (
                    EMPTY_CELL
                  )}
                </span>
                <span className={ETA_CLASS}>{eta ? `ETA ${eta}` : EMPTY_CELL}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 py-2 text-[13px] text-slate-400">{emptyText}</p>
      )}
    </SectionCard>
  );
}
