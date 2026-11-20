"use client";

import { useState } from "react";
import { Alert, Button, Checkbox, Input, Modal } from "antd";
import { apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { money } from "@/lib/money";
import { useToast } from "@/lib/toast";
import { useInvoiceChangeAsk } from "@/hooks/useInvoiceChangeAsk";
import type { InvoiceDoc } from "@/hooks/useInvoiceDocs";
import { INVOICE_FIXES, INVOICE_FIX_LABELS } from "../_lib/invoiceFixes";
import { waitingRequestReason } from "../_lib/waitingRequest";

interface InvoiceChangeModalProps {
  /** The invoice to change; null = closed */
  doc: InvoiceDoc | null;
  /**
   * A partial credit note of the invoice waiting for a manager: one request waits at a time (user council
   * B5), so nothing can be asked until it is answered or taken back.
   */
  waitingCredit?: { requestedAt: string } | null;
  onClose: () => void;
}

/**
 * Asks a manager to change an invoice on the day it was issued (API services/invoiceChangeRequest):
 * what is wrong, ticked, and why. Approved - the same day, on Sales → Managers → Billing approvals -
 * the invoice is cancelled, and its lines are billed again, corrected, under the next number.
 */
export function InvoiceChangeModal({ doc, waitingCredit = null, onClose }: InvoiceChangeModalProps) {
  const toast = useToast();
  const { ask, isAsking } = useInvoiceChangeAsk();
  const [fixes, setFixes] = useState<interfaces.InvoiceFixItem[]>([]);
  const [reason, setReason] = useState("");

  const close = () => {
    setFixes([]);
    setReason("");
    onClose();
  };

  const submit = async () => {
    if (!doc || waitingCredit || !fixes.length || !reason.trim()) return;
    try {
      await ask({ invoiceId: doc.id, fixes, reason: reason.trim() });
      toast.success(`Change of ${doc.number} sent to a manager for approval`);
      close();
    } catch (e) {
      toast.error(apiErrorMessage(e));
    }
  };

  return (
    <Modal
      open={!!doc}
      title={`Change ${doc?.number ?? ""}`}
      onCancel={close}
      destroyOnHidden
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="primary" disabled={!!waitingCredit || !fixes.length || !reason.trim()} loading={isAsking} onClick={() => void submit()}>
            Ask for approval
          </Button>
        </>
      }
    >
      <div className="text-[13px] text-slate-700 flex flex-col gap-3">
        <p className="m-0">
          Issued today ({doc && <strong className="tabular-nums">{money(Number(doc.gross))} {doc.currency}</strong>}), so it can still be changed. A manager approves it on
          Sales → Managers → Billing approvals <strong>today</strong>: the invoice is then cancelled (kept on record, no credit note), and you correct it and issue it again
          under the next number. Not answered by midnight, the request expires and a credit note corrects the invoice.
        </p>
        {waitingCredit && <Alert type="warning" showIcon message={waitingRequestReason("credit", waitingCredit.requestedAt)} />}
        <div>
          <div className="font-medium text-slate-900 mb-1">What is wrong?</div>
          <Checkbox.Group
            value={fixes}
            onChange={(v) => setFixes(v as interfaces.InvoiceFixItem[])}
            options={INVOICE_FIXES.map((f) => ({ value: f, label: INVOICE_FIX_LABELS[f] }))}
            className="grid grid-cols-2 gap-y-1"
          />
        </div>
        <Input.TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="What to correct, e.g. DUZP should be 14.11., THC was 180 EUR"
          maxLength={500}
          autoSize={{ minRows: 2 }}
          aria-label="What to correct"
        />
        {doc?.status !== "issued" && <Alert type="warning" showIcon message="This invoice is no longer issued." />}
      </div>
    </Modal>
  );
}
