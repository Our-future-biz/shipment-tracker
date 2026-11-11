"use client";

import { useState } from "react";
import { Pill } from "@/components/Pill";
import {
  CalendarOutlined,
  EditOutlined,
  LineChartOutlined,
  PercentageOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import { formatDate } from "@/lib/date";
import { BTN_BAR, CARD, CARD_BAR, CARD_ICON, CARD_TITLE, HINT, KPI_VALUE } from "@/styles/ui";
import { fmtPct, fmtQuoted, type FxOverview, fmtAverage } from "./fxShared";
import { RateChange } from "./RateChange";
import { RoeDialog } from "./RoeDialog";
import { CurrenciesDialog } from "./CurrenciesDialog";
import { CARD_CURRENCIES } from "./useFxCurrencies";

// A card that opens the user's full currency list when clicked.
const OPENS =
  "cursor-pointer transition-colors hover:border-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500";

// The three cards are built alike, as the app's other cards: the light indigo title bar with an icon
// and the card's tool, then a line on what the figures are, one row per currency (the same type in
// every card), and a note kept to the bottom so the notes line up across the cards.
const FX_CARD = `${CARD} overflow-hidden flex flex-col`;
const BODY = "flex-1 flex flex-col px-5 pt-3 pb-4";
const SUBTITLE = `${HINT} flex items-center justify-between gap-2 min-h-[22px] mb-1`;
const FX_ROW =
  "flex items-baseline justify-between gap-3 py-1.5 border-b border-slate-100 last:border-b-0";
const CURRENCY = "text-[14px] font-semibold text-slate-600";
const FOOT = `${HINT} mt-auto pt-2`;

function CardBar({
  icon,
  title,
  tool,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  tool?: React.ReactNode;
}) {
  return (
    <div className={`${CARD_BAR} !min-h-[46px]`}>
      <span className={`${CARD_ICON} shrink-0`}>{icon}</span>
      <h2 className={`${CARD_TITLE} min-w-0 flex items-center whitespace-nowrap`}>{title}</h2>
      {tool && <span className="ml-auto shrink-0">{tool}</span>}
    </div>
  );
}

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
      <div
        className={`${FX_CARD} ${OPENS}`}
        {...opener}
        aria-label="Show and choose your currencies"
      >
        <CardBar
          icon={<LineChartOutlined />}
          title={againstCzk ? "Today's ČNB rate" : `Today's rate in ${data.base}`}
          // Not a button of its own: the whole card opens the list.
          tool={
            <span className={BTN_BAR}>
              <UnorderedListOutlined />
              {more > 0 ? `All ${list.length}` : "Currencies"}
            </span>
          }
        />
        <div className={BODY}>
          <div className={SUBTITLE}>
            {fixingDate ? `Fixing of ${formatDate(fixingDate)}` : "No fixing yet"}
          </div>
          <div>
            {rates.map((r) => (
              <div key={r.currency} className={FX_ROW}>
                <span className={CURRENCY}>{r.currency}</span>
                <span className="flex items-baseline gap-3">
                  <RateChange
                    rate={r.rate}
                    previous={r.previousRate}
                    previousDate={r.previousFixingDate}
                    amount={r.amount}
                  />
                  <span className={KPI_VALUE}>{fmtQuoted(r.rate, r.amount)}</span>
                </span>
              </div>
            ))}
          </div>
          <div className={FOOT}>
            {more > 0
              ? `+ ${more} more — click to see all`
              : "Arrows: the change since the previous fixing"}
          </div>
        </div>
      </div>

      <div className={FX_CARD}>
        <CardBar
          icon={<PercentageOutlined />}
          title="Company ROE %"
          tool={
            isAdmin && (
              <button type="button" className={BTN_BAR} onClick={() => setEditing(true)}>
                <EditOutlined />
                Change
              </button>
            )
          }
        />
        <div className={BODY}>
          {/* The ROE itself beside what it does, so the rates below line up with the other cards'. */}
          <div className={SUBTITLE}>
            <span className="truncate">
              Pricing rate = ČNB × ROE
              {!againstCzk && " · CZK per 1 unit"}
            </span>
            <Pill tone="indigo" className="!text-[12px] font-semibold tabular-nums">
              ROE {fmtPct(pct)}
            </Pill>
          </div>
          <div>
            {pricing.map((r) => (
              <div key={r.currency} className={FX_ROW}>
                <span className={CURRENCY}>{r.currency}</span>
                <span className={KPI_VALUE}>
                  {fmtQuoted(r.rate == null ? null : (r.rate * pct) / 100, r.amount)}
                </span>
              </div>
            ))}
          </div>
          <div className={FOOT}>
            {data.roe.effectiveFrom
              ? `Since ${formatDate(data.roe.effectiveFrom)}${data.roe.changedByName ? `, set by ${data.roe.changedByName}` : ""}`
              : "Standard — pure ČNB rate"}
            {data.scheduledRoe && (
              <div className="text-warn">
                Changes to {fmtPct(data.scheduledRoe.pct)} on{" "}
                {formatDate(data.scheduledRoe.effectiveFrom)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={`${FX_CARD} ${OPENS}`}
        {...opener}
        aria-label="Show the month's average for all your currencies"
      >
        <CardBar
          icon={<CalendarOutlined />}
          title={<>This month&apos;s average{againstCzk ? "" : ` in ${data.base}`}</>}
        />
        <div className={BODY}>
          <div className={SUBTITLE}>
            {data.month} · provisional · {averages[0]?.fixingDays ?? 0} fixing days so far
          </div>
          {averages.length === 0 && <div className={HINT}>No fixings this month yet</div>}
          <div>
            {averages.map((a) => (
              <div key={a.currency} className={FX_ROW}>
                <span className={CURRENCY}>{a.currency}</span>
                <span className={KPI_VALUE}>{fmtAverage(a)}</span>
              </div>
            ))}
          </div>
          <div className={FOOT}>
            {againstCzk
              ? "Used by reports; fixed when the month ends."
              : "Crossed day by day from ČNB; reports use the CZK averages."}
          </div>
        </div>
      </div>

      {editing && (
        <RoeDialog
          current={data.roe.pct}
          rates={pricing}
          today={data.today}
          onClose={() => setEditing(false)}
        />
      )}
      {showAll && (
        <CurrenciesDialog
          data={data}
          list={list}
          onChange={onChangeList}
          onChangeBase={onChangeBase}
          onClose={() => setShowAll(false)}
        />
      )}
    </div>
  );
}
