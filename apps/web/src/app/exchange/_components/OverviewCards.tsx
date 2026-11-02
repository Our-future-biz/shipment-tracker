"use client";

import { useState } from "react";
import { Button } from "antd";
import { EditOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { formatDate } from "@/lib/date";
import { CARD, fmtPct, fmtQuoted, type FxOverview, fmtAverage } from "./fxShared";
import { RateChange } from "./RateChange";
import { RoeDialog } from "./RoeDialog";
import { CurrenciesDialog } from "./CurrenciesDialog";
import { CARD_CURRENCIES } from "./useFxCurrencies";

// A card that opens the user's full currency list when clicked.
const OPENS = "cursor-pointer transition-colors hover:border-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500";

interface Props {
  data: FxOverview;
  isAdmin: boolean;
  /** The user's currencies in their order (never the base); the cards show the first CARD_CURRENCIES */
  list: string[];
  onChangeList: (next: string[]) => void;
  onChangeBase: (base: string) => void;
}

export function OverviewCards({ data, isAdmin, list, onChangeList, onChangeBase }: Props) {
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const pct = data.roe.pct;
  const shown = list.slice(0, CARD_CURRENCIES);
  const rates = shown.flatMap((c) => data.rates.filter((r) => r.currency === c));
  const averages = shown.flatMap((c) => data.monthAverages.filter((a) => a.currency === c));
  const fixingDate = rates.find((r) => r.fixingDate)?.fixingDate ?? null;
  const more = list.length - shown.length;
  const againstCzk = data.base === "CZK";
  // ROE prices into CZK, so its card stays on ČNB's CZK rates: the base itself first, CZK left out.
  const pricing = [data.base, ...shown]
    .filter((c) => c !== "CZK")
    .slice(0, CARD_CURRENCIES)
    .flatMap((c) => data.cnbRates.filter((r) => r.currency === c));

  const opener = {
    role: "button",
    tabIndex: 0,
    onClick: () => setShowAll(true),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setShowAll(true);
      }
    },
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className={`${CARD} ${OPENS} px-5 py-4`} {...opener} aria-label="Show and choose your currencies">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[12px] font-bold tracking-[.05em] uppercase text-slate-500">
              {againstCzk ? "Today's ČNB rate" : `Today's rate in ${data.base}`}
            </div>
            <div className="text-[12.5px] text-slate-400 mb-3">{fixingDate ? `Fixing of ${formatDate(fixingDate)}` : "No fixing yet"}</div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-indigo-600 whitespace-nowrap">
            <UnorderedListOutlined />
            {more > 0 ? `All ${list.length}` : "Currencies"}
          </span>
        </div>
        {rates.map((r) => (
          <div key={r.currency} className="flex items-baseline justify-between py-1">
            <span className="text-[14px] font-semibold text-slate-600">{r.currency}</span>
            <span className="flex items-baseline gap-3">
              <RateChange rate={r.rate} previous={r.previousRate} previousDate={r.previousFixingDate} amount={r.amount} />
              <span className="text-[22px] font-bold text-slate-900 tabular-nums">{fmtQuoted(r.rate, r.amount)}</span>
            </span>
          </div>
        ))}
        {more > 0 && <div className="text-[12px] text-slate-400 mt-1">+ {more} more — click to see all</div>}
      </div>

      <div className={`${CARD} px-5 py-4`}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[12px] font-bold tracking-[.05em] uppercase text-slate-500">Company ROE %</div>
            <div className="text-[12.5px] text-slate-400">
              {data.roe.effectiveFrom
                ? `Since ${formatDate(data.roe.effectiveFrom)}${data.roe.changedByName ? `, set by ${data.roe.changedByName}` : ""}`
                : "Standard — pure ČNB rate"}
            </div>
          </div>
          {isAdmin && (
            <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(true)}>
              Change
            </Button>
          )}
        </div>
        <div className="text-[28px] font-bold text-slate-900 tabular-nums mt-1">{fmtPct(pct)}</div>
        <div className="text-[12.5px] text-slate-500 mb-1">
          Pricing rate = ČNB × {fmtPct(pct)}
          {!againstCzk && " · CZK per 1 unit"}
        </div>
        {pricing.map((r) => (
          <div key={r.currency} className="flex items-baseline justify-between py-0.5">
            <span className="text-[13px] text-slate-600">{r.currency}</span>
            <span className="text-[15px] font-semibold text-slate-800 tabular-nums">
              {fmtQuoted(r.rate == null ? null : (r.rate * pct) / 100, r.amount)}
            </span>
          </div>
        ))}
        {data.scheduledRoe && (
          <div className="text-[12px] text-warn mt-2">
            Changes to {fmtPct(data.scheduledRoe.pct)} on {formatDate(data.scheduledRoe.effectiveFrom)}
          </div>
        )}
      </div>

      <div className={`${CARD} ${OPENS} px-5 py-4`} {...opener} aria-label="Show the month's average for all your currencies">
        <div className="text-[12px] font-bold tracking-[.05em] uppercase text-slate-500">
          This month&apos;s average{againstCzk ? "" : ` in ${data.base}`}
        </div>
        <div className="text-[12.5px] text-slate-400 mb-3">
          {data.month} · provisional · {averages[0]?.fixingDays ?? 0} fixing days so far
        </div>
        {averages.length === 0 && <div className="text-[13px] text-slate-400">No fixings this month yet</div>}
        {averages.map((a) => (
          <div key={a.currency} className="flex items-baseline justify-between py-1">
            <span className="text-[14px] font-semibold text-slate-600">{a.currency}</span>
            <span className="text-[22px] font-bold text-slate-900 tabular-nums">{fmtAverage(a)}</span>
          </div>
        ))}
        <div className="text-[12px] text-slate-400 mt-1">
          {againstCzk ? "Used by reports; fixed when the month ends." : "Crossed day by day from ČNB; reports use the CZK averages."}
        </div>
      </div>

      {editing && <RoeDialog current={data.roe.pct} rates={pricing} today={data.today} onClose={() => setEditing(false)} />}
      {showAll && (
        <CurrenciesDialog data={data} list={list} onChange={onChangeList} onChangeBase={onChangeBase} onClose={() => setShowAll(false)} />
      )}
    </div>
  );
}
