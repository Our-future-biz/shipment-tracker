"use client";

import { useState, type ReactNode } from "react";
import { Button, DatePicker, Input, InputNumber, Select, Tooltip } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import type { CollectionLayout } from "@/hooks/useCollectionTariffs";
import type { interfaces } from "@/lib/api/client";
import { columnHeadings, columnLabel, letterIndex, previewSheet } from "../../_lib/railLayoutForm";
import { SURCHARGE_KIND_OPTIONS, ZONE_BY_OPTIONS, countryCodesText, newMatrix, newSurcharge, newZone, parseCountryCodes, withZoneBy } from "../../_lib/collectionLayoutForm";

type Matrix = interfaces.CollectionMatrix;
type Zone = interfaces.CollectionZone;
type Surcharge = interfaces.CollectionSurcharge;

const NONE = "";

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

// The columns of a sheet to choose from, named after the row above its first data row (its
// headings), plus any letter the layout names that the first rows lack.
function letterOptions(preview: readonly interfaces.SheetPreview[], sheet: string, headingRow: number, named: (string | null)[]) {
  const headings = columnHeadings(previewSheet(preview, sheet), headingRow);
  const letters = [...new Set([...headings.keys(), ...named.filter((l): l is string => !!l)])].sort((a, b) => letterIndex(a) - letterIndex(b));
  return letters.map((l) => ({ value: l, label: columnLabel(l, headings.get(l)) }));
}

// The country codes as typed ("1=CZ, 2=SK"): kept as text while typed, read into codes when left.
const CountryCodesInput = ({ value, onChange, disabled }: { value: Record<string, string>; onChange: (codes: Record<string, string>) => void; disabled: boolean }) => {
  const [text, setText] = useState(() => countryCodesText(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(countryCodesText(value));
  }
  return <Input aria-label="Country codes" placeholder="1=CZ, 2=SK" value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} onBlur={() => onChange(parseCountryCodes(text))} />;
};

interface CollectionVersionLayoutFormProps {
  form: CollectionLayout;
  onChange: (form: CollectionLayout) => void;
  /** The first rows of every sheet of the file */
  preview: interfaces.SheetPreview[];
  disabled: boolean;
}

