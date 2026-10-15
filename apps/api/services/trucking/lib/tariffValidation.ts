import { isRealYmd } from "../../../lib/businessDate";
import { bandLabel, fmt, showPostcode } from "./rateEngine";
import type {
  BandBasis,
  ServiceLevelCode,
  TariffBand,
  TariffRate,
  TariffVersionInput,
  ValidationFinding,
} from "../interfaces/interfaces";

// The findings of a tariff version: errors keep it from being activated, warnings are shown.
// Pure; a draft is saved whatever it finds (lib/tariffRules.ts refuses only input that cannot be
// stored at all).

/** Fastest first; EXP_FIXED is priced per order and not compared. */
const SPEED_ORDER: ServiceLevelCode[] = ["EXP_SAMEDAY", "EXP_1000", "EXP_1200", "D1", "D2", "D3", "D4"];
/** The CZ postcode space a full tariff is expected to cover. */
const PSC_FIRST = 10000;
const PSC_LAST = 79999;
/** A cell that moves by more than this against the active version is counted. */
export const CHANGE_WARN_PCT = 15;
const MAX_GAPS_LISTED = 20;

export interface ValidationContext {
  /** How many fuel index months the company has set */
  fuelMonthCount: number;
  /** The version active today, to compare cells with; null when there is none */
  activeInput: TariffVersionInput | null;
}

const err = (message: string, where: string): ValidationFinding => ({ severity: "error", message, where });
const warn = (message: string, where: string): ValidationFinding => ({ severity: "warning", message, where });

const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPsc = (v: string) => /^\d{5}$/.test(v);

const sheet = (level: string) => `Sheet ${level}`;

