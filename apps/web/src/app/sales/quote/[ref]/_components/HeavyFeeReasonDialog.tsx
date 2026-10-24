"use client";

import { useState } from "react";
import { Button, Input } from "antd";
import { SalesDialog } from "@/app/sales/_components/SalesDialog";
import { fmtMoney } from "@/lib/money";

interface HeavyFeeReasonDialogProps {
  /** The selling amount changed, and the one it had - or the fee being removed; none while nothing is asked. */
  change: { amount: number; before: number; currency: string; reason?: string; removing?: string } | null;
  /** Keeps the new amount (or removes the fee) with its reason. */
  onConfirm: (reason: string) => void;
  /** Puts the amount back as it was, or keeps the fee. */
  onCancel: () => void;
}

// The selling line of the warehouse's Heavy Cargo Handling Fee is put to Pricing by the warehouse's
// approval (buying + EUR 50). Sales may change it, up or down, only with a reason, kept on the line;
// removing the fee from Pricing asks for a reason the same way.
export function HeavyFeeReasonDialog({ change, onConfirm, onCancel }: HeavyFeeReasonDialogProps) {
  const [reason, setReason] = useState("");
  // Each time it asks, it starts from the reason the line already has.
  const [asked, setAsked] = useState<typeof change>(null);
  if (change !== asked) {
    setAsked(change);
    if (change) setReason(change.reason ?? "");
  }
  const up = change ? change.amount > change.before : false;
  const removing = !!change?.removing;

  return (
    <SalesDialog
      open={change !== null}
      onClose={onCancel}
      title={removing ? "Why is the Heavy Cargo Handling Fee removed?" : "Why is the Heavy Cargo Handling Fee changed?"}
      subtitle={
        removing
          ? "The warehouse's approved fee leaves Pricing - its buying and its selling line. Say why, so it can be traced later."
          : change
          ? `The selling ${up ? "goes up" : "goes down"} from ${fmtMoney(change.before, change.currency)} to ${fmtMoney(change.amount, change.currency)}. Say why, so it can be traced later.`
          : undefined
      }
      footer={
        <>
          <Button onClick={onCancel}>{removing ? "Keep the fee" : `Keep ${change ? fmtMoney(change.before, change.currency) : "the amount"}`}</Button>
          <Button type="primary" danger={removing} disabled={!reason.trim()} onClick={() => onConfirm(reason.trim())}>
            {removing ? "Remove it" : "Change it"}
          </Button>
        </>
      }
    >
      <Input.TextArea
        rows={3}
        autoFocus
        maxLength={500}
        aria-label={removing ? "Reason for removing the Heavy Cargo Handling Fee" : "Reason for the changed Heavy Cargo Handling Fee"}
        placeholder="e.g. Agreed with the customer, long-standing customer, matched a competitor"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </SalesDialog>
  );
}
