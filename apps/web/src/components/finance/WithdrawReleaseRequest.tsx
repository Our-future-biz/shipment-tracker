"use client";

import { useId, useState } from "react";
import { Input, Modal } from "antd";
import { useWithdrawReleaseRequest } from "@/hooks/useReleaseRequests";
import { apiErrorMessage } from "@/lib/api";
import { RELEASE_WHAT_LABEL, type ReleaseWhat } from "@/lib/paymentWarnings";
import { MAX_WITHDRAW_REASON, MIN_WITHDRAW_REASON } from "@/lib/releaseRequestQueue";
import { useToast } from "@/lib/toast";
import { HINT, LABEL_TEXT, LINK } from "@/styles/ui";

// Withdrawing a request to release before payment (Council Outlay 11, K20), with a reason kept with it and in the
// job's history: whoever asked takes back their request while it waits (`kind` "request"), a manager an approval
// nobody has used yet ("approval"), which then lets nothing through. A link-button that opens a small dialog; the
// server checks who may again and refuses what was answered or used meanwhile - its words are shown as they come.

export interface WithdrawReleaseRequestProps {
  request: { id: string; shipmentId: string; what: ReleaseWhat | string; jobNumber?: string };
  kind: "request" | "approval";
  className?: string;
}

export function WithdrawReleaseRequest({ request, kind, className = "" }: WithdrawReleaseRequestProps) {
  const toast = useToast();
  const withdraw = useWithdrawReleaseRequest();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const reasonId = useId();
  const what = RELEASE_WHAT_LABEL[request.what as ReleaseWhat] ?? request.what;
  const ok = reason.trim().length >= MIN_WITHDRAW_REASON;

  const send = () => {
    if (!ok || withdraw.isPending) return;
    setError("");
    withdraw
      .mutateAsync({ id: request.id, shipmentId: request.shipmentId, reason: reason.trim() })
      .then(() => {
        toast.success(kind === "approval" ? `Approval withdrawn${request.jobNumber ? ` — ${request.jobNumber}` : ""}: it lets nothing through any more` : "Request withdrawn");
        setOpen(false);
      })
      .catch((e) => setError(apiErrorMessage(e)));
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReason("");
          setError("");
          setOpen(true);
        }}
        className={`${LINK} whitespace-nowrap text-[12px] font-medium cursor-pointer bg-transparent border-none p-0 ${className}`}
      >
        {kind === "approval" ? "Withdraw approval…" : "Withdraw request…"}
      </button>
      <Modal
        open={open}
        title={kind === "approval" ? "Withdraw the approval" : "Withdraw the request"}
        width={460}
        onCancel={() => !withdraw.isPending && setOpen(false)}
        destroyOnHidden
        okText="Withdraw"
        okButtonProps={{ danger: true, disabled: !ok }}
        confirmLoading={withdraw.isPending}
        onOk={send}
      >
        <div className="flex flex-col gap-2">
          <div className="text-[13px] text-slate-700">
            {kind === "approval"
              ? `${what}${request.jobNumber ? ` of ${request.jobNumber}` : ""}: nobody has used the approval yet. Withdrawn, it lets nothing through. Whoever asked is told under the bell.`
              : `${what}: the request no longer waits for a manager. You can ask again later.`}
          </div>
          <label htmlFor={reasonId} className={`block ${LABEL_TEXT}`}>
            Reason
          </label>
          <Input.TextArea
            id={reasonId}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={withdraw.isPending}
            autoSize={{ minRows: 2, maxRows: 4 }}
            maxLength={MAX_WITHDRAW_REASON}
            placeholder={kind === "approval" ? "Why it may no longer be released before payment" : "Why it is no longer needed (paid meanwhile…)"}
          />
          <div className={HINT}>At least {MIN_WITHDRAW_REASON} characters. Kept with the request and in the job&apos;s history, with your name.</div>
          <div aria-live="polite">{error && <div className="text-[13px] text-red-600">Not withdrawn: {error}</div>}</div>
        </div>
      </Modal>
    </>
  );
}
