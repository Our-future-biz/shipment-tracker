import type { controllers, interfaces, services } from "@/lib/api/client";
import { toChargeCode } from "@/lib/chargeCodes";
import { postcodeText } from "@/app/tariffs/_lib/collectionTariffs";
import { cargoReadyDay, computeCargo } from "./salesQuote";
import type { CostLine, SalesQuoteData } from "./types";

// Pure helpers of first / last mile collections tariffs on a quote (Pricing → "Tariffs available"
// on an inland collection / delivery line of a Sea LCL or air quote): the consignment and the two
// ends the tariffs are asked for, as the quote gives them and the user corrects them, and the
// buying line an offer the user picked becomes.

export type CollectionOffer = interfaces.CollectionOffer;
export type CollectionOffersResult = services.CollectionOffersResult;
type FreightMode = interfaces.CollectionFreightMode;

/** The charge a line has to be for the collections tariffs to be offered on it. */
export const INLAND_COLLECTION = "inland_collection";

/** The prefix of the tariffRef of every line priced from a collections tariff: "collection:<versionId>". */
export const COLLECTION_REF_PREFIX = "collection:";

export const isCollectionLine = (line: Pick<CostLine, "tariffRef">) => !!line.tariffRef?.startsWith(COLLECTION_REF_PREFIX);

/** The tariff version a collection line was priced from, or null for any other line. */
export function collectionVersionId(line: Pick<CostLine, "tariffRef">): string | null {
  if (!isCollectionLine(line)) return null;
  return line.tariffRef!.slice(COLLECTION_REF_PREFIX.length).split(":")[0] || null;
}

/** Whether a line is an inland collection / delivery, which the collections tariffs can price. */
export const isInlandCollectionLine = (line: Pick<CostLine, "chargeCode" | "type">) => (line.chargeCode || toChargeCode(line.type)) === INLAND_COLLECTION;

/** The freight a quote's mode is to the collections tariffs; null for a mode they do not serve. */
export function collectionFreightOf(serviceType: string | undefined): FreightMode | null {
  if (serviceType === "Sea LCL") return "sea_lcl";
  if (serviceType === "Air") return "air";
  return null;
}

/** A collection runs from the customer to our hub (export), a delivery from our hub to the customer (import). */
export type CollectionLeg = "collection" | "delivery";

/** What the collections tariffs are asked for: the freight, the two ends, the day and the consignment. */
export interface CollectionRoute {
  freightMode: FreightMode | null;
  leg: CollectionLeg;
  /** Our hub's postcode as shown ("252 61") or typed */
  hubPostcode: string;
  /** The customer's postcode as shown or typed */
  customerPostcode: string;
  /** YYYY-MM-DD */
  date: string;
  weightKg: number | null;
  cbm: number | null;
  longestCm: number | null;
}

// A postcode written in an address: three and two digits, with or without a space between.
const POSTCODE = /(?:^|\D)(\d{3}) ?(\d{2})(?!\d)/;

/** The 5 digits of a postcode as typed ("252 61", "25261"); null when it is none. */
export const postcodeDigits = (text: string): string | null => {
  const digits = text.replace(/\s/g, "");
  return /^\d{5}$/.test(digits) ? digits : null;
};

/** The postcode in an address, shown the Czech way ("602 00"); "" when it has none. */
export function addressPostcode(address: string | undefined): string {
  const match = POSTCODE.exec(address ?? "");
  return match ? postcodeText(`${match[1]}${match[2]}`) : "";
}

/** The customer's postcode for a leg: the Pickup Address's for a collection, the Delivery Address's for a delivery. */
export const customerPostcodeOf = (data: SalesQuoteData, leg: CollectionLeg) => addressPostcode(leg === "collection" ? data.pickup : data.delivery);

/** Our hub's postcode for the freight, as the hubs set on Tariffs give it; "" when none is set. */
export function hubPostcodeOf(hubs: readonly interfaces.CollectionHub[], freightMode: FreightMode | null): string {
  const hub = hubs.find((h) => h.freightMode === freightMode);
  return hub ? postcodeText(hub.postcode) : "";
}

/** The longest side of any piece in the package lines, in cm; null when no piece has a size. */
export function longestPieceCm(data: SalesQuoteData): number | null {
  const sides = (data.packages ?? []).flatMap((p) => [p.length, p.width, p.height].map((v) => Number(v) || 0));
  const longest = Math.max(0, ...sides);
  return longest > 0 ? longest : null;
}

/**
 * The route as the quote gives it. An export is a collection from the Pickup Address to our hub, an
 * import (or a quote without a direction) a delivery from our hub to the Delivery Address; the
 * customer's postcode is the one in that address. Our hub is the one set for the freight. The day
 * is the cargo's ready date, else today; the weight, volume and longest piece those of Cargo details.
 */
