"use client";

import { Select } from "antd";
import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import { CURRENCIES } from "@/lib/enums";
import { PAYMENT_TERMS } from "../../_lib/constants";
import { CustomerInfoRow } from "./CustomerInfoRow";
import { SELECT_PROPS, SELECT_WRAPPER_CLASS } from "./inlineSelect";
import { useCustomerEdits } from "./useCustomerEdits";
import type { CustomerPatch } from "./useCustomerEdits";

const CURRENCY_OPTIONS = CURRENCIES.map((currency) => ({ value: currency, label: currency }));
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

interface CustomerPaymentTermsCardProps {
  customer: CustomerItem;
}

// How the customer is billed: its currency and its payment terms. Every change saves itself.
export function CustomerPaymentTermsCard({ customer }: CustomerPaymentTermsCardProps) {
  const { shown, save } = useCustomerEdits(customer);

  // A customer always has payment terms — PREPAYMENT from the moment it is created — so they can
  // be changed to another option but not emptied.
  const handlePaymentTermChange = (field: PaymentTermField, value: string) => {
    const patch: CustomerPatch = {};
    patch[field] = value;
    save(patch);
  };

  return (
    <SectionCard title="Payment terms">
      <CustomerInfoRow label="Currency">
        <div className={`${SELECT_WRAPPER_CLASS} max-w-[240px]`}>
          <Select
            {...SELECT_PROPS}
            aria-label="Currency"
            value={shown.currency}
            options={CURRENCY_OPTIONS}
            onChange={(value: string) => save({ currency: value })}
          />
        </div>
      </CustomerInfoRow>
      {PAYMENT_TERM_FIELDS.map(({ field, label }) => (
        <CustomerInfoRow key={field} label={label}>
          <div className={`${SELECT_WRAPPER_CLASS} max-w-[240px]`}>
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
    </SectionCard>
  );
}
