import type { interfaces } from "@/lib/api/client";
import { fmtMoney } from "@/lib/money";
import { formatQty } from "@/lib/number";
import { TARIFF_PAGES } from "./tariffPages";

// Pure helpers of the first / last mile collections tariffs: where a haulier and a version live,
// and how the freight a tariff serves, its weight rows and its surcharges read.

export const collectionHaulierHref = (customerId: string) => `${TARIFF_PAGES.collections.path}/${customerId}`;
export const collectionVersionHref = (customerId: string, versionId: string) => `${collectionHaulierHref(customerId)}/versions/${versionId}`;

/** What a collections tariff can collect and deliver, in the order they are offered (the API keeps the same list). */
export const COLLECTION_FREIGHT_MODES: { value: interfaces.CollectionFreightMode; label: string }[] = [
  { value: "sea_lcl", label: "Sea LCL" },
  { value: "air", label: "Air" },
];

/** "Sea LCL", "Air" or "Sea LCL & Air". */
export function freightModesText(modes: readonly interfaces.CollectionFreightMode[]): string {
  const labels = COLLECTION_FREIGHT_MODES.filter((m) => modes.includes(m.value)).map((m) => m.label);
  return labels.join(" & ");
}

/** A 5-digit postcode the Czech way, "252 61"; anything else as it is. */
export const postcodeText = (postcode: string) => (/^\d{5}$/.test(postcode) ? `${postcode.slice(0, 3)} ${postcode.slice(3)}` : postcode);

/** "up to 150 kg" */
export const weightToText = (kg: number) => `up to ${formatQty(kg)} kg`;

/** "≤ 0.12 m³" */
export const volumeToText = (cbm: number) => `≤ ${formatQty(cbm)} m³`;

/** How a tariff finds a consignment's price column, in words. */
export const ZONE_BY_TEXT: Record<interfaces.CollectionZoneBy, string> = {
  distance: "By distance: the km between our hub and the customer, from the tariff's own postcode and distance lists",
  postcode: "By the customer's postcode area",
};

/** A surcharge as people say it: "Oversize (over 350 cm): +50 %", "Fuel: +12 %", "Handling: 50 CZK". */
export function surchargeText(s: interfaces.CollectionSurcharge, currency: string): string {
  if (s.kind === "oversize") return `${s.label}: +${formatQty(s.percent ?? 0)} % for a piece over ${formatQty(s.overLengthCm ?? 0)} cm`;
  if (s.kind === "percent") return `${s.label}: +${formatQty(s.percent ?? 0)} %`;
  return `${s.label}: ${fmtMoney(s.amount ?? 0, currency)} per consignment`;
}
