"use client";

import Link from "next/link";
import { SectionCard } from "@/components/SectionCard";
import { useHaulier } from "@/hooks/useTrucking";
import { formatDate } from "@/lib/date";
import { HaulierIssueList } from "@/app/trucking/_components/HaulierIssueList";
import { HaulierStatusChip } from "@/app/trucking/_components/HaulierStatusChip";

interface CustomerHaulierCardProps {
  customerId: string;
}

const TOP_ISSUES = 3;

// For a company we subcontract trucking to: whether it can be put on a trip, at a glance. A summary
// that leads to the haulier page in Trucking, where its profile is kept — not a list of its own.
export function CustomerHaulierCard({ customerId }: CustomerHaulierCardProps) {
  const { haulier, isLoading, error } = useHaulier(customerId);
  const link = (
    <Link href={`/trucking/hauliers/${customerId}`} className="text-xs font-semibold text-indigo-600 whitespace-nowrap hover:underline">
      Open in Trucking
    </Link>
  );

  return (
    <SectionCard title="Haulier" extra={link}>
      {isLoading && <span className="text-xs text-slate-400">Loading…</span>}
      {!isLoading && !haulier && <span className="text-xs text-slate-500">{error ? "The Trucking status could not be read." : "No Trucking status yet."}</span>}
      {haulier && (
        <div className="flex flex-col gap-2 text-[13px]">
          <div>
            <HaulierStatusChip status={haulier.status} />
          </div>
          <HaulierIssueList issues={haulier.issues} limit={TOP_ISSUES} />
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-slate-500">Insurance valid to</dt>
            <dd className="m-0 text-slate-800">{formatDate(haulier.profile.insuranceValidTo) || "—"}</dd>
            <dt className="text-slate-500">Licence valid to</dt>
            <dd className="m-0 text-slate-800">
              {haulier.profile.licenceUnlimited ? "No end date" : formatDate(haulier.profile.licenceValidTo) || "—"}
            </dd>
          </dl>
        </div>
      )}
    </SectionCard>
  );
}
