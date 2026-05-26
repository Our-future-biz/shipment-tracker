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
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            background: danger ? "#fee2e2" : "#e0e7ff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {danger ? "\u26A0\uFE0F" : "\u2139\uFE0F"}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", marginBottom: 4 }}>
            {title}
          </div>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.5 }}>{description}</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
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
