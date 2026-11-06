"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Button, Input } from "antd";
import { AppModal } from "@/components/AppModal";

interface ReasonModalProps {
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  /** Answers why it failed, or null when done: the dialog then closes. */
  onConfirm: (reason: string) => Promise<string | null>;
}

/** Asks why before something is taken back. */
export function ReasonModal({ title, description, confirmLabel, onClose, onConfirm }: ReasonModalProps) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The modal takes the focus for itself as it opens; the cursor belongs in the box after that.
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => box.current?.querySelector("textarea")?.focus(), 100);
    return () => clearTimeout(timer);
  }, []);

  const confirm = async () => {
    setSaving(true);
    const failure = await onConfirm(reason.trim());
    setSaving(false);
    if (failure) setError(failure);
    else onClose();
  };

  return (
    <AppModal
      open
      onClose={onClose}
      title={title}
      subtitle={description}
      size="small"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button danger type="primary" loading={saving} disabled={!reason.trim()} onClick={confirm}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {error && <Alert type="error" showIcon message={error} />}
        <div ref={box}>
          <label className="block text-[13px] text-slate-700">
            Reason
            <Input.TextArea id="reason-text" className="mt-1" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </div>
      </div>
    </AppModal>
  );
}
