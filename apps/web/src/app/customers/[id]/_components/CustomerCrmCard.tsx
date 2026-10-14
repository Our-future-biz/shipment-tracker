"use client";

import { useId } from "react";
import { Select } from "antd";
import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import type { interfaces } from "@/lib/api/client";
import { CURRENCIES } from "@/lib/enums";
import { CUSTOMER_LABELS, CUSTOMER_STATUSES, PAYMENT_TERMS } from "../../_lib/constants";
import { CustomerInfoRow } from "./CustomerInfoRow";
import { EditableText } from "./EditableText";
import { SELECT_PROPS, SELECT_WRAPPER_CLASS } from "./inlineSelect";
import { useCustomerEdits } from "./useCustomerEdits";
import type { CustomerPatch } from "./useCustomerEdits";

const toOptions = (values: readonly string[]) => values.map((value) => ({ value, label: value }));

const STATUS_OPTIONS = toOptions(CUSTOMER_STATUSES);
const ACCOUNT_TYPE_OPTIONS = toOptions(CUSTOMER_LABELS);
const CURRENCY_OPTIONS = toOptions(CURRENCIES);
// Prepayment means no credit at all, so it stands out in red both in the list and as the chosen value.
const PAYMENT_TERM_OPTIONS = PAYMENT_TERMS.map((term) => ({
  value: term,
  label: term === "PREPAYMENT" ? <span className="text-red-600">{term}</span> : term,
}));

const PAYMENT_TERM_FIELDS = [
  { field: "paymentTerms", label: "General" },
  { field: "freightPaymentTerms", label: "Freight" },
  { field: "dutyPaymentTerms", label: "Duty" },
] as const;

type PaymentTermField = (typeof PAYMENT_TERM_FIELDS)[number]["field"];


interface CustomerCrmCardProps {
  customer: CustomerItem;
}

// The one place where the CRM fields of a customer are edited. Every change saves itself.
export function CustomerCrmCard({ customer }: CustomerCrmCardProps) {
  const paymentTermsId = useId();
  const { shown, save } = useCustomerEdits(customer);

  // A customer always has payment terms — PREPAYMENT from the moment it is created — so they can
  // be changed to another option but not emptied.
  const handlePaymentTermChange = (field: PaymentTermField, value: string) => {
    const patch: CustomerPatch = {};
    patch[field] = value;
    save(patch);
  };

  return (
    <SectionCard title="CRM">
      <div>
        <CustomerInfoRow label="Status" narrow>
          <div className={SELECT_WRAPPER_CLASS}>
            <Select
              {...SELECT_PROPS}
              aria-label="Status"
              value={shown.status}
              options={STATUS_OPTIONS}
              onChange={(value: interfaces.CustomerStatus) => save({ status: value })}
            />
          </div>
        </CustomerInfoRow>
        <CustomerInfoRow label="Account type" narrow>
          <div className={SELECT_WRAPPER_CLASS}>
            <Select
              {...SELECT_PROPS}
              aria-label="Account type"
              value={shown.label}
              options={ACCOUNT_TYPE_OPTIONS}
              onChange={(value: interfaces.CustomerLabel) => save({ label: value })}
            />
          </div>
        </CustomerInfoRow>
        <CustomerInfoRow label="Currency" narrow>
          <div className={SELECT_WRAPPER_CLASS}>
            <Select
              {...SELECT_PROPS}
              aria-label="Currency"
              value={shown.currency}
              options={CURRENCY_OPTIONS}
              onChange={(value: string) => save({ currency: value })}
            />
          </div>
        </CustomerInfoRow>
      </div>

      <div role="group" aria-labelledby={paymentTermsId} className="my-2 rounded-lg border border-slate-200 px-2.5 pt-2 pb-0.5">
        <div id={paymentTermsId} className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Payment terms
        </div>
        {PAYMENT_TERM_FIELDS.map(({ field, label }) => (
          <CustomerInfoRow key={field} label={label} narrow>
            <div className={SELECT_WRAPPER_CLASS}>
              <Select
                {...SELECT_PROPS}
                aria-label={`${label} payment terms`}
                placeholder="—"
                value={shown[field] || undefined}
                options={PAYMENT_TERM_OPTIONS}
                onChange={(value: string) => handlePaymentTermChange(field, value)}
              />
            </div>
          </CustomerInfoRow>
        ))}
      </div>

      <CustomerInfoRow label="Website" narrow>
        <EditableText
          value={shown.companyWebsite}
          onCommit={(value) => save({ companyWebsite: value })}
          placeholder="add…"
          label="Website"
        />
      </CustomerInfoRow>
    </SectionCard>
  );
}
