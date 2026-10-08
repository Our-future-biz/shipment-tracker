"use client";

import { useEffect, useState } from "react";

// The list keeps its search, filters and sort in the URL. The detail page is also reached
// from shipments, new tabs and direct links, so "back to the list" cannot rely on browser
// history: the list remembers its last query here and the detail links back with it.

const KEY = "customers:list-query";
const LIST_PATH = "/customers";

export function rememberCustomerListQuery(query: string) {
  try {
    sessionStorage.setItem(KEY, query);
  } catch {
    // Storage unavailable: the back link just opens the unfiltered list.
  }
}

// Starts as the bare path and is filled in after mount, so the first render matches the server's.
export function useCustomerListHref(): string {
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
