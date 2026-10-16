import type { interfaces } from "@/lib/api/client";
import { formatPostcode as formatPostcodeAs } from "@/lib/postcode";

// The API stores a Czech postcode as 5 digits ("11000"); it is shown the Czech way, "110 00".
// Other countries' postcodes are shown as stored.
export function formatPostcode(country: string, postcode: string): string {
  return formatPostcodeAs(postcode, country);
}

// One line for a grid cell: "Jankovcova 1522/53, 170 00 Praha 7, CZ".
export function siteAddressLine(site: Pick<interfaces.CustomerSiteItem, "street" | "postcode" | "city" | "country">): string {
  const place = [formatPostcode(site.country, site.postcode), site.city].filter(Boolean).join(" ");
  return [site.street, place, site.country].filter(Boolean).join(", ");
}
