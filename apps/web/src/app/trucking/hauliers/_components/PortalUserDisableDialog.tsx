"use client";

import { useState } from "react";
import { Button, Input, Modal } from "antd";

const MIN_REASON = 3;
const MAX_REASON = 500;

interface PortalUserDisableDialogProps {
  /** The user to disable; null closes the dialog. */
  userName: string | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

// Disable… a portal user with the reason the log keeps; laid out like ConfirmModal.
export const PortalUserDisableDialog = ({ userName, loading, onClose, onConfirm }: PortalUserDisableDialogProps) => {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const valid = trimmed.length >= MIN_REASON && trimmed.length <= MAX_REASON;

  return (
    <Modal open={userName !== null} onCancel={loading ? undefined : onClose} footer={null} width={440} closable={false} destroyOnHidden afterClose={() => setReason("")}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 bg-red-100">⛔</div>
        <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          <div className="text-[15px] font-semibold text-slate-800 mb-1">Disable {userName}?</div>
          <div className="text-sm text-slate-500 leading-relaxed mb-3">The user is signed out at once and cannot sign in to the haulier portal until a manager enables it again.</div>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Reason (required)</span>
            <Input.TextArea
              aria-label="Reason for disabling"
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
        <Button type="primary" danger disabled={!valid} loading={loading} onClick={() => onConfirm(trimmed)}>
          Disable user
        </Button>
      </div>
    </Modal>
  );
};
