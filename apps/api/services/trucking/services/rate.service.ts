import { customers, fx, holidays } from "~encore/clients";
import { tariffRepository } from "../repositories/tariff.repository";
import { haulierRepository } from "../repositories/haulier.repository";
import type { TruckingTariffRecord, TruckingTariffVersionRecord } from "../schemas/truckingTariff.schema";
import type { PricedSide, RateLevelResult, RateRequest, RateResponse, ServiceLevelSetting, Unpriced } from "../interfaces/interfaces";
import { addDays, businessDay } from "../../../lib/businessDate";
import { formatDay } from "../lib/format";
import { cleanRateRequest } from "../lib/tariffRules";
import {
  applyDiscount,
  isPriced,
  laneMatches,
  margin,
  promise,
  rateOnVersion,
  sortBuy,
  type FxRate,
  type RatingTariff,
  type Shipment,
} from "../lib/rateEngine";
import { assess, toProfile } from "./haulier.service";
import { settingsService } from "./settings.service";
import { fuelIndexService } from "./fuelIndex.service";
import { customerNames } from "./tariff.service";

/** Days of extra (company-uploaded) holidays fetched after the pickup: enough for D4 over Christmas. */
const HOLIDAY_WINDOW_DAYS = 45;

const unpriced = (reason: string): Unpriced => ({ reason });

const ratingTariff = (t: TruckingTariffRecord, names: Map<string, string>): RatingTariff => ({
  id: t.id,
  name: t.name,
  ownerCustomerId: t.ownerCustomerId,
  ownerName: t.ownerCustomerId ? (names.get(t.ownerCustomerId) ?? null) : null,
  currency: t.currency,
  zoneBy: t.zoneBy,
});

/** The ČNB rate of EUR for the day, or null when the fx service has none. */
async function eurRate(day: string): Promise<FxRate> {
  const r = await fx.fxResolve({ currency: "EUR", date: day });
  return r.rate !== null ? { rate: r.rate, date: r.fixingDate ?? r.date } : null;
}

