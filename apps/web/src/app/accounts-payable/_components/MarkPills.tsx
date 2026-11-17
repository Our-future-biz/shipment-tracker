"use client";

import { Tooltip } from "antd";
import { Pill } from "@/components/Pill";
import { EMPTY } from "@/styles/ui";
import { rowMarks, type PayableInvoice } from "../_lib/payables";

/** The marks beside an invoice's status (D3, D14): overdue, claimed, the supplier's checks, above estimate… */
export function MarkPills({ invoice, empty = true }: { invoice: PayableInvoice; empty?: boolean }) {
  const marks = rowMarks(invoice);
  if (!marks.length) return empty ? <span className={EMPTY}>—</span> : null;
  return (
    <div className="flex flex-wrap gap-1 max-w-[300px]">
      {marks.map((m) => (
        <Tooltip key={m.key} title={m.tip}>
          <Pill tone={m.tone}>{m.label}</Pill>
        </Tooltip>
      ))}
    </div>
  );
}
