"use client";

import { useState } from "react";
import { Button, Form, Modal, Select } from "antd";
import { formatDate } from "@/lib/date";
import { businessToday, validUntilAfter } from "../_lib/salesQuote";
import { DEFAULT_VALIDITY_DAYS, asksValidity } from "../_lib/statusChange";
import { VALIDITY_OPTIONS } from "../_lib/types";
import { EXPORT_CLOSE_LABEL, EXPORT_CLOSE_TITLE, exportCloseDescription } from "../_lib/exportClose";

interface ExportCloseDialogProps {
  quoteNumber: string;
  // The quote's validity as stored, and the days it was last sent with (data.validityDays).
  validUntil: string | null;
  validityDays?: number;
  // Exports and closes, with the days chosen when the dialog asked for them.
  onConfirm: (validityDays?: number) => Promise<void> | void;
  onClose: () => void;
}

// Asked before Export PDF closes a quote that has not gone out yet. Like the lifecycle bar's
// sending, it asks for the validity days only while the quote has no validity that still holds -
// a revision of an expired quote starts with the validity that passed.
export function ExportCloseDialog({ quoteNumber, validUntil, validityDays: lastDays, onConfirm, onClose }: ExportCloseDialogProps) {
  const today = businessToday();
  const askDays = asksValidity(validUntil, today);
  const [days, setDays] = useState<number>(VALIDITY_OPTIONS.find((d) => d === lastDays) ?? DEFAULT_VALIDITY_DAYS);
  // The request is on its way: the dialog waits for the answer.
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(askDays ? days : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onCancel={onClose} footer={null} width={420} closable={false} destroyOnHidden>
      <div className="text-[15px] font-semibold text-slate-800 mb-1">{EXPORT_CLOSE_TITLE}</div>
      <div className="text-sm text-slate-500 leading-relaxed">{exportCloseDescription(quoteNumber)}</div>
      {askDays && (
        <Form layout="vertical" disabled={busy} className="mt-4">
          <Form.Item label="Validity (days)" extra={`Valid until ${formatDate(validUntilAfter(today, days))}`}>
            {validUntil && <div className="text-xs text-red-600 mb-1">The previous validity {formatDate(validUntil)} has passed.</div>}
            <Select aria-label="Validity (days)" value={days} onChange={setDays} options={VALIDITY_OPTIONS.map((d) => ({ value: d, label: `${d} days` }))} />
          </Form.Item>
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
