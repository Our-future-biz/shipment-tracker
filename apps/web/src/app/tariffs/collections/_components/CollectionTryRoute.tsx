"use client";

import { useState, type ReactNode } from "react";
import { Alert, Button, Input, InputNumber } from "antd";
import { CalculatorOutlined } from "@ant-design/icons";
import { SectionCard } from "@/components/SectionCard";
import { useCollectionHubs, useCollectionTariffActions, type CollectionTariffVersionDetail, type CollectionTry } from "@/hooks/useCollectionTariffs";
import { apiErrorMessage } from "@/lib/api";
import { fmtMoney } from "@/lib/money";
import { formatQty } from "@/lib/number";
import { postcodeText } from "../../_lib/collectionTariffs";

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-600 min-w-0">
    {label}
    {children}
  </label>
);

const Line = ({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) => (
  <div className={`flex justify-between gap-4 py-1 border-b border-slate-100 last:border-0 ${strong ? "font-semibold text-slate-800" : ""}`}>
    <span className="text-slate-500">{label}</span>
    <span className="text-right tabular-nums">{children}</span>
  </div>
);

const digits = (text: string) => text.replace(/\s/g, "");

// "Try a route": what this version - a draft too - asks for a consignment between two postcodes,
// worked out as a quote would, so it can be checked against the haulier's own calculator before
// the version is approved.
export const CollectionTryRoute = ({ version }: { version: CollectionTariffVersionDetail }) => {
  const { hubs } = useCollectionHubs();
  const { tryRoute, isTrying } = useCollectionTariffActions();
  // Our hub of the freight the tariff serves: Sea LCL's when it serves it, else Air's.
  const hub = hubs.find((h) => h.freightMode === (version.tariff.freightModes.includes("sea_lcl") ? "sea_lcl" : "air"));
  const [hubPostcode, setHubPostcode] = useState<string | null>(null);
  const [customerPostcode, setCustomerPostcode] = useState("");
  const [weightKg, setWeightKg] = useState<number | null>(null);
  const [cbm, setCbm] = useState<number | null>(null);
  const [longestCm, setLongestCm] = useState<number | null>(null);
  const [result, setResult] = useState<CollectionTry | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const from = hubPostcode ?? (hub ? postcodeText(hub.postcode) : "");
  const ready = /^\d{5}$/.test(digits(customerPostcode)) && (version.layout.zoneBy === "postcode" || /^\d{5}$/.test(digits(from))) && ((weightKg ?? 0) > 0 || (cbm ?? 0) > 0);

  const handleTry = async () => {
    setFailed(null);
    try {
      setResult(await tryRoute({ id: version.id, hubPostcode: digits(from), customerPostcode: digits(customerPostcode), weightKg, cbm, longestCm }));
    } catch (e) {
      setResult(null);
      setFailed(apiErrorMessage(e));
    }
  };

  const price = result?.price;
  return (
    <SectionCard title="Try a route">
      <p className="mt-0 mb-3 text-[13px] text-slate-600">Price a consignment with this version as a quote would, and compare it with the haulier&apos;s own calculator.</p>
      <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_110px_100px_120px_auto] gap-3 items-end">
        <Field label={hub?.label ? `Our hub (${hub.label})` : "Our hub's postcode"}>
          <Input aria-label="Our hub's postcode" placeholder="252 61" value={from} maxLength={6} onChange={(e) => setHubPostcode(e.target.value)} />
        </Field>
        <Field label="Customer's postcode">
          <Input aria-label="Customer's postcode" placeholder="602 00" value={customerPostcode} maxLength={6} onChange={(e) => setCustomerPostcode(e.target.value)} />
        </Field>
        <Field label="Weight kg">
          <InputNumber aria-label="Weight kg" min={0} value={weightKg} onChange={setWeightKg} className="!w-full" />
        </Field>
        <Field label="m³">
          <InputNumber aria-label="Volume m³" min={0} step={0.1} value={cbm} onChange={setCbm} className="!w-full" />
        </Field>
        <Field label="Longest piece cm">
          <InputNumber aria-label="Longest piece cm" min={0} value={longestCm} onChange={setLongestCm} className="!w-full" />
        </Field>
        <Button icon={<CalculatorOutlined />} loading={isTrying} disabled={!ready} onClick={handleTry}>
          Price it
        </Button>
      </div>

      {failed && <Alert className="!mt-3" type="error" showIcon message={`Could not price it: ${failed}`} />}
      {result && !price && <Alert className="!mt-3" type="warning" showIcon message={`No price: ${result.problem}`} />}
      {result && (result.hubPlace || result.customerPlace) && (
        <p className="mt-3 mb-0 text-[12.5px] text-slate-500">
          The tariff&apos;s list names {from && `${postcodeText(digits(from))} ${result.hubPlace || "—"}`}
          {" and "}
          {`${postcodeText(digits(customerPostcode))} ${result.customerPlace || "—"}`}.
        </p>
      )}
      {price && (
        <div className="mt-3 max-w-md text-[13px]">
          <Line label="Table">{price.matrixLabel}</Line>
          <Line label={price.distanceKm !== null ? "Distance" : "Zone"}>{price.distanceKm !== null ? `${formatQty(price.distanceKm)} km → ${price.zoneLabel}` : price.zoneLabel}</Line>
          <Line label="Chargeable weight">
            {formatQty(price.chargeableKg)} kg <span className="text-slate-400">({price.chargeableBy === "volume" ? "by volume" : "by weight"})</span>
          </Line>
          <Line label="Weight band">{price.bandLabel}</Line>
          <Line label="Price">{fmtMoney(price.price, price.currency)}</Line>
          {price.surcharges.map((s) => (
            <Line key={s.label} label={s.label}>
              + {fmtMoney(s.amount, price.currency)}
            </Line>
          ))}
          <Line label="Total" strong>
            {fmtMoney(price.total, price.currency)}
          </Line>
        </div>
      )}
    </SectionCard>
  );
};
