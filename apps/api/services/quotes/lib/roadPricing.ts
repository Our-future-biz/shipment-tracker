// A quote priced from the trucking tariffs: the rate request its road input makes, the haulier
// chosen from the candidates, the cost lines the pricing writes and what it records. Pure; the
// rating itself is the trucking service's.

import type { PricedSide, RateLevelResult, RateRequest, ServiceLevelCode, Unpriced } from "../../trucking/interfaces/interfaces";
import type { QuoteRoadInput, QuoteRoadPricing } from "../interfaces/interfaces";
import { TRUCKING_REF_PREFIX, formatMoney, isTruckingLine } from "./roadMargin";

/** A cost line of a quote as pricing writes it (web sales/_lib/types CostLine). */
export interface PricedCostLine {
  type: string;
  chargeCode: string;
  description: string;
  supplier?: string;
  supplierCustomerId?: string;
  currency: string;
  amount: number;
  qty: number;
  unit: string;
  unitPrice: number;
  tariffRef: string;
}

const ROAD_FREIGHT = { type: "Road freight", chargeCode: "road_freight" };

const isPriced = (side: PricedSide | Unpriced): side is PricedSide => "total" in side;

/** The request to the trucking rate engine: one service level, the quote's customer, with buy prices. */
export function rateRequestOf(road: QuoteRoadInput, serviceLevel: ServiceLevelCode, customerId: string | null, today: string): RateRequest {
  return {
    fromPostcode: road.fromPostcode,
    toPostcode: road.toPostcode,
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
    serviceLevels: [serviceLevel],
    includeBuy: true,
    includeInternal: false,
  };
}

/** What a level's result is priced with, or why it cannot be. */
export type PricingChoice = { ok: true; sell: PricedSide; buy: PricedSide | null } | { ok: false; reason: string };

/**
 * The sell price and the haulier of a level's result. No haulier named: the engine's first
 * candidate (preferred, then cheapest), or none when there is no candidate. A named haulier must
 * be one of the candidates: an excluded (blocked) one is refused with its issues.
 */
export function choosePricing(result: RateLevelResult, haulierCustomerId: string | null): PricingChoice {
  if (!isPriced(result.sell)) return { ok: false, reason: result.sell.reason };
  if (haulierCustomerId === null) return { ok: true, sell: result.sell, buy: result.buy[0] ?? null };
  const buy = result.buy.find((b) => b.ownerCustomerId === haulierCustomerId);
  if (buy) return { ok: true, sell: result.sell, buy };
  const excluded = result.excluded.find((x) => x.customerId === haulierCustomerId);
  if (excluded) {
    const issues = excluded.issues.filter((i) => i.severity === "block").map((i) => i.message);
    return { ok: false, reason: `${excluded.name} cannot be used: ${issues.join("; ") || "blocked"}` };
  }
  return { ok: false, reason: "The haulier has no price for this shipment on this service level" };
}

/** The cost lines of a priced side: one per line of the engine's price, tagged with the tariff version and level. */
export function truckingLines(side: PricedSide, serviceLevel: ServiceLevelCode, supplier?: { name: string; customerId: string }): PricedCostLine[] {
  const tariffRef = `${TRUCKING_REF_PREFIX}${side.tariffVersionId}:${serviceLevel}`;
  return side.lines.map((line) => ({
    ...ROAD_FREIGHT,
    description: line.label,
    ...(supplier ? { supplier: supplier.name, supplierCustomerId: supplier.customerId } : {}),
    currency: side.currency,
    amount: line.amount,
    qty: line.qty,
    unit: line.unit,
    unitPrice: line.unitPrice,
    tariffRef,
  }));
}

/**
 * The lines of a quote with its trucking lines replaced: every other line stays as it is, and the
 * new ones take the place of the first old one - or come first when there was none.
 */
export function replaceTruckingLines(existing: unknown, priced: PricedCostLine[]): unknown[] {
  const lines = Array.isArray(existing) ? existing : [];
  const at = lines.findIndex(isTruckingLine);
  const kept = lines.filter((line) => !isTruckingLine(line));
  const index = at === -1 ? 0 : lines.slice(0, at).filter((line) => !isTruckingLine(line)).length;
  return [...kept.slice(0, index), ...priced, ...kept.slice(index)];
}

/** What a pricing records on the quote (data.roadPricing). */
export function roadPricingOf(result: RateLevelResult, sell: PricedSide, buy: PricedSide | null, ratedAt: string): QuoteRoadPricing {
  return {
    ratedAt,
    serviceLevel: result.serviceLevel,
    serviceLabel: result.label,
    promisedDate: result.promisedDate,
    promisedTime: result.promisedTime,
    promiseNote: result.promiseNote,
    sell: {
      tariffId: sell.tariffId,
      tariffName: sell.tariffName,
      tariffVersionId: sell.tariffVersionId,
      versionNo: sell.versionNo,
      currency: sell.currency,
      total: sell.total,
      totalCzk: sell.totalCzk,
    },
    buy: buy && {
      haulierCustomerId: buy.ownerCustomerId ?? "",
      haulierName: buy.ownerName ?? "",
      tariffVersionId: buy.tariffVersionId,
      versionNo: buy.versionNo,
      currency: buy.currency,
      total: buy.total,
      totalCzk: buy.totalCzk,
      preferred: buy.preferred,
    },
  };
}

/** The history line of a pricing: "Priced from tariff: Standard v3, +1 day, 4 250 CZK". */
export function pricedComment(pricing: QuoteRoadPricing): string {
  const { sell } = pricing;
  return `Priced from tariff: ${sell.tariffName} v${sell.versionNo}, ${pricing.serviceLabel}, ${formatMoney(sell.total, sell.currency)}`;
}
