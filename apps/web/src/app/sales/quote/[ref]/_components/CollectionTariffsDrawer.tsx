"use client";

import { useState, type ReactNode } from "react";
import { Alert, Button, DatePicker, Drawer, Input, InputNumber, Segmented, Spin, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { Pill } from "@/components/Pill";
import { useDebounced } from "@/hooks/useDebounced";
import { useCollectionOffers, type CollectionHub } from "@/hooks/useCollectionTariffs";
import { apiErrorMessage } from "@/lib/api";
import { businessToday, formatDate } from "@/lib/date";
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
import type { SalesQuoteData } from "../../../_lib/types";

const LEG_OPTIONS = [
  { value: "collection", label: "Collection" },
  { value: "delivery", label: "Delivery" },
];

const FREIGHT_LABEL = { sea_lcl: "Sea LCL", air: "Air" } as const;

const kgText = (kg: number) => `${kg.toLocaleString("cs-CZ")} kg`;

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-600 min-w-0">
    {label}
    {children}
  </label>
);

interface CollectionTariffsDrawerProps {
  open: boolean;
  quote: SalesQuoteData;
  /** Our hubs, one per freight mode that has one */
  hubs: readonly CollectionHub[];
  /** The quote's currency, which offers in other currencies are ranked and shown in */
  quoteCurrency: string;
  /** An amount in the quote's currency; null when there is no rate for the currency */
  toQuoteCurrency: (amount: number, currency: string) => number | null;
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

  const inQuoteCurrency = (o: CollectionOffer) => (o.currency === quoteCurrency ? o.total : toQuoteCurrency(o.total, o.currency));
  // Ranked in the quote's currency, so a tariff in another currency is compared fairly; one without
  // a rate goes last.
  const offers = [...(result?.offers ?? [])].sort((a, b) => (inQuoteCurrency(a) ?? Infinity) - (inQuoteCurrency(b) ?? Infinity));

  const columns: ColumnsType<CollectionOffer> = [
    {
      key: "rank",
      width: 86,
      render: (_, o, i) => (i === 0 ? <Pill tone="green">Cheapest</Pill> : <span className="text-slate-400">{i + 1}.</span>),
    },
    {
      key: "haulier",
      title: "Haulier / tariff",
      render: (_, o) => (
        <div className="min-w-0">
          <div className="font-semibold text-slate-800">{o.supplierName}</div>
          <a
            href={collectionVersionHref(o.supplierCustomerId, o.versionId)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-[12px] text-indigo-500 hover:underline"
          >
            {o.tariffName} v{o.versionNo}
          </a>
          {o.validTo && <div className="text-[11.5px] text-slate-400">valid until {formatDate(o.validTo)}</div>}
        </div>
      ),
    },
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
    {
      key: "total",
      title: "Total",
      align: "right",
      render: (_, o) => {
        const converted = o.currency === quoteCurrency ? null : toQuoteCurrency(o.total, o.currency);
        return (
          <div className="whitespace-nowrap tabular-nums">
            <div className="font-semibold text-slate-800">{fmtMoney(o.total, o.currency)}</div>
            {o.currency !== quoteCurrency && <div className="text-[11.5px] text-slate-400">{converted === null ? "no rate" : fmtMoney(converted, quoteCurrency)}</div>}
          </div>
        );
      },
    },
    {
      key: "use",
      width: 70,
      render: (_, o, i) => (
        <Button size="small" type={i === 0 ? "primary" : "default"} onClick={() => onPick(o, asked)}>
          Use
        </Button>
      ),
    },
  ];

  const customerLabel = route.leg === "collection" ? "Pickup postcode" : "Delivery postcode";

  return (
    <Drawer open={open} onClose={onClose} width={1040} destroyOnHidden title="Tariffs available">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 md:grid-cols-[auto_1fr_1fr_150px] gap-3 items-end">
          <Field label="Leg">
            <Segmented size="middle" value={route.leg} options={LEG_OPTIONS} onChange={(v) => setLeg(v as CollectionLeg)} />
          </Field>
          <Field label="Our hub's postcode">
            <Input aria-label="Our hub's postcode" placeholder="252 61" value={route.hubPostcode} maxLength={10} allowClear onChange={(e) => set({ hubPostcode: e.target.value })} />
          </Field>
          <Field label={customerLabel}>
            <Input aria-label={customerLabel} placeholder="602 00" value={route.customerPostcode} maxLength={10} allowClear onChange={(e) => set({ customerPostcode: e.target.value })} />
          </Field>
          <Field label="Prices valid on">
            <DatePicker
              aria-label="Prices valid on"
              allowClear={false}
              format="DD.MM.YYYY"
              value={dayjs(route.date)}
              onChange={(d) => d && set({ date: d.format("YYYY-MM-DD") })}
              className="!w-full"
            />
          </Field>
          <Field label="Weight (kg)">
            <InputNumber aria-label="Weight (kg)" min={0} value={route.weightKg} onChange={(v) => set({ weightKg: v ?? null })} className="!w-full" />
          </Field>
          <Field label="Volume (m³)">
            <InputNumber aria-label="Volume (m³)" min={0} step={0.1} value={route.cbm} onChange={(v) => set({ cbm: v ?? null })} className="!w-full" />
          </Field>
          <Field label="Longest piece (cm)">
            <InputNumber aria-label="Longest piece (cm)" min={0} value={route.longestCm} onChange={(v) => set({ longestCm: v ?? null })} className="!w-full" />
          </Field>
        </div>

        <div className="text-[11.5px] text-slate-400">
          {route.leg === "collection" ? "A collection runs from the customer to our hub" : "A delivery runs from our hub to the customer"}
          {route.freightMode ? ` (our ${FREIGHT_LABEL[route.freightMode]} hub)` : ""}. Our hubs are set on Tariffs → Last / First Mile Collections; a change here is for this quote only. Each tariff charges the
          higher of the real weight and its own volume weight, and adds its surcharges (e.g. a long piece).
        </div>

        {problem && <Alert type="info" showIcon message={problem} />}
        {error && <Alert type="error" showIcon message={`Could not look up the tariffs — ${apiErrorMessage(error)}.`} />}
        {!problem && !!result?.notes.length && (
          <Alert
            type="warning"
            showIcon
            message={
              <ul className="m-0 pl-4">
                {result.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            }
          />
        )}

        {!problem && isLoading && (
          <div className="flex justify-center p-10">
            <Spin />
          </div>
        )}
        {!problem && result && (
          <>
            <div className="text-[12px] text-slate-500 flex items-center gap-2">
              {offers.length
                ? `${offers.length} ${offers.length === 1 ? "option" : "options"} from the most economic to the most expensive; "Use" puts it on the buying line.`
                : "No collections tariff prices this consignment" + (result.notes.length ? ": see why above." : ".")}
              {isFetching && <Spin size="small" />}
            </div>
            {offers.length > 0 && <Table<CollectionOffer> size="small" rowKey="versionId" columns={columns} dataSource={offers} pagination={false} />}
          </>
        )}
      </div>
    </Drawer>
  );
};
