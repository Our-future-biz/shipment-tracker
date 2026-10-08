"use client";

import type { ReactNode } from "react";
import { Progress } from "antd";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { useCustomer } from "@/hooks/useCustomers";
import { summarizeInvoices } from "../../_lib/customerInvoices";
import { fmtMoney, roundCents } from "../../_lib/customerMoney";
import { BAR_COLOR, utilizationTone } from "./CustomerCreditCard";
import type { KpiTone } from "./CustomerKpiTile";

// The colours of the Finance tab: its credit bar and the figure of its Utilization tile.
const FIGURE_CLASS: Record<KpiTone, string> = {
  red: "text-red-600",
  amber: "text-amber-600",
  green: "text-green-600",
};

interface CustomerCreditSummaryCardProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// How much of the credit limit is in use, at a glance. Read-only: the limit is edited in the Finance tab.
export function CustomerCreditSummaryCard({ customerId, onSelectTab }: CustomerCreditSummaryCardProps) {
  const { customer } = useCustomer(customerId);
  const { invoices, isLoading, isError } = useCustomerInvoices(customerId);

  if (!customer) return null;

  const { creditLimit, currency } = customer;
  // Derived the same way as in the Finance tab, so the two always show the same figures.
  const { outstanding } = summarizeInvoices(invoices);
  const utilization = creditLimit > 0 ? Math.round((outstanding / creditLimit) * 100) : null;

  let content: ReactNode;
  if (isError || isLoading) {
    // Every figure comes from the invoices: without them the card would show a customer who owes nothing.
    content = <p className="m-0 text-[13px] text-slate-400">{isError ? "Could not load invoices." : "Loading…"}</p>;
  } else if (utilization === null) {
    content = (
      <div className="text-[13px]">
        <p className="m-0 text-slate-400">No credit limit set.</p>
        {outstanding > 0 && <p className="m-0 mt-1 text-slate-600">{fmtMoney(outstanding, currency)} outstanding</p>}
      </div>
    );
  } else {
    const tone = utilizationTone(utilization);
    const fillPct = Math.max(0, Math.min(100, utilization));
    // Compared in whole cents: summed amounts can differ from the limit by a rounding error of the arithmetic.
    const excess = roundCents(outstanding - creditLimit);
    content = (
      <div>
        <Progress
          aria-label="Credit utilization"
          aria-valuetext={`${utilization}%`}
          percent={fillPct}
          showInfo={false}
          size={{ height: 8 }}
          strokeColor={BAR_COLOR[tone ?? "green"]}
          className="m-0"
        />
        <div className={`mt-2 text-[13px] font-bold ${tone ? FIGURE_CLASS[tone] : "text-slate-800"}`}>{`${utilization}% used`}</div>
        <div className="text-xs text-slate-500">{`${fmtMoney(outstanding, currency)} of ${fmtMoney(creditLimit, currency)}`}</div>
        {excess > 0 && <div className="mt-1 text-xs font-medium text-red-600">{`Over the limit by ${fmtMoney(excess, currency)}`}</div>}
      </div>
    );
  }

  return (
    <SectionCard
      title="Credit"
      extra={
        <button
          type="button"
          onClick={() => onSelectTab("finance")}
          className="bg-transparent border-0 p-0 text-xs font-semibold text-indigo-600 whitespace-nowrap cursor-pointer hover:underline"
        >
          Open finance
        </button>
      }
    >
      {content}
    </SectionCard>
  );
}
