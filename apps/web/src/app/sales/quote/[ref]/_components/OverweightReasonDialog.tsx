"use client";

import { useState } from "react";
import { Button, Input } from "antd";
import { SalesDialog } from "@/app/sales/_components/SalesDialog";

interface OverweightReasonDialogProps {
  /** What is asked about: leaving Pricing with the surcharge at 0, or removing it; none while nothing is asked. */
  asking: { removing: boolean; ratio: number | null } | null;
  /** Leaves Pricing (or removes the surcharge) with the reason. */
  onConfirm: (reason: string) => void;
  /** Stays in Pricing with the surcharge as it is. */
  onCancel: () => void;
}

// A Sea LCL quote of over 2 t and under 2.2 cbm/t has an Overweight surcharge in Selling, put there
// at 0 for Sales to price. Leaving it at 0, or removing it, is done only with a reason, kept on the quote.
export function OverweightReasonDialog({ asking, onConfirm, onCancel }: OverweightReasonDialogProps) {
  const [reason, setReason] = useState("");
  // Each time it asks, it starts empty.
  const [asked, setAsked] = useState<typeof asking>(null);
  if (asking !== asked) {
    setAsked(asking);
    if (asking) setReason("");
  }
  const removing = !!asking?.removing;
  const ratio = asking?.ratio != null ? `${asking.ratio} cbm/t` : "under 2.2 cbm/t";

  return (
    <SalesDialog
      open={asking !== null}
      onClose={onCancel}
      title={removing ? "Why is the Overweight surcharge removed?" : "Why is there no Overweight surcharge?"}
      subtitle={`The shipment is over 2 t and dense (${ratio}, under 2.2): it is charged an Overweight surcharge${removing ? "" : ", which is still 0 in Selling"}. Say why, so it can be traced later.`}
      footer={
        <>
          <Button onClick={onCancel}>{removing ? "Keep the surcharge" : "Back to Pricing"}</Button>
          <Button type="primary" danger={removing} disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {removing ? "Remove it" : "Continue without it"}
          </Button>
        </>
      }
    >
      <Input.TextArea
        rows={3}
        autoFocus
        maxLength={500}
        aria-label="Reason for no Overweight surcharge"
        placeholder="e.g. Included in the ocean freight, agreed with the customer, matched a competitor"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </SalesDialog>
  );
}
