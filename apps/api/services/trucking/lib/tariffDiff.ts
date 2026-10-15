import { bandLabel, fmt, SURCHARGE_LABEL } from "./rateEngine";
import { SERVICE_LEVEL_CODES } from "./settingsRules";
import { versionLevels } from "./tariffRules";
import type { DiffCell, TariffSurcharge, TariffVersionDiff, TariffVersionInput, TariffVersionSummary } from "../interfaces/interfaces";

// What a version changes against another (normally the active one): every price cell compared by
// level, zone, band limits and price type (band ids differ between versions), the minimum charges
// as their own cells, zones, levels and surcharges. Pure.

export const MAX_DIFF_CELLS = 500;
export const MIN_CHARGE_LABEL = "Minimum charge";

interface Cell {
  serviceLevel: DiffCell["serviceLevel"];
  zoneCode: string;
  bandLabel: string;
  /** Lower band limit, for a stable order; minimum charges sort first */
  order: number;
  amount: number;
}

const isAmount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Every priced cell of a version by a key that does not depend on band ids. */
function cells(v: TariffVersionInput): Map<string, Cell> {
  const out = new Map<string, Cell>();
  const bandsById = new Map(v.bands.map((b) => [b.id, b]));
  for (const r of v.rates) {
    const b = bandsById.get(r.bandId);
    if (!b || !isAmount(r.amount)) continue;
    const label = r.priceType === "FLAT" ? bandLabel(b) : `${bandLabel(b)} (${r.priceType === "PER_UNIT" ? "per unit" : "per 100 kg"})`;
    out.set(`${r.serviceLevel}|${r.zoneCode}|${b.basis}|${b.fromExcl}|${b.toIncl}|${r.priceType}`, {
      serviceLevel: r.serviceLevel,
      zoneCode: r.zoneCode,
      bandLabel: label,
      order: b.fromExcl,
      amount: r.amount,
    });
  }
  for (const m of v.minCharges) {
    if (!isAmount(m.amount)) continue;
    out.set(`${m.serviceLevel}|${m.zoneCode}|MIN`, { serviceLevel: m.serviceLevel, zoneCode: m.zoneCode, bandLabel: MIN_CHARGE_LABEL, order: -1, amount: m.amount });
  }
  return out;
}

/** "12 %", "250 flat", "0.5 per kg", "fuel index" — with the minimum and the base when they matter. */
export function describeSurcharge(s: TariffSurcharge): string {
  const value = {
    PCT: `${fmt(s.value)} %`,
    FLAT: `${fmt(s.value)} flat`,
    PER_KG: `${fmt(s.value)} per kg`,
    PER_PALLET: `${fmt(s.value)} per pallet`,
    PER_HOUR: `${fmt(s.value)} per hour`,
    PCT_OF_VALUE: `${fmt(s.value)} % of the value`,
    FUEL_INDEX: "fuel index",
  }[s.calc];
  const base = s.calc === "PCT" || s.calc === "FUEL_INDEX" ? (s.onBasePlusSurcharges ? " of freight + surcharges" : "") : "";
  const min = s.min !== null ? `, min ${fmt(s.min)}` : "";
  return `${value}${base}${min}`;
}

/** The surcharge changes in plain English, by code in the order of the new version, then the dropped ones. */
export function surchargeChanges(next: TariffSurcharge[], prev: TariffSurcharge[]): string[] {
  const out: string[] = [];
  const prevByCode = new Map<string, TariffSurcharge>();
  for (const s of prev) if (!prevByCode.has(s.code)) prevByCode.set(s.code, s);
  const seen = new Set<string>();
  for (const s of next) {
    if (seen.has(s.code)) continue;
    seen.add(s.code);
    const label = SURCHARGE_LABEL[s.code];
    const before = prevByCode.get(s.code);
    if (!before) out.push(`${label}: new, ${describeSurcharge(s)}`);
    else if (describeSurcharge(before) !== describeSurcharge(s)) out.push(`${label}: ${describeSurcharge(before)} → ${describeSurcharge(s)}`);
  }
  for (const [code] of prevByCode) if (!seen.has(code)) out.push(`${SURCHARGE_LABEL[code as TariffSurcharge["code"]]}: removed`);
  return out;
}

