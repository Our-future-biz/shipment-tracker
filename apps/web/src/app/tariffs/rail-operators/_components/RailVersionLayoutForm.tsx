"use client";

import { Button, Input, InputNumber, Select, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { RailBand, RailLayout } from "@/hooks/useRailTariffs";
import { COLUMN_FIELDS, columnOptions, newBand } from "../../_lib/railLayoutForm";
import { bandText } from "../../_lib/railTariffs";
import { ConditionsField, DayField, Field, SubTitle } from "../../_components/TariffFormParts";

const NONE = "";

interface RailVersionLayoutFormProps {
  form: RailLayout;
  onChange: (form: RailLayout) => void;
  sheetNames: string[];
  /** Headings of the chosen sheet's columns, by letter */
  headings: Map<string, string>;
  disabled: boolean;
}

// The controls of a draft's layout: which sheet and rows, what each column holds, the price
// columns with their container lengths and weights, and the file's facts (currency, validity,
// terms). The ports and import / export belong to the tariff, not to a file. Every change goes to
// `onChange` as a whole new layout.
export const RailVersionLayoutForm = ({ form, onChange, sheetNames, headings, disabled }: RailVersionLayoutFormProps) => {
  const options = columnOptions(headings, form);
  const set = <K extends keyof RailLayout>(key: K, value: RailLayout[K]) => onChange({ ...form, [key]: value });
  const setBand = (i: number, patch: Partial<RailBand>) => set("bands", form.bands.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Sheet">
          <Select aria-label="Sheet" value={form.sheet} disabled={disabled} options={sheetNames.map((n) => ({ value: n, label: n }))} onChange={(v: string) => set("sheet", v)} />
        </Field>
        <Field label="Headings row">
          <InputNumber aria-label="Headings row" min={1} precision={0} value={form.headerRow} disabled={disabled} onChange={(v) => v != null && set("headerRow", v)} className="!w-full" />
        </Field>
        <Field label="First price row">
          <InputNumber aria-label="First price row" min={1} precision={0} value={form.firstDataRow} disabled={disabled} onChange={(v) => v != null && set("firstDataRow", v)} className="!w-full" />
        </Field>
        <Field label="Last price row" hint="Only when notes or other tables follow the prices; empty reads to the end.">
          <InputNumber
            aria-label="Last price row"
            min={1}
            precision={0}
            value={form.lastDataRow}
            placeholder="to the end"
            disabled={disabled}
            onChange={(v) => set("lastDataRow", v ?? null)}
            className="!w-full"
          />
        </Field>
        <Field label="Name the AI suggests" hint="A new tariff is named so; rename a tariff on its operator's page.">
          <Input aria-label="Name" value={form.name} maxLength={200} disabled={disabled} onChange={(e) => set("name", e.target.value)} />
        </Field>
      </div>

      <SubTitle>Columns</SubTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {COLUMN_FIELDS.map(({ key, label }) => (
          <Field key={key} label={label}>
            <Select
              aria-label={`${label} column`}
              showSearch
              optionFilterProp="label"
              disabled={disabled}
              value={form.columns[key] ?? NONE}
              options={key === "place" ? options : [{ value: NONE, label: "— none —" }, ...options]}
              onChange={(v: string) => set("columns", { ...form.columns, [key]: v || (key === "place" ? "" : null) })}
            />
          </Field>
        ))}
      </div>
      {form.columns.via && form.columns.via === form.columns.emptyDepot && (
        <p className="m-0 -mt-2 text-[12px] text-slate-500">Via terminal and empty depot share a column: a cell like &ldquo;Praha/Plzen&rdquo; is read as via Praha, empty depot Plzen.</p>
      )}

      <SubTitle>Price columns</SubTitle>
      <div className="flex flex-col gap-2">
        <div className="hidden md:grid grid-cols-[minmax(150px,1.2fr)_minmax(120px,1fr)_90px_90px_110px_minmax(120px,1fr)_32px] gap-2 text-[11px] font-semibold text-slate-500">
          <span>Column</span>
          <span>Label</span>
          <span>Length from (ft)</span>
          <span>Length to (ft)</span>
          <span>Max gross (t)</span>
          <span>Reads as</span>
          <span />
        </div>
        {form.bands.map((band, i) => (
          <div key={i} className="grid grid-cols-2 md:grid-cols-[minmax(150px,1.2fr)_minmax(120px,1fr)_90px_90px_110px_minmax(120px,1fr)_32px] gap-2 items-center">
            <Select
              aria-label={`Price column ${i + 1}`}
              showSearch
              optionFilterProp="label"
              disabled={disabled}
              value={band.column || undefined}
              options={options}
              onChange={(v: string) => setBand(i, { column: v })}
            />
            <Input aria-label={`Price column ${i + 1} label`} value={band.label} maxLength={100} disabled={disabled} onChange={(e) => setBand(i, { label: e.target.value })} />
            <InputNumber
              aria-label={`Price column ${i + 1} length from`}
              min={1}
              max={60}
              value={band.minLengthFt}
              disabled={disabled}
              onChange={(v) => v != null && setBand(i, { minLengthFt: v })}
              className="!w-full"
            />
            <InputNumber
              aria-label={`Price column ${i + 1} length to`}
              min={1}
              max={60}
              value={band.maxLengthFt}
              disabled={disabled}
              onChange={(v) => v != null && setBand(i, { maxLengthFt: v })}
              className="!w-full"
            />
            <InputNumber
              aria-label={`Price column ${i + 1} max gross tonnes`}
              min={0.1}
              max={100}
              placeholder="any"
              value={band.maxGrossTonnes}
              disabled={disabled}
              onChange={(v) => setBand(i, { maxGrossTonnes: v ?? null })}
              className="!w-full"
            />
            <span className="text-[12px] text-slate-500 truncate">{bandText(band)}</span>
            <Tooltip title="Remove this price column">
              <Button
                type="text"
                size="small"
                icon={<DeleteOutlined />}
                aria-label={`Remove price column ${i + 1}`}
                disabled={disabled}
                onClick={() => set("bands", form.bands.filter((_, j) => j !== i))}
              />
            </Tooltip>
          </div>
        ))}
        <div>
          <Button size="small" icon={<PlusOutlined />} disabled={disabled} onClick={() => set("bands", [...form.bands, newBand(form, headings)])}>
            Add price column
          </Button>
        </div>
      </div>

      <SubTitle>Tariff</SubTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Currency">
          <Input aria-label="Currency" value={form.currency} maxLength={3} disabled={disabled} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
        </Field>
        <DayField label="Valid from" value={form.validFrom} disabled={disabled} onChange={(v) => set("validFrom", v)} />
        <DayField label="Valid to" value={form.validTo} disabled={disabled} onChange={(v) => set("validTo", v)} />
        <Field label="Country of the places" hint="When the sheet has no country column">
          <Input aria-label="Country of the places" value={form.defaultCountry} maxLength={2} disabled={disabled} onChange={(e) => set("defaultCountry", e.target.value.toUpperCase())} />
        </Field>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <SubTitle>Links</SubTitle>
          {form.links.map((link, i) => (
            <div key={i} className="grid grid-cols-[1fr_1.4fr_32px] gap-2 items-center">
              <Input
                aria-label={`Link ${i + 1} label`}
                placeholder="Surcharges"
                value={link.label}
                maxLength={200}
                disabled={disabled}
                onChange={(e) => set("links", form.links.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
              />
              <Input
                aria-label={`Link ${i + 1} address`}
                placeholder="https://…"
                value={link.url}
                disabled={disabled}
                onChange={(e) => set("links", form.links.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)))}
              />
              <Button type="text" size="small" icon={<DeleteOutlined />} aria-label={`Remove link ${i + 1}`} disabled={disabled} onClick={() => set("links", form.links.filter((_, j) => j !== i))} />
            </div>
          ))}
          <div>
            <Button size="small" icon={<PlusOutlined />} disabled={disabled} onClick={() => set("links", [...form.links, { label: "", url: "" }])}>
              Add link
            </Button>
          </div>
        </div>
      </div>

      <ConditionsField value={form.conditions} onChange={(v) => set("conditions", v)} hint="One per line: what the prices include and the tariff's terms." disabled={disabled} />
    </div>
  );
};
