"use client";

import { useState } from "react";
import dayjs from "dayjs";
import { Alert, DatePicker, Modal, Radio } from "antd";
import type { StampKind } from "@/hooks/useTruckingConsignments";
import { addDays, businessToday } from "@/lib/date";
import { STAMP_LABELS, stampTimeProblem } from "../../_lib/consignments";

const MEANING: Record<StampKind, string> = {
  confirmed: "The haulier confirmed the transport order.",
  pickedUp: "The goods were loaded at the pick-up site.",
  delivered: "The goods were handed over at the delivery site. The job's actual delivery date is written to Shipments.",
  podReceived: "The signed proof of delivery is in. When every consignment of the job has its POD, the job's Shipment Status moves to Billing.",
};

interface StampModalProps {
  kind: StampKind;
  /** A manager stamping POD received without a POD document: said in the dialog. */
  note?: string;
  onClose: () => void;
  /** null = now. Rejects to keep the dialog open (the caller reports the error). */
  onSubmit: (at: string | null) => Promise<unknown>;
}

// Stamps a step of a consignment, now or at an earlier time (up to 7 days back). Stamps are final:
// a manager may void one, with a reason, and the history keeps both.
export const StampModal = ({ kind, note, onClose, onSubmit }: StampModalProps) => {
  const [when, setWhen] = useState<"now" | "earlier">("now");
  const [at, setAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = when === "now" ? null : at;
  const problem = when === "earlier" ? (at ? stampTimeProblem(at) : "Pick the time") : null;
  const label = STAMP_LABELS[kind];

  const handleOk = async () => {
    setBusy(true);
    try {
      await onSubmit(chosen);
      onClose();
    } catch {
      // Reported by the caller.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`Stamp ${label}`} okText={`Stamp ${label}`} okButtonProps={{ disabled: !!problem }} confirmLoading={busy} onOk={handleOk} onCancel={onClose} destroyOnHidden>
      <p className="mt-0 text-[13px] text-slate-600">{MEANING[kind]} Stamps are final; a manager can void one with a reason, and the history keeps both.</p>
      {note && <Alert className="mb-3" type="info" showIcon message={note} />}
      <Radio.Group
        aria-label="When"
        value={when}
        onChange={(e) => setWhen(e.target.value)}
        options={[
          { value: "now", label: "Now" },
          { value: "earlier", label: "Earlier (up to 7 days back)" },
        ]}
      />
      {when === "earlier" && (
        <div className="mt-3">
          <DatePicker
            aria-label={`${label} time`}
            showTime={{ format: "HH:mm" }}
            format="DD.MM.YYYY HH:mm"
            className="w-full"
            value={at ? dayjs(at) : null}
            // The warehouse's calendar (Prague), not the browser's: today and up to 7 days back.
            disabledDate={(d) => d.format("YYYY-MM-DD") > businessToday() || d.format("YYYY-MM-DD") < addDays(businessToday(), -7)}
            onChange={(d) => setAt(d ? d.toISOString() : null)}
          />
          {problem && at && <div className="mt-1 text-[12px] text-red-600">{problem}</div>}
        </div>
      )}
    </Modal>
  );
};
