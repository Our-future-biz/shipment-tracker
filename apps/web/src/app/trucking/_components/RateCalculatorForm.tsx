"use client";

import dayjs from "dayjs";
import { Checkbox, DatePicker, Input, InputNumber, Select, Switch, TimePicker } from "antd";
import { TERMS } from "../_lib/glossary";
import { formatPsc, pscDigits } from "../_lib/hauliers";
import type { RateExtras, RateForm } from "../_lib/rateCalculator";
import { SCOPE_LABELS, type TariffScope } from "../_lib/tariffs";
import { TruckingCustomerSelect } from "./TruckingCustomerSelect";
import { TruckingField } from "./TruckingField";

const SCOPE_OPTIONS = (Object.keys(SCOPE_LABELS) as TariffScope[]).map((k) => ({ value: k, label: SCOPE_LABELS[k] }));

type ExtraFlag = Exclude<keyof RateExtras, "waitingHours" | "declaredValueCzk">;

const EXTRA_FLAGS: { key: ExtraFlag; label: string }[] = [
  { key: "adr", label: TERMS.adr },
  { key: "tailLift", label: TERMS.tailLift },
  { key: "avizace", label: TERMS.avizace },
  { key: "timeWindow", label: "Time window" },
  { key: "b2c", label: TERMS.b2cDelivery },
  { key: "nonStackable", label: "Non-stackable" },
];

interface QuantityProps {
  label: string;
  value: number;
  step?: number;
  precision?: number;
  onChange: (value: number) => void;
}

const Quantity = ({ label, value, step = 1, precision, onChange }: QuantityProps) => (
  <TruckingField label={label}>
    <InputNumber aria-label={label} min={0} step={step} precision={precision} value={value} onChange={(v) => onChange(v ?? 0)} className="w-full" />
  </TruckingField>
);

interface RateCalculatorFormProps {
  form: RateForm;
  customerName: string | null;
  onChange: (form: RateForm) => void;
  onCustomerChange: (customerId: string | null, name: string | null) => void;
}

// What the calculator prices: the lane and pick-up, what is carried, extras, and whose prices.
export const RateCalculatorForm = ({ form, customerName, onChange, onCustomerChange }: RateCalculatorFormProps) => {
  const set = <K extends keyof RateForm>(key: K, value: RateForm[K]) => onChange({ ...form, [key]: value });
  const setExtra = <K extends keyof RateExtras>(key: K, value: RateExtras[K]) => onChange({ ...form, extras: { ...form.extras, [key]: value } });

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <TruckingField label="From PSČ">
          <Input aria-label="From postcode" inputMode="numeric" placeholder="110 00" value={formatPsc(form.fromPsc)} onChange={(e) => set("fromPsc", pscDigits(e.target.value))} />
        </TruckingField>
        <TruckingField label="To PSČ">
          <Input aria-label="To postcode" inputMode="numeric" placeholder="602 00" value={formatPsc(form.toPsc)} onChange={(e) => set("toPsc", pscDigits(e.target.value))} />
        </TruckingField>
        <TruckingField label="Pick-up date">
          <DatePicker
            aria-label="Pick-up date"
            format="DD.MM.YYYY"
            allowClear={false}
            value={form.pickupDate ? dayjs(form.pickupDate) : null}
            onChange={(d) => set("pickupDate", d ? d.format("YYYY-MM-DD") : "")}
            className="w-full"
          />
        </TruckingField>
        <TruckingField label="Pick-up time" hint={`Empty = before the ${TERMS.cutoff.toLowerCase()}`}>
          <TimePicker
            aria-label="Pick-up time"
            format="HH:mm"
            minuteStep={5}
            needConfirm={false}
            value={form.pickupTime ? dayjs(`2000-01-01T${form.pickupTime}`) : null}
            onChange={(t) => set("pickupTime", t ? t.format("HH:mm") : null)}
            className="w-full"
          />
        </TruckingField>
        <TruckingField label="Scope">
          <Select aria-label="Scope" value={form.scope} options={SCOPE_OPTIONS} onChange={(v) => set("scope", v)} />
        </TruckingField>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Quantity label="Pieces" value={form.pieces} precision={0} onChange={(v) => set("pieces", v)} />
        <Quantity label={TERMS.palletPlaces} value={form.palletPlaces} precision={0} onChange={(v) => set("palletPlaces", v)} />
        <Quantity label={TERMS.ldm} value={form.ldm} step={0.1} precision={1} onChange={(v) => set("ldm", v)} />
        <Quantity label="Weight (kg)" value={form.weightKg} step={10} onChange={(v) => set("weightKg", v)} />
        <Quantity label="Volume (m³)" value={form.cbm} step={0.1} precision={2} onChange={(v) => set("cbm", v)} />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Extras</span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {EXTRA_FLAGS.map((x) => (
            <Checkbox key={x.key} checked={form.extras[x.key]} onChange={(e) => setExtra(x.key, e.target.checked)}>
              {x.label}
            </Checkbox>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <TruckingField label={`${TERMS.waitingTime} (hours)`}>
            <InputNumber aria-label="Waiting hours" min={0} step={0.5} value={form.extras.waitingHours} onChange={(v) => setExtra("waitingHours", v ?? 0)} className="w-full" />
          </TruckingField>
          <TruckingField label="Declared value (CZK)" hint="Set it to add insurance">
            <InputNumber
              aria-label="Declared value in CZK"
              min={0}
              step={10000}
              value={form.extras.declaredValueCzk}
              onChange={(v) => setExtra("declaredValueCzk", v ?? null)}
              className="w-full"
            />
          </TruckingField>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_3fr] gap-3 items-end">
        <TruckingField label="Customer" hint="Empty = the Standard sell list">
          <TruckingCustomerSelect ariaLabel="Customer" placeholder="Standard sell list" value={form.customerId} valueName={customerName} onChange={onCustomerChange} />
        </TruckingField>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-1">
          <span className="flex items-center gap-2">
            <Switch size="small" checked={form.includeBuy} aria-label="Include buy prices" onChange={(on) => set("includeBuy", on)} />
            <span className="text-[13px] text-slate-700">Include buy (hauliers, margin)</span>
          </span>
          <span className="flex items-center gap-2">
            <Switch size="small" checked={form.includeInternal} aria-label="Include internal price" onChange={(on) => set("includeInternal", on)} />
            <span className="text-[13px] text-slate-700">Include internal</span>
          </span>
        </div>
      </div>
    </div>
  );
};
