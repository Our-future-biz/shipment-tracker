import type { interfaces } from "@/lib/api/client";
import { formatDate } from "@/lib/date";
import { formatNumber } from "@/lib/number";
import { formatPsc } from "./hauliers";

// Pure helpers of the Tariffs tab, the tariff and version pages and the rate calculator: labels,
// status chips, band labels, money and percent, and the price matrix of a version.

export type TariffSide = interfaces.TariffSide;
export type TariffScope = interfaces.TariffScope;
export type TariffVersionStatus = interfaces.TariffVersionStatus;
export type ServiceLevelCode = interfaces.ServiceLevelCode;
export type ChipTone = "green" | "amber" | "red" | "slate";

export const TARIFF_SIDES: { key: TariffSide; label: string; hint: string }[] = [
  { key: "BUY", label: "Buy", hint: "What hauliers charge us" },
  { key: "SELL", label: "Sell", hint: "What we charge customers; the Standard list and customer tariffs" },
  { key: "INTERNAL", label: "Internal", hint: "What Trucking charges another department" },
];

export const SCOPE_LABELS: Record<TariffScope, string> = { LTL: "LTL", FTL: "FTL", LINEHAUL: "Line haul" };
export const ZONE_BY_LABELS: Record<interfaces.ZoneBy, string> = { DESTINATION: "Delivery postcode", ORIGIN: "Pick-up postcode" };
export const PRICE_TYPE_SUFFIX: Record<interfaces.PriceType, string> = { FLAT: "", PER_UNIT: "per unit", PER_100KG: "per 100 kg" };

/** Service levels in the order of the settings (fastest last within D, express after). */
export const SERVICE_LEVEL_ORDER: ServiceLevelCode[] = ["D1", "D2", "D3", "D4", "EXP_SAMEDAY", "EXP_1000", "EXP_1200", "EXP_FIXED"];

export const SURCHARGE_LABELS: Record<interfaces.SurchargeCode, string> = {
  FUEL: "Fuel",
  TOLL: "Toll",
  ADR: "ADR",
  TAIL_LIFT: "Tail-lift",
  AVIZACE: "Avizace",
  TIME_WINDOW: "Time window",
  B2C: "B2C delivery",
  WAITING_TIME: "Waiting time",
  REDELIVERY: "Redelivery",
  INSURANCE: "Insurance",
  REMOTE_AREA: "Remote area",
  NON_STACKABLE: "Non-stackable",
};

export const SURCHARGE_CALC_LABELS: Record<interfaces.SurchargeCalc, string> = {
  PCT: "% of freight",
  FLAT: "Flat",
  PER_KG: "Per kg",
  PER_PALLET: "Per pallet place",
  PER_HOUR: "Per waiting hour",
  PCT_OF_VALUE: "% of declared value",
  FUEL_INDEX: "Fuel index of the month",
};

/** Text and tone of a version's status chip; the chip also carries an icon. */
export const VERSION_STATUS_CHIP: Record<TariffVersionStatus, { label: string; tone: ChipTone; hint: string }> = {
  DRAFT: { label: "Draft", tone: "slate", hint: "Saved, never activated; not used for pricing" },
  SCHEDULED: { label: "Scheduled", tone: "amber", hint: "Activated from a future date" },
  ACTIVE: { label: "Active", tone: "green", hint: "Prices consignments today" },
  EXPIRED: { label: "Expired", tone: "slate", hint: "Its validity has ended" },
  SUPERSEDED: { label: "Superseded", tone: "slate", hint: "Replaced before it started" },
};

/** "1 250" / "12.5" / "0.25": whole numbers without decimals, others with up to 2. */
export function formatQty(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return formatNumber(rounded, 0);
  return formatNumber(rounded, Number.isInteger(rounded * 10) ? 1 : 2);
}

/** "1 250 CZK", "1 250.50 EUR" (cents only when there are some); "—" for none. */
export function formatMoney(amount: number | null | undefined, currency: string): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  const cents = Math.round(amount * 100);
  const value = cents / 100 || 0;
  const text = formatNumber(Math.abs(value), cents % 100 !== 0 ? 2 : 0);
  return `${value < 0 ? "−" : ""}${text} ${currency}`;
}

