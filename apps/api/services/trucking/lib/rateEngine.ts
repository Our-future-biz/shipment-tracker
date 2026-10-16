import { addWorkingDays, effectiveStartDate, isWorkingDay } from "../../../lib/workingDays";
import { formatDay } from "./format";
import type {
  BandBasis,
  FuelIndexMonth,
  PriceLine,
  PricedSide,
  RateExtras,
  ServiceLevelCode,
  ServiceLevelSetting,
  SurchargeCode,
  TariffBand,
  TariffRate,
  TariffScope,
  TariffSurcharge,
  TariffVersionInput,
  TariffZone,
  Unpriced,
  ZoneBy,
} from "../interfaces/interfaces";

// The rate engine: prices one shipment on one tariff version for one service level. Pure - no
// I/O; the service hands it the tariff, the version, the fuel index and the ČNB rate.
//
// 1. zone   2. chargeable quantity   3. band   4. freight (min charge, break-point)
// 5. surcharges   6. rounding   7. a customer's discount off the Standard list (applyDiscount)

/** What the engine needs to know about the tariff a version belongs to. */
export interface RatingTariff {
  id: string;
  name: string;
  ownerCustomerId: string | null;
  ownerName: string | null;
  currency: "CZK" | "EUR";
  zoneBy: ZoneBy;
}

export interface RatingVersion {
  id: string;
  versionNo: number;
  input: TariffVersionInput;
}

/** The shipment as the engine rates it (postcodes already normalised to 5 digits). */
export interface Shipment {
  fromPostcode: string;
  toPostcode: string;
  pickupDate: string;
  palletPlaces: number;
  ldm: number;
  weightKg: number;
  cbm: number;
  extras: RateExtras;
}

/** The ČNB rate (CZK per 1 unit) for a EUR tariff; null for CZK, or when there is none. */
export type FxRate = { rate: number; date: string } | null;

export const isPriced = (r: PricedSide | Unpriced | null): r is PricedSide => !!r && "total" in r;

const unpriced = (reason: string): Unpriced => ({ reason });

// ---- numbers -----------------------------------------------------------------------------------

/** Removes binary noise (0.1 + 0.2) by rounding to 6 decimals. */
const clean = (x: number) => Math.round(x * 1e6) / 1e6;

/** Rounds to a step (0.01, 1, …), half away from zero. */
export function roundToStep(x: number, step: number): number {
  if (!(step > 0)) return clean(x);
  const n = Math.round(clean(Math.abs(x) / step));
  return clean(Math.sign(x) * n * step);
}

/** Rounds up to a step (1 kg, 0.1 ldm, …). */
export function roundUpToStep(x: number, step: number): number {
  if (!(step > 0)) return clean(x);
  return clean(Math.ceil(clean(x / step)) * step);
}

/** 1250 → "1 250", 2.5 → "2.5" (space as thousands separator). */
export function fmt(x: number): string {
  const [int, dec] = String(clean(x)).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return dec ? `${grouped}.${dec}` : grouped;
}

/** "79001" → "790 01" */
export const showPostcode = (p: string) => (/^\d{5}$/.test(p) ? `${p.slice(0, 3)} ${p.slice(3)}` : p);

// ---- 1. zone -----------------------------------------------------------------------------------

/** The narrowest zone whose range holds the postcode; null when none does. */
export function findZone(zones: TariffZone[], postcode: string): TariffZone | null {
  let best: TariffZone | null = null;
  let bestWidth = Infinity;
  for (const z of zones) {
    if (z.postcodeFrom <= postcode && postcode <= z.postcodeTo) {
      const width = Number(z.postcodeTo) - Number(z.postcodeFrom);
      if (width < bestWidth) {
        best = z;
        bestWidth = width;
      }
    }
  }
  return best;
}

// ---- 2. chargeable quantity -------------------------------------------------------------------

const UNIT: Record<BandBasis, string> = { KG: "kg", PALLET: "pallet", LDM: "ldm", TRIP: "trip" };

