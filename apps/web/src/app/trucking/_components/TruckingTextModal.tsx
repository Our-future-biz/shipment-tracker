"use client";

import { useState, type ReactNode } from "react";
import { Input, Modal } from "antd";

interface TruckingTextModalProps {
  title: string;
  /** What happens, in a sentence or two. */
  hint: ReactNode;
  placeholder: string;
  okText: string;
  danger?: boolean;
  /** The text must have at least this many characters (a reason: 3). 0 = optional. */
  minLength?: number;
  onClose: () => void;
  /** Rejects to keep the dialog open with the text typed (the caller reports the error). */
  onSubmit: (text: string) => Promise<unknown>;
}

// A dialog asking for one text before an action: the reason of a cancel, a margin approval or a
// voided stamp, the note of a confirmation. Rendered only while open, so each opening starts empty.
export const TruckingTextModal = ({ title, hint, placeholder, okText, danger, minLength = 3, onClose, onSubmit }: TruckingTextModalProps) => {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = text.trim().length >= minLength;

  const handleOk = async () => {
    setBusy(true);
    try {
      await onSubmit(text.trim());
      onClose();
    } catch {
      // Reported by the caller; the text stays for another try.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={title} okText={okText} okButtonProps={{ danger, disabled: !ready }} confirmLoading={busy} onOk={handleOk} onCancel={onClose} destroyOnHidden>
      <div className="mb-2 text-[13px] text-slate-600">{hint}</div>
      <Input.TextArea autoFocus aria-label={placeholder} autoSize={{ minRows: 3, maxRows: 6 }} maxLength={500} placeholder={placeholder} value={text} onChange={(e) => setText(e.target.value)} />
    </Modal>
  );
};