/** The diff of `next` against `prev`; when there is nothing to compare with, an empty diff. */
export function diffVersions(next: TariffVersionInput, prev: TariffVersionInput | null, against: TariffVersionSummary | null): TariffVersionDiff {
  const empty: TariffVersionDiff = {
    against: null,
    changedCells: 0,
    addedCells: 0,
    removedCells: 0,
    unchangedCells: 0,
    averageChangePercent: null,
    maxIncreasePercent: null,
    maxDecreasePercent: null,
    zonesAdded: [],
    zonesRemoved: [],
    levelsAdded: [],
    levelsRemoved: [],
    surchargeChanges: [],
    cells: [],
    affectedOpenQuotes: null,
    affectedOpenConsignments: null,
  };
  if (!prev) return empty;

  const after = cells(next);
  const before = cells(prev);
  const changed: DiffCell[] = [];
  const added: DiffCell[] = [];
  const removed: DiffCell[] = [];
  const order = new Map<DiffCell, Cell>();
  // Percent change of every cell priced in both versions (unchanged ones count as 0 in the average).
  const percents: number[] = [];
  let unchanged = 0;
  for (const [key, a] of after) {
    const b = before.get(key);
    const base = { serviceLevel: a.serviceLevel, zoneCode: a.zoneCode, bandLabel: a.bandLabel };
    if (!b) {
      const cell = { ...base, before: null, after: a.amount, changePercent: null };
      added.push(cell);
      order.set(cell, a);
    } else if (b.amount === a.amount) {
      unchanged++;
      percents.push(0);
    } else {
      const pct = b.amount === 0 ? null : round2(((a.amount - b.amount) / b.amount) * 100);
      if (pct !== null) percents.push(pct);
      const cell = { ...base, before: b.amount, after: a.amount, changePercent: pct };
      changed.push(cell);
      order.set(cell, a);
    }
  }
  for (const [key, b] of before) {
    if (after.has(key)) continue;
    const cell = { serviceLevel: b.serviceLevel, zoneCode: b.zoneCode, bandLabel: b.bandLabel, before: b.amount, after: null, changePercent: null };
    removed.push(cell);
    order.set(cell, b);
  }

  // Largest change first (a change from 0 counts as the largest); then added, then removed;
  // ties by level, zone and band.
  const levelIndex = (c: DiffCell) => SERVICE_LEVEL_CODES.indexOf(c.serviceLevel);
  const position = (a: DiffCell, b: DiffCell) =>
    levelIndex(a) - levelIndex(b) || a.zoneCode.localeCompare(b.zoneCode, "cs", { numeric: true }) || order.get(a)!.order - order.get(b)!.order;
  const size = (c: DiffCell) => (c.changePercent === null ? Infinity : Math.abs(c.changePercent));
  changed.sort((a, b) => size(b) - size(a) || position(a, b));
  added.sort(position);
  removed.sort(position);

  const increases = percents.filter((p) => p > 0);
  const decreases = percents.filter((p) => p < 0);
  const zoneCodes = (v: TariffVersionInput) => new Set(v.zones.map((z) => z.code));
  const nextZones = zoneCodes(next);
  const prevZones = zoneCodes(prev);
  const nextLevels = versionLevels(next);
  const prevLevels = versionLevels(prev);
  return {
    ...empty,
    against,
    changedCells: changed.length,
    addedCells: added.length,
    removedCells: removed.length,
    unchangedCells: unchanged,
    averageChangePercent: percents.length ? round2(percents.reduce((s, p) => s + p, 0) / percents.length) : null,
    maxIncreasePercent: increases.length ? Math.max(...increases) : null,
    maxDecreasePercent: decreases.length ? Math.min(...decreases) : null,
    zonesAdded: [...nextZones].filter((z) => !prevZones.has(z)),
    zonesRemoved: [...prevZones].filter((z) => !nextZones.has(z)),
    levelsAdded: nextLevels.filter((l) => !prevLevels.includes(l)),
    levelsRemoved: prevLevels.filter((l) => !nextLevels.includes(l)),
    surchargeChanges: surchargeChanges(next.surcharges, prev.surcharges),
    cells: [...changed, ...added, ...removed].slice(0, MAX_DIFF_CELLS),
  };
}
