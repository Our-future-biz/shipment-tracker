"use client";

import { Modal } from "antd";
import type { ReactNode } from "react";

type ModalSize = "small" | "medium" | "large";

const SIZE_MAP: Record<ModalSize, number> = {
  small: 380,
  medium: 480,
  large: 820,
};

interface AppModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: ModalSize;
  footer?: ReactNode;
  children: ReactNode;
  destroyOnHidden?: boolean;
}

export function AppModal({
  open,
  onClose,
  title,
  subtitle,
  size = "medium",
  footer,
  children,
  destroyOnHidden = true,
}: AppModalProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={
        <div>
          <div className="text-base font-semibold">{title}</div>
          {subtitle && (
            <div className="text-xs text-slate-500 font-normal mt-0.5">
              {subtitle}
            </div>
          )}
        </div>
      }
      width={SIZE_MAP[size]}
      footer={footer}
      destroyOnHidden={destroyOnHidden}
      styles={{
        body: { padding: "16px 24px" },
        footer: {
          padding: "12px 24px",
          borderTop: "1px solid #e2e8f0",
          background: "#fafbfc",
        },
      }}
    >
      {children}
    </Modal>
  );
}
