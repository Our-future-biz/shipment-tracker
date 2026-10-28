import type { ReactNode } from "react";
import { Button } from "antd";
import type { ColumnType } from "antd/es/table";
import { LINK_CLASS } from "@/components/linkClass";
import { Pill } from "@/components/Pill";
import { formatDate } from "@/lib/date";
import { fmtMoney } from "@/lib/money";
import { offerInQuoteCurrency, type ToQuoteCurrency } from "../../../_lib/tariffQuote";

// The columns the "Tariffs available" drawers (rail, collections, ocean) have in common: the rank,
// the supplier and its tariff, the total in the offer's and the quote's currency, and "Use".

/** What every tariff offer names: the supplier and the tariff version it comes from. */
interface TariffOfferSource {
  supplierCustomerId: string;
  supplierName: string;
  versionId: string;
  versionNo: number;
  tariffName: string;
  validTo: string | null;
}

/** "Cheapest" on the first offer, the place of every other. */
export const rankColumn = <T,>(): ColumnType<T> => ({
  key: "rank",
  width: 86,
  render: (_, _o, i) => (i === 0 ? <Pill tone="green">Cheapest</Pill> : <span className="text-slate-400">{i + 1}.</span>),
});

const validUntil = (o: TariffOfferSource) => o.validTo && <div className="text-[11.5px] text-slate-400">valid until {formatDate(o.validTo)}</div>;

/** The supplier, a link to the tariff version (in a new tab), and below it how long it is valid - or `detail`. */
export const tariffColumn = <T extends TariffOfferSource>(title: string, versionHref: (offer: T) => string, detail: (offer: T) => ReactNode = validUntil): ColumnType<T> => ({
  key: "tariff",
  title,
  render: (_, o) => (
    <div className="min-w-0">
      <div className="font-semibold text-slate-800">{o.supplierName}</div>
      <a href={versionHref(o)} target="_blank" rel="noreferrer" className={`text-[12px] ${LINK_CLASS}`}>
        {o.tariffName} v{o.versionNo}
      </a>
      {detail(o)}
    </div>
  ),
});

/** The offer's total, and below it the total in the quote's currency when that is another. */
export const totalColumn = <T extends { total: number; currency: string }>(quoteCurrency: string, toQuoteCurrency: ToQuoteCurrency): ColumnType<T> => ({
  key: "total",
  title: "Total",
  align: "right",
  render: (_, o) => {
    const converted = offerInQuoteCurrency(o, quoteCurrency, toQuoteCurrency);
    return (
      <div className="whitespace-nowrap tabular-nums">
        <div className="font-semibold text-slate-800">{fmtMoney(o.total, o.currency)}</div>
        {o.currency !== quoteCurrency && <div className="text-[11.5px] text-slate-400">{converted === null ? "no rate" : fmtMoney(converted, quoteCurrency)}</div>}
      </div>
    );
  },
});

/**
 * "Use", which puts the offer on the buying line - not while the offers are being asked again: the
 * ones shown are then still those of the route before, which the line would be described by.
 */
export const pickColumn = <T extends { supplierName: string }>(onPick: (offer: T) => void, isFetching: boolean): ColumnType<T> => ({
  key: "use",
  width: 70,
  render: (_, o, i) => (
    <Button size="small" type={i === 0 ? "primary" : "default"} disabled={isFetching || undefined} aria-label={`Use ${o.supplierName}`} onClick={() => onPick(o)}>
      Use
    </Button>
  ),
});
