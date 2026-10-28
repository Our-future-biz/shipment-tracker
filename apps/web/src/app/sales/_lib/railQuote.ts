import type { controllers, interfaces } from "@/lib/api/client";
import { containerType } from "@/lib/cargo";
import { formatPostcode } from "@/lib/postcode";
import { TARIFF_PORTS, portsText } from "@/app/tariffs/_lib/railTariffs";
import { cargoReadyDay, isContainerQuote } from "./salesQuote";
import { ADDRESS_POSTCODE, containerFreightLines, hasTariffRef, isChargeLine, tariffRefVersionId, withTariffLines, type TariffPick } from "./tariffQuote";
import type { CostLine, SalesQuoteData } from "./types";

// Pure helpers of rail tariffs on a quote (Pricing → "Tariffs available" on an inland container
// haulage line): the route the tariffs are asked for, as the quote gives it and the user corrects
// it, and the buying lines an offer the user picked becomes.

export type RailOffer = interfaces.RailOffer;

/** The charge a line has to be for the tariffs to be offered on it. */
const INLAND_HAULAGE = "inland_haulage";

/** The prefix of the tariffRef of every line priced from a rail tariff: "rail:<versionId>:<rateId>". */
const RAIL_REF_PREFIX = "rail:";

export const isRailLine = (line: Pick<CostLine, "tariffRef">) => hasTariffRef(line, RAIL_REF_PREFIX);

/** Whether a line is an inland container haulage, which the rail tariffs can price. */
export const isInlandHaulageLine = (line: Pick<CostLine, "chargeCode" | "type">) => isChargeLine(line, INLAND_HAULAGE);

/** The tariff version a rail line was priced from, or null for any other line. */
export const railVersionId = (line: Pick<CostLine, "tariffRef">) => tariffRefVersionId(line, RAIL_REF_PREFIX);

/** What the rail tariffs are asked for: the port, direction, inland place, day and containers. */
export interface RailRoute {
  port: interfaces.TariffPortCode | null;
  direction: interfaces.RailDirection;
  /** A postcode ("602 00") or a town */
  place: string;
  /** ISO 3166-1 alpha-2 of the inland place */
  country: string;
  /** YYYY-MM-DD */
  date: string;
  containers: interfaces.RailOfferContainer[];
}

const LOCODE = /\(([A-Z]{2})([A-Z0-9]{3})\)\s*$/;

// "Hamburg (DEHAM)" → "DEHAM", if it is one of the ports tariffs are for.
function tariffPortOf(value: string | undefined): interfaces.TariffPortCode | null {
  const match = LOCODE.exec(value ?? "");
  const code = match ? `${match[1]}${match[2]}` : "";
  return TARIFF_PORTS.find((p) => p.code === code)?.code ?? null;
}

/**
 * The route as the quote gives it. An import runs from the port of discharge to the delivery
 * address, an export from the pickup address to the port of loading. The inland place is the
 * postcode in that address, else the town of Destination (import) or Origin (export); the
 * country is that town's. The day is the cargo's ready date, else today. The containers are those
 * of Cargo details, with their cargo weight per box.
 */
export function railRouteOf(data: SalesQuoteData, today: string): RailRoute {
  const direction: interfaces.RailDirection = data.direction === "Export" ? "export" : "import";
  const address = (direction === "import" ? data.delivery : data.pickup) ?? "";
  const town = (direction === "import" ? data.destination : data.origin) ?? "";
  const postcode = ADDRESS_POSTCODE.exec(address);
  const country = LOCODE.exec(town)?.[1] ?? "CZ";
  return {
    port: tariffPortOf(direction === "import" ? data.pod : data.pol),
    direction,
    place: postcode ? formatPostcode(`${postcode[1]}${postcode[2]}`, country) : town.replace(LOCODE, "").trim(),
    country,
    date: cargoReadyDay(data) || today,
    containers: railContainersOf(data),
  };
}

/** The quote's container lines as the tariffs are asked for them: those with a type and a number. */
export function railContainersOf(data: SalesQuoteData): interfaces.RailOfferContainer[] {
  if (!isContainerQuote(data)) return [];
  return (data.containers ?? [])
    .map((c) => ({ type: containerType(c.type), qty: Math.floor(Number(c.qty) || 0), cargoKg: Number(c.weight) > 0 ? Number(c.weight) : null }))
    .filter((c) => c.type && c.qty > 0);
}

/** What keeps the route from being asked for, in words; null when it can be. */
export function railRouteProblem(route: RailRoute): string | null {
  if (!route.containers.length) return "Add the containers in Cargo details first";
  if (!route.port) return `Choose the port (tariffs are for ${portsText(TARIFF_PORTS.map((p) => p.code))})`;
  if (!route.place.trim()) return "Type the inland place or its postcode";
  return null;
}

/** The route as the API takes it; null while it cannot be asked for. */
export function railOffersRequest(route: RailRoute): controllers.RailOffersRequest | null {
  if (railRouteProblem(route) || !route.port) return null;
  return { port: route.port, direction: route.direction, place: route.place.trim(), country: route.country, date: route.date, containers: route.containers };
}

const portName = (code: string) => TARIFF_PORTS.find((p) => p.code === code)?.name ?? code;

/** "Rail Hamburg → Brno via Cetr" on an import, "Rail Brno → Hamburg via Cetr" on an export. */
export function railDescription(offer: Pick<RailOffer, "place" | "via">, port: string, direction: interfaces.RailDirection): string {
  const [from, to] = direction === "import" ? [portName(port), offer.place] : [offer.place, portName(port)];
  return `Rail ${from} → ${to}${offer.via ? ` via ${offer.via}` : ""}`;
}

/**
 * The buying lines a picked offer makes of the line it was picked on: the operator becomes the
 * supplier, the offer's currency the line's, and every line is tagged with the tariff row. One line
 * per container or one per container type (containerFreightLines).
 */
function railOfferLines(line: CostLine, offer: RailOffer, port: string, direction: interfaces.RailDirection, quote: SalesQuoteData): CostLine[] {
  const base: CostLine = {
    ...line,
    supplier: offer.supplierName,
    supplierCustomerId: offer.supplierCustomerId,
    currency: offer.currency,
    tariffRef: `${RAIL_REF_PREFIX}${offer.versionId}:${offer.rateId}`,
  };
  return containerFreightLines(base, railDescription(offer, port, direction), offer.lines, quote);
}

/**
 * The buying lines with an offer put on line `index`: its lines take that line's place, and lines
 * an earlier pick on it made (the same tariffRef) go, so picking again replaces them.
 */
export function withRailOffer(lines: CostLine[], index: number, offer: RailOffer, port: string, direction: interfaces.RailDirection, quote: SalesQuoteData): TariffPick {
  return withTariffLines(lines, index, RAIL_REF_PREFIX, (picked) => railOfferLines(picked, offer, port, direction, quote));
}
