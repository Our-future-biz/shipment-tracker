"use client";

import { useState, type ReactNode } from "react";
import { Alert, Button, DatePicker, Drawer, Input, Segmented, Select, Spin, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import dayjs from "dayjs";
import { Pill } from "@/components/Pill";
import { useDebounced } from "@/hooks/useDebounced";
import { useRailOffers } from "@/hooks/useRailTariffs";
import { apiErrorMessage } from "@/lib/api";
import type { interfaces } from "@/lib/api/client";
import { businessToday, formatDate } from "@/lib/date";
import { fmtMoney } from "@/lib/money";
import { formatPostcode } from "@/lib/postcode";
import { TARIFF_PORTS, railVersionHref } from "@/app/tariffs/_lib/railTariffs";
import { offerTerminals, railOffersRequest, railRouteOf, railRouteProblem, viaTerminals, type RailOffer, type RailRoute } from "../../../_lib/railQuote";
import type { SalesQuoteData } from "../../../_lib/types";

const PORT_OPTIONS = TARIFF_PORTS.map((p) => ({ value: p.code, label: `${p.name} (${p.code})` }));
const DIRECTION_OPTIONS = [
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

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-600 min-w-0">
    {label}
    {children}
  </label>
);

interface RailTariffsDrawerProps {
  open: boolean;
  quote: SalesQuoteData;
  /** The quote's currency, which offers in other currencies are ranked and shown in */
  quoteCurrency: string;
  /** An amount in the quote's currency; null when there is no rate for the currency */
  toQuoteCurrency: (amount: number, currency: string) => number | null;
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

  const inQuoteCurrency = (o: RailOffer) => (o.currency === quoteCurrency ? o.total : toQuoteCurrency(o.total, o.currency));
  // Ranked in the quote's currency, so a tariff in another currency is compared fairly; one without
  // a rate goes last.
  const ranked = [...(result?.offers ?? [])].sort((a, b) => (inQuoteCurrency(a) ?? Infinity) - (inQuoteCurrency(b) ?? Infinity));
  const terminalOptions = offerTerminals(ranked).map((t) => ({ value: t.via, label: `${t.via || "—"} (${t.count})` }));
  const offers = viaTerminals(ranked, terminals);
  const narrowed = offers.length < ranked.length;

  const columns: ColumnsType<RailOffer> = [
    {
      key: "rank",
      width: 86,
      render: (_, o, i) => (i === 0 ? <Pill tone="green">Cheapest</Pill> : <span className="text-slate-400">{i + 1}.</span>),
    },
    {
      key: "operator",
      title: "Operator / tariff",
      render: (_, o) => (
        <div className="min-w-0">
          <div className="font-semibold text-slate-800">{o.supplierName}</div>
          <a
            href={railVersionHref(o.supplierCustomerId, o.versionId)}
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

  return (
    <Drawer open={open} onClose={onClose} width={1040} destroyOnHidden title="Tariffs available">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 md:grid-cols-[auto_1fr_1.2fr_64px_150px] gap-3 items-end">
          <Field label="Direction">
            <Segmented size="middle" value={route.direction} options={DIRECTION_OPTIONS} onChange={(v) => setDirection(v as interfaces.RailDirection)} />
          </Field>
          <Field label="Port">
            <Select aria-label="Port" placeholder="Port" value={route.port} options={PORT_OPTIONS} onChange={(port: interfaces.TariffPortCode) => set({ port })} />
          </Field>
          <Field label="Inland place or postcode">
            <Input aria-label="Inland place or postcode" placeholder="602 00, or Brno" value={route.place} maxLength={300} allowClear onChange={(e) => set({ place: e.target.value })} />
          </Field>
          <Field label="Country">
            <Input aria-label="Country" value={route.country} maxLength={2} onChange={(e) => set({ country: e.target.value.toUpperCase() })} />
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
        </div>

        <div className="text-[12.5px] text-slate-600 flex flex-col gap-0.5">
          {(result?.containers ?? []).map((c, i) => (
            <span key={i}>{containerText(c)}</span>
          ))}
          {!result && route.containers.map((c, i) => <span key={i}>{`${c.qty} × ${c.type}`}</span>)}
          <span className="text-[11.5px] text-slate-400">
            Tariffs price by gross weight: the cargo per container from Cargo details plus the container&apos;s tare. A 45&apos; is priced as a 40&apos;.
          </span>
        </div>

        {problem && <Alert type="info" showIcon message={problem} />}
        {error && <Alert type="error" showIcon message={`Could not look up the tariffs — ${apiErrorMessage(error)}.`} />}
        {!!result?.notes.length && (
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
            {ranked.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-semibold text-slate-600">Terminal</span>
                <Select
                  mode="multiple"
                  allowClear
                  aria-label="Terminal"
                  placeholder="All terminals"
                  value={terminals.filter((t) => terminalOptions.some((o) => o.value === t))}
                  options={terminalOptions}
                  onChange={setTerminals}
                  className="min-w-[260px] max-w-full"
                />
              </div>
            )}
            <div className="text-[12px] text-slate-500 flex items-center gap-2">
              {offers.length
                ? `${narrowed ? `${offers.length} of ${ranked.length} options, via ${terminals.filter((t) => offers.some((o) => o.via === t)).join(", ")},` : `${offers.length} ${offers.length === 1 ? "option" : "options"}`} from the most economic to the most expensive; "Use" puts it on the buying line.`
                : result.matchedBy === "place"
                  ? `No rail tariff has "${route.place.trim()}" for this port and direction. Places are found by their exact name; try the postcode.`
                  : "No rail tariff prices this route: check the port, the direction and the postcode."}
              {isFetching && <Spin size="small" />}
            </div>
            {offers.length > 0 && <Table<RailOffer> size="small" rowKey="rateId" columns={columns} dataSource={offers} pagination={false} />}
          </>
        )}
      </div>
    </Drawer>
  );
};
