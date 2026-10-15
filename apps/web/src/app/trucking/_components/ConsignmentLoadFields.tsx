"use client";

import { Checkbox, Input, InputNumber, Select } from "antd";
import type { LoadInput } from "@/hooks/useTruckingConsignments";
import { TERMS } from "../_lib/glossary";
import { TruckingField } from "./TruckingField";

interface ConsignmentLoadFieldsProps {
  load: LoadInput;
  onChange: (load: LoadInput) => void;
  disabled?: boolean;
}

const PACKING_GROUPS: LoadInput["adrPackingGroup"][] = ["", "I", "II", "III"];
type NumberKey = "pieces" | "palletPlaces" | "ldm" | "weightKg" | "cbm";
const MEASURES: { key: NumberKey; label: string; step: number }[] = [
  { key: "pieces", label: "Pieces", step: 1 },
  { key: "palletPlaces", label: TERMS.palletPlaces, step: 1 },
  { key: "ldm", label: TERMS.ldm, step: 0.1 },
  { key: "weightKg", label: "Weight kg", step: 10 },
  { key: "cbm", label: "Volume m³", step: 0.1 },
];

// What a consignment carries: quantities, the extras the tariffs price (ADR, tail-lift, B2C,
// non-stackable) and the goods' description.
export const ConsignmentLoadFields = ({ load, onChange, disabled = false }: ConsignmentLoadFieldsProps) => {
  const set = <K extends keyof LoadInput>(key: K, value: LoadInput[K]) => onChange({ ...load, [key]: value });
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-[12px] font-bold uppercase tracking-wide text-slate-600">Load</legend>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {MEASURES.map((m) => (
          <TruckingField key={m.key} label={m.label}>
            <InputNumber aria-label={m.label} className="w-full" min={0} step={m.step} disabled={disabled} value={load[m.key]} onChange={(v) => set(m.key, v ?? 0)} />
          </TruckingField>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Checkbox disabled={disabled} checked={load.adr} onChange={(e) => set("adr", e.target.checked)}>
          {TERMS.adr} (dangerous goods)
        </Checkbox>
        <Checkbox disabled={disabled} checked={load.nonStackable} onChange={(e) => set("nonStackable", e.target.checked)}>
          Non-stackable
        </Checkbox>
        <Checkbox disabled={disabled} checked={load.tailLift} onChange={(e) => set("tailLift", e.target.checked)}>
          {TERMS.tailLift} needed
        </Checkbox>
        <Checkbox disabled={disabled} checked={load.b2c} onChange={(e) => set("b2c", e.target.checked)}>
          {TERMS.b2cDelivery}
        </Checkbox>
      </div>
      {load.adr && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TruckingField label="UN number">
            <Input aria-label="UN number" disabled={disabled} maxLength={4} inputMode="numeric" value={load.adrUn} onChange={(e) => set("adrUn", e.target.value.replace(/\D/g, ""))} />
          </TruckingField>
          <TruckingField label="Class">
            <Input aria-label="ADR class" disabled={disabled} value={load.adrClass} onChange={(e) => set("adrClass", e.target.value)} />
          </TruckingField>
          <TruckingField label="Packing group">
            <Select
              aria-label="Packing group"
              disabled={disabled}
              value={load.adrPackingGroup}
              options={PACKING_GROUPS.map((g) => ({ value: g, label: g || "None" }))}
              onChange={(g: LoadInput["adrPackingGroup"]) => set("adrPackingGroup", g)}
            />
          </TruckingField>
        </div>
      )}
      <TruckingField label="Goods">
        <Input.TextArea aria-label="Goods description" disabled={disabled} autoSize={{ minRows: 1, maxRows: 3 }} value={load.description} onChange={(e) => set("description", e.target.value)} />
      </TruckingField>
    </fieldset>
  );
};
