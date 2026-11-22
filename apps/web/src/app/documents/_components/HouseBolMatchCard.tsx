"use client";

import { Alert, Button } from "antd";
import Link from "next/link";
import type { ShipmentItem } from "@/hooks/useShipments";
import { formatDate } from "@/lib/date";
import { HINT, LINK, REF } from "@/styles/ui";

interface Props {
  /** The House B/L read. */
  houseBol: string;
  /** The live shipment that has it already. */
  shipment: ShipmentItem;
  disabled?: boolean;
  /** This is the shipment: the read is written into it. */
  onApprove: () => void;
  /** It is not: a new job is created anyway. */
  onCreateNew: () => void;
}

// Documents → Shipments, "Create new shipment": the read's House B/L is on a shipment already. The shipment
// is shown for the user to say whether it is the one the document is about; nothing is written before.
export function HouseBolMatchCard({ houseBol, shipment, disabled, onApprove, onCreateNew }: Props) {
  const route = [shipment.pol, shipment.pod].filter(Boolean).join(" → ");
  const dates = [
    shipment.estimatedDeparture && `ETD ${formatDate(shipment.estimatedDeparture)}`,
    shipment.estimatedArrival && `ETA ${formatDate(shipment.estimatedArrival)}`,
  ].filter(Boolean);
  const rows: [string, string][] = [
    ["Customer", shipment.customer],
    ["Shipper", shipment.shipper],
    ["Consignee", shipment.consignee],
    ["Route", route],
    ["Mode", [shipment.freightMode, shipment.loadType].filter(Boolean).join(" · ")],
    ["Dates", dates.join(" · ")],
    ["Master B/L", shipment.masterBolNumber],
    ["Container", shipment.containerNumber],
    ["Status", shipment.status],
  ];
  return (
    <Alert
      className="mb-3"
      type="warning"
      showIcon
      message={`House B/L ${houseBol} is on a shipment already`}
      description={
        <>
          <p className="mt-1 mb-2">
            {/* By its id: the shipment page is found by id, not by job number (mock test S18-141). */}
            <Link href={`/shipments/${encodeURIComponent(shipment.id)}`} target="_blank" className={`${LINK} ${REF} font-semibold`}>
              {shipment.jobNumber}
            </Link>{" "}
            has this House B/L. Is it the shipment this document is about?
          </p>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 m-0 text-[13px]">
            {rows
              .filter(([, value]) => value?.trim())
              .map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="m-0 text-slate-900">{value}</dd>
                </div>
              ))}
          </dl>
          <div className="flex flex-wrap gap-2 mt-3">
            <Button type="primary" disabled={disabled} onClick={onApprove}>
              Approve: write into {shipment.jobNumber}
            </Button>
            <Button disabled={disabled} onClick={onCreateNew}>
              Create new job
            </Button>
          </div>
          <p className={`mt-2 mb-0 ${HINT}`}>
            Approve sets the fields read beside {shipment.jobNumber}&apos;s values (ones that differ are unticked to look at). Create new job makes a second
            shipment with the same House B/L.
          </p>
        </>
      }
    />
  );
}
