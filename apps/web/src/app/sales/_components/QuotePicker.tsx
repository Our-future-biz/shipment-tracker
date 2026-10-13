"use client";

import { useState, type ReactNode } from "react";
import { Select } from "antd";
import { useDebounced } from "@/hooks/useDebounced";
import { useSalesQuoteList } from "@/hooks/useSalesQuoteList";
import type { SalesQuote } from "../_lib/salesQuote";
import { QuoteRoute } from "./QuoteRoute";

// How many quotes the picker lists at a time: the newest ones that match what was typed.
const PICKER_LIMIT = 20;

/** The quote a picker shows as picked. One picked earlier is known by its reference alone - what a task or another record keeps of it. */
export type PickedQuote = Pick<SalesQuote, "quoteNumber"> & Partial<Pick<SalesQuote, "data">>;

// A quote in one line of plain text: what a row of the list says in full when it is too long to
// fit, as its tooltip.
function quoteText(quote: PickedQuote): string {
  if (!quote.data) return quote.quoteNumber;
  const { customerName, origin, destination } = quote.data;
  const route = origin || destination ? ` · ${origin || "—"} → ${destination || "—"}` : "";
  return `${quote.quoteNumber}${customerName ? ` — ${customerName}` : ""}${route}`;
}

// A quote as the picker shows it, in its list and in its box: the reference as the app prints
// references, then whose quote it is and where it goes.
function quoteLabel(quote: PickedQuote): ReactNode {
  const { customerName, origin, destination } = quote.data ?? {};
  return (
    <>
      <span className="font-mono font-semibold">{quote.quoteNumber}</span>
      {customerName && <span className="ml-2">{customerName}</span>}
      {(origin || destination) && (
        <span className="ml-2">
          <QuoteRoute origin={origin} destination={destination} />
        </span>
      )}
    </>
  );
}

// Picks one sales quote out of all the company has. The server looks for what is typed - in the
// reference, customer, route, commodity and the other fields the Quotes list searches - so a quote
// can be found however old it is; the list itself holds only the newest few that match and says
// when there are more. The picked quote is handed over whole, with its document.
export function QuotePicker({
  value,
  onChange,
  exclude,
}: {
  value: PickedQuote | null;
  onChange: (quote: SalesQuote | null) => void;
  /** A reference that is not offered: the quote the picker is opened from. */
  exclude?: string;
}) {
  const [typed, setTyped] = useState("");
  // The request waits until typing pauses: every search reads through the company's quotes.
  const search = useDebounced(typed, 300).trim();
  const { quotes, total, isLoading, isError } = useSalesQuoteList({ search: search || undefined, limit: PICKER_LIMIT });
  const offered = quotes.filter((quote) => quote.quoteNumber !== exclude);
  // A quote known by its reference alone reads as the list reads it, while the list holds it.
  const shown = value && !value.data ? (offered.find((quote) => quote.quoteNumber === value.quoteNumber) ?? value) : value;

  let emptyText = "No quotes match";
  if (isLoading) emptyText = "Searching…";
  if (isError) emptyText = "Could not load quotes";

  return (
    <Select
      showSearch
      allowClear
      labelInValue
      className="w-full"
      placeholder="Search by reference, customer or route…"
      // The server has already searched; filtering again here would hide what it found by a
      // field the label does not show.
      filterOption={false}
      onSearch={setTyped}
      // The box empties itself when the list closes; the search has to go with it, or the list
      // would open again on what was typed last time.
      onOpenChange={(open) => !open && setTyped("")}
      loading={isLoading}
      value={shown ? { value: shown.quoteNumber, label: quoteLabel(shown) } : undefined}
      onChange={(picked?: { value: string; label: ReactNode }) => onChange(offered.find((quote) => quote.quoteNumber === picked?.value) ?? null)}
      options={offered.map((quote) => ({ value: quote.quoteNumber, label: quoteLabel(quote), title: quoteText(quote) }))}
      notFoundContent={emptyText}
      popupRender={(menu) => (
        <>
          {menu}
          {total !== undefined && total > quotes.length && (
            <div className="border-t border-slate-100 px-3 py-1.5 text-xs text-slate-400">
              Showing the newest {quotes.length} of {total.toLocaleString("en-US")} - type to find another.
            </div>
          )}
        </>
      )}
    />
  );
}
