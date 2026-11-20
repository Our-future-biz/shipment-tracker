import type { interfaces } from "@/lib/api/client";
import { COUNTRIES } from "@/lib/countries";

// A quote's Pickup and Delivery Address come from the customer's addresses in the Customer
// Database: the Pickup Address from its addresses that are (also) Pickup, the Delivery Address from
// those that are (also) Delivery; one address can be both. The quote keeps the address as text, the
// way the PDF prints it and the shipment takes it over; the collections tariffs read its postcode
// from that text.

/** The kind of address a quote's field is picked from. */
export type QuoteAddressType = Extract<interfaces.AddressType, "Pickup" | "Delivery">;

type AddressParts = Pick<interfaces.AddressItem, "label" | "street" | "postalCode" | "city" | "country">;

const countryName = (code: string) => COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code;

/** A Customer Database address as the quote keeps it: "Alza (nakladka), V jame, 16000 Praha 6, Czechia". */
export function quoteAddressText(address: AddressParts): string {
  const place = [address.postalCode.trim(), address.city.trim()].filter(Boolean).join(" ");
  return [address.label.trim(), address.street.trim(), place, countryName(address.country.trim())].filter(Boolean).join(", ");
}

/** One address the field offers; `registered` when it is offered as the customer's registered address only. */
export interface QuoteAddressOption {
  value: string;
  label: string;
  registered: boolean;
}

/**
 * The customer's addresses of a type (among others) as the field offers them, each once, in the
 * Customer Database's order; then its registered address, where that is not one of them already.
 * A customer found in the register comes with its registered address only, and its pickup is
 * often there: the field offers it rather than nothing (User Council S14). The quote keeps the
 * address's text alone, without the "(registered address)" the list names it by.
 */
export function quoteAddressOptions(addresses: readonly interfaces.AddressItem[], type: QuoteAddressType): QuoteAddressOption[] {
  const own = [...new Set(addresses.filter((a) => a.types.includes(type)).map(quoteAddressText))].filter(Boolean);
  const registered = [...new Set(addresses.filter((a) => a.types.includes("Registered")).map(quoteAddressText))].filter((text) => text && !own.includes(text));
  return [
    ...own.map((text) => ({ value: text, label: text, registered: false })),
    ...registered.map((text) => ({ value: text, label: `${text} (registered address)`, registered: true })),
  ];
}