/** Chargeable kg: the largest of the actual weight and the volume measures, rounded up to the weight step. */
export function chargeableKg(s: Shipment, v: TariffVersionInput): { kg: number; explanation: string } {
  const f = v.factors;
  const measures = [
    { kg: s.weightKg, text: `${fmt(s.weightKg)} kg actual` },
    { kg: s.ldm * f.kgPerLdm, text: `${fmt(s.ldm)} ldm × ${fmt(f.kgPerLdm)} kg` },
    { kg: s.cbm * f.kgPerCbm, text: `${fmt(s.cbm)} cbm × ${fmt(f.kgPerCbm)} kg` },
    { kg: s.palletPlaces * f.kgPerPalletPlace, text: `${fmt(s.palletPlaces)} pallets × ${fmt(f.kgPerPalletPlace)} kg` },
  ];
  // The first measure wins a tie, so the actual weight is named whenever it is as high as any.
  const winner = measures.reduce((a, b) => (clean(b.kg) > clean(a.kg) ? b : a));
  const kg = roundUpToStep(winner.kg, v.rounding.weightStepKg);
  const explanation = winner === measures[0] ? `${fmt(kg)} kg (actual weight)` : `${fmt(kg)} kg (${winner.text} beats ${fmt(s.weightKg)} kg actual)`;
  return { kg, explanation };
}

/** The quantity the bands of `basis` are read with. */
export function chargeable(basis: BandBasis, s: Shipment, v: TariffVersionInput): { basis: BandBasis; quantity: number; explanation: string } {
  switch (basis) {
    case "KG": {
      const { kg, explanation } = chargeableKg(s, v);
      return { basis, quantity: kg, explanation };
    }
    case "PALLET":
      return { basis, quantity: s.palletPlaces, explanation: `${fmt(s.palletPlaces)} pallet places` };
    case "LDM": {
      const ldm = roundUpToStep(s.ldm, 0.1);
      return { basis, quantity: ldm, explanation: `${fmt(ldm)} ldm` };
    }
    case "TRIP":
      return { basis, quantity: 1, explanation: "1 trip" };
  }
}

// ---- 3. band ------------------------------------------------------------------------------------

/** "1 001–1 500 kg", "over 10 000 kg", "over 2.5–5 ldm", "per trip" */
export function bandLabel(b: TariffBand): string {
  if (b.basis === "TRIP") return "per trip";
  const unit = b.basis === "PALLET" ? "pallets" : UNIT[b.basis];
  const whole = b.basis !== "LDM" && Number.isInteger(b.fromExcl);
  if (b.toIncl === null) return `over ${fmt(b.fromExcl)} ${unit}`;
  return whole ? `${fmt(b.fromExcl + 1)}–${fmt(b.toIncl)} ${unit}` : `over ${fmt(b.fromExcl)}–${fmt(b.toIncl)} ${unit}`;
}

const inBand = (b: TariffBand, q: number) => b.fromExcl < q && (b.toIncl === null || q <= b.toIncl);

// ---- 4. freight --------------------------------------------------------------------------------

/** What a rate charges for quantity q. */
export function ratePrice(rate: Pick<TariffRate, "amount" | "priceType">, q: number): number {
  switch (rate.priceType) {
    case "FLAT":
      return rate.amount;
    case "PER_UNIT":
      return clean(rate.amount * q);
    case "PER_100KG":
      return clean(rate.amount * Math.ceil(clean(q / 100)));
  }
}

/**
 * The least quantity a band holds: its lower limit is exclusive, so one step above it - the
 * weight step for kg (1 001 kg after "1 000"), 0.1 ldm, one pallet place.
 */
export function bandStart(band: TariffBand, weightStepKg: number): number {
  switch (band.basis) {
    case "KG":
      return clean(band.fromExcl + (weightStepKg > 0 ? weightStepKg : 1));
    case "LDM":
      return clean(band.fromExcl + 0.1);
    case "PALLET":
      return band.fromExcl + 1;
    case "TRIP":
      return band.fromExcl;
  }
}

/** The least a higher band charges: its flat amount, or its rate at the least quantity it holds. */
const bandMinimum = (rate: TariffRate, band: TariffBand, weightStepKg: number) =>
  rate.priceType === "FLAT" ? rate.amount : ratePrice(rate, bandStart(band, weightStepKg));

/**
 * The break-point candidate among the bands above the shipment's: the one charging least (the
 * nearest on a tie). Every higher band counts - a narrow next band must not hide a cheaper one
 * two steps up.
 */
export function cheapestHigherBand<T extends { rate: TariffRate; band: TariffBand }>(higher: T[], weightStepKg: number): T | null {
  let best: T | null = null;
  for (const x of higher) if (!best || bandMinimum(x.rate, x.band, weightStepKg) < bandMinimum(best.rate, best.band, weightStepKg)) best = x;
  return best;
}