export function collectionRouteOf(data: SalesQuoteData, hubs: readonly interfaces.CollectionHub[], today: string): CollectionRoute {
  const freightMode = collectionFreightOf(data.serviceType);
  const leg: CollectionLeg = data.direction === "Export" ? "collection" : "delivery";
  const cargo = computeCargo(data);
  return {
    freightMode,
    leg,
    hubPostcode: hubPostcodeOf(hubs, freightMode),
    customerPostcode: customerPostcodeOf(data, leg),
    date: cargoReadyDay(data) || today,
    weightKg: cargo.grossWeight > 0 ? cargo.grossWeight : null,
    cbm: cargo.cbm > 0 ? cargo.cbm : null,
    longestCm: longestPieceCm(data),
  };
}

/** What keeps the route from being asked for, in words; null when it can be. */
export function collectionRouteProblem(route: CollectionRoute): string | null {
  if (!route.freightMode) return "Collections tariffs price Sea LCL and air quotes";
  if (!postcodeDigits(route.hubPostcode)) return "Type our hub's 5-digit postcode (a manager sets it on Tariffs → Last / First Mile Collections)";
  if (!postcodeDigits(route.customerPostcode)) return `Type the ${route.leg === "collection" ? "pickup" : "delivery"} postcode, 5 digits`;
  if (!(route.weightKg && route.weightKg > 0) && !(route.cbm && route.cbm > 0)) return "Enter the weight or the volume (Cargo details)";
  return null;
}

/** The route as the API takes it; null while it cannot be asked for. */
export function collectionOffersRequest(route: CollectionRoute): controllers.CollectionOffersRequest | null {
  if (collectionRouteProblem(route) || !route.freightMode) return null;
  return {
    freightMode: route.freightMode,
    hubPostcode: postcodeDigits(route.hubPostcode)!,
    customerPostcode: postcodeDigits(route.customerPostcode)!,
    date: route.date,
    weightKg: route.weightKg,
    cbm: route.cbm,
    longestCm: route.longestCm,
  };
}

/** The two ends of an offer the way the consignment goes: the tariff's own place names, else the postcodes. */
export function offerEnds(offer: Pick<CollectionOffer, "hubPlace" | "customerPlace">, route: Pick<CollectionRoute, "leg" | "hubPostcode" | "customerPostcode">): [string, string] {
  const hub = offer.hubPlace || route.hubPostcode;
  const customer = offer.customerPlace || route.customerPostcode;
  return route.leg === "delivery" ? [hub, customer] : [customer, hub];
}

/** "206 km" for a tariff by distance, its zone ("Zone 3") for one by postcode area. */
export const offerReach = (offer: Pick<CollectionOffer, "distanceKm" | "zoneLabel">) => (offer.distanceKm !== null ? `${offer.distanceKm.toLocaleString("cs-CZ")} km` : offer.zoneLabel);

/** "Delivery Dobrovíz → Brno · 206 km · up to 150 kg". */
export function collectionDescription(offer: CollectionOffer, route: Pick<CollectionRoute, "leg" | "hubPostcode" | "customerPostcode">): string {
  const [from, to] = offerEnds(offer, route);
  return `${route.leg === "delivery" ? "Delivery" : "Collection"} ${from} → ${to} · ${offerReach(offer)} · ${offer.bandLabel}`;
}

/**
 * The buying line a picked offer makes of the line it was picked on: one lump sum for the whole
 * consignment in the tariff's currency, the haulier as the supplier, tagged with the tariff version.
 * A pairing with a selling line stays; whatever an earlier pick or a basis made of it goes.
 */
export function collectionOfferLine(line: CostLine, offer: CollectionOffer, route: Pick<CollectionRoute, "leg" | "hubPostcode" | "customerPostcode">): CostLine {
  const priced: CostLine = {
    ...line,
    description: collectionDescription(offer, route),
    supplier: offer.supplierName,
    supplierCustomerId: offer.supplierCustomerId,
    currency: offer.currency,
    basis: "lumpsum",
    amount: offer.total,
    value: 1,
    tariffRef: `${COLLECTION_REF_PREFIX}${offer.versionId}`,
  };
  delete priced.qty;
  delete priced.unit;
  delete priced.unitPrice;
  return priced;
}

/** The buying lines with an offer put on line `index`: its line takes that line's place, so picking again replaces it. */
export function withCollectionOffer(lines: CostLine[], index: number, offer: CollectionOffer, route: Pick<CollectionRoute, "leg" | "hubPostcode" | "customerPostcode">): CostLine[] {
  const picked = lines[index];
  if (!picked) return lines;
  return lines.map((l, i) => (i === index ? collectionOfferLine(l, offer, route) : l));
}
