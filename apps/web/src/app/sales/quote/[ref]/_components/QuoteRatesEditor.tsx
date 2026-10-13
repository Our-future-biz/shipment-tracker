"use client";

import { InputNumber } from "antd";
import { SyncOutlined } from "@ant-design/icons";
import type { CurrentExchangeRates } from "@/hooks/useExchangeRates";
import { formatDate } from "@/lib/date";
import { weekRange } from "@/lib/isoWeek";
import { normalizeMoneyInput } from "@/lib/money";
import type { SalesQuoteData } from "@/app/sales/_lib/types";
import { ratesNeeded, ratesFromSheet } from "@/app/sales/_lib/salesQuote";
import { MiniButton } from "./QuoteButtons";
import { LineBlock } from "./LineBlock";

// A rate has more decimals than an amount, so the money rule - a comma followed by three digits
// separates thousands - would read "28,455" as 28455. In a rate a lone comma is always the decimal
// mark, as on the Exchange page; the rest - spaces ("1 250,50"), a comma beside a dot ("1,250.50") -
// is read the way an amount is. Returns text for the same reason moneyInputParser does.
const rateInputParser = (text: string | undefined) => {
  const typed = text ?? "";
  const loneComma = !typed.includes(".") && typed.indexOf(",") === typed.lastIndexOf(",");
  return normalizeMoneyInput(loneComma ? typed.replace(",", ".") : typed) as unknown as number;
};

// The Exchange week a rate was taken from, with its days in the app's date format:
// "Week 40 · 28.09.2026 – 04.10.2026". A key that names no week is shown as it is.
function weekLabel(weekKey: string): string {
  const range = weekRange(weekKey);
  return range ? `Week ${Number(weekKey.slice(6))} · ${formatDate(range.from)} – ${formatDate(range.to)}` : weekKey;
}

// The exchange rates the quote's totals are converted with, for the currencies that need one. Each
// row says where its rate comes from and can be typed over - GBP and CHF are not on the Exchange
// sheet, so typing is the only way to give them a rate.
export function QuoteRatesEditor({
  data,
  exchange,
  onChange,
}: {
  data: SalesQuoteData;
  exchange: Pick<CurrentExchangeRates, "rates" | "usedWeek" | "isError">;
  onChange: (rates: SalesQuoteData["rates"]) => void;
}) {
  const needed = ratesNeeded(data);
  if (!needed.length) return null;

  const onSheet = (currency: string) => exchange.rates[currency] !== undefined;
  // Old quotes store no rates and are converted with the sheet's; the user is told, because such
  // a quote's totals move with the sheet until its rates are stored.
  const followsSheet = needed.some((currency) => !data.rates?.[currency] && onSheet(currency));

  return (
    <LineBlock
      title="Exchange rates · CZK per 1 unit"
      actions={
        <MiniButton icon={<SyncOutlined />} disabled={!needed.some(onSheet)} onClick={() => onChange(ratesFromSheet(data, exchange, true))}>
          Use current Exchange rates
        </MiniButton>
      }
    >
      <ul className="m-0 p-0 list-none">
        {needed.map((currency) => {
          const stored = data.rates?.[currency];
          return (
            <li key={currency} className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-100 last:border-b-0">
              <span className="w-11 shrink-0 text-xs font-semibold text-slate-700">{currency}</span>
              {/* Width needs "!": antd's own input-number width is unlayered CSS and would win over a plain utility. */}
              <InputNumber
                size="small"
                className="!w-[120px] shrink-0"
                aria-label={`${currency} rate`}
                min={0}
                controls={false}
                parser={rateInputParser}
                placeholder="Rate"
                value={stored?.rate ?? exchange.rates[currency] ?? null}
                // An emptied field or a zero is not a rate: the one in use stays.
                onChange={(rate) => rate && onChange({ ...data.rates, [currency]: { rate } })}
              />
              {stored?.week ? (
                <span className="flex-1 min-w-0 text-xs text-slate-500">Exchange · {weekLabel(stored.week)}</span>
              ) : stored ? (
                <span className="flex-1 min-w-0 text-xs text-slate-500">Typed here</span>
              ) : onSheet(currency) ? (
                <span className="flex-1 min-w-0 text-xs text-amber-600">Exchange · {weekLabel(exchange.usedWeek)} · not stored on this quote yet</span>
              ) : exchange.isError ? (
                // The sheet may well have this rate; asking for it to be typed would be wrong.
                <span className="flex-1 min-w-0 text-xs font-semibold text-red-600">Exchange rates not loaded</span>
              ) : (
                <span className="flex-1 min-w-0 text-xs font-semibold text-red-600">No rate - type it here</span>
              )}
            </li>
          );
        })}
      </ul>
      {followsSheet && (
        <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-500">
          A rate that is not stored yet follows the Exchange sheet, so the totals can change with it. It is stored with the next change to
          the pricing, or with “Use current Exchange rates”.
        </div>
      )}
    </LineBlock>
  );
}
