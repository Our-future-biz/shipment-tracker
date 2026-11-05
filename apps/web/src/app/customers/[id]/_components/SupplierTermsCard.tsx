"use client";

import { useState } from "react";
import { Alert, Button, InputNumber, Select, Switch } from "antd";
import { EditOutlined, LockOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import { useCustomer } from "@/hooks/useCustomers";
import { useSupplierTerms, type SupplierTermsInput } from "@/hooks/useSupplierTerms";
import { apiErrorMessage } from "@/lib/api";
import { businessDateTime, businessDayOf, businessToday, formatDate } from "@/lib/date";
import { CURRENCIES } from "@/lib/enums";
import { useToast } from "@/lib/toast";
import { HaulierBankAccounts } from "@/app/trucking/hauliers/_components/HaulierBankAccounts";
import { LABEL_TEXT } from "@/styles/ui";

interface SupplierTermsCardProps {
  customer: CustomerItem;
}

// Trucking holds an exact-match haulier invoice for a manager this long after an account is added.
const BANK_HOLD_DAYS = 30;
const HAULIER_CURRENCIES = ["CZK", "EUR"];

// Nothing is filled in that nobody chose (K7): days and currency not set stay empty until typed. `fromTrucking`
// tells the server the editor starts from Trucking's copy, so a first save of a haulier is not refused.
const draftOf = (c: CustomerItem, fromTrucking: boolean): SupplierTermsInput => ({
  paymentDays: c.supplierTerms.paymentDays,
  currency: c.supplierTerms.currency ?? "",
  vatUnreliable: c.supplierTerms.vatUnreliable,
  bankAccountPublished: c.supplierTerms.bankAccountPublished,
  vatCheckedAt: c.supplierTerms.vatCheckedAt,
  bankAccounts: [...c.supplierTerms.bankAccounts],
  fromTrucking,
});

// What a haulier's save still lacks, as the server would refuse it: Trucking pays by the days, in CZK or EUR.
const haulierMissing = (d: SupplierTermsInput): string | null => {
  if (d.paymentDays === null) return "A haulier needs its payment days: Trucking pays its invoices by them";
  if (!HAULIER_CURRENCIES.includes(d.currency)) return "A haulier is paid in CZK or EUR";
  return null;
};

// What we pay a supplier and the VAT register checks before we do (Council Outlay 7, step 6b): kept here
// only, a haulier's copied to Trucking on every save. Managers and admins change them (the server says
// who: canEditSupplierTerms); everyone sees them.
export function SupplierTermsCard({ customer }: SupplierTermsCardProps) {
  const toast = useToast();
  const { canEditSupplierTerms, supplierTermsFromTrucking, supplierTermsUnavailable } = useCustomer(customer.id);
  const { saveTerms, saving } = useSupplierTerms(customer.id);
  const [draft, setDraft] = useState<SupplierTermsInput | null>(null);
  const terms = customer.supplierTerms;
  const haulier = customer.roles.includes("haulier");
  const editing = draft !== null;
  const shown = draft ?? draftOf(customer, supplierTermsFromTrucking);
  const set = <K extends keyof SupplierTermsInput>(key: K, value: SupplierTermsInput[K]) =>
    setDraft((d) => ({ ...(d ?? draftOf(customer, supplierTermsFromTrucking)), [key]: value }));
  const missing = haulier && draft ? haulierMissing(draft) : null;
  // Trucking's copy could not be read: an edit from what is shown could wipe the VAT and bank details it holds.
  const canEdit = canEditSupplierTerms && !supplierTermsUnavailable;
  const holdUntil = terms.bankAccountsChangedAt ? new Date(Date.parse(terms.bankAccountsChangedAt) + BANK_HOLD_DAYS * 86_400_000) : null;
  const onHold = haulier && holdUntil !== null && holdUntil.getTime() > Date.now();
  const currencies = haulier ? HAULIER_CURRENCIES : [...CURRENCIES];

  const handleSave = () => {
    if (!draft) return;
    saveTerms(draft).then(
      () => {
        setDraft(null);
        toast.success(haulier ? "Saved, and copied to Trucking" : "Saved");
      },
      (err: unknown) => toast.error(`Not saved: ${apiErrorMessage(err)}`),
    );
  };

  const extra = canEdit ? (
    editing ? (
      <span className="flex gap-2">
        <Button size="small" onClick={() => setDraft(null)} disabled={saving}>
          Cancel
        </Button>
        <Button size="small" type="primary" onClick={handleSave} loading={saving} disabled={!!missing} title={missing ?? undefined}>
          Save
        </Button>
      </span>
    ) : (
      <Button size="small" icon={<EditOutlined />} onClick={() => setDraft(draftOf(customer, supplierTermsFromTrucking))}>
        Edit
      </Button>
    )
  ) : null;

  return (
    <SectionCard title="Terms and checks" extra={extra}>
      <div className="flex flex-col gap-4">
        {supplierTermsFromTrucking && (
          <Alert
            type="info"
            showIcon
            message="Shown as Trucking holds them"
            description="These are not saved in the Customer Database yet. The first save keeps them here, with any change you make, and Trucking goes on using them."
          />
        )}
        {supplierTermsUnavailable && (
          <Alert
            type="warning"
            showIcon
            message="Trucking's copy of these terms could not be read"
            description="They are not saved in the Customer Database yet, and Trucking may hold more than is shown here. Reload the page in a moment to see and edit them."
          />
        )}
        {missing && <Alert type="error" showIcon message={missing} />}
        {!canEditSupplierTerms && (
          <Alert type="info" showIcon icon={<LockOutlined />} message="Only a manager can change a supplier's payment terms and VAT / bank details." />
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={LABEL_TEXT}>Payment days (we pay within)</span>
            {editing ? (
              <InputNumber
                aria-label="Payment days"
                min={0}
                max={365}
                precision={0}
                placeholder={haulier ? "Required" : "Not set"}
                value={shown.paymentDays}
                onChange={(v) => set("paymentDays", v ?? null)}
                status={haulier && shown.paymentDays === null ? "error" : undefined}
                className="!w-full"
              />
            ) : (
              <span className="text-[14px] text-slate-900">{terms.paymentDays === null ? "Not set" : `${terms.paymentDays} days`}</span>
            )}
          </label>
          <label className="flex flex-col gap-1">
            <span className={LABEL_TEXT}>Paid in{haulier ? " (a haulier: CZK or EUR)" : ""}</span>
            {editing ? (
              <Select
                aria-label="Currency"
                showSearch
                allowClear={!haulier}
                placeholder={haulier ? "Required" : "Not set"}
                value={shown.currency || undefined}
                options={currencies.map((c) => ({ value: c, label: c }))}
                onChange={(v: string | undefined) => set("currency", v ?? "")}
                status={haulier && !HAULIER_CURRENCIES.includes(shown.currency) ? "error" : undefined}
                className="w-full"
              />
            ) : (
              <span className="text-[14px] text-slate-900">{terms.currency ?? "Not set"}</span>
            )}
          </label>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <span className={LABEL_TEXT}>VAT register</span>
          <div className="flex items-center gap-2">
            <Switch size="small" checked={shown.vatUnreliable} disabled={!editing} aria-label="Unreliable VAT payer" onChange={(on) => set("vatUnreliable", on)} />
            <span className={`text-[13px] ${shown.vatUnreliable ? "font-semibold text-red-700" : "text-slate-700"}`}>Unreliable VAT payer</span>
            {haulier && shown.vatUnreliable && <span className="text-[11px] text-red-600">— blocks the haulier in Trucking</span>}
          </div>
          <div className="flex items-center gap-2">
            <Switch size="small" checked={shown.bankAccountPublished} disabled={!editing} aria-label="Bank account published" onChange={(on) => set("bankAccountPublished", on)} />
            <span className="text-[13px] text-slate-700">Bank account published in the VAT register</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-slate-700">
            <span>Last checked: {shown.vatCheckedAt ? formatDate(shown.vatCheckedAt) : "never"}</span>
            {editing && (
              <Button size="small" onClick={() => set("vatCheckedAt", businessToday())} disabled={shown.vatCheckedAt === businessToday()}>
                Mark checked today
              </Button>
            )}
          </div>
          <HaulierBankAccounts accounts={shown.bankAccounts} onChange={(v) => set("bankAccounts", v)} readOnly={!editing} haulier={haulier} />
          {terms.bankAccountsChangedAt && (
            <p className={`m-0 text-[12px] ${onHold ? "text-amber-700" : "text-slate-400"}`}>
              An account was added{terms.bankAccountsChangedBy ? ` by ${terms.bankAccountsChangedBy}` : ""} on {businessDateTime(terms.bankAccountsChangedAt)}
              {onHold && holdUntil ? `: until ${formatDate(businessDayOf(holdUntil.toISOString()))} a haulier invoice waits for a manager, even on an exact match.` : "."}
            </p>
          )}
          <p className="m-0 text-[11px] text-slate-400">
            Checked by hand in the VAT register for now.{haulier ? " Trucking blocks paying a haulier invoice while the haulier is an unreliable VAT payer, its account is not published, or the invoice's account is not listed here." : ""}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}
