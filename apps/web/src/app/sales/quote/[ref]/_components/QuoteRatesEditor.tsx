"use client";

import type { CurrentExchangeRates } from "@/hooks/useExchangeRates";
import { formatDate } from "@/lib/date";
import { FX_DRAFT_STATUSES, type SalesQuoteData } from "@/app/sales/_lib/types";
import { ratesNeeded } from "@/app/sales/_lib/salesQuote";
import { LineBlock } from "./LineBlock";

interface QuoteRatesEditorProps {
  data: SalesQuoteData;
  exchange: Pick<CurrentExchangeRates, "rates" | "fixingDate" | "isError">;
}

// The exchange rates the quote's totals are converted with, for the currencies that need one, and
// where each comes from. ČNB is the only source: a draft is priced at today's fixing and the server
// stores the rates on the quote when it is sent. Rates are never typed: a currency ČNB does not
// publish cannot be converted, and its lines stay out of the totals.
export function QuoteRatesEditor({ data, exchange }: QuoteRatesEditorProps) {
  const needed = ratesNeeded(data);
  if (!needed.length) return null;
  const draft = FX_DRAFT_STATUSES.has(data.quoteStatus ?? "draft");

  return (
    <LineBlock title="Exchange rates · CZK per 1 unit">
      <ul className="m-0 p-0 list-none">
        {needed.map((currency) => {
          const stamped = data.fx?.rates?.[currency];
          const own = data.rates?.[currency]?.rate;
          const today = exchange.rates[currency];
          const shown = stamped ?? (draft ? (today ?? own) : (own ?? today));
          return (
            <li key={currency} className="flex items-center gap-3 px-3 py-1.5 border-b border-slate-100 last:border-b-0">
              <span className="w-11 shrink-0 text-xs font-semibold text-slate-700">{currency}</span>
              <span className="w-[120px] shrink-0 text-xs tabular-nums text-slate-700">{shown ?? "—"}</span>
              {stamped !== undefined ? (
                <span className="flex-1 min-w-0 text-xs text-slate-500">
                  ČNB · {formatDate(data.fx?.fixingDate ?? "")} · stored when the quote was sent
                </span>
              ) : !draft && own !== undefined ? (
                <span className="flex-1 min-w-0 text-xs text-slate-500">Stored on this quote</span>
              ) : today !== undefined ? (
                <span className="flex-1 min-w-0 text-xs text-slate-500">ČNB · today ({formatDate(exchange.fixingDate)})</span>
              ) : exchange.isError ? (
                // ČNB may well publish this rate; asking for it to be typed would be wrong.
                <span className="flex-1 min-w-0 text-xs font-semibold text-red-600">ČNB rates not loaded</span>
              ) : own !== undefined ? (
                <span className="flex-1 min-w-0 text-xs text-slate-500">Stored on this quote · ČNB publishes no rate</span>
              ) : (
                <span className="flex-1 min-w-0 text-xs font-semibold text-red-600">ČNB publishes no rate - those lines are left out</span>
              )}
            </li>
          );
        })}
      </ul>
      {draft && (
        <div className="px-3 py-2 border-t border-slate-100 text-xs text-slate-500">
          A draft follows today&apos;s ČNB rates; they are stored on the quote when it is sent.
        </div>
      )}
    </LineBlock>
  );
}
