"use client";

import { Modal } from "antd";
import { HINT, MODAL_TITLE } from "@/styles/ui";
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
          <div className={MODAL_TITLE}>{title}</div>
          {subtitle && (
            <div className={`${HINT} font-normal mt-0.5`}>
              {subtitle}
            </div>
          )}
        </div>
      }
      width={SIZE_MAP[size]}
      footer={footer}
      destroyOnHidden={destroyOnHidden}
      classNames={{ footer: "!border-t !border-slate-200 !pt-3" }}
    >
      {children}
    </Modal>
  );
}
