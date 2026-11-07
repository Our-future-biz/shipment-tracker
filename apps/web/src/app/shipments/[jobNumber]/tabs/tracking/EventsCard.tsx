"use client";

import { useState } from "react";
import { CountChip, PillTabs, SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import { useTrackingActions, type TrackingEventItem } from "@/hooks/useShipmentTracking";
import { apiErrorMessage } from "@/lib/api";
import { businessDateTime, formatDate } from "@/lib/date";
import { BTN_BAR, BTN_BAR_PRIMARY, EMPTY_STATE, HINT, REF, TD, TH } from "@/styles/ui";
import { CELL_LINE, DATE_TEXT, MAIN_TEXT, TABLE, TABLE_BOX, TBODY, TROW } from "./trackingUi";
import { personOrSystem } from "./RecordedBy";
import { ReasonModal } from "./ReasonModal";

interface EventsCardProps {
  shipmentId: string;
  events: readonly TrackingEventItem[];
  mayChangeDetails: boolean;
  /** Whether this person may record (and so strike) an event of this kind: the server's rule. */
  mayRecord: (kind: string) => boolean;
  /** The shipment's container numbers: with more than one, the events can be read per container. */
  containers?: readonly string[];
}

/** Every stored fact, a date waiting to be confirmed first: where it was, where it came from, and what can be done with it. */
export function EventsCard({ shipmentId, events, mayChangeDetails, mayRecord, containers = [] }: EventsCardProps) {
  const { confirm, dismiss, strike } = useTrackingActions(shipmentId);
  const [striking, setStriking] = useState<TrackingEventItem | null>(null);
  const [container, setContainer] = useState("");
  // An event about the shipment as a whole is about every box on it.
  const shown = [...events].filter((e) => e.effect !== "dismissed" && (!container || !e.containerNumber || e.containerNumber === container)).sort((a, b) => Number(b.effect === "proposed") - Number(a.effect === "proposed"));
  const busy = confirm.isPending || dismiss.isPending;

  return (
    <SectionCard title="Events" extra={<CountChip count={shown.length} />} bodyClassName="p-0">
      {containers.length > 1 && (
        <div className="px-6 pt-4">
          <PillTabs tabs={[{ key: "", label: "All containers" }, ...containers.map((c) => ({ key: c, label: c }))]} active={container} onChange={setContainer} />
        </div>
      )}
      {shown.length === 0 ? (
        <p className={EMPTY_STATE}>No events yet. The Gate Log, Trucking and what people record land here.</p>
      ) : (
        // Under the container tabs the table keeps a shorter gap, so the tabs read as its filter.
        <div className={`${TABLE_BOX} ${containers.length > 1 ? "pt-3" : ""}`}>
          <table className={`${TABLE} min-w-[1000px]`}>
            <thead>
              <tr>
                <th scope="col" className={`${TH} w-[150px]`}>When</th>
                <th scope="col" className={TH}>Event</th>
                <th scope="col" className={`${TH} w-[140px]`}>Where</th>
                <th scope="col" className={`${TH} w-[14%]`}>Note</th>
                {/* cut with "…" (the whole of it in its title), so the Event keeps the room it needs */}
                <th scope="col" className={`${TH} w-[240px]`}>Recorded</th>
                <th scope="col" className={`${TH} w-[170px]`}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className={TBODY}>
              {shown.map((e) => (
                <tr key={e.id} className={TROW}>
                  <td className={`${TD} ${DATE_TEXT}`}>
                    {formatDate(e.occurredOn)}
                    {e.occurredTime && ` ${e.occurredTime}`}
                  </td>
                  <td className={TD}>
                    <span className={MAIN_TEXT}>{e.label}</span>
                    {e.effect === "proposed" && <Pill tone="indigo" className="ml-2">Sets the {e.sets} once confirmed</Pill>}
                    {e.resolvedAt && <Pill tone="slate" className="ml-2">Closed</Pill>}
                  </td>
                  <td className={TD}>
                    {e.place}
                    {e.vessel && <div className={HINT}>{e.vessel}</div>}
                    {e.containerNumber && <div className={`${HINT} ${REF}`}>{e.containerNumber}</div>}
                  </td>
                  <td className={TD}>{e.note}</td>
                  <td className={TD}>
                    {(() => {
                      const text = [e.source, e.by || (e.source ? "" : personOrSystem("")), businessDateTime(e.recordedAt)].filter(Boolean).join(" · ");
                      return <span className={CELL_LINE} title={text}>{text}</span>;
                    })()}
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    {e.effect === "proposed" && mayChangeDetails && (
                      <span className="inline-flex gap-1">
                        <button type="button" disabled={busy} onClick={() => confirm.mutate(e.id)} className={`${BTN_BAR_PRIMARY}`}>Confirm</button>
                        <button type="button" disabled={busy} onClick={() => dismiss.mutate(e.id)} className={`${BTN_BAR}`}>Dismiss</button>
                      </span>
                    )}
                    {e.strikeable && e.effect !== "proposed" && mayRecord(e.kind) && (
                      <button type="button" onClick={() => setStriking(e)} className={`${BTN_BAR}`}>Strike</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {striking && (
        <ReasonModal
          title={`Strike: ${striking.label} ${formatDate(striking.occurredOn)}`}
          description={
            striking.effect === "applied" && striking.sets && striking.sets !== "ETA" && striking.sets !== "ETD" && striking.sets !== "customs status"
              ? `This also clears the ${striking.sets}, if it is still this date.`
              : "The event goes away. Your reason is kept in the shipment's log."
          }
          confirmLabel="Strike"
          onClose={() => setStriking(null)}
          onConfirm={async (reason) => {
            try {
              await strike.mutateAsync({ eventId: striking.id, reason });
              return null;
            } catch (err) {
              return apiErrorMessage(err);
            }
          }}
        />
      )}
    </SectionCard>
  );
}
