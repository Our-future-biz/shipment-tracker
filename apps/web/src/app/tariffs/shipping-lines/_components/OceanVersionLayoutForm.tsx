"use client";

import { useState, type ReactNode } from "react";
import { Button, Checkbox, DatePicker, Input, InputNumber, Select, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { OceanLayout } from "@/hooks/useOceanTariffs";
import type { interfaces } from "@/lib/api/client";
import { columnHeadings, columnLabel, letterIndex, previewSheet } from "../../_lib/railLayoutForm";
import {
  BASIS_OPTIONS,
  CHARGE_OPTIONS,
  CONDITION_OPTIONS,
  EQUIPMENT_KIND_OPTIONS,
  codesText,
  newPriceColumn,
  newSurcharge,
  newTable,
  parseCountries,
  parsePortCodes,
  parsePorts,
  portCodesText,
  withoutTable,
} from "../../_lib/oceanLayoutForm";
import { OCEAN_EQUIPMENT } from "../../_lib/oceanTariffs";

type Table = interfaces.OceanTable;
type PriceColumn = interfaces.OceanPriceColumn;
type Surcharge = interfaces.OceanSurcharge;

const NONE = "";
const EQUIPMENT_OPTIONS = OCEAN_EQUIPMENT.map((e) => ({ value: e.value, label: e.label }));

const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-600 min-w-0">
    {label}
    {children}
    {hint && <span className="text-[11px] font-normal text-slate-400">{hint}</span>}
  </label>
);

const SubTitle = ({ children }: { children: ReactNode }) => <div className="text-[12px] font-bold uppercase tracking-wider text-slate-500 mt-1">{children}</div>;

const toDay = (value: string | null) => (value ? dayjs(value) : null);
const fromDay = (d: dayjs.Dayjs | null) => (d ? d.format("YYYY-MM-DD") : null);

// The columns of a sheet to choose from, named after its headings row, plus any letter the layout
// names that the first rows lack.
function letterOptions(preview: readonly interfaces.SheetPreview[], sheet: string, headingRow: number, named: (string | null)[]) {
  const headings = columnHeadings(previewSheet(preview, sheet), headingRow);
  const letters = [...new Set([...headings.keys(), ...named.filter((l): l is string => !!l)])].sort((a, b) => letterIndex(a) - letterIndex(b));
  return letters.map((l) => ({ value: l, label: columnLabel(l, headings.get(l)) }));
}

interface TypedListProps<T> {
  value: T;
  format: (value: T) => string;
  parse: (text: string) => T;
  onChange: (value: T) => void;
  label: string;
  placeholder?: string;
  disabled: boolean;
  /** Several lines, e.g. the port codes */
  multiline?: boolean;
  size?: "small" | "middle";
}