// ---- 5. surcharges -----------------------------------------------------------------------------

export const SURCHARGE_LABEL: Record<SurchargeCode, string> = {
  FUEL: "Fuel surcharge",
  TOLL: "Toll",
  ADR: "ADR (dangerous goods)",
  TAIL_LIFT: "Tail lift",
  AVIZACE: "Delivery notice (avizace)",
  TIME_WINDOW: "Time window delivery",
  B2C: "B2C delivery",
  WAITING_TIME: "Waiting time",
  REDELIVERY: "Redelivery",
  INSURANCE: "Insurance",
  REMOTE_AREA: "Remote area",
  NON_STACKABLE: "Non-stackable goods",
};

/** Whether a surcharge applies to this shipment: FUEL and TOLL always; the others only with their extra (or remote zone). */
export function surchargeApplies(code: SurchargeCode, extras: RateExtras, remoteZone: boolean): boolean {
  switch (code) {
    case "FUEL":
    case "TOLL":
      return true;
    case "ADR":
      return extras.adr;
    case "TAIL_LIFT":
      return extras.tailLift;
    case "AVIZACE":
      return extras.avizace;
    case "TIME_WINDOW":
      return extras.timeWindow;
    case "B2C":
      return extras.b2c;
    case "NON_STACKABLE":
      return extras.nonStackable;
    case "WAITING_TIME":
      return extras.waitingHours > 0;
    case "INSURANCE":
      return extras.declaredValueCzk !== null;
    case "REMOTE_AREA":
      return remoteZone;
    case "REDELIVERY":
      return false; // charged when it happens, never at rating
  }
}

/** Order in which the calcs are applied: amounts first, then the percentages on top of them. */
const CALC_ORDER = ["FLAT", "PER_KG", "PER_PALLET", "PER_HOUR", "PCT_OF_VALUE", "PCT", "FUEL_INDEX"] as const;

/** The fuel index % of the pickup month, or the latest earlier month (said in the label). */
export function fuelIndexFor(months: FuelIndexMonth[], pickupDate: string): { percent: number; note: string } | null {
  const month = pickupDate.slice(0, 7);
  const earlier = months.filter((m) => m.month <= month).sort((a, b) => b.month.localeCompare(a.month));
  if (!earlier.length) return null;
  const hit = earlier[0];
  return { percent: hit.percent, note: hit.month === month ? `index ${hit.month}` : `index ${hit.month}; ${month} not set` };
}

// ---- the whole price ---------------------------------------------------------------------------

/**
 * Prices the shipment on one version for one level: the tariff currency, with each line rounded
 * to the version's money step, and the total in CZK at `fx` (required for a EUR tariff).
 */
