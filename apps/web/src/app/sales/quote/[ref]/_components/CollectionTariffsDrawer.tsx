"use client";

import { useState } from "react";
import { DatePicker, Input, InputNumber, Segmented, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useDebounced } from "@/hooks/useDebounced";
import { useCollectionOffers, type CollectionHub } from "@/hooks/useCollectionTariffs";
import { businessToday } from "@/lib/date";
import { fmtMoney } from "@/lib/money";
import { collectionVersionHref } from "@/app/tariffs/_lib/collectionTariffs";
import {
  collectionOffersRequest,
  collectionRouteOf,
  collectionRouteProblem,
  customerPostcodeOf,
  offerEnds,
  offerReach,
  type CollectionLeg,
  type CollectionOffer,
  type CollectionRoute,
} from "../../../_lib/collectionQuote";
import { offerInQuoteCurrency, rankOffers, type ToQuoteCurrency } from "../../../_lib/tariffQuote";
import type { SalesQuoteData } from "../../../_lib/types";
import { TariffDrawerField } from "./TariffDrawerField";
import { TariffOffersDrawer } from "./TariffOffersDrawer";
import { pickColumn, rankColumn, tariffColumn, totalColumn } from "./tariffOfferColumns";

const LEG_OPTIONS: { value: CollectionLeg; label: string }[] = [
  { value: "collection", label: "Collection" },
  { value: "delivery", label: "Delivery" },
];

const FREIGHT_LABEL = { sea_lcl: "Sea LCL", air: "Air" } as const;

const kgText = (kg: number) => `${kg.toLocaleString("cs-CZ")} kg`;

interface CollectionTariffsDrawerProps {
  open: boolean;
  quote: SalesQuoteData;
  /** Our hubs, one per freight mode that has one */
  hubs: readonly CollectionHub[];
  /** The quote's currency, which offers in other currencies are ranked and shown in */
  quoteCurrency: string;
  toQuoteCurrency: ToQuoteCurrency;
  /** Puts the offer on the line the drawer was opened from. */
  onPick: (offer: CollectionOffer, route: CollectionRoute) => void;
  onClose: () => void;
}