/** Everything wrong or suspicious in a version: the errors, then the warnings. */
export function validateVersion(v: TariffVersionInput, ctx: ValidationContext): ValidationFinding[] {
  const out: ValidationFinding[] = [];
  const bandsById = new Map(v.bands.map((b) => [b.id, b]));
  const zoneCodes = new Set(v.zones.map((z) => z.code));
  const describeBand = (id: string) => {
    const b = bandsById.get(id);
    return b ? `band ${bandLabel(b)}` : `band ${id}`;
  };
  const cell = (r: Pick<TariffRate, "serviceLevel" | "zoneCode" | "bandId">) => `${sheet(r.serviceLevel)}, zone ${r.zoneCode}, ${describeBand(r.bandId)}`;

  // validity
  if (!isRealYmd(v.validFrom)) out.push(err("The valid-from date is not a date", "Validity"));
  if (v.validTo !== null && !isRealYmd(v.validTo)) out.push(err("The valid-to date is not a date", "Validity"));
  if (v.validTo !== null && v.validTo < v.validFrom) out.push(err("Valid from is after valid to", "Validity"));

  // factors and rounding
  for (const [key, label] of [
    ["kgPerLdm", "Kg per loading metre"],
    ["kgPerCbm", "Kg per cubic metre"],
    ["kgPerPalletPlace", "Kg per pallet place"],
  ] as const) {
    if (!isAmount(v.factors[key]) || v.factors[key] <= 0) out.push(err(`${label} must be a number above 0`, "Chargeable weight factors"));
  }
  if (!isAmount(v.rounding.weightStepKg) || v.rounding.weightStepKg <= 0) out.push(err("The weight rounding step must be above 0", "Rounding"));
  if (!isAmount(v.rounding.moneyStep) || v.rounding.moneyStep <= 0) out.push(err("The money rounding step must be above 0", "Rounding"));

  // zones: real postcodes, unique codes, ranges that nest or stay apart (never cross)
  const seenZone = new Set<string>();
  for (const z of v.zones) {
    const where = `Zone ${z.code || "(no code)"}`;
    if (!z.code) out.push(err("A zone has no code", where));
    else if (seenZone.has(z.code)) out.push(err(`Zone code ${z.code} is used twice`, where));
    seenZone.add(z.code);
    if (!isPsc(z.postcodeFrom) || !isPsc(z.postcodeTo)) out.push(err("Postcodes must be 5 digits, like 110 00", where));
    else if (z.postcodeFrom > z.postcodeTo) out.push(err("The postcode range runs backwards", where));
  }
  const ranges = v.zones.filter((z) => isPsc(z.postcodeFrom) && isPsc(z.postcodeTo) && z.postcodeFrom <= z.postcodeTo);
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      const range = (z: typeof a) => `${showPostcode(z.postcodeFrom)}–${showPostcode(z.postcodeTo)}`;
      if (a.postcodeFrom === b.postcodeFrom && a.postcodeTo === b.postcodeTo) {
        out.push(err(`Zones ${a.code} and ${b.code} have the same postcode range ${range(a)}`, `Zone ${b.code}`));
        continue;
      }
      const overlap = a.postcodeFrom <= b.postcodeTo && b.postcodeFrom <= a.postcodeTo;
      const nested = (a.postcodeFrom <= b.postcodeFrom && b.postcodeTo <= a.postcodeTo) || (b.postcodeFrom <= a.postcodeFrom && a.postcodeTo <= b.postcodeTo);
      if (overlap && !nested) out.push(err(`Zones ${a.code} (${range(a)}) and ${b.code} (${range(b)}) overlap`, `Zone ${b.code}`));
    }
  }

  // bands: unique ids, sensible limits, per basis contiguous from the lowest up, open band last
  const seenBand = new Set<string>();
  for (const b of v.bands) {
    const where = `Band ${b.id || "(no id)"}`;
    if (!b.id) out.push(err("A band has no id", where));
    else if (seenBand.has(b.id)) out.push(err(`Band id ${b.id} is used twice`, where));
    seenBand.add(b.id);
    if (!isAmount(b.fromExcl) || b.fromExcl < 0) out.push(err("The band's lower limit must be a number, 0 or more", where));
    if (b.toIncl !== null && (!isAmount(b.toIncl) || b.toIncl <= b.fromExcl)) out.push(err("The band's upper limit must be above its lower limit", where));
  }
  const byBasis = new Map<BandBasis, TariffBand[]>();
  for (const b of v.bands) if (isAmount(b.fromExcl)) byBasis.set(b.basis, [...(byBasis.get(b.basis) ?? []), b]);
  for (const [basis, bands] of byBasis) {
    const sorted = [...bands].sort((a, b) => a.fromExcl - b.fromExcl);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const where = `Bands ${basis}, ${bandLabel(cur)}`;
      if (prev.toIncl === null) out.push(err(`Band ${bandLabel(prev)} is open at the top but another band follows it`, where));
      else if (cur.fromExcl < prev.toIncl) out.push(err(`Overlaps band ${bandLabel(prev)}`, where));
      else if (cur.fromExcl > prev.toIncl) out.push(err(`Gap after band ${bandLabel(prev)}: nothing prices ${fmt(prev.toIncl)}–${fmt(cur.fromExcl)}`, where));
    }
  }

  // rates and minimum charges: known zone and band, a number 0 or more, once per cell
  const seenCell = new Set<string>();
  for (const r of v.rates) {
    const where = cell(r);
    if (!zoneCodes.has(r.zoneCode)) out.push(err(`Unknown zone ${r.zoneCode}`, where));
    if (!bandsById.has(r.bandId)) out.push(err(`Unknown band ${r.bandId}`, where));
    if (!isAmount(r.amount)) out.push(err("The price is not a number", where));
    else if (r.amount < 0) out.push(err("The price is negative", where));
    const key = `${r.serviceLevel}|${r.zoneCode}|${r.bandId}`;
    if (seenCell.has(key)) out.push(err("Priced twice", where));
    seenCell.add(key);
  }
  const levelBases = new Map<string, Set<BandBasis>>();
  for (const r of v.rates) {
    const b = bandsById.get(r.bandId);
    if (b) levelBases.set(r.serviceLevel, (levelBases.get(r.serviceLevel) ?? new Set()).add(b.basis));
  }
  for (const [level, bases] of levelBases) {
    if (bases.size > 1) out.push(err(`Mixes bands of ${[...bases].join(" and ")}; a sheet is priced on one basis`, sheet(level)));
  }
  for (const m of v.minCharges) {
    const where = `${sheet(m.serviceLevel)}, zone ${m.zoneCode}, minimum charge`;
    if (!zoneCodes.has(m.zoneCode)) out.push(err(`Unknown zone ${m.zoneCode}`, where));
    if (!isAmount(m.amount)) out.push(err("The minimum charge is not a number", where));
    else if (m.amount < 0) out.push(err("The minimum charge is negative", where));
  }
  for (const s of v.surcharges) {
    const where = `Surcharge ${s.code}`;
    if (!isAmount(s.value)) out.push(err("The value is not a number", where));
    else if (s.value < 0) out.push(err("The value is negative", where));
    if (s.min !== null && (!isAmount(s.min) || s.min < 0)) out.push(err("The minimum must be a number, 0 or more", where));
  }

  out.push(...warnings(v, ctx, bandsById, cell));
  return out;
}

