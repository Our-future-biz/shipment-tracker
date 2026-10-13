"use client";

import { useEffect, useState } from "react";
import { SALES_PAGES } from "./tabs";

// The Quotes list keeps its search, filters, sort and page in the URL. The quote page is also
// reached from customers, shipments and direct links, so its "Quotes" link cannot rely on
// browser history: the list remembers its last query here and the quote page links back with it.
// The twin of app/customers/_lib/customerListHref.ts.

const KEY = "sales:quote-list-query";
const LIST_PATH = SALES_PAGES.quotes.path;

export function rememberQuoteListQuery(query: string) {
  try {
    sessionStorage.setItem(KEY, query);
  } catch {
    // Storage unavailable: the link just opens the unfiltered list.
  }
}

// Starts as the bare path and is filled in after mount, so the first render matches the server's.
export function useQuoteListHref(): string {
  const [href, setHref] = useState(LIST_PATH);
  useEffect(() => {
    try {
      const query = sessionStorage.getItem(KEY);
      if (query) setHref(`${LIST_PATH}?${query}`);
    } catch {
      // Storage unavailable: keep the bare path.
    }
  }, []);
  return href;
}
