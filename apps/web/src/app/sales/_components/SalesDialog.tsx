"use client";

import type { ReactNode } from "react";
import { Modal } from "antd";

// A dialog that is filled in, and one that shows a document.
const WIDTH = { form: 520, reading: 820 } as const;

interface SalesDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  // One grey line under the title, for what the title alone does not say.
  subtitle?: string;
  size?: keyof typeof WIDTH;
  // A request is on its way: the dialog waits for the server's answer, so the X, the mask and
  // Esc are off. The dialog's own buttons are its to disable.
  busy?: boolean;
  // The buttons, left to right: Cancel, then the primary one, named after what it does.
  footer: ReactNode;
  children: ReactNode;
}

// The frame of every Sales dialog that is more than a question (those are ConfirmModal), by the
// rules of the app's form dialogs as the Dashboard's notice dialog draws them: the buttons under a
// rule that runs across the whole dialog, and no way out while a request is running. A closed
// dialog holds nothing, so its form starts anew with every opening and what it asks the server
// for is asked only while it is open. The shared AppModal is not used for it: its footer strip
// sits inside the dialog's padding, and it cannot switch closing off.
export function SalesDialog({ open, onClose, title, subtitle, size = "form", busy = false, footer, children }: SalesDialogProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
      width={WIDTH[size]}
      title={
        subtitle ? (
          <>
            {title}
            <div className="mt-0.5 text-xs font-normal text-slate-500">{subtitle}</div>
          </>
        ) : (
          title
        )
      }
      footer={<div className="-mx-6 px-6 pt-4 border-t border-slate-200 flex justify-end gap-2">{footer}</div>}
      destroyOnHidden
    >
      <div className="pt-2 pb-2">{children}</div>
    </Modal>
  );
}
