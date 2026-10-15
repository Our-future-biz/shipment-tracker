"use client";

import { useState } from "react";
import { Button, Input, Modal } from "antd";

const MIN_REASON = 3;
const MAX_REASON = 500;

interface HaulierBlockDialogProps {
  open: boolean;
  /** Block or unblock: the words and the button follow it. */
  mode: "block" | "unblock";
  companyName: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

// Block… / Unblock… with the reason the log keeps; laid out like ConfirmModal, with a required reason.
export const HaulierBlockDialog = ({ open, mode, companyName, loading, onClose, onConfirm }: HaulierBlockDialogProps) => {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON;
  const block = mode === "block";

  return (
    <Modal open={open} onCancel={loading ? undefined : onClose} footer={null} width={440} closable={false} destroyOnHidden afterClose={() => setReason("")}>
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 ${block ? "bg-red-100" : "bg-indigo-100"}`}>
          {block ? "⛔" : "ℹ️"}
        </div>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <div className="text-[15px] font-semibold text-slate-800 mb-1">{block ? `Block ${companyName}?` : `Unblock ${companyName}?`}</div>
          <div className="text-sm text-slate-500 leading-relaxed mb-3">
            {block
              ? "A blocked haulier cannot be put on a trip until a manager unblocks it."
              : "The haulier can be put on trips again, unless its insurance, licence or VAT status still blocks it."}
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Reason (required)</span>
            <Input.TextArea
              aria-label={block ? "Reason for blocking" : "Reason for unblocking"}
              autoFocus
              autoSize={{ minRows: 3, maxRows: 8 }}
              maxLength={MAX_REASON}
              showCount
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="primary" danger={block} disabled={!valid} loading={loading} onClick={() => onConfirm(trimmed)}>
          {block ? "Block haulier" : "Unblock haulier"}
        </Button>
      </div>
    </Modal>
  );
};
