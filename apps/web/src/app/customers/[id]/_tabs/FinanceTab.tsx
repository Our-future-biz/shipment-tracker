"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Spin } from "antd";
import { PillTabs } from "@/components/SectionCard";
import { useCustomerOwed } from "@/hooks/useCustomerInvoices";
import { useCustomer } from "@/hooks/useCustomers";
import { summarizeInvoices, unconvertedReason } from "../../_lib/customerInvoices";
import { useLatestRates } from "@/lib/fx";
import { fmtMoney, roundCents } from "../../_lib/customerMoney";
import { CustomerAgingCard, invoiceCountLabel } from "../_components/CustomerAgingCard";
import { CustomerCreditCard, utilizationTone } from "../_components/CustomerCreditCard";
import { CustomerInvoicesCard } from "../_components/CustomerInvoicesCard";
import { CustomerKpiTile, KPI_GRID_CLASS } from "../_components/CustomerKpiTile";
import { CustomerPaymentTermsCard } from "../_components/CustomerPaymentTermsCard";
import { CustomerProfitabilityView } from "../_components/CustomerProfitabilityView";
import { CustomerStatementMenu } from "../_components/CustomerStatementMenu";
import { statementCurrencies } from "../../_lib/customerStatement";
import { EMPTY_CELL } from "../../_lib/customerTable";

const DEFAULT_VIEW = "invoices";

const FINANCE_VIEWS = [
  { key: DEFAULT_VIEW, label: "Invoices & credit" },
  { key: "profitability", label: "Profitability" },
];

interface FinanceTabProps {
  customerId: string;
  onSelectTab: (key: string) => void;
}

// Everything about the customer's money that the header totals do not already say:
// invoices and credit in one view, profitability over time in the other.
export function FinanceTab({ customerId, onSelectTab }: FinanceTabProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { customer } = useCustomer(customerId);
  const { ledger, today, truncated, canAct, isLoading, isError, refetch } = useCustomerOwed(customerId);
  const { rates, fixingLabel, isLoading: ratesLoading, isError: ratesError } = useLatestRates();

  // The sub-view lives in the URL (?view=) next to ?tab=, so it survives a reload and can be linked to.
  const rawView = searchParams.get("view") ?? DEFAULT_VIEW;
  const view = FINANCE_VIEWS.some((v) => v.key === rawView) ? rawView : DEFAULT_VIEW;

  const handleSelectView = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === DEFAULT_VIEW) params.delete("view");
    else params.set("view", key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (!customer) return null;

  const { creditLimit, currency } = customer;
  // One summary feeds the tiles, the bar and the aging buckets, so they cannot disagree with each other - nor with
  // Accounts Receivable: the issued invoices count with what is left to pay, the typed rows with their amount.
  // Invoices in other currencies are converted into the customer's currency at today's rates.
  const summary = summarizeInvoices(ledger, { currency, rates }, today);
  // Shown when anything is owed in a currency other than the customer's: what the converted total is made of.
  // (A currency that nets to zero, e.g. an invoice and its credit note, adds nothing to the breakdown.)
  const owed = summary.byCurrency.filter((c) => roundCents(c.amount) !== 0);
  const mixed = owed.some((c) => c.currency !== currency);
  const breakdown = owed.map((c) => fmtMoney(c.amount, c.currency)).join(" + ");
  // A limit of 0 means none was set: there is nothing to be "available" or "used" then.
  const hasLimit = creditLimit > 0;
  const available = roundCents(creditLimit - summary.outstanding);
  const utilization = hasLimit ? Math.round((summary.outstanding / creditLimit) * 100) : null;

  return (
    <div className="space-y-5">
      <PillTabs tabs={FINANCE_VIEWS} active={view} onChange={handleSelectView} />

      {view === "profitability" ? (
        <CustomerProfitabilityView customer={customer} onSelectTab={onSelectTab} />
      ) : (
        <>
          {/* Every figure in this block is derived from the invoices, so it waits for them as one —
              and without them it shows an error, not a customer with nothing outstanding. It waits for
              today's rates too: until they are in, an invoice in another currency would be left out. */}
          {isError ? (
            <Alert
              type="error"
              showIcon
              message="Could not load invoices."
              action={
                <Button size="small" onClick={() => refetch()}>
                  Retry
                </Button>
              }
            />
          ) : (
            <Spin spinning={isLoading || ratesLoading}>
              <div className="space-y-5">
                {truncated && (
                  <Alert
                    type="warning"
                    showIcon
                    message="This customer has more invoices than can be read at once: the figures and the list below may leave some out."
                  />
                )}
                {summary.unconverted.length > 0 && (
                  <Alert
                    type="warning"
                    showIcon
                    message={unconvertedReason(summary.unconverted, ratesError)}
                    description={`${summary.unconverted.map((u) => fmtMoney(u.amount, u.currency)).join(" + ")} is left out of the totals below.`}
                  />
                )}
                <div className={KPI_GRID_CLASS}>
                  <CustomerKpiTile
                    label="Outstanding"
                    value={fmtMoney(summary.outstanding, currency)}
                    hint={mixed ? <span title={`${breakdown} — converted at the rates of ${fixingLabel || "today"}`}>{breakdown}</span> : undefined}
                  />
                  <CustomerKpiTile
                    label="Available"
                    value={hasLimit ? fmtMoney(available, currency) : EMPTY_CELL}
                    tone={hasLimit && available < 0 ? "red" : undefined}
                  />
                  <CustomerKpiTile
                    label="Utilization"
                    value={utilization === null ? EMPTY_CELL : `${utilization}%`}
                    tone={utilizationTone(utilization)}
                  />
                  <CustomerKpiTile
                    label="Not yet due"
                    value={fmtMoney(summary.openAmount, currency)}
                    hint={invoiceCountLabel(summary.openCount)}
                  />
                  <CustomerKpiTile
                    label="Overdue"
                    value={fmtMoney(summary.overdueAmount, currency)}
                    hint={invoiceCountLabel(summary.overdueCount)}
                    tone={summary.overdueAmount > 0 ? "red" : undefined}
                  />
                </div>

                {/* Keyed so an edit still being saved never carries over to another customer. */}
                <CustomerPaymentTermsCard key={customer.id} customer={customer} />
                <CustomerCreditCard customer={customer} outstanding={summary.outstanding} utilization={utilization} />
                <CustomerAgingCard
                  aging={summary.aging}
                  currency={currency}
                  // A statement per currency the customer owes in (step 7), of the invoices issued in Invoicing.
                  extra={<CustomerStatementMenu customerId={customerId} customer={customer.companyName} currencies={statementCurrencies(ledger.issued)} canSend={canAct} />}
                />
              </div>
            </Spin>
          )}

          <CustomerInvoicesCard customerId={customerId} currency={currency} today={today} />
        </>
      )}
    </div>
  );
}
