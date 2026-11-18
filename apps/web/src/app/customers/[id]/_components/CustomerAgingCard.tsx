"use client";

import type { ReactNode } from "react";
import { SectionCard } from "@/components/SectionCard";
import type { AgingBucket } from "../../_lib/customerInvoices";
import { fmtMoney } from "../../_lib/customerMoney";
import { CustomerKpiTile } from "./CustomerKpiTile";

interface CustomerAgingCardProps {
  // The buckets of summarizeInvoices(), oldest last.
  aging: AgingBucket[];
  currency: string;
  /** Beside the title: the customer's statements. */
  extra?: ReactNode;
}

// "1 invoice" / "3 invoices" — the count printed under an invoice amount.
export function invoiceCountLabel(count: number): string {
  return `${count} invoice${count === 1 ? "" : "s"}`;
}

// Unpaid invoices grouped by how far past their due date they are.
export function CustomerAgingCard({ aging, currency, extra }: CustomerAgingCardProps) {
  return (
    <SectionCard title="Invoice aging" extra={extra}>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {aging.map((bucket) => (
          <CustomerKpiTile
            key={bucket.key}
            label={bucket.label}
            value={fmtMoney(bucket.amount, currency)}
            hint={invoiceCountLabel(bucket.count)}
            tone={bucket.critical && bucket.count > 0 ? "red" : undefined}
          />
        ))}
      </div>
    </SectionCard>
  );
}
