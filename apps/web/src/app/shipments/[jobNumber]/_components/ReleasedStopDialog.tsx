"use client";

import { useState } from "react";
import { Modal } from "antd";
import { OverrideReasonField, ReleaseStopAlert, useCanOverrideReleaseStop } from "@/components/finance/ReleasePaymentWarning";
import { apiErrorMessage } from "@/lib/api";
import { overrideReasonOk, releaseStopOf, type ReleaseStop } from "@/lib/paymentWarnings";
import { useToast } from "@/lib/toast";
import { BTN, BTN_PRIMARY } from "@/styles/ui";

// Warehouse Released set by hand on the shipment's detail, on a job on prepayment that is not paid (Accounts
// Receivable step 7): the server refused it with its sentence, shown as it is. A manager may send the same edit
// again with a reason (recorded with the release); a user only reads the sentence - a manager can release it.

/** The stop, and the same edit to send again with a manager's reason (useShipmentMutations' updateField). */
export interface ReleasedStop {
  stop: ReleaseStop;
  resend: (reason: string) => Promise<void>;
}

export function ReleasedStopDialog({ value, onClose }: { value: ReleasedStop | null; onClose: () => void }) {
  return value ? <StopDialog key={value.stop.message} value={value} onClose={onClose} /> : null;
}

function StopDialog({ value, onClose }: { value: ReleasedStop; onClose: () => void }) {
  const toast = useToast();
  const manager = useCanOverrideReleaseStop();
  const [stop, setStop] = useState(value.stop);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const send = () => {
    if (!overrideReasonOk(reason) || sending) return;
    setSending(true);
    setError("");
    value
      .resend(reason.trim())
      .then(() => {
        toast.success("Warehouse Released set, with your reason");
        onClose();
      })
      .catch((e) => {
        // Stopped again (its payment could not be checked this time, say): the server's new sentence.
        const again = releaseStopOf(e);
        if (again) setStop(again);
        else setError(apiErrorMessage(e));
      })
      .finally(() => setSending(false));
  };

  return (
    <Modal
      open
      title="Warehouse Released was not set"
      width={520}
      onCancel={() => !sending && onClose()}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={sending} className={BTN}>
            {manager ? "Cancel" : "Close"}
          </button>
          {manager && (
            <button type="button" onClick={send} disabled={sending || !overrideReasonOk(reason)} className={BTN_PRIMARY}>
              {sending ? "Releasing…" : "Release with this reason"}
            </button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <ReleaseStopAlert message={stop.message} label="Warehouse Released" />
        {manager && <OverrideReasonField value={reason} onChange={setReason} disabled={sending} />}
        <div aria-live="polite">{error && <div className="text-[13px] text-red-600">Not released: {error}</div>}</div>
      </div>
    </Modal>
  );
}
