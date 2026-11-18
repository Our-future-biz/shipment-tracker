"use client";

import { Alert } from "antd";
import { WarningOutlined } from "@ant-design/icons";
import { useCreditWarning } from "@/hooks/useReceivables";
import { useLatestRates } from "@/lib/fx";
import { creditUnbilledLine, creditWarningLines, prepaymentLine } from "@/lib/paymentWarnings";
import { HINT } from "@/styles/ui";

// The credit warning for everyone (Council Outlay 10, D21): over the credit limit, or overdue invoices - on a new
// quote, on a new shipment and beside the shipment's hand-set Credit Check. A warning only, never a stop. What is
// owed is converted into the limit's currency as the customer's Finance tab converts it (today's ČNB rates); a
// currency without a rate is not guessed. The work on the customer's open jobs not yet invoiced (step 7) follows as
// a line of information: never added to what is owed, never part of "over the limit".

export interface CreditWarningView {
  /** The warning's lines; empty when there is nothing to warn about. */
  lines: string[];
  /** The prepayment fact (D22), or null. */
  prepayment: string | null;
  /** "Not yet invoiced: … (N jobs)" when it was read and is above 0, or null. Information only. */
  unbilled: string | null;
  /** The customer's credit could not be read. */
  isError: boolean;
}

/** The credit warning of a customer, as lines. Nothing while it is read or when there is no customer. */
export function useCreditWarningView(customerId: string | null | undefined): CreditWarningView {
  const q = useCreditWarning(customerId);
  const { rates, isLoading: ratesLoading } = useLatestRates();
  if (!customerId || !q.data) return { lines: [], prepayment: null, unbilled: null, isError: !!customerId && q.isError };
  // Until today's rates are in, only the limit's own currency can be compared: the rest waits rather than guess.
  return {
    lines: creditWarningLines(q.data, ratesLoading ? null : rates),
    prepayment: prepaymentLine(q.data),
    unbilled: creditUnbilledLine(q.data),
    isError: false,
  };
}

/** The lines as an antd warning (a dialog, a card) or as small amber text beside a field ("inline"). */
export function CreditWarningLines({ lines, variant = "alert", className = "" }: { lines: string[]; variant?: "alert" | "inline"; className?: string }) {
  if (lines.length === 0) return null;
  if (variant === "inline") {
    return (
      <div className={`text-[12px] leading-snug text-amber-700 ${className}`}>
        {lines.map((l) => (
          <div key={l} className="flex items-start gap-1">
            <WarningOutlined className="mt-[2px] shrink-0" />
            <span className="min-w-0">{l}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <Alert
      className={className}
      type="warning"
      showIcon
      message={lines.length === 1 ? lines[0] : <div className="flex flex-col gap-0.5">{lines.map((l) => <div key={l}>{l}</div>)}</div>}
    />
  );
}

/**
 * The customer's credit warning: "<customer> is over its credit limit" and/or "has N overdue invoices, the oldest due
 * dd.mm.yyyy"; nothing when neither. With `showPrepayment` the prepayment fact (D22) follows as a short line, and the
 * work not yet invoiced as another, when there is some.
 */
export function CreditWarning({
  customerId,
  showPrepayment = false,
  variant = "alert",
  className = "",
}: {
  customerId: string | null | undefined;
  showPrepayment?: boolean;
  variant?: "alert" | "inline";
  className?: string;
}) {
  const view = useCreditWarningView(customerId);
  if (view.isError) return <div className={`${HINT} ${className}`}>Credit could not be checked.</div>;
  const prepayment = showPrepayment ? view.prepayment : null;
  if (view.lines.length === 0 && !prepayment && !view.unbilled) return null;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <CreditWarningLines lines={view.lines} variant={variant} />
      {prepayment && <div className={HINT}>{prepayment}</div>}
      {view.unbilled && <div className={HINT}>{view.unbilled}</div>}
    </div>
  );
}