/** "12.5 %"; with `signed`, "+3 %" / "−5 %". "—" for none. */
export function formatPercent(p: number | null | undefined, signed = false): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const rounded = Math.round(p * 10) / 10 || 0;
  const sign = rounded < 0 ? "−" : signed && rounded > 0 ? "+" : "";
  return `${sign}${formatQty(Math.abs(rounded))} %`;
}

/** How a DISCOUNT tariff reads: "−5 % on Standard" (a negative discount is an uplift: "+3 % on Standard"). */
export function discountLabel(discountPercent: number | null): string {
  return `${formatPercent(-(discountPercent ?? 0), true)} on Standard`;
}

export function modeLabel(t: Pick<interfaces.TariffListItem, "mode" | "discountPercent">): string {
  return t.mode === "MATRIX" ? "Matrix" : discountLabel(t.discountPercent);
}

/** Whose tariff it is: the haulier or customer, "Standard" for the sell list everyone else gets, "Other departments" for the internal one. */
/** Who an internal tariff charges: whichever department a job belongs to, never one named one. */
export const INTERNAL_OWNER = "Other departments";

export function ownerLabel(t: Pick<interfaces.TariffListItem, "side" | "ownerCustomerId" | "ownerName">): string {
  if (t.ownerCustomerId) return t.ownerName ?? "Unknown company";
  if (t.side === "SELL") return "Standard";
  if (t.side === "INTERNAL") return INTERNAL_OWNER;
  return "—";
}

/** "01.11.2026 – 31.12.2026", or "from 01.11.2026" when open-ended. */
export function validityLabel(validFrom: string, validTo: string | null): string {
  return validTo ? `${formatDate(validFrom)} – ${formatDate(validTo)}` : `from ${formatDate(validFrom)}`;
}

export function versionLabel(v: Pick<interfaces.TariffVersionSummary, "versionNo">): string {
  return `v${v.versionNo}`;
}

/** The chip of a tariff in the list: what prices with it today. */
export function tariffListStatus(t: interfaces.TariffListItem): { label: string; tone: ChipTone; hint: string } {
  if (t.mode === "DISCOUNT") return { label: "Follows Standard", tone: "green", hint: "Priced from the Standard sell list active on the day, with the discount" };
  if (t.activeVersion) return { label: "Active", tone: "green", hint: `${versionLabel(t.activeVersion)} prices consignments today` };
  if (t.nextVersion) return { label: "Scheduled", tone: "amber", hint: `Nothing active today; ${versionLabel(t.nextVersion)} starts on ${formatDate(t.nextVersion.validFrom)}` };
  if (t.draftCount) return { label: "Draft only", tone: "slate", hint: "Only drafts — activate one to use the tariff" };
  return { label: "No versions", tone: "red", hint: "No prices yet — the tariff is not used" };
}

const BASIS_UNIT: Record<interfaces.BandBasis, [one: string, many: string]> = {
  KG: ["kg", "kg"],
  PALLET: ["pallet", "pallets"],
  LDM: ["LDM", "LDM"],
  TRIP: ["trip", "trips"],
};

/**
 * A band as people read it: "1 001 – 1 500 kg", "up to 500 kg", "over 5 000 kg", "3 – 4 pallets",
 * "1.1 – 2 LDM", "Per trip". Weights and pallets count in whole units, LDM in tenths, so the lower
 * end is the first quantity above `fromExcl`.
 */
export function bandLabel(band: Pick<interfaces.TariffBand, "basis" | "fromExcl" | "toIncl">): string {
  if (band.basis === "TRIP") return "Per trip";
  const [one, many] = BASIS_UNIT[band.basis];
  const unit = (n: number) => (n === 1 ? one : many);
  if (band.toIncl == null) return `over ${formatQty(band.fromExcl)} ${many}`;
  if (band.fromExcl <= 0) return `up to ${formatQty(band.toIncl)} ${unit(band.toIncl)}`;
  const step = band.basis === "LDM" ? 0.1 : 1;
  const exact = Number.isInteger(Math.round(band.fromExcl / step * 1e6) / 1e6);
  if (!exact) return `over ${formatQty(band.fromExcl)} – ${formatQty(band.toIncl)} ${many}`;
  const low = Math.round((band.fromExcl + step) * 10) / 10;
  if (low === band.toIncl) return `${formatQty(low)} ${unit(low)}`;
  return `${formatQty(low)} – ${formatQty(band.toIncl)} ${many}`;
}

