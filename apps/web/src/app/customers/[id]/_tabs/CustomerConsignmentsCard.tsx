"use client";

import Link from "next/link";
import { Spin } from "antd";
import { CountChip, SectionCard } from "@/components/SectionCard";
import { useConsignments } from "@/hooks/useTruckingConsignments";
import { formatDate } from "@/lib/date";
import { CONSIGNMENT_STATUS_CHIP, consignmentHref } from "@/app/trucking/_lib/consignments";
import { TruckingStatusChip } from "@/app/trucking/_components/TruckingStatusChip";

const SHOWN = 20;

interface CustomerConsignmentsCardProps {
  customerId: string;
  companyName: string;
}

// The customer's consignments in Trucking, newest first (the server searches by the company's name;
// only this company's are kept). Each opens its consignment page.
export const CustomerConsignmentsCard = ({ customerId, companyName }: CustomerConsignmentsCardProps) => {
  const { consignments, isLoading, isError } = useConsignments({ search: companyName }, { enabled: !!companyName });
  const own = consignments.filter((c) => c.customerId === customerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <SectionCard title="Consignments" extra={own.length ? <CountChip count={own.length} /> : undefined}>
      {isLoading ? (
        <Spin size="small" />
      ) : isError ? (
        <div className="text-[13px] text-red-600">The consignments could not be loaded.</div>
      ) : own.length === 0 ? (
        <div className="text-[13px] text-slate-500">No consignments yet. Book one in Trucking → Consignments → Create new, or from a job&apos;s Trucking tab.</div>
      ) : (
        <div>
          {own.slice(0, SHOWN).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 py-2 text-[13px] last:border-b-0">
              <Link href={consignmentHref(c.id)} className="font-mono font-semibold text-indigo-600 hover:underline">
                {c.ref}
              </Link>
              <TruckingStatusChip chip={CONSIGNMENT_STATUS_CHIP[c.status]} />
              <span className="text-slate-600">
                {c.pickupCity} → {c.deliveryCity}
              </span>
              <span className="text-slate-500">Pick-up {formatDate(c.pickupDate)}</span>
              <span className="font-mono text-slate-500">{c.jobNumber}</span>
            </div>
          ))}
          {own.length > SHOWN && <div className="pt-2 text-[12px] text-slate-500">The newest {SHOWN} of {own.length} — the rest are in Trucking → Consignments.</div>}
        </div>
      )}
    </SectionCard>
  );
};
