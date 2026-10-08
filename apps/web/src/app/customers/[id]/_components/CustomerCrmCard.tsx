"use client";

import { useId, useState } from "react";
import { Select } from "antd";
import { SectionCard } from "@/components/SectionCard";
import { useCustomer } from "@/hooks/useCustomers";
import type { CustomerItem } from "@/hooks/useCustomers";
import type { controllers } from "@/lib/api/client";
import { useToast } from "@/lib/toast";
import { CURRENCIES, CUSTOMER_LABELS, CUSTOMER_STATUSES, PAYMENT_TERMS } from "../../_lib/constants";
import { CustomerInfoRow } from "./CustomerInfoRow";
import { EditableText } from "./EditableText";

type CustomerPatch = controllers.CustomerUpdateRequest;

interface PendingEdit {
  patch: CustomerPatch;
  // updatedAt of the row this save produced; null while the save is still on its way.
  savedAt: string | null;
}

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

// Inline Selects fill the value slot of a row and use its 12px text. A borderless Select keeps 8px of inner
// inset (padding + transparent border), so its wrapper pulls it back by as much: the text then lines up with the
// plain values of the other rows, and the longest account type ("TARGET CUSTOMER") fits the 300px side column.
// Borderless also means no hover or focus cue of its own, hence the background.
const SELECT_WRAPPER_CLASS = "-ml-2";
const SELECT_PROPS = {
  size: "small",
  variant: "borderless",
  className:
    "w-full rounded transition-colors hover:bg-slate-100 [&.ant-select-focused]:bg-slate-100 [&_.ant-select-selector]:!text-xs",
  popupMatchSelectWidth: false,
} as const;

interface CustomerCrmCardProps {
  customer: CustomerItem;
}

// The one place where the CRM fields of a customer are edited. Every change saves itself.
export function CustomerCrmCard({ customer }: CustomerCrmCardProps) {
  const toast = useToast();
  const paymentTermsId = useId();
  const { updateCustomer } = useCustomer(customer.id);
  const [edits, setEdits] = useState<PendingEdit[]>([]);

  // Show the user's choice at once: the server value only arrives after the save and the refetch that follows it,
  // and the field would jump back to the old value in between. Every save is tracked on its own, so saves that
  // overlap cannot hide or cancel one another. An edit stops applying by itself once the loaded row is at least
  // as new as the row its save produced (both are ISO timestamps from the API, which compare correctly as text).
  const isPending = (edit: PendingEdit) => edit.savedAt === null || customer.updatedAt < edit.savedAt;
  const shown = edits.filter(isPending).reduce((row, edit) => ({ ...row, ...edit.patch }), customer);

  const save = (patch: CustomerPatch) => {
    const edit: PendingEdit = { patch, savedAt: null };
    // Edits the loaded row has caught up with are dropped here, so the list never grows.
    setEdits((current) => [...current.filter(isPending), edit]);
    updateCustomer(patch).then(
      (saved) => setEdits((current) => current.map((e) => (e === edit ? { ...edit, savedAt: saved.customer.updatedAt } : e))),
      () => {
        setEdits((current) => current.filter((e) => e !== edit));
        toast.error("Failed to save");
      },
    );
  };

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
              onChange={(value: string) => save({ status: value })}
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
              onChange={(value: string) => save({ label: value })}
            />
          </div>
        </CustomerInfoRow>
        <CustomerInfoRow label="Sales owner" narrow>
          <EditableText
            value={shown.salesOwner}
            onCommit={(value) => save({ salesOwner: value })}
            placeholder="assign…"
            label="Sales owner"
          />
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