// The controls of a collections draft's layout: the tariff's facts, its price tables with their
// weight, volume and zone columns, the lists a zone is found by (postcode → region and distances,
// or postcode areas), the surcharges and the terms. Every change goes to `onChange` as a whole new layout.
export const CollectionVersionLayoutForm = ({ form, onChange, preview, disabled }: CollectionVersionLayoutFormProps) => {
  const sheetNames = preview.map((p) => p.name);
  const sheetOptions = sheetNames.map((n) => ({ value: n, label: n }));
  const byDistance = form.zoneBy === "distance";
  const set = <K extends keyof CollectionLayout>(key: K, value: CollectionLayout[K]) => onChange({ ...form, [key]: value });
  const setMatrix = (i: number, patch: Partial<Matrix>) => set("matrices", form.matrices.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const setZone = (i: number, z: number, patch: Partial<Zone>) => setMatrix(i, { zones: form.matrices[i]!.zones.map((zone, k) => (k === z ? { ...zone, ...patch } : zone)) });
  const setSurcharge = (i: number, patch: Partial<Surcharge>) => set("surcharges", form.surcharges.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const regions = form.regions;
  const distances = form.distances;
  const areas = form.areas;

  return (
    <div className="flex flex-col gap-4">
      <SubTitle>Tariff</SubTitle>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Field label="Name">
          <Input aria-label="Name" value={form.name} maxLength={200} disabled={disabled} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="Currency">
          <Input aria-label="Currency" value={form.currency} maxLength={3} disabled={disabled} onChange={(e) => set("currency", e.target.value.toUpperCase())} />
        </Field>
        <Field label="Valid from">
          <DatePicker aria-label="Valid from" value={toDay(form.validFrom)} format="DD.MM.YYYY" disabled={disabled} onChange={(d) => set("validFrom", fromDay(d))} className="!w-full" />
        </Field>
        <Field label="Valid to">
          <DatePicker aria-label="Valid to" value={toDay(form.validTo)} format="DD.MM.YYYY" disabled={disabled} onChange={(d) => set("validTo", fromDay(d))} className="!w-full" />
        </Field>
        <Field label="Price column found">
          <Select
            aria-label="Price column found"
            value={form.zoneBy}
            disabled={disabled}
            options={ZONE_BY_OPTIONS}
            popupMatchSelectWidth={false}
            onChange={(v: interfaces.CollectionZoneBy) => onChange(withZoneBy(form, v, sheetNames[0] ?? ""))}
          />
        </Field>
        <Field label="kg per m³" hint="Only when the tariff turns volume into weight by a factor; leave empty when a table has a volume column">
          <InputNumber aria-label="kg per m³" min={0} value={form.kgPerCbm} disabled={disabled} onChange={(v) => set("kgPerCbm", v ?? null)} className="!w-full" />
        </Field>
        {byDistance && (
          <Field label="km within one region" hint="When the distance list has no row for two places of one region">
            <InputNumber aria-label="km within one region" min={0} value={form.sameRegionKm} disabled={disabled} onChange={(v) => set("sameRegionKm", v ?? null)} className="!w-full" />
          </Field>
        )}
      </div>

      <SubTitle>Price tables</SubTitle>
      {form.matrices.map((m, i) => {
        const columns = letterOptions(preview, m.sheet, m.headerRow, [m.weightTo, m.volumeTo, ...m.zones.map((z) => z.column)]);
        return (
          <div key={i} className="rounded-lg border border-slate-200 p-3 flex flex-col gap-3">
            <div className="grid grid-cols-2 lg:grid-cols-[1.4fr_80px_1.4fr_repeat(3,110px)_32px] gap-3 items-end">
              <Field label="Table">
                <Input aria-label={`Table ${i + 1} name`} placeholder="CZ → CZ" value={m.label} maxLength={100} disabled={disabled} onChange={(e) => setMatrix(i, { label: e.target.value })} />
              </Field>
              <Field label="Country">
                <Input aria-label={`Table ${i + 1} country`} placeholder="CZ" value={m.country} maxLength={2} disabled={disabled} onChange={(e) => setMatrix(i, { country: e.target.value.toUpperCase() })} />
              </Field>
              <Field label="Sheet">
                <Select aria-label={`Table ${i + 1} sheet`} value={m.sheet} disabled={disabled} options={sheetOptions} onChange={(v: string) => setMatrix(i, { sheet: v })} />
              </Field>
              <Field label="Headings row">
                <InputNumber aria-label={`Table ${i + 1} headings row`} min={1} precision={0} value={m.headerRow} disabled={disabled} onChange={(v) => v != null && setMatrix(i, { headerRow: v })} className="!w-full" />
              </Field>
              <Field label="First price row">
                <InputNumber aria-label={`Table ${i + 1} first price row`} min={1} precision={0} value={m.firstDataRow} disabled={disabled} onChange={(v) => v != null && setMatrix(i, { firstDataRow: v })} className="!w-full" />
              </Field>
              <Field label="Last price row">
                <InputNumber aria-label={`Table ${i + 1} last price row`} min={1} precision={0} placeholder="to the end" value={m.lastDataRow} disabled={disabled} onChange={(v) => setMatrix(i, { lastDataRow: v ?? null })} className="!w-full" />
              </Field>
              <Tooltip title="Remove this table">
                <Button type="text" size="small" icon={<DeleteOutlined />} aria-label={`Remove table ${i + 1}`} disabled={disabled || form.matrices.length === 1} onClick={() => set("matrices", form.matrices.filter((_, j) => j !== i))} />
              </Tooltip>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Weight column (up to kg)">
                <Select aria-label={`Table ${i + 1} weight column`} value={m.weightTo || undefined} placeholder="Column" disabled={disabled} options={columns} showSearch optionFilterProp="label" onChange={(v: string) => setMatrix(i, { weightTo: v })} />
              </Field>
              <Field label="Volume column (up to m³)" hint="When a volume counts as the row's weight">
                <Select
                  aria-label={`Table ${i + 1} volume column`}
                  value={m.volumeTo ?? NONE}
                  disabled={disabled}
                  options={[{ value: NONE, label: "None" }, ...columns]}
                  showSearch
                  optionFilterProp="label"
                  onChange={(v: string) => setMatrix(i, { volumeTo: v || null })}
                />
              </Field>
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-[12px] font-semibold text-slate-600">Zone columns</div>
              {m.zones.map((z, k) => (
                <div key={k} className="grid grid-cols-[1.4fr_1fr_110px_32px] gap-2 items-center">
                  <Select
                    aria-label={`Table ${i + 1} zone ${k + 1} column`}
                    size="small"
                    value={z.column || undefined}
                    placeholder="Column"
                    disabled={disabled}
                    options={columns}
                    showSearch
                    optionFilterProp="label"
                    onChange={(v: string) => setZone(i, k, { column: v })}
                  />
                  <Input aria-label={`Table ${i + 1} zone ${k + 1} heading`} size="small" placeholder="Heading" value={z.label} maxLength={100} disabled={disabled} onChange={(e) => setZone(i, k, { label: e.target.value })} />
                  {byDistance ? (
                    <InputNumber
                      aria-label={`Table ${i + 1} zone ${k + 1} km`}
                      size="small"
                      min={0}
                      addonAfter="km"
                      value={z.kmTo}
                      disabled={disabled}
                      onChange={(v) => setZone(i, k, { kmTo: v ?? null })}
                      className="!w-full"
                    />
                  ) : (
                    <Input aria-label={`Table ${i + 1} zone ${k + 1} code`} size="small" placeholder="Zone" value={z.zone ?? ""} maxLength={30} disabled={disabled} onChange={(e) => setZone(i, k, { zone: e.target.value })} />
                  )}
                  <Button
                    type="text"
                    size="small"
                    icon={<DeleteOutlined />}
                    aria-label={`Remove zone ${k + 1} of table ${i + 1}`}
                    disabled={disabled}
                    onClick={() => setMatrix(i, { zones: m.zones.filter((_, j) => j !== k) })}
                  />
                </div>
              ))}
              <div>
                <Button size="small" icon={<PlusOutlined />} disabled={disabled} onClick={() => setMatrix(i, { zones: [...m.zones, newZone(m, form.zoneBy)] })}>
                  Add zone column
                </Button>
              </div>
            </div>
          </div>
        );
      })}
      <div>
        <Button size="small" icon={<PlusOutlined />} disabled={disabled} onClick={() => set("matrices", [...form.matrices, newMatrix(form, sheetNames[0] ?? "")])}>
          Add price table
        </Button>
      </div>

      {byDistance && regions && (
        <>
          <SubTitle>Postcode → region list</SubTitle>
          {(() => {
            const columns = letterOptions(preview, regions.sheet, Math.max(1, regions.firstDataRow - 1), [regions.postcode, regions.region, regions.country, regions.place]);
            const setRegions = (patch: Partial<interfaces.CollectionRegionTable>) => set("regions", { ...regions, ...patch });
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="Sheet">
                  <Select aria-label="Region list sheet" value={regions.sheet} disabled={disabled} options={sheetOptions} onChange={(v: string) => setRegions({ sheet: v })} />
                </Field>
                <Field label="First row">
                  <InputNumber aria-label="Region list first row" min={1} precision={0} value={regions.firstDataRow} disabled={disabled} onChange={(v) => v != null && setRegions({ firstDataRow: v })} className="!w-full" />
                </Field>
                <Field label="Last row">
                  <InputNumber aria-label="Region list last row" min={1} precision={0} placeholder="to the end" value={regions.lastDataRow} disabled={disabled} onChange={(v) => setRegions({ lastDataRow: v ?? null })} className="!w-full" />
                </Field>
                <Field label="Default country">
                  <Input aria-label="Region list default country" value={regions.defaultCountry} maxLength={2} disabled={disabled} onChange={(e) => setRegions({ defaultCountry: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Postcode column">
                  <Select aria-label="Postcode column" value={regions.postcode || undefined} placeholder="Column" disabled={disabled} options={columns} onChange={(v: string) => setRegions({ postcode: v })} />
                </Field>
                <Field label="Region column">
                  <Select aria-label="Region column" value={regions.region || undefined} placeholder="Column" disabled={disabled} options={columns} onChange={(v: string) => setRegions({ region: v })} />
                </Field>
                <Field label="Country column">
                  <Select aria-label="Country column" value={regions.country ?? NONE} disabled={disabled} options={[{ value: NONE, label: "None" }, ...columns]} onChange={(v: string) => setRegions({ country: v || null })} />
                </Field>
                <Field label="Place column">
                  <Select aria-label="Place column" value={regions.place ?? NONE} disabled={disabled} options={[{ value: NONE, label: "None" }, ...columns]} onChange={(v: string) => setRegions({ place: v || null })} />
                </Field>
                <Field label="Country codes" hint="What the country column holds, e.g. 1=CZ, 2=SK; empty when it holds country codes">
                  <CountryCodesInput value={regions.countryCodes} disabled={disabled} onChange={(countryCodes) => setRegions({ countryCodes })} />
                </Field>
              </div>
            );
          })()}
        </>
      )}

      {byDistance && distances && (
        <>
          <SubTitle>Distance list</SubTitle>
          {(() => {
            const columns = letterOptions(preview, distances.sheet, Math.max(1, distances.firstDataRow - 1), [distances.fromRegion, distances.toRegion, distances.km]);
            const setDistances = (patch: Partial<interfaces.CollectionDistanceTable>) => set("distances", { ...distances, ...patch });
            return (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Sheet">
                  <Select aria-label="Distance list sheet" value={distances.sheet} disabled={disabled} options={sheetOptions} onChange={(v: string) => setDistances({ sheet: v })} />
                </Field>
                <Field label="First row">
                  <InputNumber aria-label="Distance list first row" min={1} precision={0} value={distances.firstDataRow} disabled={disabled} onChange={(v) => v != null && setDistances({ firstDataRow: v })} className="!w-full" />
                </Field>
                <Field label="Last row">
                  <InputNumber aria-label="Distance list last row" min={1} precision={0} placeholder="to the end" value={distances.lastDataRow} disabled={disabled} onChange={(v) => setDistances({ lastDataRow: v ?? null })} className="!w-full" />
                </Field>
                <Field label="From region column">
                  <Select aria-label="From region column" value={distances.fromRegion || undefined} placeholder="Column" disabled={disabled} options={columns} onChange={(v: string) => setDistances({ fromRegion: v })} />
                </Field>
                <Field label="To region column">
                  <Select aria-label="To region column" value={distances.toRegion || undefined} placeholder="Column" disabled={disabled} options={columns} onChange={(v: string) => setDistances({ toRegion: v })} />
                </Field>
                <Field label="km column">
                  <Select aria-label="km column" value={distances.km || undefined} placeholder="Column" disabled={disabled} options={columns} onChange={(v: string) => setDistances({ km: v })} />
                </Field>
              </div>
            );
          })()}
        </>
      )}

      {!byDistance && areas && (
        <>
          <SubTitle>Postcode areas</SubTitle>
          {(() => {
            const columns = letterOptions(preview, areas.sheet, Math.max(1, areas.firstDataRow - 1), [areas.postcodeFrom, areas.postcodeTo, areas.zone, areas.country]);
            const setAreas = (patch: Partial<interfaces.CollectionAreaTable>) => set("areas", { ...areas, ...patch });
            return (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Field label="Sheet">
                  <Select aria-label="Areas sheet" value={areas.sheet} disabled={disabled} options={sheetOptions} onChange={(v: string) => setAreas({ sheet: v })} />
                </Field>
                <Field label="First row">
                  <InputNumber aria-label="Areas first row" min={1} precision={0} value={areas.firstDataRow} disabled={disabled} onChange={(v) => v != null && setAreas({ firstDataRow: v })} className="!w-full" />
                </Field>
                <Field label="Last row">
                  <InputNumber aria-label="Areas last row" min={1} precision={0} placeholder="to the end" value={areas.lastDataRow} disabled={disabled} onChange={(v) => setAreas({ lastDataRow: v ?? null })} className="!w-full" />
                </Field>
                <Field label="Default country">
                  <Input aria-label="Areas default country" value={areas.defaultCountry} maxLength={2} disabled={disabled} onChange={(e) => setAreas({ defaultCountry: e.target.value.toUpperCase() })} />
                </Field>
                <Field label="Postcode (from) column" hint={'A postcode, or a prefix such as "1xxxx"'}>
                  <Select aria-label="Postcode from column" value={areas.postcodeFrom || undefined} placeholder="Column" disabled={disabled} options={columns} onChange={(v: string) => setAreas({ postcodeFrom: v })} />
                </Field>
                <Field label="Postcode to column">
                  <Select aria-label="Postcode to column" value={areas.postcodeTo ?? NONE} disabled={disabled} options={[{ value: NONE, label: "None" }, ...columns]} onChange={(v: string) => setAreas({ postcodeTo: v || null })} />
                </Field>
                <Field label="Zone column">
                  <Select aria-label="Zone column" value={areas.zone || undefined} placeholder="Column" disabled={disabled} options={columns} onChange={(v: string) => setAreas({ zone: v })} />
                </Field>
                <Field label="Country column">
                  <Select aria-label="Areas country column" value={areas.country ?? NONE} disabled={disabled} options={[{ value: NONE, label: "None" }, ...columns]} onChange={(v: string) => setAreas({ country: v || null })} />
                </Field>
              </div>
            );
          })()}
        </>
      )}

      <SubTitle>Surcharges</SubTitle>
      <div className="flex flex-col gap-2">
        {form.surcharges.map((s, i) => (
          <div key={i} className="grid grid-cols-2 lg:grid-cols-[200px_1fr_120px_100px_120px_32px] gap-2 items-center">
            <Select aria-label={`Surcharge ${i + 1} kind`} size="small" value={s.kind} disabled={disabled} options={SURCHARGE_KIND_OPTIONS} popupMatchSelectWidth={false} onChange={(v: interfaces.CollectionSurchargeKind) => setSurcharge(i, { kind: v })} />
            <Input aria-label={`Surcharge ${i + 1} name`} size="small" placeholder="Name" value={s.label} maxLength={100} disabled={disabled} onChange={(e) => setSurcharge(i, { label: e.target.value })} />
            {s.kind === "oversize" ? (
              <InputNumber aria-label={`Surcharge ${i + 1} longer than`} size="small" min={0} addonBefore=">" addonAfter="cm" value={s.overLengthCm} disabled={disabled} onChange={(v) => setSurcharge(i, { overLengthCm: v ?? null })} className="!w-full" />
            ) : (
              <span />
            )}
            {s.kind !== "flat" ? (
              <InputNumber aria-label={`Surcharge ${i + 1} percent`} size="small" addonAfter="%" value={s.percent} disabled={disabled} onChange={(v) => setSurcharge(i, { percent: v ?? null })} className="!w-full" />
            ) : (
              <span />
            )}
            {s.kind === "flat" ? (
              <InputNumber aria-label={`Surcharge ${i + 1} amount`} size="small" min={0} addonAfter={form.currency || "—"} value={s.amount} disabled={disabled} onChange={(v) => setSurcharge(i, { amount: v ?? null })} className="!w-full" />
            ) : (
              <span />
            )}
            <Button type="text" size="small" icon={<DeleteOutlined />} aria-label={`Remove surcharge ${i + 1}`} disabled={disabled} onClick={() => set("surcharges", form.surcharges.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div>
          <Button size="small" icon={<PlusOutlined />} disabled={disabled} onClick={() => set("surcharges", [...form.surcharges, newSurcharge()])}>
            Add surcharge
          </Button>
        </div>
      </div>

      <Field label="Conditions" hint="One per line: what the prices include, delivery times and the tariff's terms.">
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
