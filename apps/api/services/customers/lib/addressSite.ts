import { APIError } from "encore.dev/api";
import type { AddressType, CustomerSiteKind } from "../interfaces/interfaces";
import type { CustomerAddressRecord } from "../schemas/customerAddress.schema";
import type { NewCustomerSiteRecord } from "../schemas/customerSite.schema";
import { normaliseCountry, normalisePostcode } from "./postcode";

// Every Pickup and Delivery address of a customer is also one of its sites (the Sites tab): the
// address is kept in Addresses, the site adds what trucking needs there (opening hours, avizace,
// tail lift, notes). One address that is both Pickup and Delivery is one site used for both;
// different addresses are different sites. The site follows its address: its name, use and
// address are written from it on every change, and it goes when the address stops being Pickup
// or Delivery, or is deleted.

/** What a site is used for, by its address's types; null when the address is neither Pickup nor Delivery. */
export function siteKindOf(types: readonly AddressType[]): CustomerSiteKind | null {
  const pickup = types.includes("Pickup");
  const delivery = types.includes("Delivery");
  if (pickup && delivery) return "both";
  if (pickup) return "loading";
  if (delivery) return "delivery";
  return null;
}

/** An address's types with its Pickup / Delivery replaced by what a site of `kind` is used for; the others kept. */
export function typesForKind(types: readonly AddressType[], kind: CustomerSiteKind): AddressType[] {
  const others = types.filter((t) => t !== "Pickup" && t !== "Delivery");
  const used: AddressType[] = kind === "both" ? ["Pickup", "Delivery"] : kind === "loading" ? ["Pickup"] : ["Delivery"];
  return [...others, ...used];
}

/** The address's types without Pickup and Delivery: what is left of it when its site goes. */
export const typesWithoutSite = (types: readonly AddressType[]): AddressType[] => types.filter((t) => t !== "Pickup" && t !== "Delivery");

/** The parts of a site written from its address. */
export type SiteAddressFields = Pick<NewCustomerSiteRecord, "label" | "kind" | "street" | "postcode" | "city" | "country">;

/**
 * A Pickup / Delivery address's site fields: its name (else its street, else its city), what the
 * site is used for, and the address with the postcode as sites keep it (a Czech one as 5 digits,
 * which zone pricing reads). Refused when the postcode is not one for the country.
 */
export function siteFieldsOf(
  address: Pick<CustomerAddressRecord, "types" | "label" | "street" | "city" | "postalCode" | "country">,
  kind: CustomerSiteKind,
): SiteAddressFields {
  const country = normaliseCountry(address.country || "CZ");
  const postcode = normalisePostcode(country, address.postalCode);
  if (postcode === null) {
    throw APIError.invalidArgument(
      country === "CZ"
        ? "A pickup or delivery address in Czechia needs a postcode of 5 digits, e.g. 110 00: trucking prices by it"
        : "A pickup or delivery address needs a postcode",
    );
  }
  const street = address.street.trim();
  const city = address.city.trim();
  return { label: address.label.trim() || street || city || postcode, kind, street, postcode, city, country };
}

/** Whether the site's address differs from these fields: its map position no longer fits then. */
export const siteMoved = (site: Pick<NewCustomerSiteRecord, "street" | "postcode" | "city" | "country">, fields: SiteAddressFields) =>
  site.street !== fields.street || site.postcode !== fields.postcode || site.city !== fields.city || site.country !== fields.country;
