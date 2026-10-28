"use client";

import { useState } from "react";
import { DatePicker, Segmented, Switch, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { GeoSelect } from "@/components/GeoSelect";
import { useDebounced } from "@/hooks/useDebounced";
import { useOceanOffers } from "@/hooks/useOceanTariffs";
import type { interfaces } from "@/lib/api/client";
import { businessToday, formatDate } from "@/lib/date";
import { fmtMoney } from "@/lib/money";
import { equipmentLabel, oceanVersionHref } from "@/app/tariffs/_lib/oceanTariffs";
import { offerPorts, oceanAllIn, oceanOffersRequest, oceanRouteOf, oceanRouteProblem, type OceanOffer, type OceanRoute } from "../../../_lib/oceanQuote";
import { rankOffers, viaTerminals, type ToQuoteCurrency } from "../../../_lib/tariffQuote";
import type { SalesQuoteData } from "../../../_lib/types";
import { TariffDrawerField } from "./TariffDrawerField";
import { TariffOffersDrawer } from "./TariffOffersDrawer";
import { TariffViaFilter } from "./TariffViaFilter";
import { pickColumn, rankColumn, tariffColumn } from "./tariffOfferColumns";

const DIRECTION_OPTIONS: { value: interfaces.RailDirection; label: string }[] = [
  { value: "export", label: "Export" },
  { value: "import", label: "Import" },
];

interface OceanTariffsDrawerProps {
  open: boolean;
  quote: SalesQuoteData;
  /** The quote's currency, which the all-in totals are ranked and shown in */
  quoteCurrency: string;
  toQuoteCurrency: ToQuoteCurrency;
  /** Puts the offer on the line the drawer was opened from. */
  onPick: (offer: OceanOffer, route: OceanRoute) => void;
  onClose: () => void;
}

// "Tariffs available" on the Ocean freight line of a Sea FCL quote: every way the shipping lines'
// approved tariffs take the quote's containers from port to port, with freight and surcharges,
// from the most economic to the most expensive all-in. The route starts as the quote has it and
// can be corrected here, other ports of loading compared and the transshipment ports narrowed;
// picking an offer puts the freight and its surcharges on the buying lines.
export const OceanTariffsDrawer = ({ open, quote, quoteCurrency, toQuoteCurrency, onPick, onClose }: OceanTariffsDrawerProps) => {
  const [route, setRoute] = useState<OceanRoute>(() => oceanRouteOf(quote, businessToday()));
  // Each opening starts again from the quote as it is now.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setRoute(oceanRouteOf(quote, businessToday()));
  }
  // The transshipment ports the user wants; none chosen shows them all. Kept while the quote is open.
  const [vias, setVias] = useState<string[]>([]);
  const asked = useDebounced(route, 350);
  const problem = oceanRouteProblem(route);
  const { result, isLoading, isFetching, error } = useOceanOffers(open ? oceanOffersRequest(asked) : null);
  const set = (patch: Partial<OceanRoute>) => setRoute((r) => ({ ...r, ...patch }));

  const allIn = (o: OceanOffer) => oceanAllIn(o, quoteCurrency, toQuoteCurrency);
  // Ranked by the all-in total in the quote's currency, so freight and surcharges in other
  // currencies are compared fairly; an offer with a currency without a rate goes last.
  const ranked = rankOffers(result?.offers ?? [], allIn);
  const offers = viaTerminals(ranked, vias);
  const narrowed = offers.length < ranked.length;

  const columns: ColumnsType<OceanOffer> = [
    rankColumn(),
    tariffColumn(
      "Shipping line / tariff",
      (o) => oceanVersionHref(o.supplierCustomerId, o.versionId),
      (o) => (
        <div className="text-[11.5px] text-slate-400">
          {o.tableLabel}
          {o.validTo ? ` · valid until ${formatDate(o.validTo)}` : ""}
        </div>
      ),
    ),
    {
      key: "route",
      title: "Route",
      render: (_, o) => {
        const [from, to] = offerPorts(o, asked);
        return (
          <div>
            {from} <span className="text-slate-400">{o.polCode}</span> → {to} <span className="text-slate-400">{o.podCode}</span>
            <div className="text-[11.5px] text-slate-400">{o.via ? `via ${o.via}` : "direct"}</div>
            {o.note && <div className="text-[11.5px] text-amber-700">{o.note}</div>}
          </div>
        );
      },
    },
    {
      key: "freight",
      title: "Per container",
      render: (_, o) => (
        <div className="flex flex-col gap-0.5 text-[12.5px] tabular-nums">
          {o.lines.map((l) => (
            <span key={`${l.type}-${l.equipment}`} className="whitespace-nowrap">
              {l.qty} × {l.type}: {fmtMoney(l.price, o.currency)} <span className="text-slate-400">({equipmentLabel(l.equipment)})</span>
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "surcharges",
      title: "Surcharges",
      render: (_, o) =>
        o.surcharges.length ? (
          <div className="flex flex-col gap-0.5 text-[12px] tabular-nums">
            {o.surcharges.map((s) => (
              <span key={`${s.code}-${s.name}`} className="whitespace-nowrap" title={s.name}>
                {s.code} {fmtMoney(s.rate, s.currency)} × {s.units} = {fmtMoney(s.total, s.currency)}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-slate-400">none</span>
        ),
    },
    {
      key: "total",
      title: "All-in",
      align: "right",
      render: (_, o) => {
        const converted = allIn(o);
        const foreign = o.totals.some((t) => t.currency !== quoteCurrency);
        return (
          <div className="whitespace-nowrap tabular-nums">
            {o.totals.map((t) => (
              <div key={t.currency} className="font-semibold text-slate-800">
                {fmtMoney(t.amount, t.currency)}
              </div>
            ))}
            {foreign && <div className="text-[11.5px] text-slate-400">{converted === null ? "no rate" : `≈ ${fmtMoney(converted, quoteCurrency)}`}</div>}
          </div>
        );
      },
    },
    pickColumn((o) => onPick(o, asked), isFetching),
  ];

  const summary = offers.length
    ? `${narrowed ? `${offers.length} of ${ranked.length} options` : `${offers.length} ${offers.length === 1 ? "option" : "options"}`} from the most economic to the most expensive all-in; "Use" puts the freight and its surcharges on the buying lines.`
    : route.comparePols
      ? "No shipping line's tariff has a rate to this port of discharge for these containers."
      : 'No shipping line\'s tariff has a rate on this route for these containers. Try "Compare other ports of loading".';

  const containersText = route.containers.map((c) => `${c.qty} × ${c.type}`).join(" · ");

  const form = (
    <>
      <div className="grid grid-cols-2 md:grid-cols-[auto_1fr_1fr_150px] gap-3 items-end">
        <TariffDrawerField label="Direction" group>
          <Segmented<interfaces.RailDirection> size="middle" aria-label="Direction" value={route.direction} options={DIRECTION_OPTIONS} onChange={(direction) => set({ direction })} />
        </TariffDrawerField>
        <TariffDrawerField label="Port of loading">
          <GeoSelect kind="place" className="w-full" placeholder="Port of loading" value={route.pol} onChange={(v) => set({ pol: v })} />
        </TariffDrawerField>
        <TariffDrawerField label="Port of discharge">
          <GeoSelect kind="place" className="w-full" placeholder="Port of discharge" value={route.pod} onChange={(v) => set({ pod: v })} />
        </TariffDrawerField>
        <TariffDrawerField label="Rates valid on">
          <DatePicker
            aria-label="Rates valid on"
            allowClear={false}
            format="DD.MM.YYYY"
            value={dayjs(route.date)}
            onChange={(d) => d && set({ date: d.format("YYYY-MM-DD") })}
            className="!w-full"
          />
        </TariffDrawerField>
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-slate-600 cursor-pointer w-fit">
        <Switch size="small" checked={route.comparePols} onChange={(comparePols) => set({ comparePols })} />
        Compare other ports of loading
      </label>

      <div className="text-[12.5px] text-slate-600">
        {containersText || "No containers"}
        {route.dangerous && <span className="text-amber-700"> · dangerous goods: IMO surcharges apply</span>}
        <div className="text-[11.5px] text-slate-400">
          Containers from Cargo details. 20&apos; DC, 40&apos; DC, 40&apos; HC, 20&apos; RF and 40&apos; HRF are priced; special equipment is priced individually. Origin
          and destination local charges are not included.
        </div>
      </div>
    </>
  );

  return (
    <TariffOffersDrawer
      open={open}
      onClose={onClose}
      width={1120}
      form={form}
      problem={problem}
      error={error}
      notes={result?.notes}
      isLoading={isLoading}
      isFetching={isFetching}
      answered={!!result}
      filter={ranked.length > 0 && <TariffViaFilter label="Transshipment" placeholder="All, direct too" noneLabel="Direct" offers={ranked} chosen={vias} onChange={setVias} />}
      summary={summary}
    >
      {offers.length > 0 && <Table<OceanOffer> size="small" rowKey="rateId" columns={columns} dataSource={offers} pagination={false} />}
    </TariffOffersDrawer>
  );
};
