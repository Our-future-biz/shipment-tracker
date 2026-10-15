import type { interfaces } from "@/lib/api/client";
import type { RateLevelResult } from "@/hooks/useTrucking";
import { formatPsc } from "@/app/trucking/_lib/hauliers";
import { NO_EXTRAS, emptyRateForm, rateFormProblems, type RateForm } from "@/app/trucking/_lib/rateCalculator";
import { formatMoney, formatPercent, isPriced } from "@/app/trucking/_lib/tariffs";
import { cargoReadyDay, computeCargo } from "./salesQuote";
import type { CostLine, QuoteRoadInput, QuoteRoadPricing, SalesQuoteData } from "./types";

// Pure helpers of road transport on a quote: when the Road transport card shows, what it starts
// from, its checks, which lines were priced from a tariff and whether somebody changed them, and
// how the margin against the floor reads.

export type RoadMargin = NonNullable<interfaces.SalesQuoteItem["roadMargin"]>;

/** The prefix of the tariffRef of every line "Price from tariff" writes: "trucking:<versionId>:<level>". */
export const TRUCKING_REF_PREFIX = "trucking:";

export const isTruckingLine = (line: Pick<CostLine, "tariffRef">) => !!line.tariffRef?.startsWith(TRUCKING_REF_PREFIX);

/** The tariff version a trucking line was priced from, or null for any other line. */
export function truckingVersionId(line: Pick<CostLine, "tariffRef">): string | null {
  if (!isTruckingLine(line)) return null;
  return line.tariffRef!.slice(TRUCKING_REF_PREFIX.length).split(":")[0] || null;
}

/** The Road transport card shows on a Road quote and on any quote that already has lines priced from a tariff. */
export function isRoadQuote(data: Pick<SalesQuoteData, "serviceType" | "buyingLines" | "sellingLines">): boolean {
  if (data.serviceType === "Road") return true;
  return [...(data.buyingLines ?? []), ...(data.sellingLines ?? [])].some(isTruckingLine);
}

/**
 * What the Road transport card starts from on a quote that has none yet: the cargo and readiness
 * date typed into the quote, dangerous goods as ADR and goods that may not be stacked as
 * non-stackable. Pallet places count the pallets among the packages.
 */
export function roadInputDefaults(data: SalesQuoteData): QuoteRoadInput {
  const cargo = computeCargo(data);
  const pallets = (data.packages ?? []).filter((p) => p.type === "Pallets").reduce((sum, p) => sum + (Number(p.qty) || 0), 0);
  const nonStackable = data.stackable === false || (data.packages ?? []).some((p) => p.stackable === false);
  return {
    fromSiteId: null,
    fromPostcode: "",
    toSiteId: null,
    toPostcode: "",
    pickupDate: cargoReadyDay(data) || null,
    pickupTime: null,
    scope: "LTL",
    pieces: cargo.totalPackages || 1,
    palletPlaces: pallets,
    ldm: 0,
    weightKg: cargo.grossWeight,
    cbm: Math.round(cargo.cbm * 100) / 100,
    extras: { ...NO_EXTRAS, adr: !!data.dangerous, nonStackable },
  };
}

/** A Czech postcode as typed ("110 00", "11000") as its 5 digits; null when it is not one. */
export function pscOf(typed: string): string | null {
  const compact = typed.replace(/\s/g, "");
  return /^\d{5}$/.test(compact) ? compact : null;
}

/** The rate calculator's form for a quote's road input: no date means today, prices for the quote's customer, with buy. */
export function roadToRateForm(road: QuoteRoadInput, today: string, customerId: string | null): RateForm {
  return {
    ...emptyRateForm(today),
    fromPsc: pscOf(road.fromPostcode) ?? road.fromPostcode,
    toPsc: pscOf(road.toPostcode) ?? road.toPostcode,
    pickupDate: road.pickupDate ?? today,
    pickupTime: road.pickupTime,
    scope: road.scope,
    pieces: road.pieces,
    palletPlaces: road.palletPlaces,
    ldm: road.ldm,
    weightKg: road.weightKg,
    cbm: road.cbm,
    extras: road.extras,
    customerId,
    includeBuy: true,
    includeInternal: false,
  };
}

/** Why the road input cannot be priced yet: the rate calculator's checks, the postcodes as typed. */
export function roadInputProblems(road: QuoteRoadInput, today: string): string[] {
  const out = rateFormProblems(roadToRateForm(road, today, null));
  if (road.pickupDate && road.pickupDate < today) out.push("Pick-up date is in the past");
  return out;
}

/** The calculator's inputs as a quote's road input ("Copy to quote"); no sites, postcodes shown the Czech way. */
export function rateFormToRoad(form: RateForm): QuoteRoadInput {
  return {
    fromSiteId: null,
    fromPostcode: formatPsc(form.fromPsc),
    toSiteId: null,
    toPostcode: formatPsc(form.toPsc),
    pickupDate: form.pickupDate || null,
    pickupTime: form.pickupTime,
    scope: form.scope,
    pieces: form.pieces,
    palletPlaces: form.palletPlaces,
    ldm: form.ldm,
    weightKg: form.weightKg,
    cbm: form.cbm,
    extras: form.extras,
  };
}

// ── Override detection ──

// Lines are rounded by the tariff to its money step (whole CZK at most); a difference within it is
// that rounding, not a change.
const ROUNDING_TOLERANCE = 1;

/** What a priced side of the quote's road pricing wrote: its version, currency and total. */
type PricedTotals = Pick<QuoteRoadPricing["sell"], "tariffVersionId" | "versionNo" | "currency" | "total">;

