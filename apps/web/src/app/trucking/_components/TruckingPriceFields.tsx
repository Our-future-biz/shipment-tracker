"use client";

import { Input, InputNumber, Radio, Select } from "antd";
import { CURRENCIES } from "../_lib/hauliers";
import type { PriceForm } from "../_lib/planning";
import { TruckingField } from "./TruckingField";

interface TruckingPriceFieldsProps {
  value: PriceForm;
  onChange: (value: PriceForm) => void;
  /** "From the haulier's tariff" by default. */
  tariffLabel?: string;
}

// The buy price of a trip or a partner delivery: from the haulier's tariff, or agreed (total,
// currency and why the tariff is not used).
export const TruckingPriceFields = ({ value, onChange, tariffLabel = "From the haulier's tariff" }: TruckingPriceFieldsProps) => (
  <div className="flex flex-col gap-3">
    <Radio.Group
      aria-label="Buy price"
      value={value.source}
      options={[
        { value: "TARIFF", label: tariffLabel },
        { value: "MANUAL", label: "Agreed price" },
      ]}
      onChange={(e) => onChange({ ...value, source: e.target.value })}
    />
    {value.source === "MANUAL" && (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_96px_1fr]">
        <TruckingField label="Total">
          <InputNumber aria-label="Agreed total" className="w-full" min={0} value={value.total} onChange={(total) => onChange({ ...value, total })} />
        </TruckingField>
        <TruckingField label="Currency">
          <Select aria-label="Currency" value={value.currency} options={CURRENCIES.map((c) => ({ value: c, label: c }))} onChange={(currency) => onChange({ ...value, currency })} />
        </TruckingField>
        <TruckingField label="Why not the tariff">
          <Input aria-label="Why not the tariff" maxLength={300} value={value.reason} onChange={(e) => onChange({ ...value, reason: e.target.value })} />
        </TruckingField>
      </div>
    )}
  </div>
);