function warnings(
  v: TariffVersionInput,
  ctx: ValidationContext,
  bandsById: Map<string, TariffBand>,
  cell: (r: TariffRate) => string,
): ValidationFinding[] {
  const out: ValidationFinding[] = [];
  const good = v.rates.filter((r) => isAmount(r.amount) && bandsById.has(r.bandId));

  // a FLAT price that falls as the band rises
  const groups = new Map<string, TariffRate[]>();
  for (const r of good) if (r.priceType === "FLAT") groups.set(`${r.serviceLevel}|${r.zoneCode}`, [...(groups.get(`${r.serviceLevel}|${r.zoneCode}`) ?? []), r]);
  for (const rates of groups.values()) {
    const sorted = [...rates].sort((a, b) => bandsById.get(a.bandId)!.fromExcl - bandsById.get(b.bandId)!.fromExcl);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].amount < sorted[i - 1].amount) {
        out.push(warn(`The price falls from ${fmt(sorted[i - 1].amount)} to ${fmt(sorted[i].amount)} as the band rises`, cell(sorted[i])));
      }
    }
  }

  // a slower level dearer than a faster one for the same zone and band (same kind of price)
  const byCell = new Map<string, TariffRate>();
  for (const r of good) byCell.set(`${r.serviceLevel}|${r.zoneCode}|${r.bandId}`, r);
  const dearer = new Map<string, { count: number; first: TariffRate; faster: TariffRate }>();
  for (const r of good) {
    const speed = SPEED_ORDER.indexOf(r.serviceLevel);
    if (speed < 0) continue;
    for (const fasterLevel of SPEED_ORDER.slice(0, speed)) {
      const f = byCell.get(`${fasterLevel}|${r.zoneCode}|${r.bandId}`);
      if (f && f.priceType === r.priceType && r.amount > f.amount) {
        const key = `${r.serviceLevel}|${fasterLevel}`;
        const seen = dearer.get(key);
        if (seen) seen.count++;
        else dearer.set(key, { count: 1, first: r, faster: f });
      }
    }
  }
  for (const { count, first, faster } of dearer.values()) {
    const more = count > 1 ? ` (and ${count - 1} more cells)` : "";
    out.push(warn(`${first.serviceLevel} costs ${fmt(first.amount)}, more than the faster ${faster.serviceLevel} at ${fmt(faster.amount)}${more}`, cell(first)));
  }

  // postcodes no zone covers
  const gaps = postcodeGaps(v);
  for (const [from, to] of gaps.slice(0, MAX_GAPS_LISTED)) {
    const range = from === to ? showPostcode(from) : `${showPostcode(from)}–${showPostcode(to)}`;
    out.push(warn(`Postcodes ${range} are in no zone`, "Zones"));
  }
  if (gaps.length > MAX_GAPS_LISTED) out.push(warn(`And ${gaps.length - MAX_GAPS_LISTED} more postcode gaps`, "Zones"));

  // a fuel-index surcharge with no index to read
  if (v.surcharges.some((s) => s.calc === "FUEL_INDEX") && ctx.fuelMonthCount === 0) {
    out.push(warn("A surcharge follows the fuel index, but no fuel index month is set: it will be 0 %", "Surcharges"));
  }

  // cells that move a lot against the active version
  if (ctx.activeInput) {
    const changed = bigChanges(v, ctx.activeInput);
    if (changed) out.push(warn(`${changed} prices change by more than ${CHANGE_WARN_PCT} % against the active version`, "Rates"));
  }
  return out;
}

/** The postcode ranges 100 00–799 99 that no zone covers, as [from, to] pairs. */
export function postcodeGaps(v: Pick<TariffVersionInput, "zones">): [string, string][] {
  const ranges = v.zones
    .filter((z) => isPsc(z.postcodeFrom) && isPsc(z.postcodeTo) && z.postcodeFrom <= z.postcodeTo)
    .map((z) => [Number(z.postcodeFrom), Number(z.postcodeTo)] as const)
    .sort((a, b) => a[0] - b[0]);
  const gaps: [string, string][] = [];
  const psc = (n: number) => String(n).padStart(5, "0");
  let next = PSC_FIRST;
  for (const [from, to] of ranges) {
    if (to < next) continue;
    if (from > next) gaps.push([psc(next), psc(Math.min(from - 1, PSC_LAST))]);
    next = Math.max(next, to + 1);
    if (next > PSC_LAST) break;
  }
  if (next <= PSC_LAST) gaps.push([psc(next), psc(PSC_LAST)]);
  return gaps.filter(([from]) => Number(from) <= PSC_LAST);
}

/** How many cells (level, zone, band limits) differ by more than CHANGE_WARN_PCT % from the old version. */
export function bigChanges(next: TariffVersionInput, prev: TariffVersionInput): number {
  const key = (v: TariffVersionInput, r: TariffRate) => {
    const b = v.bands.find((x) => x.id === r.bandId);
    return b ? `${r.serviceLevel}|${r.zoneCode}|${b.basis}|${b.fromExcl}|${b.toIncl}|${r.priceType}` : null;
  };
  const old = new Map<string, number>();
  for (const r of prev.rates) {
    const k = key(prev, r);
    if (k && isAmount(r.amount)) old.set(k, r.amount);
  }
  let count = 0;
  for (const r of next.rates) {
    const k = key(next, r);
    const before = k ? old.get(k) : undefined;
    if (before === undefined || !isAmount(r.amount)) continue;
    if (before === 0 ? r.amount !== 0 : (Math.abs(r.amount - before) / before) * 100 > CHANGE_WARN_PCT) count++;
  }
  return count;
}