/** The priced side a trucking line belongs to, by its tariff version; null when it is from an older pricing. */
export function pricedSideOf(line: Pick<CostLine, "tariffRef">, pricing: QuoteRoadPricing | undefined, kind: "buying" | "selling"): PricedTotals | null {
  const versionId = truckingVersionId(line);
  const side = kind === "selling" ? pricing?.sell : pricing?.buy;
  return versionId && side && side.tariffVersionId === versionId ? side : null;
}

/** One line changed by hand since pricing wrote it: another currency, or an amount that is no longer qty × unit price. */
export function lineOverridden(line: CostLine, pricedCurrency: string): boolean {
  if (line.currency !== pricedCurrency) return true;
  if (line.qty == null || line.unitPrice == null) return false;
  return Math.abs(line.amount - line.qty * line.unitPrice) > ROUNDING_TOLERANCE;
}

/** The trucking lines of one side no longer add up to what pricing wrote (a line changed, added or removed). */
export function sideOverridden(lines: readonly CostLine[], priced: Pick<PricedTotals, "currency" | "total"> | null | undefined): boolean {
  const trucking = lines.filter(isTruckingLine);
  if (!priced) return false;
  if (trucking.some((l) => l.currency !== priced.currency)) return true;
  const sum = trucking.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  return Math.abs(sum - priced.total) > 0.005;
}

export interface LineTariffTag {
  /** "Tariff v3"; "Tariff" for a line of an older pricing. */
  label: string;
  /** The line was changed by hand since it was priced. */
  override: boolean;
}

/** The tags of a cost line: none for a line typed by hand; "Tariff vN" and maybe "Override" for one priced from a tariff. */
export function lineTariffTag(line: CostLine, pricing: QuoteRoadPricing | undefined, kind: "buying" | "selling"): LineTariffTag | null {
  if (!isTruckingLine(line)) return null;
  const side = pricedSideOf(line, pricing, kind);
  if (!side) return { label: "Tariff", override: false };
  return { label: `Tariff v${side.versionNo}`, override: lineOverridden(line, side.currency) };
}

// ── Margin ──

/** "380 CZK (4.2 %)"; "unknown" when it could not be worked out. */
export function marginText(marginCzk: number | null, marginPercent: number | null): string {
  if (marginCzk == null) return "unknown";
  return marginPercent == null ? formatMoney(marginCzk, "CZK") : `${formatMoney(marginCzk, "CZK")} (${formatPercent(marginPercent)})`;
}

/** "8 % / 300 CZK". */
export function floorText(m: Pick<RoadMargin, "floorPercent" | "floorMinCzk">): string {
  return `${formatPercent(m.floorPercent)} / ${formatMoney(m.floorMinCzk, "CZK")}`;
}

/** Where the margin of a road quote stands: above the floor, approved below it, waiting for a manager, or unknown. */
export type MarginState = "ok" | "approved" | "needsApproval";

export function marginState(m: Pick<RoadMargin, "belowFloor" | "approvalValid" | "needsApproval">): MarginState {
  if (m.needsApproval) return "needsApproval";
  if (m.belowFloor && m.approvalValid) return "approved";
  return "ok";
}

/**
 * Why the quote cannot be sent or marked Ready to send, in the server's words: the margin below
 * the floor without a valid approval. Null when nothing blocks it.
 */
export function sendBlockedText(m: RoadMargin | null | undefined): string | null {
  if (!m?.needsApproval) return null;
  // No margin to approve when a rate is missing: only the rate or CZK lines unblock the quote.
  if (m.problem) return `The margin cannot be worked out: ${m.problem.replace(/\.$/, "")}. The quote can be sent once the rate is available or its lines are in CZK.`;
  return `The margin of ${marginText(m.marginCzk, m.marginPercent)} is below the floor of ${floorText(m)}. A manager must approve it before the quote is sent.`;
}

export const APPROVAL_REASON_MIN = 3;
export const APPROVAL_REASON_MAX = 500;

/** Why an approval reason cannot be sent yet, or null. */
export function approvalReasonProblem(reason: string): string | null {
  const length = reason.trim().length;
  if (length < APPROVAL_REASON_MIN) return `Give a reason of at least ${APPROVAL_REASON_MIN} characters`;
  if (length > APPROVAL_REASON_MAX) return `The reason is at most ${APPROVAL_REASON_MAX} characters`;
  return null;
}

// ── Picking a level and a haulier ──

/** The levels that can be put on a quote: those with a sell price. */
export const pickableLevels = (results: readonly RateLevelResult[]) => results.filter((r) => isPriced(r.sell));

export interface RatePick {
  serviceLevel: RateLevelResult["serviceLevel"];
  /** null = no haulier (no buy candidates); the engine's first candidate otherwise by default. */
  haulierCustomerId: string | null;
}

/** The haulier offered first for a level: the engine's first candidate (preferred, then cheapest). */
export function defaultHaulier(result: Pick<RateLevelResult, "buy"> | undefined): string | null {
  return result?.buy[0]?.ownerCustomerId ?? null;
}

/**
 * What the price picker starts on: the level the quote was priced with last when it can still be
 * priced, else the first priceable level; with its first haulier. Null when no level has a price.
 */
export function defaultPick(results: readonly RateLevelResult[], previousLevel?: string | null): RatePick | null {
  const levels = pickableLevels(results);
  const level = levels.find((r) => r.serviceLevel === previousLevel) ?? levels[0];
  if (!level) return null;
  return { serviceLevel: level.serviceLevel, haulierCustomerId: defaultHaulier(level) };
}
