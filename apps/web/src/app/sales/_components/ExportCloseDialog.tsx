"use client";

import { useState } from "react";
import { Button, Form, Modal } from "antd";
import { MODAL_TITLE } from "@/styles/ui";
import { businessToday, validUntilAfter } from "../_lib/salesQuote";
import { DEFAULT_VALIDITY_DAYS, asksValidity } from "../_lib/statusChange";
import { ValidUntilField } from "./ValidUntilField";
import { EXPORT_CLOSE_LABEL, EXPORT_CLOSE_TITLE, exportCloseDescription } from "../_lib/exportClose";

interface ExportCloseDialogProps {
  quoteNumber: string;
  // The quote's validity as stored.
  validUntil: string | null;
  // Exports and closes, with the date chosen when the dialog asked for one.
  onConfirm: (validUntil?: string) => Promise<void> | void;
  onClose: () => void;
}

// Asked before Export PDF closes a quote that has not gone out yet. Like the lifecycle bar's
// sending, it asks for the validity date only while the quote has no validity that still holds -
// a revision of an expired quote starts with the validity that passed.
export function ExportCloseDialog({ quoteNumber, validUntil, onConfirm, onClose }: ExportCloseDialogProps) {
  const today = businessToday();
  const askDate = asksValidity(validUntil, today);
  const [chosen, setChosen] = useState<string>(() => validUntilAfter(today, DEFAULT_VALIDITY_DAYS) ?? today);
  // The request is on its way: the dialog waits for the answer.
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(askDate ? chosen : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onCancel={onClose} footer={null} width={420} closable={false} destroyOnHidden>
      <div className={`${MODAL_TITLE} mb-1`}>{EXPORT_CLOSE_TITLE}</div>
      <div className="text-[13px] text-slate-600 leading-relaxed">{exportCloseDescription(quoteNumber)}</div>
      {askDate && (
        <Form layout="vertical" disabled={busy} className="mt-4">
          <ValidUntilField value={chosen} onChange={setChosen} today={today} passed={validUntil} />
        </Form>
      )}
      <div className="flex justify-end gap-2 mt-5">
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="primary" onClick={confirm} loading={busy}>
          {EXPORT_CLOSE_LABEL}
        </Button>
      </div>
    </Modal>
  );
}
