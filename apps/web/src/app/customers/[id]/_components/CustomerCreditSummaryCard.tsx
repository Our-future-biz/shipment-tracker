"use client";

import type { ReactNode } from "react";
import { Progress } from "antd";
import { KPI_TONE_CLASS } from "@/components/KpiTile";
import { SectionCard } from "@/components/SectionCard";
import { useCustomerInvoices } from "@/hooks/useCustomerInvoices";
import { useCustomer } from "@/hooks/useCustomers";
import { useLatestRates } from "@/lib/fx";
import { summarizeInvoices, unconvertedReason } from "../../_lib/customerInvoices";
import { fmtMoney, roundCents } from "../../_lib/customerMoney";
import { BAR_COLOR, utilizationTone } from "./CustomerCreditCard";
import { LINK } from "@/styles/ui";

interface CustomerCreditSummaryCardProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// How much of the credit limit is in use, at a glance. Read-only: the limit is edited in the Finance tab.
export function CustomerCreditSummaryCard({ customerId, onSelectTab }: CustomerCreditSummaryCardProps) {
  const { customer } = useCustomer(customerId);
  const { invoices, isLoading, isError } = useCustomerInvoices(customerId);
  const { rates, isLoading: ratesLoading, isError: ratesError } = useLatestRates();

  if (!customer) return null;

  const { creditLimit, currency } = customer;
  // Derived from the same invoices and today's rates as the Finance tab's figures; an open invoice in a
  // currency ČNB has no rate for is left out of the outstanding sum here as there (the tab names it).
  const { outstanding, unconverted } = summarizeInvoices(invoices, { currency, rates });
  const utilization = creditLimit > 0 ? Math.round((outstanding / creditLimit) * 100) : null;

  let content: ReactNode;
  if (isError || isLoading || ratesLoading) {
    // Every figure comes from the invoices: without them the card would show a customer who owes nothing.
    // And from today's rates: until they are in, an invoice in another currency would be left out.
    content = <p className="m-0 text-[13px] text-slate-400">{isError ? "Could not load invoices." : "Loading…"}</p>;
  } else if (ratesError && unconverted.length > 0) {
    // Only CZK is known without the rates: the sum would leave out what is owed in other currencies.
    content = <p className="m-0 text-[13px] text-slate-400">{unconvertedReason(unconverted, true)}.</p>;
  } else if (utilization === null) {
    content = (
      <div className="text-[13px]">
        <p className="m-0 text-slate-400">No credit limit set.</p>
        {outstanding > 0 && <p className="m-0 mt-1 text-slate-700">{fmtMoney(outstanding, currency)} outstanding</p>}
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
        <div className={`mt-2 text-[13px] font-bold ${tone ? KPI_TONE_CLASS[tone] : "text-slate-900"}`}>{`${utilization}% used`}</div>
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
          className={`bg-transparent border-0 p-0 text-xs font-semibold whitespace-nowrap cursor-pointer ${LINK}`}
        >
          Open finance
        </button>
      }
    >
      {content}
    </SectionCard>
  );
}
