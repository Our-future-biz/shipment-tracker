"use client";

import { Select, Button } from "antd";
import { useEffect, useState } from "react";
import { KpiCard, SectionCard } from "./shared";
import { useCustomer } from "@/hooks/useCustomers";
import { PAYMENT_TERMS } from "@/app/customers/_lib/constants";
import { useToast } from "@/lib/toast";

const OPTIONS = PAYMENT_TERMS.map((term) => ({ label: term, value: term }));

export function PaymentSection({ customerId }: { customerId: string }) {
  const { customer, updateCustomer } = useCustomer(customerId);
  const toast = useToast();

  const savedGeneral = customer?.paymentTerms ?? "";
  const savedFreight = customer?.freightPaymentTerms ?? "";
  const savedDuty = customer?.dutyPaymentTerms ?? "";

  const [general, setGeneral] = useState<string>("");
  const [freight, setFreight] = useState<string>("");
  const [duty, setDuty] = useState<string>("");

  useEffect(() => {
    if (!customer) return;
    setGeneral(customer.paymentTerms ?? "");
    setFreight(customer.freightPaymentTerms ?? "");
    setDuty(customer.dutyPaymentTerms ?? "");
  }, [customer]);

  const dirty =
    general !== savedGeneral || freight !== savedFreight || duty !== savedDuty;

  const handleSave = () => {
    updateCustomer({
      paymentTerms: general,
      freightPaymentTerms: freight,
      dutyPaymentTerms: duty,
    });
    toast.success("Payment terms saved");
  };

  const handleDiscard = () => {
    setGeneral(savedGeneral);
    setFreight(savedFreight);
    setDuty(savedDuty);
  };

  const renderSelect = (
    label: string,
    value: string,
    onChange: (next: string) => void,
  ) => (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">
        {label}
      </label>
      <Select
        className="w-full"
        placeholder="Select terms"
        options={OPTIONS}
        value={value || undefined}
        onChange={(next: string) => onChange(next)}
      />
      {value === "PREPAYMENT" && (
        <div className="text-red-600 font-medium text-xs mt-1">
          Prepayment required
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <KpiCard
          label="General terms"
          value={savedGeneral || "—"}
          tone={savedGeneral === "PREPAYMENT" ? "red" : undefined}
        />
        <KpiCard
          label="Freight terms"
          value={savedFreight || "—"}
          tone={savedFreight === "PREPAYMENT" ? "red" : undefined}
        />
        <KpiCard
          label="Duty terms"
          value={savedDuty || "—"}
          tone={savedDuty === "PREPAYMENT" ? "red" : undefined}
        />
      </div>

      <SectionCard title="Payment terms">
        {dirty && (
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700 mb-4">
            <span>You have unsaved changes</span>
            <div className="flex items-center gap-2">
              <Button size="small" onClick={handleDiscard}>
                Discard
              </Button>
              <Button size="small" type="primary" onClick={handleSave}>
                Save
              </Button>
            </div>
          </div>
        )}

        <div className="grid gap-4">
          {renderSelect("General", general, setGeneral)}
          {renderSelect("Freight", freight, setFreight)}
          {renderSelect("Duty", duty, setDuty)}
        </div>
      </SectionCard>
    </div>
  );
}
