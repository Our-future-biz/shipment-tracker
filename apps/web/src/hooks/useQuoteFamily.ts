"use client";

import { useMemo } from "react";
import { baseRef, quoteFamily } from "@/app/sales/_lib/salesQuote";
import { useAllSalesQuotes } from "./useAllSalesQuotes";

// The variants of one enquiry: the quote `ref` names, the quote it branches off and the other
// -2, -3, ..., in the order of their numbers. The server is asked for that family alone, so a
// screen that shows one quote never loads the list of all of them. Null asks for nothing.
export const useQuoteFamily = (ref: string | null) => {
  // Asked by the base, so every variant of a family reads the same copy.
  const { quotes, isError, reload } = useAllSalesQuotes({ familyOf: ref ? baseRef(ref) : "" }, { enabled: ref !== null });
  const family = useMemo(() => (ref ? quoteFamily(quotes, ref) : []), [quotes, ref]);
  return { family, isError, reload };
};