export function rateOnVersion(
  tariff: RatingTariff,
  version: RatingVersion,
  level: ServiceLevelCode,
  s: Shipment,
  fuel: FuelIndexMonth[],
  fx: FxRate,
): PricedSide | Unpriced {
  const v = version.input;
  const step = v.rounding.moneyStep;

  // 1. zone
  const zonePostcode = tariff.zoneBy === "ORIGIN" ? s.fromPostcode : s.toPostcode;
  const zone = findZone(v.zones, zonePostcode);
  if (!zone) return unpriced(`No zone for postcode ${showPostcode(zonePostcode)} in ${tariff.name}`);

  const levelRates = v.rates.filter((r) => r.serviceLevel === level);
  if (!levelRates.length) return unpriced(`${tariff.name} has no ${level} prices`);
  const zoneRates = levelRates.filter((r) => r.zoneCode === zone.code);
  if (!zoneRates.length) return unpriced(`${tariff.name} has no ${level} price for zone ${zone.code}`);
  const bandsById = new Map(v.bands.map((b) => [b.id, b]));
  const priced = zoneRates
    .map((rate) => ({ rate, band: bandsById.get(rate.bandId) }))
    .filter((x): x is { rate: TariffRate; band: TariffBand } => !!x.band)
    .sort((a, b) => a.band.fromExcl - b.band.fromExcl);
  if (!priced.length) return unpriced(`${tariff.name} has no ${level} price for zone ${zone.code}`);

  // 2. chargeable quantity, on the basis of the level's bands
  const ch = chargeable(priced[0].band.basis, s, v);
  if (ch.quantity <= 0) return unpriced(`Nothing to charge: give the ${ch.basis === "PALLET" ? "pallet places" : ch.basis === "LDM" ? "loading metres" : "weight or size"}`);

  // 3. band
  const at = priced.findIndex((x) => inBand(x.band, ch.quantity));
  if (at < 0) return unpriced("Above the top band — price on request");
  const { rate, band } = priced[at];

  // 4. freight, the next band's price when that is lower (break-point), at least the minimum charge
  const lines: PriceLine[] = [];
  const where = `${level}, zone ${zone.code}, ${bandLabel(band)}`;
  let freight: PriceLine;
  const own = ratePrice(rate, ch.quantity);
  const weightStep = v.rounding.weightStepKg;
  const next = cheapestHigherBand(priced.slice(at + 1), weightStep);
  if (next && bandMinimum(next.rate, next.band, weightStep) < own) {
    const amount = bandMinimum(next.rate, next.band, weightStep);
    freight = { code: "FREIGHT", label: `Freight ${where} — charged at the ${bandLabel(next.band)} price (break-point, cheaper)`, qty: 1, unit: "shipment", unitPrice: amount, amount };
  } else if (rate.priceType === "FLAT") {
    freight = { code: "FREIGHT", label: `Freight ${where}`, qty: 1, unit: ch.basis === "TRIP" ? "trip" : "shipment", unitPrice: rate.amount, amount: own };
  } else if (rate.priceType === "PER_100KG") {
    const hundreds = Math.ceil(clean(ch.quantity / 100));
    freight = { code: "FREIGHT", label: `Freight ${where}`, qty: hundreds, unit: "100 kg", unitPrice: rate.amount, amount: own };
  } else {
    freight = { code: "FREIGHT", label: `Freight ${where}`, qty: ch.quantity, unit: UNIT[ch.basis], unitPrice: rate.amount, amount: own };
  }
  const min = v.minCharges.find((m) => m.serviceLevel === level && m.zoneCode === zone.code);
  if (min && min.amount > freight.amount) {
    freight = { code: "FREIGHT", label: `Freight ${where} — minimum charge`, qty: 1, unit: "shipment", unitPrice: min.amount, amount: min.amount };
  }
  freight.amount = roundToStep(freight.amount, step);
  lines.push(freight);

  // 5. surcharges: amounts first, then percentages (on freight, or freight + the amount surcharges)
  const applicable = v.surcharges
    .filter((x) => surchargeApplies(x.code, s.extras, zone.remote))
    .sort((a, b) => CALC_ORDER.indexOf(a.calc) - CALC_ORDER.indexOf(b.calc));
  const kgForSurcharges = () => chargeableKg(s, v).kg;
  const declaredValue = s.extras.declaredValueCzk === null ? 0 : tariff.currency === "CZK" ? s.extras.declaredValueCzk : fx ? s.extras.declaredValueCzk / fx.rate : 0;
  let amountSurcharges = 0;
  const findings: string[] = [];
  for (const x of applicable) {
    const line = surchargeLine(x, {
      freight: freight.amount,
      amounts: amountSurcharges,
      kg: kgForSurcharges,
      pallets: s.palletPlaces,
      hours: s.extras.waitingHours,
      declaredValue,
      currency: tariff.currency,
      fuel: () => fuelIndexFor(fuel, s.pickupDate),
    });
    if (x.calc === "FUEL_INDEX") findings.push(...fuelFindings(fuel, s.pickupDate));
    line.amount = roundToStep(line.amount, step);
    if (x.calc !== "PCT" && x.calc !== "FUEL_INDEX") amountSurcharges = clean(amountSurcharges + line.amount);
    lines.push(line);
  }

  // 6. total = sum of the rounded lines
  const total = clean(lines.reduce((sum, l) => sum + l.amount, 0));
  if (tariff.currency !== "CZK" && !fx) return unpriced(`No ČNB rate for ${tariff.currency} on ${formatDay(s.pickupDate)}`);
  return {
    tariffId: tariff.id,
    tariffName: tariff.name,
    tariffVersionId: version.id,
    versionNo: version.versionNo,
    ownerCustomerId: tariff.ownerCustomerId,
    ownerName: tariff.ownerName,
    currency: tariff.currency,
    zoneCode: zone.code,
    zoneLabel: zone.label,
    bandLabel: bandLabel(band),
    chargeable: ch,
    lines,
    total,
    totalCzk: toCzk(total, tariff.currency, fx),
    fx: tariff.currency === "CZK" ? null : fx,
    preferred: false,
    ...(findings.length ? { findings } : {}),
  };
}

