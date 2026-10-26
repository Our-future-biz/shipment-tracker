"use client";

import dayjs from "dayjs";
import { Checkbox, DatePicker, Input, Select } from "antd";
import type { CustomerSiteItem } from "@/hooks/useCustomerSites";
import type { StopInput } from "@/hooks/useTruckingConsignments";
import { stopFromSite } from "../_lib/consignmentForm";
import { formatPsc, pscDigits } from "../_lib/hauliers";
import { TruckingField } from "./TruckingField";
import { limitCzechPhone } from "@/lib/phone";

interface ConsignmentStopFieldsProps {
  title: string;
  stop: StopInput;
  /** The customer's sites; picking one fills the address and the avizace contact. */
  sites: readonly CustomerSiteItem[];
  onChange: (stop: StopInput) => void;
  /** After the pick-up only the reference and notes can change. */
  limited?: boolean;
}

const toIso = (d: dayjs.Dayjs | null) => (d ? d.toISOString() : null);

// One stop of a consignment (pick-up or delivery): a customer site or a typed address, the time
// window, who to call before arriving (avizace), the reference and notes for the driver.
export const ConsignmentStopFields = ({ title, stop, sites, onChange, limited = false }: ConsignmentStopFieldsProps) => {
  const set = <K extends keyof StopInput>(key: K, value: StopInput[K]) => onChange({ ...stop, [key]: value });
  const czech = stop.country === "CZ";

  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 rounded-xl border border-slate-200 p-3">
      <legend className="px-1 text-[12px] font-bold uppercase tracking-wide text-slate-600">{title}</legend>
      <TruckingField label="Customer site" hint={sites.length ? "Fills the address and the avizace contact; anything can be typed instead" : "The customer has no sites — type the address"}>
        <Select
          allowClear
          aria-label={`${title} site`}
          placeholder="Typed address"
          disabled={limited || !sites.length}
          value={stop.siteId ?? undefined}
          options={sites.map((s) => ({ value: s.id, label: `${s.label} · ${[formatPsc(s.postcode), s.city].filter(Boolean).join(" ")}` }))}
          onChange={(id: string | undefined) => {
            const site = sites.find((s) => s.id === id);
            onChange(site ? stopFromSite(site, stop) : { ...stop, siteId: null });
          }}
        />
      </TruckingField>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TruckingField label="Company / site name">
          <Input aria-label={`${title} name`} disabled={limited} value={stop.name} onChange={(e) => set("name", e.target.value)} />
        </TruckingField>
        <TruckingField label="Street">
          <Input aria-label={`${title} street`} disabled={limited} value={stop.street} onChange={(e) => set("street", e.target.value)} />
        </TruckingField>
        <TruckingField label={czech ? "Postcode (PSČ)" : "Postcode"}>
          <Input
            aria-label={`${title} postcode`}
            disabled={limited}
            inputMode={czech ? "numeric" : undefined}
            value={czech ? formatPsc(stop.postcode) : stop.postcode}
            onChange={(e) => set("postcode", czech ? pscDigits(e.target.value) : e.target.value)}
          />
        </TruckingField>
        <TruckingField label="City">
          <Input aria-label={`${title} city`} disabled={limited} value={stop.city} onChange={(e) => set("city", e.target.value)} />
        </TruckingField>
        <TruckingField label="Country" hint="Two letters, e.g. CZ">
          <Input aria-label={`${title} country`} disabled={limited} maxLength={2} value={stop.country} onChange={(e) => set("country", e.target.value.toUpperCase())} />
        </TruckingField>
        <TruckingField label="Time window">
          <DatePicker.RangePicker
            aria-label={`${title} time window`}
            disabled={limited}
            showTime={{ format: "HH:mm" }}
            format="DD.MM.YYYY HH:mm"
            allowEmpty={[true, true]}
            value={[stop.windowFrom ? dayjs(stop.windowFrom) : null, stop.windowTo ? dayjs(stop.windowTo) : null]}
            onChange={(range) => onChange({ ...stop, windowFrom: toIso(range?.[0] ?? null), windowTo: toIso(range?.[1] ?? null) })}
          />
        </TruckingField>
        <TruckingField label="Contact name">
          <Input aria-label={`${title} contact name`} disabled={limited} value={stop.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </TruckingField>
        <TruckingField label="Contact phone">
          <Input aria-label={`${title} contact phone`} disabled={limited} inputMode="tel" value={stop.contactPhone} onChange={(e) => set("contactPhone", limitCzechPhone(e.target.value))} />
        </TruckingField>
        <TruckingField label="Reference" hint="Their order or delivery number, printed on the transport order">
          <Input aria-label={`${title} reference`} value={stop.reference} onChange={(e) => set("reference", e.target.value)} />
        </TruckingField>
        <div className="flex items-end pb-1">
          <Checkbox disabled={limited} checked={stop.avizaceRequired} onChange={(e) => set("avizaceRequired", e.target.checked)}>
            Avizace — call before arriving
          </Checkbox>
        </div>
      </div>
      <TruckingField label="Notes for the driver">
        <Input.TextArea aria-label={`${title} notes`} autoSize={{ minRows: 1, maxRows: 4 }} value={stop.notes} onChange={(e) => set("notes", e.target.value)} />
      </TruckingField>
    </fieldset>
  );
};
