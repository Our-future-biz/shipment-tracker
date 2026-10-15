"use client";

import dayjs from "dayjs";
import { Checkbox, DatePicker, Input, InputNumber, Radio, Segmented, Select, TimePicker } from "antd";
import { useCustomerSites } from "@/hooks/useCustomerSites";
import { useHauliers, useTruckingSettings } from "@/hooks/useTrucking";
import type { ConsignmentScope } from "@/hooks/useTruckingConsignments";
import { LAST_MILE_OPTIONS, SCOPE_OPTIONS, type ConsignmentForm, type PriceSource } from "../_lib/consignmentForm";
import { CURRENCIES } from "../_lib/hauliers";
import { TERMS } from "../_lib/glossary";
import { ConsignmentLoadFields } from "./ConsignmentLoadFields";
import { ConsignmentStopFields } from "./ConsignmentStopFields";
import { TruckingField } from "./TruckingField";

interface ConsignmentFormFieldsProps {
  form: ConsignmentForm;
  onChange: (form: ConsignmentForm) => void;
  /** After the pick-up only references and notes change. */
  limited?: boolean;
}

// The fields of a consignment, shared by Create and Edit: service level and pick-up date, both
// stops (the customer's sites offered), the load and where the sell price comes from.
export const ConsignmentFormFields = ({ form, onChange, limited = false }: ConsignmentFormFieldsProps) => {
  const { settings } = useTruckingSettings();
  const { sites } = useCustomerSites(form.customerId ?? "");
  const { hauliers } = useHauliers();
  const ltl = form.scope === "LTL";
  // Blocked hauliers are not offered; the one already chosen stays visible.
  const partners = hauliers.filter((h) => h.status !== "blocked" || h.customerId === form.partnerHaulierCustomerId);
  const set = <K extends keyof ConsignmentForm>(key: K, value: ConsignmentForm[K]) => onChange({ ...form, [key]: value });

  const levels = (settings?.serviceLevels ?? []).filter((l) => l.active || l.code === form.serviceLevel);
  const priceOptions: { value: PriceSource; label: string; disabled?: boolean }[] = [
    { value: "TARIFF", label: "From the tariff" },
    { value: "QUOTE", label: form.quoteNumber ? `From quote ${form.quoteNumber}` : "From the quote", disabled: !form.quoteNumber },
    { value: "MANUAL", label: "Agreed price" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1 text-[12px] font-bold uppercase tracking-wide text-slate-600">Scope</legend>
        <Segmented<ConsignmentScope> block aria-label="Scope" disabled={limited} options={SCOPE_OPTIONS} value={form.scope} onChange={(scope) => set("scope", scope)} />
        {ltl && (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1.2fr] lg:items-end">
            <Checkbox disabled={limited} checked={form.selfDelivered} onChange={(e) => set("selfDelivered", e.target.checked)}>
              Customer brings goods to our warehouse
            </Checkbox>
            <TruckingField label="Last mile">
              <Radio.Group aria-label="Last mile" disabled={limited} value={form.lastMile} options={LAST_MILE_OPTIONS} onChange={(e) => set("lastMile", e.target.value)} />
            </TruckingField>
            {form.lastMile === "PARTNER" && (
              <TruckingField label={`${TERMS.partnerNetwork} haulier`} hint="Delivers in its region; priced per consignment from its buy tariff">
                <Select
                  showSearch
                  allowClear
                  aria-label="Partner haulier"
                  optionFilterProp="label"
                  disabled={limited}
                  value={form.partnerHaulierCustomerId ?? undefined}
                  options={partners.map((h) => ({ value: h.customerId, label: `${h.companyName}${h.status === "warning" ? " (warning)" : ""}` }))}
                  onChange={(id) => set("partnerHaulierCustomerId", id ?? null)}
                />
              </TruckingField>
            )}
          </div>
        )}
        {ltl && (
          <p className="m-0 text-[12px] text-slate-500">
            Goes through our warehouse: {form.selfDelivered ? "the customer brings it" : `a ${TERMS.pickupRun.toLowerCase()} collects it`}, the warehouse confirms the gate-in (the promised date counts from it), then{" "}
            {form.lastMile === "PARTNER" ? `the partner delivers it (a ${TERMS.lineHaul.toLowerCase()} takes it to the partner's depot when needed)` : `our ${TERMS.deliveryRun.toLowerCase()} delivers it`}. Legs are planned on the Planning tab.
          </p>
        )}
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TruckingField label={TERMS.serviceLevel} hint={ltl ? `${TERMS.ltl}: counted from the warehouse gate-in` : `${TERMS.ftl}: counted from the planned pick-up`}>
          <Select
            aria-label={TERMS.serviceLevel}
            disabled={limited}
            value={form.serviceLevel ?? undefined}
            options={levels.map((l) => ({ value: l.code, label: l.label }))}
            onChange={(code) => set("serviceLevel", code)}
          />
        </TruckingField>
        <TruckingField label="Planned pick-up">
          <DatePicker
            aria-label="Planned pick-up date"
            className="w-full"
            format="DD.MM.YYYY"
            allowClear={false}
            disabled={limited}
            value={form.pickupDate ? dayjs(form.pickupDate) : null}
            onChange={(d) => d && set("pickupDate", d.format("YYYY-MM-DD"))}
          />
        </TruckingField>
        <TruckingField label="Pick-up time" hint={`Empty = before the ${TERMS.cutoff.toLowerCase()}`}>
          <TimePicker
            aria-label="Pick-up time"
            className="w-full"
            format="HH:mm"
            minuteStep={5}
            needConfirm={false}
            disabled={limited}
            value={form.pickupTime ? dayjs(`2000-01-01T${form.pickupTime}`) : null}
            onChange={(t) => set("pickupTime", t ? t.format("HH:mm") : null)}
          />
        </TruckingField>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ConsignmentStopFields title="Pick-up" stop={form.pickup} sites={sites} limited={limited} onChange={(s) => set("pickup", s)} />
        <ConsignmentStopFields title="Delivery" stop={form.delivery} sites={sites} limited={limited} onChange={(s) => set("delivery", s)} />
      </div>

      <ConsignmentLoadFields load={form.load} disabled={limited} onChange={(l) => set("load", l)} />

      <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1 text-[12px] font-bold uppercase tracking-wide text-slate-600">Sell price</legend>
        <Radio.Group aria-label="Sell price" disabled={limited} value={form.priceSource} options={priceOptions} onChange={(e) => set("priceSource", e.target.value)} />
        {form.priceSource === "MANUAL" && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_100px_1fr]">
            <TruckingField label="Total">
              <InputNumber aria-label="Agreed total" className="w-full" min={0} disabled={limited} value={form.manualTotal} onChange={(v) => set("manualTotal", v)} />
            </TruckingField>
            <TruckingField label="Currency">
              <Select aria-label="Currency" disabled={limited} value={form.manualCurrency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={(c) => set("manualCurrency", c)} />
            </TruckingField>
            <TruckingField label="Why not the tariff">
              <Input aria-label="Why not the tariff" disabled={limited} maxLength={300} value={form.manualReason} onChange={(e) => set("manualReason", e.target.value)} />
            </TruckingField>
          </div>
        )}
        <p className="m-0 text-[12px] text-slate-500">
          The price is stored with the consignment and written to the job&apos;s selling costs. Below the {TERMS.marginFloor.toLowerCase()} it can be saved, but the transport order waits for a manager&apos;s approval.
        </p>
      </fieldset>
    </div>
  );
};
