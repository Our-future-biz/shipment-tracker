"use client";

import Link from "next/link";
import { SectionCard } from "@/components/SectionCard";
import type { ConsignmentDetail } from "@/hooks/useTruckingConsignments";
import { businessDateTime } from "@/lib/date";
import { quoteHref } from "@/app/sales/_lib/quoteHref";
import { EMPTY, LABEL_TEXT, LINK, REF } from "@/styles/ui";
import { formatPsc } from "../../_lib/hauliers";
import { PriceSnapshotTable } from "../../_components/PriceSnapshotTable";
import { TERMS } from "../../_lib/glossary";
import { pragueDate } from "../../_lib/format";

type Stop = ConsignmentDetail["pickup"];

// A label + value row of the cards below, in the shape of InfoRow.
const ROW = "flex items-baseline gap-2 border-b border-slate-100 py-1.5 text-[13px] last:border-b-0";
const LABEL = `w-[140px] shrink-0 ${LABEL_TEXT}`;

const Line = ({ k, v }: { k: string; v: string }) => (
  <div className={ROW}>
    <span className={LABEL}>{k}</span>
    <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words ${v ? "text-slate-900" : EMPTY}`}>{v || "—"}</span>
  </div>
);

const StopCard = ({ title, stop }: { title: string; stop: Stop }) => (
  <SectionCard title={title}>
    <Line k="Name" v={stop.name} />
    <Line k="Address" v={[stop.street, [stop.country === "CZ" ? formatPsc(stop.postcode) : stop.postcode, stop.city].filter(Boolean).join(" "), stop.country].filter(Boolean).join(", ")} />
    <Line k="Time window" v={stop.windowFrom || stop.windowTo ? `${businessDateTime(stop.windowFrom) || "…"} – ${businessDateTime(stop.windowTo) || "…"}` : ""} />
    <Line k="Contact" v={[stop.contactName, stop.contactPhone].filter(Boolean).join(" · ")} />
    <Line k="Avizace" v={stop.avizaceRequired ? "Call before arriving" : "Not needed"} />
    <Line k="Reference" v={stop.reference} />
    <Line k="Notes" v={stop.notes} />
    <Line k="Arrived / left" v={[businessDateTime(stop.actualArrival), businessDateTime(stop.actualDeparture)].filter(Boolean).join(" → ")} />
  </SectionCard>
);

interface ConsignmentOverviewTabProps {
  c: ConsignmentDetail;
}

// Overview: both stops in full, the goods and the sell price as it was priced.
export const ConsignmentOverviewTab = ({ c }: ConsignmentOverviewTabProps) => (
  <div className="flex flex-col gap-4">
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <StopCard title="Pick-up" stop={c.pickup} />
      <StopCard title="Delivery" stop={c.delivery} />
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <SectionCard title="Order">
        <Line k="Customer" v={c.customerName} />
        <div className={ROW}>
          <span className={LABEL}>Job</span>
          <Link href={`/shipments/${c.shipmentId}?tab=trucking`} className={`${LINK} ${REF} font-semibold`}>
            {c.jobNumber}
          </Link>
        </div>
        <div className={ROW}>
          <span className={LABEL}>Quote</span>
          {c.quoteNumber ? (
            <Link href={quoteHref(c.quoteNumber)} className={`${LINK} ${REF} font-semibold`}>
              {c.quoteNumber}
            </Link>
          ) : (
            <span className={EMPTY}>—</span>
          )}
        </div>
        <Line k="Goods" v={c.load.description} />
        <Line k="Booked" v={pragueDate(c.createdAt)} />
      </SectionCard>
      <SectionCard title="Sell price">
        {c.internal ? (
          <p className="m-0 text-[13px] text-slate-500">
            No customer price: billed internally from the {TERMS.internalTariff.toLowerCase()} in the monthly {TERMS.internalStatement.toLowerCase()} (see Money).
          </p>
        ) : c.sell ? (
          <PriceSnapshotTable price={c.sell} />
        ) : (
          <p className="m-0 text-[13px] text-slate-500">Not priced.</p>
        )}
      </SectionCard>
    </div>
  </div>
);
