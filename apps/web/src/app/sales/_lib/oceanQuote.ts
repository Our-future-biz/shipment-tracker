import type { controllers, interfaces } from "@/lib/api/client";
import { containerType } from "@/lib/cargo";
import { chargeLabel } from "@/lib/chargeCodes";
import { cargoReadyDay, isContainerQuote } from "./salesQuote";
import { containerFreightLines, hasTariffRef, isChargeLine, tariffRefVersionId, withTariffLines, type ToQuoteCurrency, type TariffPick } from "./tariffQuote";
import type { CostLine, SalesQuoteData } from "./types";

// Pure helpers of shipping lines' ocean tariffs on a quote (Pricing → "Tariffs available" on the
// Ocean freight line of a Sea FCL quote): the route and containers the tariffs are asked for, as
// the quote gives them and the user corrects them, and the buying lines an offer the user picked
// becomes - the freight, and a line per surcharge.

export type OceanOffer = interfaces.OceanOffer;

/** The charge a line has to be for the ocean tariffs to be offered on it. */
const OCEAN_FREIGHT = "ocean_freight";

/** The prefix of the tariffRef of every line priced from an ocean tariff: "ocean:<versionId>:<rateId>". */
const OCEAN_REF_PREFIX = "ocean:";

export const isOceanLine = (line: Pick<CostLine, "tariffRef">) => hasTariffRef(line, OCEAN_REF_PREFIX);

/** The tariff version an ocean line was priced from, or null for any other line. */
export const oceanVersionId = (line: Pick<CostLine, "tariffRef">) => tariffRefVersionId(line, OCEAN_REF_PREFIX);

/** Whether a line is ocean freight, which the shipping lines' tariffs can price. */
export const isOceanFreightLine = (line: Pick<CostLine, "chargeCode" | "type">) => isChargeLine(line, OCEAN_FREIGHT);

/** What the ocean tariffs are asked for: the direction, the two ports, the day, the containers. */
export interface OceanRoute {
  /** Whether the quote is a Sea FCL one, the only kind the tariffs price */
  fcl: boolean;
  direction: interfaces.RailDirection;
  /** The port of loading as places are stored, "Hamburg (DEHAM)"; "" when none */
  pol: string;
  /** The port of discharge, the same way */
  pod: string;
  /** Every port of loading the tariffs have to the port of discharge, not only `pol` */
  comparePols: boolean;
  /** YYYY-MM-DD */
  date: string;
  containers: { type: string; qty: number }[];
  dangerous: boolean;
}

const LOCODE = /\(([A-Z]{2}[A-Z0-9]{3})\)\s*$/;

/** The UN/LOCODE of a stored place, "Hamburg (DEHAM)" → "DEHAM"; null when it carries none. */
export const oceanPlaceCode = (value: string | undefined): string | null => LOCODE.exec(value ?? "")?.[1] ?? null;

/** The name of a stored place, "Hamburg (DEHAM)" → "Hamburg". */
const placeName = (value: string) => value.replace(LOCODE, "").trim();

/** The quote's container lines as the tariffs are asked for them: those with a type and a number. */
export function oceanContainersOf(data: SalesQuoteData): { type: string; qty: number }[] {
  if (!isContainerQuote(data)) return [];
  return (data.containers ?? []).map((c) => ({ type: containerType(c.type), qty: Math.floor(Number(c.qty) || 0) })).filter((c) => c.type && c.qty > 0);
}

/**
 * The route as the quote gives it: its ports of loading and discharge, an import when the quote
 * says so (else an export), the cargo's ready date (else today), the containers of Cargo details,
 * and whether the cargo is dangerous goods (IMO surcharges).
 */
export function oceanRouteOf(data: SalesQuoteData, today: string): OceanRoute {
  return {
    fcl: data.serviceType === "Sea FCL",
    direction: data.direction === "Import" ? "import" : "export",
    pol: oceanPlaceCode(data.pol) ? (data.pol ?? "").trim() : "",
    pod: oceanPlaceCode(data.pod) ? (data.pod ?? "").trim() : "",
    comparePols: false,
    date: cargoReadyDay(data) || today,
    containers: oceanContainersOf(data),
    dangerous: !!data.dangerous,
  };
}

/** What keeps the route from being asked for, in words; null when it can be. */
export function oceanRouteProblem(route: OceanRoute): string | null {
  if (!route.fcl) return "Shipping lines' tariffs price Sea FCL quotes";
  if (!route.containers.length) return "Add the containers in Cargo details first";
  if (!route.comparePols && !oceanPlaceCode(route.pol)) return "Choose the port of loading";
  if (!oceanPlaceCode(route.pod)) return "Choose the port of discharge";
  return null;
}

