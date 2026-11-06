"use client";

import { useState } from "react";
import { CountChip, PillTabs, SectionCard } from "@/components/SectionCard";
import { Pill } from "@/components/Pill";
import { useTrackingActions, type TrackingEventItem } from "@/hooks/useShipmentTracking";
import { apiErrorMessage } from "@/lib/api";
import { businessDateTime, formatDate } from "@/lib/date";
import { BTN_GHOST, BTN_PRIMARY, BTN_SM, EMPTY_STATE, HINT, REF, TD, TH } from "@/styles/ui";
import { personOrSystem } from "./RecordedBy";
import { ReasonModal } from "./ReasonModal";

interface EventsCardProps {
  shipmentId: string;
  events: readonly TrackingEventItem[];
  mayChangeDetails: boolean;
  /** The shipment's container numbers: with more than one, the events can be read per container. */
  containers?: readonly string[];
}

/** Every stored fact, a date waiting to be confirmed first: where it was, where it came from, and what can be done with it. */
export function EventsCard({ shipmentId, events, mayChangeDetails, containers = [] }: EventsCardProps) {
  const { confirm, dismiss, strike } = useTrackingActions(shipmentId);
  const [striking, setStriking] = useState<TrackingEventItem | null>(null);
  const [container, setContainer] = useState("");
  // An event about the shipment as a whole is about every box on it.
  const shown = [...events].filter((e) => e.effect !== "dismissed" && (!container || !e.containerNumber || e.containerNumber === container)).sort((a, b) => Number(b.effect === "proposed") - Number(a.effect === "proposed"));
  const busy = confirm.isPending || dismiss.isPending;

  return (
    <SectionCard title="Events" extra={<CountChip count={shown.length} />} bodyClassName="p-0">
      {containers.length > 1 && (
        <div className="px-4 pt-3">
          <PillTabs tabs={[{ key: "", label: "All containers" }, ...containers.map((c) => ({ key: c, label: c }))]} active={container} onChange={setContainer} />
        </div>
      )}
      {shown.length === 0 ? (
        <p className={EMPTY_STATE}>No events yet. The Gate Log, Trucking and what people record land here.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse [&_td:first-child]:!pl-4 [&_th:first-child]:!pl-4">
            <thead>
              <tr>
                <th className={TH}>When</th>
                <th className={TH}>Event</th>
                <th className={TH}>Where</th>
                <th className={TH}>Note</th>
                <th className={TH}>Recorded</th>
                <th className={TH} aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className={`${TD} tabular-nums whitespace-nowrap`}>
                    {formatDate(e.occurredOn)}
                    {e.occurredTime && ` ${e.occurredTime}`}
                  </td>
                  <td className={TD}>
                    <span className="font-medium text-slate-900">{e.label}</span>
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
                    <span className={HINT}>{[e.source, e.by || (e.source ? "" : personOrSystem("")), businessDateTime(e.recordedAt)].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className={`${TD} whitespace-nowrap text-right`}>
                    {e.effect === "proposed" && mayChangeDetails && (
                      <span className="inline-flex gap-1">
                        <button type="button" disabled={busy} onClick={() => confirm.mutate(e.id)} className={`${BTN_PRIMARY} ${BTN_SM}`}>Confirm</button>
                        <button type="button" disabled={busy} onClick={() => dismiss.mutate(e.id)} className={`${BTN_GHOST} ${BTN_SM}`}>Dismiss</button>
                      </span>
                    )}
                    {e.strikeable && e.effect !== "proposed" && (
                      <button type="button" onClick={() => setStriking(e)} className={`${BTN_GHOST} ${BTN_SM}`}>Strike</button>
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
