"use client";

import type { ReactNode } from "react";
import { Checkbox, InputNumber, Radio, Select } from "antd";
import { moneyInputParser } from "@/lib/money";
import type { QuoteReefer } from "../../../_lib/types";
import { LineBlock } from "./LineBlock";

interface QuoteReeferBlockProps {
  value: QuoteReefer | undefined;
  onChange: (patch: Partial<QuoteReefer>) => void;
  // Why the Cargo details step is not complete yet (reeferMissing); shown at the set-point.
  missing: string | null;
}

// The vent as a reefer unit can be set: closed, or open at a flow (m³/h) or a share of the opening.
const VENT_OPTIONS = [
  { value: "closed", label: "Closed" },
  { value: "m3h", label: "Open · m³/h" },
  { value: "percent", label: "Open · % of opening" },
];
const SHORE_POWER_OPTIONS = [
  { value: "available", label: "Available at the terminal" },
  { value: "check", label: "To be checked" },
  { value: "none", label: "Not available" },
];

// One of the four groups of questions: a numbered heading over its fields.
function Group({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
        {n}. {title}
      </div>
      {children}
    </div>
  );
}

// A label and its field on one line, the label of a fixed width so the fields of a group align.
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className="w-[150px] shrink-0 pt-1 text-slate-500 font-medium">{label}</span>
      <div className="flex-1 min-w-0">
        {children}
        {hint && <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>}
      </div>
    </div>
  );
}

// The reefer requirements of a quote with a reefer box (RF / HR) among its containers: the
// set-point - required - and what the cargo or the shipper needs of the unit's atmosphere,
// drains, monitoring, power and papers. Every change is saved with the quote, as the rest of it.
export function QuoteReeferBlock({ value, onChange, missing }: QuoteReeferBlockProps) {
  const r = value ?? {};
  const ventOpen = r.ventMode === "m3h" || r.ventMode === "percent";
  return (
    <LineBlock title="Reefer requirements">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5 p-3">
        <Group n={1} title="Cargo and set-point">
          <Field label="Set-point (required)" hint={missing ?? undefined}>
            <InputNumber
              size="small"
              className="!w-[140px]"
              aria-label="Set-point temperature in °C"
              status={typeof r.setPoint === "number" ? undefined : "error"}
              min={-40}
              max={40}
              step={0.5}
              parser={moneyInputParser}
              value={r.setPoint}
              suffix="°C"
              onChange={(v) => onChange({ setPoint: v ?? undefined })}
            />
          </Field>
          <Field label="Tolerance">
            <div className="flex items-center gap-3">
              <Checkbox checked={!!r.toleranceRequired} onChange={(e) => onChange({ toleranceRequired: e.target.checked, ...(e.target.checked ? {} : { tolerance: undefined }) })}>
                Allowed
              </Checkbox>
              {r.toleranceRequired && (
                <InputNumber
                  size="small"
                  className="!w-[120px]"
                  aria-label="Set-point tolerance in °C"
                  min={0}
                  max={10}
                  step={0.5}
                  parser={moneyInputParser}
                  value={r.tolerance}
                  prefix="±"
                  suffix="°C"
                  placeholder="e.g. 2"
                  onChange={(v) => onChange({ tolerance: v ?? undefined })}
                />
              )}
            </div>
          </Field>
        </Group>

        <Group n={2} title="Atmosphere and airflow">
          <Field label="Ventilation (fresh air)" hint={r.ventMode === "m3h" ? "Typically 0-250 m³/h, depending on the unit" : undefined}>
            <div className="flex items-center gap-2">
              <Select
                size="small"
                className="w-[170px]"
                aria-label="Ventilation"
                placeholder="Not specified"
                allowClear
                value={r.ventMode}
                options={VENT_OPTIONS}
                onChange={(v) => onChange({ ventMode: v, ...(v === "m3h" || v === "percent" ? {} : { ventValue: undefined }) })}
              />
              {ventOpen && (
                <InputNumber
                  size="small"
                  className="!w-[120px]"
                  aria-label={r.ventMode === "m3h" ? "Ventilation in m³/h" : "Ventilation in % of opening"}
                  min={0}
                  max={r.ventMode === "m3h" ? 250 : 100}
                  parser={moneyInputParser}
                  value={r.ventValue}
                  suffix={r.ventMode === "m3h" ? "m³/h" : "%"}
                  onChange={(v) => onChange({ ventValue: v ?? undefined })}
                />
              )}
            </div>
          </Field>
          <Field label="Humidity" hint={r.humidityControl ? "Only where the unit controls humidity - typically 60-95 % RH" : undefined}>
            <div className="flex items-center gap-3">
              <Checkbox checked={!!r.humidityControl} onChange={(e) => onChange({ humidityControl: e.target.checked, ...(e.target.checked ? {} : { humidity: undefined }) })}>
                Controlled
              </Checkbox>
              {r.humidityControl && (
                <InputNumber
                  size="small"
                  className="!w-[120px]"
                  aria-label="Target relative humidity in %"
                  min={60}
                  max={95}
                  parser={moneyInputParser}
                  value={r.humidity}
                  suffix="% RH"
                  onChange={(v) => onChange({ humidity: v ?? undefined })}
                />
              )}
            </div>
          </Field>
        </Group>

        <Group n={3} title="Drain holes">
          <Field label="Drainage">
            <Radio.Group size="small" value={r.drains} onChange={(e) => onChange({ drains: e.target.value })}>
              <Radio value="open">Open</Radio>
              <Radio value="closed">Closed</Radio>
            </Radio.Group>
          </Field>
        </Group>

        <Group n={4} title="Monitoring and documentation">
          <Field label="Cold-chain proof" hint="If the shipper requires proof of the cold chain">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Checkbox checked={!!r.dataLogger} onChange={(e) => onChange({ dataLogger: e.target.checked })}>
                Data logger / USB download
              </Checkbox>
              <Checkbox checked={!!r.recorderCertificate} onChange={(e) => onChange({ recorderCertificate: e.target.checked })}>
                Temperature recorder certificate
              </Checkbox>
            </div>
          </Field>
          <Field label="Power on inland legs" hint="Rail, road or inland legs">
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <Checkbox checked={!!r.genset} onChange={(e) => onChange({ genset: e.target.checked })}>
                  Genset (clip-on)
                </Checkbox>
                <Checkbox checked={!!r.plugIn} onChange={(e) => onChange({ plugIn: e.target.checked })}>
                  Reefer plug-in
                </Checkbox>
              </div>
              <Select
                size="small"
                className="w-[220px]"
                aria-label="Shore power at the terminal"
                placeholder="Shore power at the terminal"
                allowClear
                value={r.shorePower}
                options={SHORE_POWER_OPTIONS}
                onChange={(v) => onChange({ shorePower: v })}
              />
            </div>
          </Field>
          <Field label="Certificates" hint="If applicable">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Checkbox checked={!!r.phytosanitary} onChange={(e) => onChange({ phytosanitary: e.target.checked })}>
                Phytosanitary
              </Checkbox>
              <Checkbox checked={!!r.sanitary} onChange={(e) => onChange({ sanitary: e.target.checked })}>
                Sanitary
              </Checkbox>
              <Checkbox checked={!!r.veterinary} onChange={(e) => onChange({ veterinary: e.target.checked })}>
                Veterinary
              </Checkbox>
            </div>
          </Field>
        </Group>
      </div>
    </LineBlock>
  );
}