/** The route as the API takes it; null while it cannot be asked for. */
export function oceanOffersRequest(route: OceanRoute): controllers.OceanOffersRequest | null {
  if (oceanRouteProblem(route)) return null;
  return {
    direction: route.direction,
    polCode: oceanPlaceCode(route.pol) ?? "",
    podCode: oceanPlaceCode(route.pod)!,
    comparePols: route.comparePols,
    date: route.date,
    containers: route.containers,
    dangerous: route.dangerous,
  };
}

// A port of an offer as people read it: the route's own name when it is that port, else the
// tariff's name - or the code, where the tariff writes a short code ("HAM").
function portLabel(name: string, code: string, routePlace: string): string {
  if (code && oceanPlaceCode(routePlace) === code) return placeName(routePlace);
  return /^[A-Z]{3}$/.test(name) && code ? code : name;
}

/** The two ports of an offer, "Hamburg" and "Shanghai", as the route names them where it can. */
export function offerPorts(offer: Pick<OceanOffer, "polName" | "polCode" | "podName" | "podCode">, route: Pick<OceanRoute, "pol" | "pod">): [string, string] {
  return [portLabel(offer.polName, offer.polCode, route.pol), portLabel(offer.podName, offer.podCode, route.pod)];
}

/** "Ocean freight Hamburg → Shanghai (OOCL) via Kaohsiung". */
export function oceanDescription(offer: OceanOffer, route: Pick<OceanRoute, "pol" | "pod">): string {
  const [from, to] = offerPorts(offer, route);
  return `Ocean freight ${from} → ${to} (${offer.supplierName})${offer.via ? ` via ${offer.via}` : ""}`;
}

/** The unit a surcharge line is counted in; never "container", which the per-container basis owns. */
const SURCHARGE_UNIT: Record<interfaces.OceanSurchargeBasis, string> = { teu: "TEU", container: "ctr", bl: "B/L", booking: "booking" };

const MAPPED_CHARGES = new Set<string>(["fcl_baf", "ams_ens", "fcl_documentation"]);

/** The buying line a surcharge of an offer becomes: a lump sum of units × rate, on its own charge where the quote has one. */
function oceanSurchargeLine(s: interfaces.OceanOfferSurcharge, offer: OceanOffer, tariffRef: string): CostLine {
  const code = MAPPED_CHARGES.has(s.charge) ? s.charge : "other";
  return {
    type: chargeLabel(code),
    chargeCode: code,
    description: `${s.code} – ${s.name}`,
    supplier: offer.supplierName,
    supplierCustomerId: offer.supplierCustomerId,
    currency: s.currency,
    basis: "lumpsum",
    amount: s.total,
    qty: s.units,
    unit: SURCHARGE_UNIT[s.basis],
    unitPrice: s.rate,
    tariffRef,
  };
}

/**
 * The buying lines a picked offer makes of the line it was picked on: the freight - one line per
 * container or one per container type (containerFreightLines) - and then a line per surcharge. The
 * shipping line is the supplier of each, and each is tagged with the tariff row.
 */
function oceanOfferLines(line: CostLine, offer: OceanOffer, route: Pick<OceanRoute, "pol" | "pod">, quote: SalesQuoteData): CostLine[] {
  const tariffRef = `${OCEAN_REF_PREFIX}${offer.versionId}:${offer.rateId}`;
  const base: CostLine = {
    ...line,
    supplier: offer.supplierName,
    supplierCustomerId: offer.supplierCustomerId,
    currency: offer.currency,
    tariffRef,
  };
  const freight = containerFreightLines(base, oceanDescription(offer, route), offer.lines, quote);
  return [...freight, ...offer.surcharges.map((s) => oceanSurchargeLine(s, offer, tariffRef))];
}

/**
 * The buying lines with an offer put on line `index`: its lines take that line's place, and the
 * lines an earlier pick on it made (the same tariffRef: its freight and surcharges) go, so picking
 * again replaces them.
 */
export function withOceanOffer(lines: CostLine[], index: number, offer: OceanOffer, route: Pick<OceanRoute, "pol" | "pod">, quote: SalesQuoteData): TariffPick {
  return withTariffLines(lines, index, OCEAN_REF_PREFIX, (picked) => oceanOfferLines(picked, offer, route, quote));
}

/** An offer's all-in total in the quote's currency: every currency's total converted; null when one has no rate. */
export function oceanAllIn(offer: Pick<OceanOffer, "totals">, quoteCurrency: string, toQuoteCurrency: ToQuoteCurrency): number | null {
  let sum = 0;
  for (const t of offer.totals) {
    const converted = t.currency === quoteCurrency ? t.amount : toQuoteCurrency(t.amount, t.currency);
    if (converted === null) return null;
    sum += converted;
  }
  return Math.round(sum * 100) / 100;
}
