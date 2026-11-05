import { isPlainObject } from "./quoteDocument.utils";

// A quote's Shipping terms - what the rate offer includes, excludes and is subject to - come from a
// Terms & Conditions template of Sales Settings, never typed: the quote is not made Ready to Send,
// sent or Won before one is chosen (the margin and warehouse gates' moves).

export const SHIPPING_TERMS_FIRST = "Choose the Shipping terms template first (Shipping terms step): the quote can't be sent without it";

/** Why the quote can't move on for its Shipping terms; null once a template is chosen. */
export function shippingTermsGateMessage(data: unknown): string | null {
  const name = isPlainObject(data) ? data.shippingTerms : undefined;
  return typeof name === "string" && name.trim() ? null : SHIPPING_TERMS_FIRST;
}
