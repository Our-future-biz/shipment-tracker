"use client";

import { useState } from "react";
import { Button, Input } from "antd";
import { AppModal } from "@/components/AppModal";
import { HINT, LABEL_TEXT } from "@/styles/ui";
import { CANCEL_REASON_MAX, cancelReasonOk } from "./cancelReason";

interface CancelReasonDialogProps {
  /** The job's reference, named in the title. */
  jobNumber?: string | null;
  /** "cancel": the status is being set to Cancelled Shipment; "change": the reason of a cancelled job is changed. */
  mode?: "cancel" | "change";
  /** The reason as it stands (a job cancelled before keeps its reason when it is cancelled again). */
  initial?: string | null;
  onClose: () => void;
  /** The reason, trimmed; the caller saves it (with the status, when cancelling) in one write. */
  onConfirm: (reason: string) => void;
}

/**
 * Why the shipment is cancelled (Council Outlay 11, D22): asked when its status is set to Cancelled
 * Shipment, in the grid or on its page, and sent with the status in one write. Nothing is saved
 * without a reason; closing the dialog leaves the status as it was.
 */
export function CancelReasonDialog({ jobNumber, mode = "cancel", initial, onClose, onConfirm }: CancelReasonDialogProps) {
  const [reason, setReason] = useState(initial ?? "");
  const ok = cancelReasonOk(reason);
  const confirm = () => {
    if (ok) onConfirm(reason.trim());
  };
  const job = jobNumber ? ` ${jobNumber}` : "";
  return (
    // Holds what was typed: a click beside it leaves it open.
    <AppModal
      open
      maskClosable={false}
      onClose={onClose}
      title={mode === "cancel" ? `Cancel shipment${job}?` : `Why shipment${job} is cancelled`}
      subtitle={mode === "cancel" ? "Say why it is cancelled: the reason is kept on the job and in its history." : undefined}
      size="medium"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{mode === "cancel" ? "Keep the status" : "Close"}</Button>
          <Button type="primary" danger={mode === "cancel"} disabled={!ok} onClick={confirm}>
            {mode === "cancel" ? "Cancel the shipment" : "Save the reason"}
          </Button>
        </div>
      }
    >
      <label className="flex flex-col gap-1.5 py-1">
        <span className={LABEL_TEXT}>Reason</span>
        <Input.TextArea
          autoFocus
          autoSize={{ minRows: 3, maxRows: 8 }}
          maxLength={CANCEL_REASON_MAX}
          value={reason}
          placeholder="e.g. The customer cancelled the order"
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl / ⌘ + Enter saves; Enter alone starts a new line.
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) confirm();
          }}
        />
        {!ok && <span className={HINT}>{mode === "cancel" ? "A reason is needed to cancel the shipment." : "The reason can't be left empty."}</span>}
      </label>
    </AppModal>
  );
}
