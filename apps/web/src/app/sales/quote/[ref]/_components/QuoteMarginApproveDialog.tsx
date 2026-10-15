"use client";

import { useState } from "react";
import { Alert, Button, Input } from "antd";
import { SalesDialog } from "../../../_components/SalesDialog";
import { APPROVAL_REASON_MAX, approvalReasonProblem, floorText, marginText, type RoadMargin } from "../../../_lib/roadQuote";

interface QuoteMarginApproveDialogProps {
  quoteNumber: string;
  margin: RoadMargin;
  // Asks the server to approve the margin. Resolves with why it refused, or null.
  onApprove: (reason: string) => Promise<string | null>;
  onClose: () => void;
}

// A manager accepts a margin below the floor, with the reason. The approval covers this margin or
// a better one; a worse one needs approving again. Rendered only while open, so it starts empty.
export const QuoteMarginApproveDialog = ({ quoteNumber, margin, onApprove, onClose }: QuoteMarginApproveDialogProps) => {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const problem = approvalReasonProblem(reason);

  const handleApprove = async () => {
    setSaving(true);
    setRefusal(null);
    const refused = await onApprove(reason.trim());
    setSaving(false);
    if (refused) setRefusal(refused);
    else onClose();
  };

  return (
    <SalesDialog
      open
      onClose={onClose}
      busy={saving}
      title="Approve margin"
      subtitle={`The margin of ${marginText(margin.marginCzk, margin.marginPercent)} is below the floor of ${floorText(margin)}.`}
      footer={
        <>
          <Button disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="primary" loading={saving} disabled={!!problem} title={problem ?? undefined} onClick={handleApprove}>
            Approve margin
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Reason</span>
          <Input.TextArea
            aria-label="Reason"
            rows={3}
            maxLength={APPROVAL_REASON_MAX}
            showCount
            disabled={saving}
            placeholder="Why we accept this margin, e.g. a new customer's first order"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <div className="text-xs text-slate-500">The approval covers this margin or a better one. If the prices change for the worse, it has to be approved again.</div>
        {refusal && <Alert type="error" showIcon message={`${quoteNumber} - ${refusal}`} />}
      </div>
    </SalesDialog>
  );
};