// A list typed as text ("CN, HK", or "HAM = DEHAM" lines): kept as typed while typed, read into the
// list when left.
function TypedList<T>({ value, format, parse, onChange, label, placeholder, disabled, multiline, size }: TypedListProps<T>) {
  const [text, setText] = useState(() => format(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(format(value));
  }
  const common = { "aria-label": label, placeholder, value: text, disabled, onBlur: () => onChange(parse(text)) };
  return multiline ? (
    <Input.TextArea {...common} autoSize={{ minRows: 3, maxRows: 12 }} onChange={(e) => setText(e.target.value)} />
  ) : (
    <Input {...common} size={size} onChange={(e) => setText(e.target.value)} />
  );
}

interface OceanVersionLayoutFormProps {
  form: OceanLayout;
  onChange: (form: OceanLayout) => void;
  /** The first rows of every sheet of the file */
  preview: interfaces.SheetPreview[];
  disabled: boolean;
}

// The controls of a shipping line draft's layout: the tariff's facts, its rate tables with their
// port, currency and price columns, what the file's port codes stand for, the surcharges and the
// terms. Every change goes to `onChange` as a whole new layout.
export const OceanVersionLayoutForm = ({ form, onChange, preview, disabled }: OceanVersionLayoutFormProps) => {
  const sheetNames = preview.map((p) => p.name);
  const sheetOptions = sheetNames.map((n) => ({ value: n, label: n }));
  const tableOptions = form.tables.map((t, i) => ({ value: i, label: t.label || `Table ${i + 1}` }));
  const set = <K extends keyof OceanLayout>(key: K, value: OceanLayout[K]) => onChange({ ...form, [key]: value });
  const setTable = (i: number, patch: Partial<Table>) => set("tables", form.tables.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  const setPrice = (i: number, k: number, patch: Partial<PriceColumn>) => setTable(i, { prices: form.tables[i]!.prices.map((p, j) => (j === k ? { ...p, ...patch } : p)) });
  const setSurcharge = (i: number, patch: Partial<Surcharge>) => set("surcharges", form.surcharges.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  return (
    <div className="flex flex-col gap-4">
      <SubTitle>Tariff</SubTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr] gap-3">
        <Field label="Name">
          <Input aria-label="Name" value={form.name} maxLength={200} disabled={disabled} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Valid from">
          <DatePicker aria-label="Valid from" value={toDay(form.validFrom)} format="DD.MM.YYYY" disabled={disabled} onChange={(d) => set("validFrom", fromDay(d))} className="!w-full" />
        </Field>
        <Field label="Valid to">
          <DatePicker aria-label="Valid to" value={toDay(form.validTo)} format="DD.MM.YYYY" disabled={disabled} onChange={(d) => set("validTo", fromDay(d))} className="!w-full" />
        </Field>
      </div>

      <SubTitle>Rate tables</SubTitle>
      {form.tables.map((t, i) => {
        const columns = letterOptions(preview, t.sheet, t.headerRow, [t.pol, t.pod, t.via, t.currency, t.note, ...t.prices.map((p) => p.column)]);
        const optional = [{ value: NONE, label: "None" }, ...columns];
        const name = `Table ${i + 1}`;
        return (
          <div key={i} className="rounded-lg border border-slate-200 p-3 flex flex-col gap-3">
            <div className="grid grid-cols-2 lg:grid-cols-[1.6fr_1.2fr_repeat(3,110px)_32px] gap-3 items-end">
              <Field label="Table">
                <Input aria-label={`${name} name`} placeholder="Far East direct calls" value={t.label} maxLength={100} disabled={disabled} onChange={(e) => setTable(i, { label: e.target.value })} />
              </Field>
              <Field label="Sheet">
                <Select aria-label={`${name} sheet`} value={t.sheet} disabled={disabled} options={sheetOptions} onChange={(v: string) => setTable(i, { sheet: v })} />
              </Field>
              <Field label="Headings row">
                <InputNumber aria-label={`${name} headings row`} min={1} precision={0} value={t.headerRow} disabled={disabled} onChange={(v) => v != null && setTable(i, { headerRow: v })} className="!w-full" />
              </Field>
              <Field label="First rate row">
                <InputNumber aria-label={`${name} first rate row`} min={1} precision={0} value={t.firstDataRow} disabled={disabled} onChange={(v) => v != null && setTable(i, { firstDataRow: v })} className="!w-full" />
              </Field>
              <Field label="Last rate row">
                <InputNumber aria-label={`${name} last rate row`} min={1} precision={0} placeholder="to the end" value={t.lastDataRow} disabled={disabled} onChange={(v) => setTable(i, { lastDataRow: v ?? null })} className="!w-full" />
              </Field>
              <Tooltip title="Remove this table">
                <Button type="text" size="small" icon={<DeleteOutlined />} aria-label={`Remove ${name.toLowerCase()}`} disabled={disabled || form.tables.length === 1} onClick={() => onChange(withoutTable(form, i))} />
              </Tooltip>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="POL column" hint="None when every row has the same ports of loading">
                <Select
                  aria-label={`${name} POL column`}
                  value={t.pol ?? NONE}
                  disabled={disabled}
                  options={optional}
                  showSearch
                  optionFilterProp="label"
                  onChange={(v: string) => setTable(i, { pol: v || null, polFixed: v ? null : (t.polFixed ?? "") })}
                />
              </Field>
              {!t.pol && (
                <Field label="Ports of loading" hint="As the tariff writes them, e.g. Hamburg; Bremerhaven">
                  <Input aria-label={`${name} ports of loading`} value={t.polFixed ?? ""} maxLength={500} disabled={disabled} onChange={(e) => setTable(i, { polFixed: e.target.value })} />
                </Field>
              )}
              <Field label="POD column">
                <Select aria-label={`${name} POD column`} value={t.pod || undefined} placeholder="Column" disabled={disabled} options={columns} showSearch optionFilterProp="label" onChange={(v: string) => setTable(i, { pod: v })} />
              </Field>
              <Field label="Via column" hint="The transshipment port(s)">
                <Select aria-label={`${name} via column`} value={t.via ?? NONE} disabled={disabled} options={optional} showSearch optionFilterProp="label" onChange={(v: string) => setTable(i, { via: v || null })} />
              </Field>
              <Field label="Currency column" hint="None when every row has the same currency">
                <Select
                  aria-label={`${name} currency column`}
                  value={t.currency ?? NONE}
                  disabled={disabled}
                  options={optional}
                  showSearch
                  optionFilterProp="label"
                  onChange={(v: string) => setTable(i, { currency: v || null, currencyFixed: v ? null : (t.currencyFixed ?? "USD") })}
                />
              </Field>
              {!t.currency && (
                <Field label="Currency">
                  <Input aria-label={`${name} currency`} value={t.currencyFixed ?? ""} maxLength={3} disabled={disabled} onChange={(e) => setTable(i, { currencyFixed: e.target.value.toUpperCase() })} />
                </Field>
              )}
              <Field label="Note column" hint="Remarks such as No DG acceptance">
                <Select aria-label={`${name} note column`} value={t.note ?? NONE} disabled={disabled} options={optional} showSearch optionFilterProp="label" onChange={(v: string) => setTable(i, { note: v || null })} />
              </Field>
              <Field label="POD countries" hint="To tell ports of one name apart, e.g. CN, HK; empty for any">
                <TypedList value={t.podCountries} format={codesText} parse={parseCountries} onChange={(podCountries) => setTable(i, { podCountries })} label={`${name} POD countries`} placeholder="CN, HK" disabled={disabled} />
              </Field>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-[12px] font-semibold text-slate-600">Price columns</div>
              {t.prices.map((p, k) => (
                <div key={k} className="grid grid-cols-[1.4fr_120px_1fr_32px] gap-2 items-center">
                  <Select
                    aria-label={`${name} price ${k + 1} column`}
                    size="small"
                    value={p.column || undefined}
                    placeholder="Column"
                    disabled={disabled}
                    options={columns}
                    showSearch
                    optionFilterProp="label"
                    onChange={(v: string) => setPrice(i, k, { column: v })}
                  />
                  <Select
                    aria-label={`${name} price ${k + 1} container`}
                    size="small"
                    value={p.equipment}
                    disabled={disabled}
                    options={EQUIPMENT_OPTIONS}
                    onChange={(v: interfaces.OceanEquipment) => setPrice(i, k, { equipment: v })}
                  />
                  <Input aria-label={`${name} price ${k + 1} heading`} size="small" placeholder="Heading, e.g. 40' HQ" value={p.label} maxLength={100} disabled={disabled} onChange={(e) => setPrice(i, k, { label: e.target.value })} />
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    aria-label={`Remove price ${k + 1} of ${name.toLowerCase()}`}
                    disabled={disabled}
                    onClick={() => setTable(i, { prices: t.prices.filter((_, j) => j !== k) })}
                  />
                </div>
              ))}
              <div>
                <Button size="small" icon={<PlusOutlined />} disabled={disabled || t.prices.length >= OCEAN_EQUIPMENT.length} onClick={() => setTable(i, { prices: [...t.prices, newPriceColumn(t)] })}>
                  Add price column
                </Button>
              </div>
            </div>
          </div>
        );
      })}
      <div>
        <Button size="small" icon={<PlusOutlined />} disabled={disabled} onClick={() => set("tables", [...form.tables, newTable(form, sheetNames[0] ?? "")])}>
          Add rate table
        </Button>
      </div>

      <SubTitle>Port codes</SubTitle>
      <Field label="What the file's port codes and names stand for" hint="One per line: the code or name as the file writes it, then its UN/LOCODE, e.g. HAM = DEHAM">
        <TypedList value={form.portCodes} format={portCodesText} parse={parsePortCodes} onChange={(portCodes) => set("portCodes", portCodes)} label="Port codes" placeholder="HAM = DEHAM" disabled={disabled} multiline />
      </Field>

      <SubTitle>Surcharges</SubTitle>
      <div className="flex flex-col gap-2">
        {form.surcharges.map((s, i) => {
          const name = `Surcharge ${i + 1}`;
          return (
            <div key={i} className="rounded-lg border border-slate-200 p-3 flex flex-col gap-2">
              <div className="grid grid-cols-2 lg:grid-cols-[100px_1.6fr_120px_80px_140px_160px_32px] gap-2 items-end">
                <Field label="Code">
                  <Input aria-label={`${name} code`} size="small" placeholder="EBS" value={s.code} maxLength={20} disabled={disabled} onChange={(e) => setSurcharge(i, { code: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Name">
                  <Input aria-label={`${name} name`} size="small" placeholder="Emergency Bunker Surcharge" value={s.name} maxLength={200} disabled={disabled} onChange={(e) => setSurcharge(i, { name: e.target.value })} />
                </Field>
                <Field label="Amount">
                  <InputNumber aria-label={`${name} amount`} size="small" min={0} value={s.amount} disabled={disabled} onChange={(v) => setSurcharge(i, { amount: v ?? 0 })} className="!w-full" />
                </Field>
                <Field label="Currency">
                  <Input aria-label={`${name} currency`} size="small" value={s.currency} maxLength={3} disabled={disabled} onChange={(e) => setSurcharge(i, { currency: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Basis">
                  <Select aria-label={`${name} basis`} size="small" value={s.basis} disabled={disabled} options={BASIS_OPTIONS} popupMatchSelectWidth={false} onChange={(v: interfaces.OceanSurchargeBasis) => setSurcharge(i, { basis: v })} />
                </Field>
                <Field label="Quote charge">
                  <Select aria-label={`${name} quote charge`} size="small" value={s.charge} disabled={disabled} options={CHARGE_OPTIONS} popupMatchSelectWidth={false} onChange={(v: interfaces.OceanSurchargeCharge) => setSurcharge(i, { charge: v })} />
                </Field>
                <Tooltip title="Remove this surcharge">
                  <Button type="text" size="small" icon={<DeleteOutlined />} aria-label={`Remove ${name.toLowerCase()}`} disabled={disabled} onClick={() => set("surcharges", form.surcharges.filter((_, j) => j !== i))} />
                </Tooltip>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-[200px_160px_1fr] gap-3 items-start">
                <Field label="When">
                  <Select aria-label={`${name} when`} size="small" value={s.condition} disabled={disabled} options={CONDITION_OPTIONS} popupMatchSelectWidth={false} onChange={(v: interfaces.OceanSurchargeCondition) => setSurcharge(i, { condition: v })} />
                </Field>
                <fieldset className="m-0 p-0 border-0 flex flex-col gap-1 min-w-0">
                  <legend className="text-[12px] font-semibold text-slate-600 mb-1 p-0">Containers</legend>
                  <Checkbox.Group aria-label={`${name} containers`} options={EQUIPMENT_KIND_OPTIONS} value={s.equipment} disabled={disabled} onChange={(equipment) => setSurcharge(i, { equipment })} />
                  <span className="text-[11px] text-slate-400">None ticked: both</span>
                </fieldset>
                <fieldset className="m-0 p-0 border-0 flex flex-col gap-1 min-w-0">
                  <legend className="text-[12px] font-semibold text-slate-600 mb-1 p-0">Rate tables</legend>
                  <Checkbox.Group aria-label={`${name} rate tables`} options={tableOptions} value={s.tables} disabled={disabled} onChange={(tables) => setSurcharge(i, { tables: [...tables].sort((a, b) => a - b) })} />
                  <span className="text-[11px] text-slate-400">None ticked: every table</span>
                </fieldset>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="Only for POD countries">
                  <TypedList value={s.countries} format={codesText} parse={parseCountries} onChange={(countries) => setSurcharge(i, { countries })} label={`${name} countries`} placeholder="any" size="small" disabled={disabled} />
                </Field>
                <Field label="Except POD countries">
                  <TypedList value={s.exceptCountries} format={codesText} parse={parseCountries} onChange={(exceptCountries) => setSurcharge(i, { exceptCountries })} label={`${name} except countries`} placeholder="none" size="small" disabled={disabled} />
                </Field>
                <Field label="Only for PODs" hint="UN/LOCODEs, e.g. NGAPP, NGLOS">
                  <TypedList value={s.ports} format={codesText} parse={parsePorts} onChange={(ports) => setSurcharge(i, { ports })} label={`${name} ports`} placeholder="any" size="small" disabled={disabled} />
                </Field>
                <Field label="Except PODs">
                  <TypedList value={s.exceptPorts} format={codesText} parse={parsePorts} onChange={(exceptPorts) => setSurcharge(i, { exceptPorts })} label={`${name} except ports`} placeholder="none" size="small" disabled={disabled} />
                </Field>
              </div>
            </div>
          );
        })}
        <div>
          <Button size="small" icon={<PlusOutlined />} disabled={disabled} onClick={() => set("surcharges", [...form.surcharges, newSurcharge()])}>
            Add surcharge
          </Button>
        </div>
      </div>

      <Field label="Conditions" hint="One per line: what the rates include and the tariff's terms.">
        <Input.TextArea
          aria-label="Conditions"
          autoSize={{ minRows: 3, maxRows: 10 }}
          value={form.conditions.join("\n")}
          disabled={disabled}
          // Lines are kept as typed (an empty one too, so Enter starts a new line); empty ones are dropped when sent.
          onChange={(e) => set("conditions", e.target.value.split("\n"))}
        />
      </Field>
    </div>
  );
};
