"use client";

import { useState } from "react";
import { Modal } from "antd";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateReleaseRequests, useReleasePass } from "@/hooks/useReleaseRequests";
import { AskManagerToRelease, OverrideReasonField, ReleaseStopAlert, useCanOverrideReleaseStop } from "@/components/finance/ReleasePaymentWarning";
import { apiErrorMessage } from "@/lib/api";
import { overrideReasonOk, RELEASE_ON_APPROVAL_NOTE, releaseStopOf, type ReleaseStop } from "@/lib/paymentWarnings";
import { useToast } from "@/lib/toast";
import { BTN, BTN_PRIMARY } from "@/styles/ui";

// Warehouse Released set by hand on the shipment's detail, on a job on prepayment that is not paid (Accounts
// Receivable step 7): the server refused it with its sentence, shown as it is. A manager may send the same edit
// again with a reason (recorded with the release); a user reads the sentence and asks a manager to release it
// (Council Outlay 11, D16). An approval sets nothing: for 7 days it lets Warehouse Released be set once, the usual
// way. Should it arrive while this dialog is still open, the same edit is sent again from here, on the approval.

/** The stop, and the same edit to send again with a manager's reason (useShipmentMutations' updateField). */
export interface ReleasedStop {
  stop: ReleaseStop;
  resend: (reason: string) => Promise<void>;
  /**
   * Asked before anything was sent (mock test council n6): the release check already said the stop will hold
   * the job, so a manager gives the reason up front - nothing was refused yet.
   */
  ahead?: boolean;
}

export function ReleasedStopDialog({ shipmentId, value, onClose }: { shipmentId: string; value: ReleasedStop | null; onClose: () => void }) {
  return value ? <StopDialog key={value.stop.message} shipmentId={shipmentId} value={value} onClose={onClose} /> : null;
}

function StopDialog({ shipmentId, value, onClose }: { shipmentId: string; value: ReleasedStop; onClose: () => void }) {
  const toast = useToast();
  const manager = useCanOverrideReleaseStop();
  const [stop, setStop] = useState(value.stop);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  // A manager approved a request for this release and the approval can still be used: the edit goes through on
  // it, for whoever sends it - no reason is asked for. Read when the dialog opens and every 30 seconds while it
  // is open; until it is read the manager's reason field waits (never shown for a moment over an approval), and
  // when it could not be read the field shows: their own reason is the way that is left.
  const { pass, read: passRead } = useReleasePass(shipmentId, "warehouse");
  const passChecking = passRead === "checking";

  const send = () => {
    if ((!pass && !overrideReasonOk(reason)) || sending) return;
    setSending(true);
    setError("");
    value
      .resend(pass ? "" : reason.trim())
      .then(() => {
        toast.success(pass ? "Warehouse Released set, on the manager's approval" : "Warehouse Released set, with your reason");
        onClose();
      })
      .catch((e) => {
        // Stopped again (its payment could not be checked this time, say): the server's new sentence.
        const again = releaseStopOf(e);
        if (again) setStop(again);
        else setError(apiErrorMessage(e));
      })
      // The approval is used now - or, refused after all, no longer stands: read again either way.
      .finally(() => {
        setSending(false);
        invalidateReleaseRequests(queryClient);
      });
  };

  return (
    <Modal
      open
      title={value.ahead ? "Set Warehouse Released?" : "Warehouse Released was not set"}
      width={520}
      onCancel={() => !sending && onClose()}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={sending} className={BTN}>
            {manager || pass ? "Cancel" : "Close"}
          </button>
          {pass ? (
            <button type="button" onClick={send} disabled={sending} className={BTN_PRIMARY}>
              {sending ? "Releasing…" : "Set it on the approval"}
            </button>
          ) : (
            manager &&
            !passChecking && (
              <button type="button" onClick={send} disabled={sending || !overrideReasonOk(reason)} className={BTN_PRIMARY}>
                {sending ? "Releasing…" : "Release with this reason"}
              </button>
            )
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <ReleaseStopAlert message={stop.message} label="Warehouse Released" />
        {pass && <div className="text-[13px] font-medium text-emerald-700">{RELEASE_ON_APPROVAL_NOTE}</div>}
        {manager && !pass && !passChecking && <OverrideReasonField value={reason} onChange={setReason} disabled={sending} />}
        {/* A user asks a manager; both see where a request already stands. */}
        <AskManagerToRelease shipmentId={shipmentId} what="warehouse" offer />
        <div aria-live="polite">{error && <div className="text-[13px] text-red-600">Not released: {error}</div>}</div>
      </div>
    </Modal>
  );
}
