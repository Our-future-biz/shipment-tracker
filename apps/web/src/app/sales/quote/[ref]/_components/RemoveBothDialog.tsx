"use client";

import { Button, Modal } from "antd";
import type { CostLine } from "@/app/sales/_lib/types";
import { fmtMoney } from "@/lib/money";

interface RemoveBothDialogProps {
  side: "buying" | "selling";
  // The line being removed, and the one on the other side that goes with it.
  line: CostLine;
  counterpart: CostLine;
  onBoth: () => void;
  onOnly: () => void;
  onClose: () => void;
}

const lineText = (l: CostLine) => `${(l.description ?? "").trim() || l.type} (${fmtMoney(l.amount, l.currency)})`;

// Asked when a buying or selling line is removed that has a counterpart on the other side.
export function RemoveBothDialog({ side, line, counterpart, onBoth, onOnly, onClose }: RemoveBothDialogProps) {
  const other = side === "buying" ? "selling" : "buying";
  return (
    <Modal
      open
      title={`Remove from ${other} as well?`}
      onCancel={onClose}
      width={440}
      destroyOnHidden
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={onOnly}>Only from {side}</Button>
          {/* Not focused on purpose: a reflex Enter must not take the other side's line. */}
          <Button type="primary" danger onClick={onBoth}>
            Remove from both
          </Button>
        </div>
      }
    >
      <div className="text-sm text-slate-600 leading-relaxed pt-1">
        Removing the {side} line <span className="font-medium text-slate-800">{lineText(line)}</span>. The {other} side has{" "}
        <span className="font-medium text-slate-800">{lineText(counterpart)}</span> - remove it too?
      </div>
    </Modal>
  );
}
