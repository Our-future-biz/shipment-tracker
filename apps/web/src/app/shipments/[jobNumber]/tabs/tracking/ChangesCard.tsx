"use client";

import { CountChip, SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import type { TrackingChange } from "@/hooks/useShipmentTracking";
import { businessDateTime, formatDate } from "@/lib/date";
import { EMPTY, EMPTY_STATE, HINT, TD, TH } from "@/styles/ui";
import { personOrSystem } from "./RecordedBy";
import { movedDaysLabel } from "./trackingText";
import { DATE_TEXT, MAIN_TEXT, TABLE, TABLE_BOX, TBODY, TROW } from "./trackingUi";

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
        <div className={TABLE_BOX}>
          <table className={`${TABLE} min-w-[760px]`}>
            <thead>
              <tr>
                <th scope="col" className={`${TH} w-[150px]`}>When</th>
                {/* From and To share what is left, so a long port name has room */}
                <th scope="col" className={`${TH} w-[170px]`}>What</th>
                <th scope="col" className={TH}>From</th>
                <th scope="col" className={TH}>To</th>
                <th scope="col" className={`${TH} w-[96px]`}>Moved</th>
                <th scope="col" className={`${TH} w-[200px]`}>Who</th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {changes.map((c) => (
                <tr key={c.id} className={TROW}>
                  <td className={`${TD} ${DATE_TEXT}`}>{businessDateTime(c.at)}</td>
                  <td className={`${TD} ${MAIN_TEXT}`}>{c.label}</td>
                  <td className={`${TD} tabular-nums ${c.isDate ? "whitespace-nowrap" : "break-words"}`}><Value change={c} value={c.oldValue} /></td>
                  <td className={`${TD} tabular-nums ${c.isDate ? "whitespace-nowrap" : "break-words"}`}><Value change={c} value={c.newValue} /></td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {c.movedDays ? <Pill tone={c.movedDays > 0 ? "amber" : "slate"}>{movedDaysLabel(c.movedDays)}</Pill> : <span className={EMPTY}>—</span>}
                  </td>
                  <td className={`${TD} truncate`}>{personOrSystem(c.by)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {capped && <p className={`${HINT} m-0 px-6 pb-4 -mt-1`}>Showing the newest {changes.length} changes.</p>}
    </SectionCard>
  );
}