class RateService {
  /**
   * Prices a shipment on every requested service level: the customer's (or the Standard) sell
   * price, every usable haulier's buy price, the internal price, the margin and the promised date.
   * Tariffs, fuel index and ČNB rate are those of the pickup date.
   */
  async rate(companyId: string, raw: RateRequest): Promise<RateResponse> {
    const req = cleanRateRequest(raw);
    const day = req.pickupDate;
    const [settings, tariffs, fuel, extraHolidays] = await Promise.all([
      settingsService.get(companyId),
      tariffRepository.list(companyId, { scope: req.scope }),
      fuelIndexService.list(companyId),
      holidays._internalHolidaysCzNational({ from: day, to: addDays(day, HOLIDAY_WINDOW_DAYS) }).then((r) => r.dates),
    ]);
    const versions = await tariffRepository.bindingOn(companyId, tariffs.map((t) => t.id), day);
    const versionOf = new Map(versions.map((v) => [v.tariffId, v]));

    const standard = tariffs.find((t) => t.side === "SELL" && !t.ownerCustomerId);
    const own = req.customerId ? tariffs.find((t) => t.side === "SELL" && t.ownerCustomerId === req.customerId) : undefined;
    const internal = tariffs.find((t) => t.side === "INTERNAL");
    const buyTariffs = req.includeBuy ? tariffs.filter((t) => t.side === "BUY" && versionOf.has(t.id)) : [];
    const used = [standard, own, internal, ...buyTariffs].filter((t): t is TruckingTariffRecord => !!t);

    const buyOwners = buyTariffs.map((t) => t.ownerCustomerId!);
    const [names, fxRate, profiles, liveHauliers] = await Promise.all([
      customerNames(used.map((t) => t.ownerCustomerId)),
      used.some((t) => t.currency === "EUR") ? eurRate(day) : Promise.resolve(null),
      haulierRepository.findMany(companyId, buyOwners),
      buyOwners.length ? customers._internalHaulierList({ ids: buyOwners }).then((r) => r.hauliers) : Promise.resolve([]),
    ]);
    const profileOf = new Map(profiles.map((p) => [p.profile.customerId, toProfile(p)]));
    const haulierName = new Map(liveHauliers.map((h) => [h.id, h.companyName]));
    const today = businessDay(new Date());

    const shipment: Shipment = {
      fromPostcode: req.fromPostcode,
      toPostcode: req.toPostcode,
      pickupDate: day,
      palletPlaces: req.palletPlaces,
      ldm: req.ldm,
      weightKg: req.weightKg,
      cbm: req.cbm,
      extras: req.extras,
    };
    const priceOn = (t: TruckingTariffRecord, level: ServiceLevelSetting["code"]): PricedSide | Unpriced => {
      const v: TruckingTariffVersionRecord | undefined = versionOf.get(t.id);
      if (!v) return unpriced(`${t.name} has no version valid on ${formatDay(day)}`);
      return rateOnVersion(ratingTariff(t, names), { id: v.id, versionNo: v.versionNo, input: v.input }, level, shipment, fuel, fxRate);
    };

    // The customer's own tariff when it has a version valid on the pickup date; else the Standard
    // list (the fallback), named so in tariffName when a customer tariff exists but is not valid.
    const standardValid = !!standard && versionOf.has(standard.id);
    const neither = (customerTariff: TruckingTariffRecord) =>
      unpriced(`Neither ${customerTariff.name} nor the Standard ${req.scope} sell list has a version valid on ${formatDay(day)}`);
    const sellOn = (level: ServiceLevelSetting["code"]): PricedSide | Unpriced => {
      if (own?.mode === "DISCOUNT") {
        if (!standard || !standardValid) return neither(own);
        const base = priceOn(standard, level);
        if (!isPriced(base)) return base;
        return applyDiscount(base, ratingTariff(own, names), own.discountPercent ?? 0, versionOf.get(standard.id)!.input.rounding.moneyStep);
      }
      if (own && versionOf.has(own.id)) return priceOn(own, level);
      if (!standard) return own ? neither(own) : unpriced(`No Standard ${req.scope} sell list`);
      if (own && !standardValid) return neither(own);
      const base = priceOn(standard, level);
      if (own && isPriced(base)) return { ...base, tariffName: `Standard (customer list not valid on ${formatDay(day)})` };
      return base;
    };

    const levels = req.serviceLevels
      ? settings.serviceLevels.filter((l) => req.serviceLevels!.includes(l.code))
      : settings.serviceLevels.filter((l) => l.active);

    const results = levels.map((level): RateLevelResult => {
      const sell = sellOn(level.code);
      const buy: PricedSide[] = [];
      const excluded: RateLevelResult["excluded"] = [];
      for (const t of buyTariffs) {
        const owner = t.ownerCustomerId!;
        const name = haulierName.get(owner);
        if (!name) continue; // no longer a live haulier in the Customer Database
        const priced = priceOn(t, level.code);
        if (!isPriced(priced)) continue;
        const profile = profileOf.get(owner) ?? null;
        const { status, issues } = assess(profile, today);
        if (status === "blocked") {
          excluded.push({ customerId: owner, name, issues });
          continue;
        }
        const preferred = !!profile?.preferredLanes.some((l) => laneMatches(l, req.fromPostcode, req.toPostcode, req.scope));
        buy.push({ ...priced, ownerName: name, preferred });
      }
      const sortedBuy = sortBuy(buy);
      return {
        serviceLevel: level.code,
        label: level.label,
        ...promise(level, day, req.pickupTime, req.scope, extraHolidays),
        sell,
        buy: sortedBuy,
        excluded: excluded.sort((a, b) => a.name.localeCompare(b.name, "cs")),
        internal: req.includeInternal ? (internal ? priceOn(internal, level.code) : unpriced(`No internal ${req.scope} tariff`)) : null,
        ...margin(sell, sortedBuy, settings.marginFloor),
      };
    });
    return { request: req, ratedAt: new Date().toISOString(), results };
  }
}

export const rateService = new RateService();
