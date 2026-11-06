"use client";

import { CountChip, SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import type { TrackingChange } from "@/hooks/useShipmentTracking";
import { businessDateTime, formatDate } from "@/lib/date";
import { EMPTY, EMPTY_STATE, HINT, TD, TH } from "@/styles/ui";
import { personOrSystem } from "./RecordedBy";
import { movedDaysLabel } from "./trackingText";

function Value({ change, value }: { change: TrackingChange; value: string | null }) {
  if (!value) return <span className={EMPTY}>—</span>;
  return <>{change.isDate ? formatDate(value) : value}</>;
}

/** Every logged change of the shipment's dates and routing, newest first: what we knew when. */
export function ChangesCard({ changes, capped }: { changes: readonly TrackingChange[]; capped: boolean }) {
  return (
    <SectionCard title="Date and routing changes" extra={<CountChip count={capped ? `${changes.length}+` : changes.length} />} bodyClassName="p-0">
      {changes.length === 0 ? (
        <p className={EMPTY_STATE}>No changes logged yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse [&_td:first-child]:!pl-4 [&_th:first-child]:!pl-4">
            <thead>
              <tr>
                <th className={TH}>When</th>
                <th className={TH}>What</th>
                <th className={TH}>From</th>
                <th className={TH}>To</th>
                <th className={TH}>Moved</th>
                <th className={TH}>Who</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id}>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}>{businessDateTime(c.at)}</td>
                  <td className={`${TD} whitespace-nowrap font-medium text-slate-900`}>{c.label}</td>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}><Value change={c} value={c.oldValue} /></td>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}><Value change={c} value={c.newValue} /></td>
                  <td className={TD}>
                    {c.movedDays ? <Pill tone={c.movedDays > 0 ? "amber" : "slate"}>{movedDaysLabel(c.movedDays)}</Pill> : <span className={EMPTY}>—</span>}
                  </td>
                  <td className={TD}>{personOrSystem(c.by)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {capped && <p className={`${HINT} m-0 px-4 py-2`}>Showing the newest {changes.length} changes.</p>}
    </SectionCard>
  );
}
