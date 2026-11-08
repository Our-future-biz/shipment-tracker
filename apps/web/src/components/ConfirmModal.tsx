"use client";

import { Modal, Button } from "antd";
import { MODAL_TITLE } from "@/styles/ui";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Text, or text with a part marked out (a bold reference). */
  title: React.ReactNode;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  /** Wider than the usual 380px, for a title that should stay on one line. */
  width?: number;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  loading = false,
  width = 380,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={width}
      closable={false}
      destroyOnHidden
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 ${
            danger ? "bg-red-100" : "bg-indigo-100"
          }`}
        >
          {danger ? "\u26A0\uFE0F" : "\u2139\uFE0F"}
        </div>
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <div className={`${MODAL_TITLE} mb-1`}>
            {title}
          </div>
          <div className="text-[13px] text-slate-700 leading-relaxed">{description}</div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button onClick={onClose}>{cancelLabel}</Button>
        <Button
          type="primary"
          danger={danger}
          onClick={onConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
