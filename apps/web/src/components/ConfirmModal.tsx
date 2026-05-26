"use client";

import { Modal, Button } from "antd";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  danger = false,
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={380}
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
        <div>
          <div className="text-[15px] font-semibold text-slate-800 mb-1">
            {title}
          </div>
          <div className="text-sm text-slate-500 leading-relaxed">{description}</div>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button onClick={onClose}>Cancel</Button>
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