/**
 * What a fuel-index surcharge was priced with that someone should look at: no index at all (the
 * surcharge is 0), or an earlier month's index because the pick-up month has none.
 */
export function fuelFindings(months: FuelIndexMonth[], pickupDate: string): string[] {
  const month = pickupDate.slice(0, 7);
  const idx = fuelIndexFor(months, pickupDate);
  if (!idx) return [`No fuel index for ${month}: the fuel surcharge is priced at 0`];
  const used = months.filter((m) => m.month <= month).sort((a, b) => b.month.localeCompare(a.month))[0]!;
  return used.month === month ? [] : [`Fuel index for ${month} not set: the ${used.month} index (${fmt(used.percent)} %) was used`];
}

const toCzk = (amount: number, currency: "CZK" | "EUR", fx: FxRate) => (currency === "CZK" || !fx ? amount : roundToStep(amount * fx.rate, 0.01));

interface SurchargeBase {
  freight: number;
  /** The amount (non-percentage) surcharges so far */
  amounts: number;
  kg: () => number;
  pallets: number;
  hours: number;
  /** In the tariff currency */
  declaredValue: number;
  currency: string;
  fuel: () => { percent: number; note: string } | null;
}

/** One surcharge as a price line (not rounded yet), at least its minimum. */
function surchargeLine(x: TariffSurcharge, b: SurchargeBase): PriceLine {
  const label = SURCHARGE_LABEL[x.code];
  const withMin = (line: PriceLine): PriceLine =>
    x.min !== null && x.min > line.amount ? { ...line, label: `${line.label} — minimum`, qty: 1, unit: "shipment", unitPrice: x.min, amount: x.min } : line;
  const pctBase = x.onBasePlusSurcharges ? clean(b.freight + b.amounts) : b.freight;
  switch (x.calc) {
    case "FLAT":
      return withMin({ code: x.code, label, qty: 1, unit: "shipment", unitPrice: x.value, amount: x.value });
    case "PER_KG": {
      const kg = b.kg();
      return withMin({ code: x.code, label, qty: kg, unit: "kg", unitPrice: x.value, amount: clean(kg * x.value) });
    }
    case "PER_PALLET":
      return withMin({ code: x.code, label, qty: b.pallets, unit: "pallet", unitPrice: x.value, amount: clean(b.pallets * x.value) });
    case "PER_HOUR":
      return withMin({ code: x.code, label, qty: b.hours, unit: "hour", unitPrice: x.value, amount: clean(b.hours * x.value) });
    case "PCT_OF_VALUE":
      return withMin({
        code: x.code,
        label: `${label} ${fmt(x.value)} % of the declared value`,
        qty: b.declaredValue,
        unit: `${b.currency} value`,
        unitPrice: x.value / 100,
        amount: clean((b.declaredValue * x.value) / 100),
      });
    case "PCT":
      return withMin({ code: x.code, label: `${label} ${fmt(x.value)} %`, qty: pctBase, unit: "base", unitPrice: x.value / 100, amount: clean((pctBase * x.value) / 100) });
    case "FUEL_INDEX": {
      const idx = b.fuel();
      if (!idx) return { code: x.code, label: `${label} — Fuel index not set`, qty: pctBase, unit: "base", unitPrice: 0, amount: 0 };
      return withMin({
        code: x.code,
        label: `${label} ${fmt(idx.percent)} % (${idx.note})`,
        qty: pctBase,
        unit: "base",
        unitPrice: idx.percent / 100,
        amount: clean((pctBase * idx.percent) / 100),
      });
    }
  }
}

// ---- 7. customer discount ------------------------------------------------------------------------

/**
 * A customer's DISCOUNT tariff: the Standard list's price with one more line, −x % (or +x % for a
 * negative discount, an uplift) of the freight + surcharges total, shown under the customer's tariff.
 */
export function applyDiscount(
  standard: PricedSide,
  customer: { id: string; name: string; ownerCustomerId: string | null; ownerName: string | null },
  discountPercent: number,
  moneyStep: number,
): PricedSide {
  const amount = roundToStep((-standard.total * discountPercent) / 100, moneyStep);
  const label = discountPercent >= 0 ? `Customer discount −${fmt(discountPercent)} %` : `Customer uplift +${fmt(-discountPercent)} %`;
  const lines = [...standard.lines, { code: "DISCOUNT", label, qty: standard.total, unit: "base", unitPrice: -discountPercent / 100, amount }];
  const total = clean(lines.reduce((sum, l) => sum + l.amount, 0));
  return {
    ...standard,
    tariffId: customer.id,
    tariffName: customer.name,
    ownerCustomerId: customer.ownerCustomerId,
    ownerName: customer.ownerName,
    lines,
    total,
    totalCzk: toCzk(total, standard.currency, standard.fx),
  };
}