/** "110 00 – 199 99", or one postcode when the range is a single one. */
export function pscRangeLabel(from: string, to: string): string {
  return from === to ? formatPsc(from) : `${formatPsc(from)} – ${formatPsc(to)}`;
}

/** Errors first, then warnings, each in the server's order. */
export function sortFindings<T extends Pick<interfaces.ValidationFinding, "severity">>(findings: readonly T[]): T[] {
  return [...findings.filter((f) => f.severity === "error"), ...findings.filter((f) => f.severity !== "error")];
}

export const countErrors = (findings: readonly Pick<interfaces.ValidationFinding, "severity">[]) => findings.filter((f) => f.severity === "error").length;

/** A side of a rate result the engine could not price. */
export function isUnpriced(side: interfaces.PricedSide | interfaces.Unpriced | null): side is interfaces.Unpriced {
  return !!side && "reason" in side;
}

export function isPriced(side: interfaces.PricedSide | interfaces.Unpriced | null): side is interfaces.PricedSide {
  return !!side && !("reason" in side);
}

// ── The price matrix of a version ──

export interface MatrixCell {
  amount: number;
  priceType: interfaces.PriceType;
}

export interface MatrixRow {
  band: interfaces.TariffBand;
  label: string;
  /** One per zone of the matrix, in its order; null where the sheet has no price. */
  cells: (MatrixCell | null)[];
}

export interface LevelMatrix {
  level: ServiceLevelCode;
  zones: interfaces.TariffZone[];
  rows: MatrixRow[];
  /** Minimum charge per zone; null where none is set. */
  minRow: (number | null)[];
  /** Lowest and highest amount per price type, for the heat tint. */
  ranges: Partial<Record<interfaces.PriceType, { min: number; max: number }>>;
}

const BASIS_ORDER: interfaces.BandBasis[] = ["KG", "PALLET", "LDM", "TRIP"];

/** One matrix per service level the version prices: rows = its bands (low to high), columns = the zones. */
export function buildLevelMatrices(input: Pick<interfaces.TariffVersionInput, "zones" | "bands" | "rates" | "minCharges">): LevelMatrix[] {
  const levels = SERVICE_LEVEL_ORDER.filter((l) => input.rates.some((r) => r.serviceLevel === l));
  const zoneIndex = new Map(input.zones.map((z, i) => [z.code, i]));
  const bands = [...input.bands].sort((a, b) => BASIS_ORDER.indexOf(a.basis) - BASIS_ORDER.indexOf(b.basis) || a.fromExcl - b.fromExcl);

  return levels.map((level) => {
    const rates = input.rates.filter((r) => r.serviceLevel === level);
    const ranges: LevelMatrix["ranges"] = {};
    const rows = bands
      .filter((b) => rates.some((r) => r.bandId === b.id))
      .map((band) => {
        const cells: (MatrixCell | null)[] = input.zones.map(() => null);
        for (const r of rates) {
          const i = zoneIndex.get(r.zoneCode);
          if (r.bandId !== band.id || i == null) continue;
          cells[i] = { amount: r.amount, priceType: r.priceType };
          const range = ranges[r.priceType];
          ranges[r.priceType] = range ? { min: Math.min(range.min, r.amount), max: Math.max(range.max, r.amount) } : { min: r.amount, max: r.amount };
        }
        return { band, label: bandLabel(band), cells };
      });
    const minRow = input.zones.map((z) => input.minCharges.find((m) => m.serviceLevel === level && m.zoneCode === z.code)?.amount ?? null);
    return { level, zones: input.zones, rows, minRow, ranges };
  });
}

export const HEAT_STEPS = 5;

/** Where an amount sits between the lowest and highest of its kind: 0 (cheapest) … HEAT_STEPS − 1 (dearest). */
export function heatStep(amount: number, range: { min: number; max: number } | undefined): number {
  if (!range || range.max <= range.min) return 0;
  const share = (amount - range.min) / (range.max - range.min);
  return Math.min(HEAT_STEPS - 1, Math.max(0, Math.floor(share * HEAT_STEPS)));
}
