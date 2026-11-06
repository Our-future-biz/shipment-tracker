"use client";

import { Modal } from "antd";
import { HINT, MODAL_TITLE } from "@/styles/ui";
import type { ReactNode } from "react";

type ModalSize = "small" | "medium" | "large" | "xlarge";

const SIZE_MAP: Record<ModalSize, number> = {
  small: 380,
  medium: 480,
  large: 820,
  /** A whole working panel in a dialog (Issue invoice from the shipment's Costs Breakdown). */
  xlarge: 1240,
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
  /** false: a click beside the dialog leaves it open (a dialog holding work typed into it). */
  maskClosable?: boolean;
  /** false: the dialog can't be closed for now - no close button, Esc does nothing (while it saves). */
  closable?: boolean;
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
  maskClosable = true,
  closable = true,
}: AppModalProps) {
  return (
    <Modal
      open={open}
      onCancel={() => closable && onClose()}
      maskClosable={maskClosable && closable}
      closable={closable}
      keyboard={closable}
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
