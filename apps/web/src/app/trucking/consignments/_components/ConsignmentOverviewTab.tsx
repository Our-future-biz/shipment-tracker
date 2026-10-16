"use client";

import Link from "next/link";
import { SectionCard } from "@/components/SectionCard";
import type { ConsignmentDetail } from "@/hooks/useTruckingConsignments";
import { businessDateTime } from "@/lib/date";
import { quoteHref } from "@/app/sales/_lib/quoteHref";
import { formatPsc } from "../../_lib/hauliers";
import { PriceSnapshotTable } from "../../_components/PriceSnapshotTable";
import { TERMS } from "../../_lib/glossary";
import { pragueDate } from "../../_lib/format";

type Stop = ConsignmentDetail["pickup"];

const Line = ({ k, v }: { k: string; v: string }) => (
  <div className="flex items-baseline gap-2 border-b border-slate-100 py-1 text-xs last:border-b-0">
    <span className="w-[140px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">{k}</span>
    <span className={`min-w-0 flex-1 whitespace-pre-wrap break-words font-medium ${v ? "text-slate-900" : "text-slate-300"}`}>{v || "—"}</span>
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
        <div className="flex items-baseline gap-2 border-b border-slate-100 py-1 text-xs">
          <span className="w-[140px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">Job</span>
          <Link href={`/shipments/${c.shipmentId}?tab=trucking`} className="font-mono font-semibold text-indigo-600 hover:underline">
            {c.jobNumber}
          </Link>
        </div>
        <div className="flex items-baseline gap-2 border-b border-slate-100 py-1 text-xs">
          <span className="w-[140px] shrink-0 text-[11px] font-bold uppercase tracking-wide text-slate-500">Quote</span>
          {c.quoteNumber ? (
            <Link href={quoteHref(c.quoteNumber)} className="font-mono font-semibold text-indigo-600 hover:underline">
              {c.quoteNumber}
            </Link>
          ) : (
            <span className="text-slate-300">—</span>
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
