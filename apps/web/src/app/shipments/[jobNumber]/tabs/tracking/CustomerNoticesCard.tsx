"use client";

import { CountChip, SectionCard } from "@/components/SectionCard";
import type { TrackingCustomerNotice } from "@/hooks/useShipmentTracking";
import { businessDateTime, formatDate } from "@/lib/date";
import { HINT, TD, TH } from "@/styles/ui";
import { personOrSystem } from "./RecordedBy";
import { DATE_TEXT, MAIN_TEXT, TABLE, TABLE_BOX, TBODY, TROW } from "./trackingUi";

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
      <div className={TABLE_BOX}>
        <table className={`${TABLE} min-w-[860px]`}>
          <thead>
            <tr>
              <th scope="col" className={`${TH} w-[150px]`}>When</th>
              <th scope="col" className={TH}>What</th>
              <th scope="col" className={`${TH} w-[180px]`}>To</th>
              <th scope="col" className={`${TH} w-[240px]`}>Dates told</th>
              <th scope="col" className={`${TH} w-[180px]`}>Who</th>
            </tr>
          </thead>
          <tbody className={TBODY}>
            {notices.map((n) => (
              <tr key={n.id} className={TROW}>
                <td className={`${TD} ${DATE_TEXT}`}>{businessDateTime(n.at)}</td>
                <td className={`${TD} break-words`}>
                  <span className={MAIN_TEXT}>{n.label}</span>
                  {n.note && <div className={`${HINT} mt-0.5`}>{n.note}</div>}
                </td>
                <td className={`${TD} break-words`}>
                  {n.toldTo}
                  <div className={`${HINT} mt-0.5`}>{CHANNEL[n.channel] ?? n.channel}</div>
                </td>
                <td className={`${TD} tabular-nums`}>{datesTold(n)}</td>
                <td className={`${TD} truncate`}>{personOrSystem(n.by)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
