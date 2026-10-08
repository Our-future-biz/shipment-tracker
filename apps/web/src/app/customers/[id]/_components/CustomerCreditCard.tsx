"use client";

import { useId, useState } from "react";
import { Button, InputNumber } from "antd";
import { SectionCard } from "@/components/SectionCard";
import { useCustomer } from "@/hooks/useCustomers";
import type { CustomerItem } from "@/hooks/useCustomers";
import { useToast } from "@/lib/toast";
import { fmtMoney, moneyInputParser } from "../../_lib/customerMoney";
import type { KpiTone } from "./CustomerKpiTile";

const AMBER_FROM_PCT = 70;
const RED_FROM_PCT = 90;

// One set of thresholds for the Utilization tile and the bar, so both change colour at the same point.
export function utilizationTone(pct: number | null): KpiTone | undefined {
  if (pct === null) return undefined;
  if (pct >= RED_FROM_PCT) return "red";
  if (pct >= AMBER_FROM_PCT) return "amber";
  return undefined;
}

const BAR_CLASS: Record<KpiTone, string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-green-500",
};

const LABEL_CLASS = "text-[11px] font-bold text-slate-500 uppercase tracking-wide";

interface CustomerCreditCardProps {
  customer: CustomerItem;
  // Unpaid invoice total, from summarizeInvoices().
  outstanding: number;
  // Share of the limit in use, in percent; null when no limit is set.
  utilization: number | null;
}

// How much of the credit limit is in use, and the only place where the limit is edited.
export function CustomerCreditCard({ customer, outstanding, utilization }: CustomerCreditCardProps) {
  const toast = useToast();
  const inputId = useId();
  const { updateCustomer } = useCustomer(customer.id);
  const { creditLimit, currency } = customer;

  const [draft, setDraft] = useState<number | null>(creditLimit);
  // What the field is compared with. It moves to a newly saved value at once; the refetched customer arrives a moment later.
  const [savedLimit, setSavedLimit] = useState(creditLimit);
  const [storedLimit, setStoredLimit] = useState(creditLimit);
  const [saving, setSaving] = useState(false);

  // The stored limit changed underneath the editor (our own save landing, or an edit elsewhere): start again from it.
  if (storedLimit !== creditLimit) {
    setStoredLimit(creditLimit);
    setSavedLimit(creditLimit);
    setDraft(creditLimit);
  }

  // An emptied field means "no limit", which is stored as 0.
  const nextLimit = draft ?? 0;
  const dirty = nextLimit !== savedLimit;
  const fillPct = Math.min(100, utilization ?? 0);

  const handleSave = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const { customer: updated } = await updateCustomer({ creditLimit: nextLimit });
      setSavedLimit(updated.creditLimit);
      setDraft(updated.creditLimit);
      toast.success("Credit limit saved");
    } catch {
      toast.error("Failed to save the credit limit");
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard title="Credit">
      <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className={LABEL_CLASS}>Utilization</span>
            <span className={`text-[13px] font-semibold ${utilization === null ? "text-slate-300" : "text-slate-800"}`}>
              {utilization === null ? "—" : `${utilization}%`}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label="Credit utilization"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={fillPct}
            aria-valuetext={utilization === null ? "No credit limit set" : `${utilization}%`}
            className="h-2.5 rounded-full bg-slate-100 overflow-hidden"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-300 ${BAR_CLASS[utilizationTone(utilization) ?? "green"]}`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            {utilization === null
              ? "Set a credit limit to track how much of it is in use."
              : `${fmtMoney(outstanding, currency)} of ${fmtMoney(creditLimit, currency)} used`}
          </div>
        </div>

        <div>
          <label htmlFor={inputId} className={`block mb-1.5 ${LABEL_CLASS}`}>
            Credit limit
          </label>
          <div className="flex items-center gap-2">
            {/* Width needs "!": antd's own input-number width is unlayered CSS and would win over a plain utility. */}
            <InputNumber<number>
              id={inputId}
              className="!w-44"
              min={0}
              controls={false}
              parser={moneyInputParser}
              placeholder="0"
              suffix={currency}
              value={draft}
              disabled={saving}
              onChange={setDraft}
              onPressEnter={handleSave}
            />
            <Button type="primary" size="small" loading={saving} disabled={!dirty} onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
