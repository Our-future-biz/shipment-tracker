"use client";

import { CountChip, SectionCard } from "@/components/SectionCard";
import type { TrackingCustomerNotice } from "@/hooks/useShipmentTracking";
import { businessDateTime, formatDate } from "@/lib/date";
import { HINT, TD, TH } from "@/styles/ui";
import { personOrSystem } from "./RecordedBy";

const CHANNEL: Record<string, string> = { email: "E-mail", phone: "Phone", other: "Other" };

const datesTold = (n: TrackingCustomerNotice) =>
  [
    n.etaPod && `ETA ${formatDate(n.etaPod)}`,
    n.etaWarehouse && `ETA warehouse ${formatDate(n.etaWarehouse)}`,
    n.plannedDelivery && `Delivery ${formatDate(n.plannedDelivery)}`,
  ]
    .filter(Boolean)
    .join(" · ");

/** What the customer was told and when, the latest first: the answer when they call. */
export function CustomerNoticesCard({ notices }: { notices: readonly TrackingCustomerNotice[] }) {
  return (
    <SectionCard title="Told the customer" extra={<CountChip count={notices.length} />} bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse [&_td:first-child]:!pl-4 [&_th:first-child]:!pl-4">
          <thead>
            <tr>
              <th className={TH}>When</th>
              <th className={TH}>What</th>
              <th className={TH}>To</th>
              <th className={TH}>Dates told</th>
              <th className={TH}>Who</th>
            </tr>
          </thead>
          <tbody>
            {notices.map((n) => (
              <tr key={n.id}>
                <td className={`${TD} tabular-nums whitespace-nowrap`}>{businessDateTime(n.at)}</td>
                <td className={TD}>
                  <span className="font-medium text-slate-900">{n.label}</span>
                  {n.note && <div className={HINT}>{n.note}</div>}
                </td>
                <td className={TD}>
                  {n.toldTo}
                  <div className={HINT}>{CHANNEL[n.channel] ?? n.channel}</div>
                </td>
                <td className={`${TD} tabular-nums`}>{datesTold(n)}</td>
                <td className={TD}>{personOrSystem(n.by)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
