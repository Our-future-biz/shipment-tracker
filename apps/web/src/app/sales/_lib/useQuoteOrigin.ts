"use client";

import { useSearchParams } from "next/navigation";
import { useCustomer } from "@/hooks/useCustomers";
import { quoteHref, quoteOriginOf } from "./quoteHref";
import { useQuoteListHref } from "./quoteListHref";
import { SALES_PAGES } from "./tabs";

// For the quote page: where its one back link leads and what it is called, by where the quote
// was opened from (quoteHref).
// - From Follow-up: "Follow-up".
// - From a customer's page: that customer's name, back on its Quotes tab. The name is the
//   customer's own, read by the id in the address - not the name on the quote, which the user may
//   be changing right now.
// - Otherwise: "Quotes", the list as it was left (useQuoteListHref).
// `hrefOf` is the address of another quote opened from this page - a variant, a duplicate - which
// keeps the origin, so the way back stays the same while switching between them.
export function useQuoteOrigin() {
  const origin = quoteOriginOf(useSearchParams());
  const customerId = origin?.from === "customer" ? origin.customerId : null;
  const listHref = useQuoteListHref();
  const { customer } = useCustomer(customerId);

  let back = { href: listHref, label: SALES_PAGES.quotes.label };
  if (origin?.from === "followup") back = { href: SALES_PAGES.followup.path, label: SALES_PAGES.followup.label };
  // Until the customer is read - or when it cannot be - the link still leads to its page.
  if (customerId) back = { href: `/customers/${customerId}?tab=quotes`, label: customer?.companyName || "Customer" };

  return { back, hrefOf: (quoteNumber: string) => quoteHref(quoteNumber, origin) };
}