// "Tariffs available" on an inland collection / delivery line of a Sea LCL or air quote: what every
// first / last mile haulier asks for the consignment between our hub and the customer, from the
// most economic to the most expensive. The consignment and its two ends start as the quote has
// them and can be corrected here; picking an offer puts it on the buying line.
export const CollectionTariffsDrawer = ({ open, quote, hubs, quoteCurrency, toQuoteCurrency, onPick, onClose }: CollectionTariffsDrawerProps) => {
  const [route, setRoute] = useState<CollectionRoute>(() => collectionRouteOf(quote, hubs, businessToday()));
  // Each opening starts again from the quote as it is now.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setRoute(collectionRouteOf(quote, hubs, businessToday()));
  }
  const asked = useDebounced(route, 350);
  const problem = collectionRouteProblem(route);
  const { result, isLoading, isFetching, error } = useCollectionOffers(open ? collectionOffersRequest(asked) : null);
  const set = (patch: Partial<CollectionRoute>) => setRoute((r) => ({ ...r, ...patch }));

  // The leg decides which of the quote's addresses the customer's postcode is read from.
  const setLeg = (leg: CollectionLeg) => set({ leg, customerPostcode: customerPostcodeOf(quote, leg) });

  const offers = rankOffers(result?.offers ?? [], (o) => offerInQuoteCurrency(o, quoteCurrency, toQuoteCurrency));

  const columns: ColumnsType<CollectionOffer> = [
    rankColumn(),
    tariffColumn("Haulier / tariff", (o) => collectionVersionHref(o.supplierCustomerId, o.versionId)),
    {
      key: "route",
      title: "Route",
      render: (_, o) => {
        const [from, to] = offerEnds(o, asked);
        return (
          <div>
            {from} → {to}
            <div className="text-[11.5px] text-slate-400">
              {offerReach(o)} · {o.matrixLabel}
            </div>
          </div>
        );
      },
    },
    {
      key: "weight",
      title: "Charged weight",
      render: (_, o) => (
        <div className="whitespace-nowrap">
          {kgText(o.chargeableKg)}
          {o.chargeableBy === "volume" && <span className="text-slate-400"> by volume</span>}
          <div className="text-[11.5px] text-slate-400">{o.bandLabel}</div>
        </div>
      ),
    },
    {
      key: "price",
      title: "Price",
      render: (_, o) => (
        <div className="flex flex-col gap-0.5 text-[12.5px] tabular-nums">
          <span className="whitespace-nowrap">{fmtMoney(o.price, o.currency)}</span>
          {o.surcharges.map((s) => (
            <span key={s.label} className="whitespace-nowrap text-slate-500">
              + {fmtMoney(s.amount, o.currency)} <span className="text-slate-400">{s.label}</span>
            </span>
          ))}
        </div>
      ),
    },
    totalColumn(quoteCurrency, toQuoteCurrency),
    pickColumn((o) => onPick(o, asked), isFetching),
  ];

  const summary = offers.length
    ? `${offers.length} ${offers.length === 1 ? "option" : "options"} from the most economic to the most expensive; "Use" puts it on the buying line.`
    : "No collections tariff prices this consignment" + (result?.notes.length ? ": see why above." : ".");

  const customerLabel = route.leg === "collection" ? "Pickup postcode" : "Delivery postcode";

  const form = (
    <>
      <div className="grid grid-cols-2 md:grid-cols-[auto_1fr_1fr_150px] gap-3 items-end">
        <TariffDrawerField label="Leg" group>
          <Segmented<CollectionLeg> size="middle" aria-label="Leg" value={route.leg} options={LEG_OPTIONS} onChange={setLeg} />
        </TariffDrawerField>
        <TariffDrawerField label="Our hub's postcode">
          <Input aria-label="Our hub's postcode" placeholder="252 61" value={route.hubPostcode} maxLength={10} allowClear onChange={(e) => set({ hubPostcode: e.target.value })} />
        </TariffDrawerField>
        <TariffDrawerField label={customerLabel}>
          <Input aria-label={customerLabel} placeholder="602 00" value={route.customerPostcode} maxLength={10} allowClear onChange={(e) => set({ customerPostcode: e.target.value })} />
        </TariffDrawerField>
        <TariffDrawerField label="Prices valid on">
          <DatePicker
            aria-label="Prices valid on"
            allowClear={false}
            format="DD.MM.YYYY"
            value={dayjs(route.date)}
            onChange={(d) => d && set({ date: d.format("YYYY-MM-DD") })}
            className="!w-full"
          />
        </TariffDrawerField>
        <TariffDrawerField label="Weight (kg)">
          <InputNumber aria-label="Weight (kg)" min={0} value={route.weightKg} onChange={(v) => set({ weightKg: v ?? null })} className="!w-full" />
        </TariffDrawerField>
        <TariffDrawerField label="Volume (m³)">
          <InputNumber aria-label="Volume (m³)" min={0} step={0.1} value={route.cbm} onChange={(v) => set({ cbm: v ?? null })} className="!w-full" />
        </TariffDrawerField>
        <TariffDrawerField label="Longest piece (cm)">
          <InputNumber aria-label="Longest piece (cm)" min={0} value={route.longestCm} onChange={(v) => set({ longestCm: v ?? null })} className="!w-full" />
        </TariffDrawerField>
      </div>

      <div className="text-[11.5px] text-slate-400">
        {route.leg === "collection" ? "A collection runs from the customer to our hub" : "A delivery runs from our hub to the customer"}
        {route.freightMode ? ` (our ${FREIGHT_LABEL[route.freightMode]} hub)` : ""}. Our hubs are set on Tariffs → Last / First Mile Collections; a change here is for this quote only. Each tariff charges the
        higher of the real weight and its own volume weight, and adds its surcharges (e.g. a long piece).
      </div>
    </>
  );

  return (
    <TariffOffersDrawer
      open={open}
      onClose={onClose}
      width={1040}
      form={form}
      problem={problem}
      error={error}
      notes={result?.notes}
      isLoading={isLoading}
      isFetching={isFetching}
      answered={!!result}
      summary={summary}
    >
      {offers.length > 0 && <Table<CollectionOffer> size="small" rowKey="versionId" columns={columns} dataSource={offers} pagination={false} />}
    </TariffOffersDrawer>
  );
};
