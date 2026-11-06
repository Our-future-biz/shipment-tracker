"use client";

import { useState } from "react";
import { Alert, Button, Checkbox, DatePicker, InputNumber, Select } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { AppModal } from "@/components/AppModal";
import type { ShipmentItem } from "@/hooks/useShipments";
import { useTrackingActions, type TrackingContainerClock } from "@/hooks/useShipmentTracking";
import { apiErrorMessage } from "@/lib/api";
import { HINT, LABEL_TEXT } from "@/styles/ui";

const FROM_OPTIONS = [
  { value: "discharge", label: "Discharge" },
  { value: "gate_out", label: "Leaving the terminal" },
];

interface FreeTimeModalProps {
  shipment: ShipmentItem;
  clock: TrackingContainerClock;
  clocks: readonly TrackingContainerClock[];
  onClose: () => void;
}

/** The free time the booking gives a box, or the last free day the carrier stated. */
export function FreeTimeModal({ shipment, clock, clocks, onClose }: FreeTimeModalProps) {
  const { setFreeTime } = useTrackingActions(shipment.id);
  const [days, setDays] = useState<number | null>(clock.freeTimeDays ?? null);
  const [from, setFrom] = useState(clock.freeTimeFrom || "discharge");
  const [stated, setStated] = useState<Dayjs | null>(clock.lastFreeDayStated ? dayjs(clock.lastFreeDayStated) : null);
  const [allBoxes, setAllBoxes] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    setError(null);
    setFreeTime.mutate(
      {
        containerIds: allBoxes ? clocks.map((c) => c.containerId) : [clock.containerId],
        freeTimeDays: days,
        freeTimeFrom: from,
        lastFreeDay: stated ? stated.format("YYYY-MM-DD") : null,
      },
      { onSuccess: onClose, onError: (err) => setError(apiErrorMessage(err)) },
    );
  };

  return (
    <AppModal
      open
      onClose={onClose}
      title="Free time"
      subtitle={clock.containerNumber}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="primary" loading={setFreeTime.isPending} onClick={save}>
            Save
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {error && <Alert type="error" showIcon message={error} />}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="free-days" className={LABEL_TEXT}>Free days</label>
            <InputNumber id="free-days" className="!w-full mt-1" min={0} max={365} precision={0} value={days} onChange={setDays} />
          </div>
          <div>
            <label htmlFor="free-from" className={LABEL_TEXT}>Counted from</label>
            <Select id="free-from" className="w-full mt-1" value={from} onChange={setFrom} options={FROM_OPTIONS} />
          </div>
        </div>
        <div>
          <label htmlFor="free-stated" className={LABEL_TEXT}>Last free day the carrier stated</label>
          <DatePicker id="free-stated" className="w-full mt-1" format="DD.MM.YYYY" value={stated} onChange={setStated} />
        </div>
        <p className={`${HINT} m-0`}>The day after the start is the first free day. A date the carrier stated wins over counting. The clock stops when the empty&apos;s return is recorded.</p>
        {clocks.length > 1 && (
          <Checkbox checked={allBoxes} onChange={(e) => setAllBoxes(e.target.checked)}>
            The same for all {clocks.length} containers
          </Checkbox>
        )}
      </div>
    </AppModal>
  );
}