// ---- buy side ----------------------------------------------------------------------------------

export interface LaneRange {
  originPostcodeFrom: string;
  originPostcodeTo: string;
  destPostcodeFrom: string;
  destPostcodeTo: string;
  serviceKind: string;
}

/** Whether a haulier's preferred lane covers the shipment: both postcodes in range, service ANY or the scope. */
export const laneMatches = (lane: LaneRange, from: string, to: string, scope: TariffScope): boolean =>
  lane.originPostcodeFrom <= from &&
  from <= lane.originPostcodeTo &&
  lane.destPostcodeFrom <= to &&
  to <= lane.destPostcodeTo &&
  (lane.serviceKind === "ANY" || lane.serviceKind === scope);

/** Buy prices in the order to pick from: preferred lane first, then cheapest in CZK, then by name. */
export const sortBuy = (buy: PricedSide[]): PricedSide[] =>
  [...buy].sort(
    (a, b) => Number(b.preferred) - Number(a.preferred) || a.totalCzk - b.totalCzk || (a.ownerName ?? "").localeCompare(b.ownerName ?? "", "cs"),
  );

/** Margin of a sell price over the buy price that would be used (the first of the sorted buy list). */
export function margin(
  sell: PricedSide | Unpriced,
  buy: PricedSide[],
  floor: { percent: number; minAmountCzk: number },
): { marginCzk: number | null; marginPercent: number | null; belowFloor: boolean } {
  if (!isPriced(sell) || !buy.length) return { marginCzk: null, marginPercent: null, belowFloor: false };
  const marginCzk = roundToStep(sell.totalCzk - buy[0].totalCzk, 0.01);
  const marginPercent = sell.totalCzk > 0 ? roundToStep((marginCzk / sell.totalCzk) * 100, 0.01) : null;
  const belowFloor = (marginPercent !== null && marginPercent < floor.percent) || marginCzk < floor.minAmountCzk;
  return { marginCzk, marginPercent, belowFloor };
}

// ---- promised date -----------------------------------------------------------------------------

export interface DeliveryPromise {
  promisedDate: string | null;
  promisedTime: string | null;
  promiseNote: string;
}

/**
 * When the level delivers a shipment picked up on `pickupDate` at `pickupTime` (null = before the
 * cut-off). Counts from the effective start day (the next working day after the level's cut-off
 * or on a non-working day), Czech holidays plus `extraHolidays` excluded.
 */
export function promise(
  level: ServiceLevelSetting,
  pickupDate: string,
  pickupTime: string | null,
  scope: TariffScope,
  extraHolidays: readonly string[],
): DeliveryPromise {
  if (level.code === "EXP_FIXED") return { promisedDate: null, promisedTime: null, promiseNote: "Date agreed per order" };
  const start = effectiveStartDate({ date: pickupDate, time: pickupTime ?? level.cutoff }, level.cutoff, extraHolidays);
  const notes: string[] = [];
  if (start !== pickupDate) {
    notes.push(
      isWorkingDay(pickupDate, extraHolidays)
        ? `Ordered after the ${level.cutoff} cut-off: counted from ${formatDay(start)}`
        : `${formatDay(pickupDate)} is not a working day: counted from ${formatDay(start)}`,
    );
  } else {
    notes.push(`Counted from ${formatDay(start)}`);
  }
  if (scope === "LTL") notes.push(`LTL: assumes gate-in at our warehouse on ${formatDay(start)}`);
  const promiseNote = notes.join(". ");
  switch (level.code) {
    case "EXP_SAMEDAY":
      return { promisedDate: start, promisedTime: "same day", promiseNote };
    case "EXP_1000":
      return { promisedDate: addWorkingDays(start, 1, extraHolidays), promisedTime: "by 10:00", promiseNote };
    case "EXP_1200":
      return { promisedDate: addWorkingDays(start, 1, extraHolidays), promisedTime: "by 12:00", promiseNote };
    default:
      return { promisedDate: addWorkingDays(start, level.workingDays, extraHolidays), promisedTime: null, promiseNote };
  }
}
