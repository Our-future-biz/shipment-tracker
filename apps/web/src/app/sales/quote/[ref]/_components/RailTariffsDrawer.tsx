"use client";

import { useState } from "react";
import { DatePicker, Input, Segmented, Select, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { useDebounced } from "@/hooks/useDebounced";
import { useRailOffers } from "@/hooks/useRailTariffs";
import type { interfaces } from "@/lib/api/client";
import { businessToday } from "@/lib/date";
import { fmtMoney } from "@/lib/money";
import { formatPostcode } from "@/lib/postcode";
import { TARIFF_PORTS, railVersionHref } from "@/app/tariffs/_lib/railTariffs";
import { railOffersRequest, railRouteOf, railRouteProblem, type RailOffer, type RailRoute } from "../../../_lib/railQuote";
import { offerInQuoteCurrency, rankOffers, viaTerminals, type ToQuoteCurrency } from "../../../_lib/tariffQuote";
import type { SalesQuoteData } from "../../../_lib/types";
import { TariffDrawerField } from "./TariffDrawerField";
import { TariffOffersDrawer } from "./TariffOffersDrawer";
import { TariffViaFilter } from "./TariffViaFilter";
import { pickColumn, rankColumn, tariffColumn, totalColumn } from "./tariffOfferColumns";

const PORT_OPTIONS = TARIFF_PORTS.map((p) => ({ value: p.code, label: `${p.name} (${p.code})` }));
const DIRECTION_OPTIONS: { value: interfaces.RailDirection; label: string }[] = [
  { value: "import", label: "Import" },
  { value: "export", label: "Export" },
];

const tonnes = (kg: number) => `${(kg / 1000).toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`;

// "2 × 20' DC · 12,0 t cargo + 2,3 t tare = 14,3 t gross"
function containerText(c: interfaces.RailPricedContainer): string {
  const head = `${c.qty} × ${c.type}`;
  if (c.cargoKg === null) return `${head} · no cargo weight`;
  if (c.tareKg === null || c.grossKg === null) return `${head} · ${tonnes(c.cargoKg)} cargo, tare unknown`;
  return `${head} · ${tonnes(c.cargoKg)} cargo + ${tonnes(c.tareKg)} tare = ${tonnes(c.grossKg)} gross`;
}

interface RailTariffsDrawerProps {
  open: boolean;
  quote: SalesQuoteData;
  /** The quote's currency, which offers in other currencies are ranked and shown in */
  quoteCurrency: string;
  toQuoteCurrency: ToQuoteCurrency;
  /** Puts the offer on the line the drawer was opened from. */
  onPick: (offer: RailOffer, route: RailRoute) => void;
  onClose: () => void;
}

// "Tariffs available": what every rail tariff asks for the quote's containers on its route, from
// the most economic to the most expensive. The route starts as the quote has it - the port,
// direction, inland place and containers - and can be corrected here; picking an offer puts it on
// the buying line. The options can be narrowed to the terminals the user wants the train to run
// via; that choice stays while the quote is open.
export const RailTariffsDrawer = ({ open, quote, quoteCurrency, toQuoteCurrency, onPick, onClose }: RailTariffsDrawerProps) => {
  const [route, setRoute] = useState<RailRoute>(() => railRouteOf(quote, businessToday()));
  // Each opening starts again from the quote as it is now.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setRoute(railRouteOf(quote, businessToday()));
  }
  // The terminals the user wants; none chosen shows them all.
  const [terminals, setTerminals] = useState<string[]>([]);
  const asked = useDebounced(route, 350);
  const problem = railRouteProblem(route);
  const { result, isLoading, isFetching, error } = useRailOffers(open ? railOffersRequest(asked) : null);
  const set = (patch: Partial<RailRoute>) => setRoute((r) => ({ ...r, ...patch }));

  // The direction decides which port and address of the quote the route is read from.
  const setDirection = (direction: interfaces.RailDirection) => {
    const fromQuote = railRouteOf({ ...quote, direction: direction === "export" ? "Export" : "Import" }, route.date);
    setRoute({ ...fromQuote, date: route.date });
  };

  const ranked = rankOffers(result?.offers ?? [], (o) => offerInQuoteCurrency(o, quoteCurrency, toQuoteCurrency));
  const offers = viaTerminals(ranked, terminals);
  const narrowed = offers.length < ranked.length;

  const columns: ColumnsType<RailOffer> = [
    rankColumn(),
    tariffColumn("Operator / tariff", (o) => railVersionHref(o.supplierCustomerId, o.versionId)),
    {
      key: "place",
      title: "Place",
      render: (_, o) => (
        <div>
          {o.place} <span className="text-slate-400">{formatPostcode(o.postcode)}</span>
          {o.note && <div className="text-[11.5px] text-slate-400">{o.note}</div>}
        </div>
      ),
    },
    {
      key: "via",
      title: "Via terminal",
      render: (_, o) => (
        <div>
          {o.via || "—"}
          {o.emptyDepot && o.emptyDepot !== o.via && <div className="text-[11.5px] text-slate-400">empty: {o.emptyDepot}</div>}
        </div>
      ),
    },
    {
      key: "prices",
      title: "Per container",
      render: (_, o) => (
        <div className="flex flex-col gap-0.5 text-[12.5px] tabular-nums">
          {o.lines.map((l) => (
            <span key={`${l.type}-${l.bandCode}`} className="whitespace-nowrap">
              {l.qty} × {l.type}: {fmtMoney(l.price, o.currency)} <span className="text-slate-400">({l.bandLabel})</span>
            </span>
          ))}
        </div>
      ),
    },
    totalColumn(quoteCurrency, toQuoteCurrency),
    pickColumn((o) => onPick(o, asked), isFetching),
  ];

  const summary = offers.length
    ? `${narrowed ? `${offers.length} of ${ranked.length} options, via ${terminals.filter((t) => offers.some((o) => o.via === t)).join(", ")},` : `${offers.length} ${offers.length === 1 ? "option" : "options"}`} from the most economic to the most expensive; "Use" puts it on the buying line.`
    : result?.matchedBy === "place"
      ? `No rail tariff has "${route.place.trim()}" for this port and direction. Places are found by their exact name; try the postcode.`
      : "No rail tariff prices this route: check the port, the direction and the postcode.";

  const form = (
    <>
      <div className="grid grid-cols-2 md:grid-cols-[auto_1fr_1.2fr_64px_150px] gap-3 items-end">
        <TariffDrawerField label="Direction" group>
          <Segmented<interfaces.RailDirection> size="middle" aria-label="Direction" value={route.direction} options={DIRECTION_OPTIONS} onChange={setDirection} />
        </TariffDrawerField>
        <TariffDrawerField label="Port">
          <Select aria-label="Port" placeholder="Port" value={route.port} options={PORT_OPTIONS} onChange={(port: interfaces.TariffPortCode) => set({ port })} />
        </TariffDrawerField>
        <TariffDrawerField label="Inland place or postcode">
          <Input aria-label="Inland place or postcode" placeholder="602 00, or Brno" value={route.place} maxLength={300} allowClear onChange={(e) => set({ place: e.target.value })} />
        </TariffDrawerField>
        <TariffDrawerField label="Country">
          <Input aria-label="Country" value={route.country} maxLength={2} onChange={(e) => set({ country: e.target.value.toUpperCase() })} />
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
      </div>

      <div className="text-[12.5px] text-slate-600 flex flex-col gap-0.5">
        {/* The quote's container lines, in their order (two can be alike). */}
        {result ? result.containers.map((c, i) => <span key={i}>{containerText(c)}</span>) : route.containers.map((c, i) => <span key={i}>{`${c.qty} × ${c.type}`}</span>)}
        <span className="text-[11.5px] text-slate-400">
          Tariffs price by gross weight: the cargo per container from Cargo details plus the container&apos;s tare. A 45&apos; is priced as a 40&apos;.
        </span>
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
      filter={ranked.length > 0 && <TariffViaFilter label="Terminal" placeholder="All terminals" noneLabel="—" offers={ranked} chosen={terminals} onChange={setTerminals} />}
      summary={summary}
    >
      {offers.length > 0 && <Table<RailOffer> size="small" rowKey="rateId" columns={columns} dataSource={offers} pagination={false} />}
    </TariffOffersDrawer>
  );
};
