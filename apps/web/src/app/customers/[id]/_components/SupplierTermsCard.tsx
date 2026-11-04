"use client";

import { useState } from "react";
import { Alert, Button, InputNumber, Select, Switch } from "antd";
import { EditOutlined, LockOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import type { CustomerItem } from "@/hooks/useCustomers";
import { useCustomer } from "@/hooks/useCustomers";
import { useSupplierTerms, type SupplierTermsInput } from "@/hooks/useSupplierTerms";
import { apiErrorMessage } from "@/lib/api";
import { businessDayOf, businessToday, formatDate, formatDateTime } from "@/lib/date";
import { CURRENCIES } from "@/lib/enums";
import { useToast } from "@/lib/toast";
import { HaulierBankAccounts } from "@/app/trucking/hauliers/_components/HaulierBankAccounts";

interface SupplierTermsCardProps {
  customer: CustomerItem;
}

// Trucking holds an exact-match haulier invoice for a manager this long after an account is added.
const BANK_HOLD_DAYS = 30;
const HAULIER_CURRENCIES = ["CZK", "EUR"];

const draftOf = (c: CustomerItem): SupplierTermsInput => ({
  paymentDays: c.supplierTerms.paymentDays ?? 30,
  currency: c.supplierTerms.currency ?? (c.roles.includes("haulier") ? "CZK" : c.currency),
  vatUnreliable: c.supplierTerms.vatUnreliable,
  bankAccountPublished: c.supplierTerms.bankAccountPublished,
  vatCheckedAt: c.supplierTerms.vatCheckedAt,
  bankAccounts: [...c.supplierTerms.bankAccounts],
});

// What we pay a supplier and the VAT register checks before we do (Council Outlay 7, step 6b): kept here
// only, a haulier's copied to Trucking on every save. Managers and admins change them (the server says
// who: canEditSupplierTerms); everyone sees them.
export function SupplierTermsCard({ customer }: SupplierTermsCardProps) {
  const toast = useToast();
  const { canEditSupplierTerms } = useCustomer(customer.id);
  const { saveTerms, saving } = useSupplierTerms(customer.id);
  const [draft, setDraft] = useState<SupplierTermsInput | null>(null);
  const terms = customer.supplierTerms;
  const haulier = customer.roles.includes("haulier");
  const editing = draft !== null;
  const shown = draft ?? draftOf(customer);
  const set = <K extends keyof SupplierTermsInput>(key: K, value: SupplierTermsInput[K]) => setDraft((d) => ({ ...(d ?? draftOf(customer)), [key]: value }));
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

  const extra = canEditSupplierTerms ? (
    editing ? (
      <span className="flex gap-2">
        <Button size="small" onClick={() => setDraft(null)} disabled={saving}>
          Cancel
        </Button>
        <Button size="small" type="primary" onClick={handleSave} loading={saving}>
          Save
        </Button>
      </span>
    ) : (
      <Button size="small" icon={<EditOutlined />} onClick={() => setDraft(draftOf(customer))}>
        Edit
      </Button>
    )
  ) : null;

  return (
    <SectionCard title="Terms and checks" extra={extra}>
      <div className="flex flex-col gap-4">
        {!canEditSupplierTerms && (
          <Alert type="info" showIcon icon={<LockOutlined />} message="Only a manager can change a supplier's payment terms and VAT / bank details." />
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[12px] text-slate-500">
            Payment days (we pay within)
            {editing ? (
              <InputNumber aria-label="Payment days" min={0} max={365} precision={0} value={shown.paymentDays} onChange={(v) => set("paymentDays", v ?? 0)} className="w-full" />
            ) : (
              <span className="text-[14px] text-slate-800">{terms.paymentDays === null ? "Not set" : `${terms.paymentDays} days`}</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-slate-500">
            Paid in{haulier ? " (a haulier: CZK or EUR)" : ""}
            {editing ? (
              <Select aria-label="Currency" value={shown.currency} options={currencies.map((c) => ({ value: c, label: c }))} onChange={(v: string) => set("currency", v)} className="w-full" />
            ) : (
              <span className="text-[14px] text-slate-800">{terms.currency ?? "Not set"}</span>
            )}
          </label>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3">
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">VAT register</span>
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
          <HaulierBankAccounts accounts={shown.bankAccounts} onChange={(v) => set("bankAccounts", v)} readOnly={!editing} />
          {terms.bankAccountsChangedAt && (
            <p className={`m-0 text-[12px] ${onHold ? "text-amber-700" : "text-slate-400"}`}>
              An account was added{terms.bankAccountsChangedBy ? ` by ${terms.bankAccountsChangedBy}` : ""} on {formatDateTime(terms.bankAccountsChangedAt)}
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
