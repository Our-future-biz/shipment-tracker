"use client";

import Link from "next/link";
import { Select } from "antd";
import { SectionCard } from "@/components/SectionCard";
import { LINK_CLASS } from "@/components/linkClass";
import { useCustomerAddresses } from "@/hooks/useCustomerAddresses";
import type { CustomerItem } from "@/hooks/useCustomers";
import { CURRENCIES } from "@/lib/enums";
import { PAYMENT_TERMS } from "../../_lib/constants";
import { CustomerInfoRow } from "./CustomerInfoRow";
import { SELECT_PROPS, SELECT_WRAPPER_CLASS } from "./inlineSelect";
import { useCustomerEdits } from "./useCustomerEdits";
import type { CustomerPatch } from "./useCustomerEdits";
import { useCanManageCustomers } from "@/lib/auth/AuthContext";

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

// At most this many currencies besides the default (the server holds the same limit).
const MAX_SECONDARY_CURRENCIES = 2;

// How the customer is billed: its currencies and its payment terms. Every change saves itself.
export function CustomerPaymentTermsCard({ customer }: CustomerPaymentTermsCardProps) {
  const { shown, save } = useCustomerEdits(customer);
  // Where invoices are addressed: the Billing address, else the seat (chosen on the Addresses tab).
  const { addresses } = useCustomerAddresses(customer.id);
  const billing = addresses.find((a) => a.types.includes("Billing"));
  const billingText = billing ? [billing.label, billing.street, [billing.postalCode, billing.city].filter(Boolean).join(" "), billing.country].filter(Boolean).join(", ") : "";
  // Currency and payment terms are a manager's decision; the server refuses anyone else.
  const canManage = useCanManageCustomers();
  const lockedTitle = canManage ? undefined : "Only a manager can change this";

  // A customer always has payment terms — PREPAYMENT from the moment it is created — so they can
  // be changed to another option but not emptied.
  const handlePaymentTermChange = (field: PaymentTermField, value: string) => {
    const patch: CustomerPatch = {};
    patch[field] = value;
    save(patch);
  };

  return (
    <SectionCard title="Payment terms">
      <CustomerInfoRow label="Invoice address">
        <span className="min-w-0">
          {billingText || <span className="text-slate-500">Registered address</span>}{" "}
          <Link href={`/customers/${customer.id}?tab=addresses`} className={`whitespace-nowrap ${LINK_CLASS}`}>
            {billing ? "Change" : "Set a billing address"}
          </Link>
        </span>
      </CustomerInfoRow>
      <CustomerInfoRow label="Default currency">
        <div className={`${SELECT_WRAPPER_CLASS} max-w-[240px]`}>
          <Select
            {...SELECT_PROPS}
            aria-label="Default currency"
            disabled={!canManage}
            title={lockedTitle}
            value={shown.currency}
            options={CURRENCY_OPTIONS}
            // A secondary currency made the default leaves the secondary ones.
            onChange={(value: string) =>
              save({ currency: value, secondaryCurrencies: shown.secondaryCurrencies.filter((c) => c !== value) })
            }
          />
        </div>
      </CustomerInfoRow>
      <CustomerInfoRow label="Secondary currencies">
        <div className={`${SELECT_WRAPPER_CLASS} max-w-[240px]`}>
          <Select
            {...SELECT_PROPS}
            mode="multiple"
            maxCount={MAX_SECONDARY_CURRENCIES}
            aria-label="Secondary currencies"
            disabled={!canManage}
            title={lockedTitle ?? "Up to 2; billing in one of them asks to confirm"}
            placeholder="None"
            value={shown.secondaryCurrencies}
            options={CURRENCY_OPTIONS.filter((o) => o.value !== shown.currency)}
            onChange={(value: string[]) => save({ secondaryCurrencies: value })}
          />
        </div>
      </CustomerInfoRow>
      {PAYMENT_TERM_FIELDS.map(({ field, label }) => (
        <CustomerInfoRow key={field} label={label}>
          <div className={`${SELECT_WRAPPER_CLASS} max-w-[240px]`}>
            <Select
              {...SELECT_PROPS}
              aria-label={`${label} payment terms`}
              disabled={!canManage}
              title={lockedTitle}
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
