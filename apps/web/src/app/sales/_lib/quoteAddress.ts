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

/** The customer's addresses of a type (among others) as the field offers them, each once, in the Customer Database's order. */
export function quoteAddressOptions(addresses: readonly interfaces.AddressItem[], type: QuoteAddressType): { value: string; label: string }[] {
  const texts = addresses.filter((a) => a.types.includes(type)).map(quoteAddressText);
  return [...new Set(texts)].filter(Boolean).map((text) => ({ value: text, label: text }));
}
