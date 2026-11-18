"use client";

import { ChipList } from "@/components/finance/ChipList";
import { rowMarks, type PayableInvoice } from "../_lib/payables";

/** The marks beside an invoice's status (D3, D14): overdue, claimed, the supplier's checks, above estimate… */
export function MarkPills({ invoice, empty = true }: { invoice: PayableInvoice; empty?: boolean }) {
  const chips = rowMarks(invoice).map((m) => ({ key: m.key, label: m.label, tone: m.tone, title: m.tip }));
  return <ChipList chips={chips} empty={empty} />;
}
