"use client";

import { useState } from "react";
import { Alert, Button, DatePicker, Input, Select, TimePicker } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { AppModal } from "@/components/AppModal";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useTrackingActions, type ShipmentTracking, type TrackingRecordableKind } from "@/hooks/useShipmentTracking";
import { apiErrorMessage } from "@/lib/api";
import { addDays, businessToday } from "@/lib/date";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { mayLieAhead } from "./trackingText";

const GROUPS: { key: TrackingRecordableKind["group"]; label: string }[] = [
  { key: "milestone", label: "Milestones" },
  { key: "exception", label: "Exceptions" },
  { key: "note", label: "Note" },
];

/** Where a kind usually happens, so the place needn't be typed. */
function placeOf(kind: string, shipment: ShipmentItem): string {
  if (kind === "loaded" || kind === "departed") return shipment.pol ?? "";
  if (kind === "arrived" || kind === "discharged" || kind === "terminal_out") return shipment.pod ?? "";
  if (kind === "hub_arrived") return shipment.hub ?? "";
  if (kind === "delivered") return shipment.destination ?? "";
  return "";
}

interface RecordEventModalProps {
  shipment: ShipmentItem;
  tracking: ShipmentTracking;
  initialKind?: string;
  /** The checklist tick this event comes with. */
  taskKey?: string;
  onClose: () => void;
}

/** A dated fact: what, when, where, which container, and why when it needs a reason. */
export function RecordEventModal({ shipment, tracking, initialKind, taskKey, onClose }: RecordEventModalProps) {
  const { record } = useTrackingActions(shipment.id);
  const firstKind = initialKind ?? tracking.recordable[0]?.kind ?? "";
  const [kind, setKindState] = useState(firstKind);
  // Today on the company's calendar (Prague), wherever the browser is.
  const today = businessToday();
  const [day, setDay] = useState<Dayjs | null>(dayjs(today));
  const [time, setTime] = useState<Dayjs | null>(null);
  const [place, setPlace] = useState(placeOf(firstKind, shipment));
  const [container, setContainer] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  // What has happened can't be in the future; the server lets it be tomorrow, as a port ahead of
  // Prague can already be. A new ETD or ETA is a plan, and may lie ahead.
  const latestDay = addDays(today, 1);
  const tooLate = (d: Dayjs | null, k: string) => !!d && !mayLieAhead(tracking.recordable.find((r) => r.kind === k)?.sets) && d.format("YYYY-MM-DD") > latestDay;

  const setKind = (next: string) => {
    setKindState(next);
    setPlace(placeOf(next, shipment));
    if (tooLate(day, next)) setDay(dayjs(today));
  };

  const def = tracking.recordable.find((r) => r.kind === kind);
  const containers = (shipment.containers ?? []).map((c) => c.containerNumber).filter(Boolean);
  // The server refuses it too; said here before anyone types.
  const lockedByInvoice = !!def?.taxDate && tracking.taxDate.invoiced === true;
  const canSave = !!def && !!day && !tooLate(day, kind) && (!def.reasonRequired || !!note.trim()) && !lockedByInvoice;

  const save = () => {
    if (!canSave) return;
    setError(null);
    record.mutate(
      {
        kind,
        occurredOn: day.format("YYYY-MM-DD"),
        occurredTime: time ? time.format("HH:mm") : undefined,
        place: place.trim() || undefined,
        containerNumber: container || undefined,
        note: note.trim() || undefined,
        taskKey,
      },
      { onSuccess: onClose, onError: (err) => setError(apiErrorMessage(err)) },
    );
  };

  return (
    <AppModal
      open
      onClose={onClose}
      title="Record an event"
      subtitle={shipment.jobNumber ?? undefined}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={record.isPending} disabled={!canSave} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {error && <Alert type="error" showIcon message={error} />}
        <div>
          <label htmlFor="tracking-kind" className={LABEL_TEXT}>Event</label>
          <Select
            id="tracking-kind"
            className="w-full mt-1"
            value={kind}
            onChange={setKind}
            disabled={!!taskKey}
            showSearch
            optionFilterProp="label"
            options={GROUPS.map((g) => ({
              label: g.label,
              options: tracking.recordable.filter((r) => r.group === g.key).map((r) => ({ value: r.kind, label: r.label })),
            })).filter((g) => g.options.length > 0)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tracking-day" className={LABEL_TEXT}>Date</label>
            <DatePicker id="tracking-day" className="w-full mt-1" format="DD.MM.YYYY" value={day} onChange={setDay} allowClear={false} disabledDate={(d) => tooLate(d, kind)} />
          </div>
          <div>
            <label htmlFor="tracking-time" className={LABEL_TEXT}>Time, Prague (if known)</label>
            <TimePicker id="tracking-time" className="w-full mt-1" format="HH:mm" minuteStep={5} needConfirm={false} value={time} onChange={setTime} />
          </div>
        </div>
        <div>
          <label htmlFor="tracking-place" className={LABEL_TEXT}>Place</label>
          <Input id="tracking-place" className="mt-1" maxLength={200} value={place} onChange={(e) => setPlace(e.target.value)} />
        </div>
        {containers.length > 1 && (
          <div>
            <label htmlFor="tracking-container" className={LABEL_TEXT}>Container</label>
            <Select
              id="tracking-container"
              className="w-full mt-1"
              value={container}
              onChange={setContainer}
              options={[{ value: "", label: "All containers" }, ...containers.map((c) => ({ value: c, label: c }))]}
            />
          </div>
        )}
        <div>
          <label htmlFor="tracking-note" className={LABEL_TEXT}>{def?.reasonRequired ? "Reason" : "Note"}</label>
          <Input.TextArea id="tracking-note" className="mt-1" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {lockedByInvoice ? (
          <Alert type="warning" showIcon message={`The ${def?.sets} can't change: the job is invoiced. Credit the invoice first.`} />
        ) : (
          def?.taxDate && <Alert type="info" showIcon message={`This sets the ${def.sets}. It can be the job's tax date, and the ČNB rate locks on it.`} />
        )}
        {!lockedByInvoice && def?.sets && !def.taxDate && <p className={`${HINT} m-0`}>This sets the {def.sets}.</p>}
      </div>
    </AppModal>
  );
}
