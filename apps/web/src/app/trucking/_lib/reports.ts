import type { interfaces } from "@/lib/api/client";
import type { KpiRange } from "@/app/warehouse-concept/_components/kpi/kpiPeriod";
import { formatPsc, HAULIER_STATUS_CHIP } from "./hauliers";
import { formatMoney, formatPercent, formatQty, SCOPE_LABELS } from "./tariffs";

// Pure helpers of the Reports tab: KPI order and tone, the margin views, sorting of the grids,
// money and percent text, coverage-gap lanes, the department statement and the export file name.

type Report = interfaces.TruckingReport;
type Kpi = interfaces.TruckingKpi;
type MarginRow = interfaces.MarginRow;
type HaulierScore = interfaces.HaulierScore;
type CoverageGap = interfaces.CoverageGap;
type DepartmentResult = interfaces.DepartmentResult;

/** The KPI cards in reading order: service first, then cost and money, then control. */
export const KPI_ORDER: readonly Kpi["key"][] = [
  "onTime",
  "firstAttempt",
  "daysToPod",
  "podMissing",
  "lineHaulFill",
  "costPerKg",
  "costPerPallet",
  "margin",
  "exceptionRate",
  "avizaceDone",
];

/** The KPIs in KPI_ORDER; a key the screen does not know yet goes last. */
export function sortKpis(kpis: readonly Kpi[]): Kpi[] {
  const rank = (k: Kpi) => {
    const i = KPI_ORDER.indexOf(k.key);
    return i < 0 ? KPI_ORDER.length : i;
  };
  return [...kpis].sort((a, b) => rank(a) - rank(b));
}

/** Red for a negative margin, amber while PODs are missing; otherwise the normal colour. */
export function truckingKpiTone(k: Pick<Kpi, "key" | "value">): "amber" | "red" | undefined {
  if (k.value == null) return undefined;
  if (k.key === "margin" && k.value < 0) return "red";
  if (k.key === "podMissing" && k.value > 0) return "amber";
  return undefined;
}

export type MarginView = "customer" | "lane" | "serviceLevel";

export const MARGIN_VIEWS: { value: MarginView; label: string }[] = [
  { value: "customer", label: "Customer" },
  { value: "lane", label: "Lane" },
  { value: "serviceLevel", label: "Service level" },
];

export const isMarginView = (v: string | null | undefined): v is MarginView => MARGIN_VIEWS.some((m) => m.value === v);

/** The margin rows of a view, largest sell first (then by name). */
export function marginRows(report: Pick<Report, "marginByCustomer" | "marginByLane" | "marginByServiceLevel">, view: MarginView): MarginRow[] {
  const rows = view === "customer" ? report.marginByCustomer : view === "lane" ? report.marginByLane : report.marginByServiceLevel;
  return [...rows].sort((a, b) => b.sellCzk - a.sellCzk || a.label.localeCompare(b.label, "cs"));
}

/** "−1 200 CZK (loss)": a negative margin says so in words, not only in red. */
export function marginText(marginCzk: number): string {
  const money = formatMoney(marginCzk, "CZK");
  return marginCzk < 0 ? `${money} (loss)` : money;
}

/** "12.5 %", or "—" when there is no sell to divide by. */
export const marginPercentText = (p: number | null): string => formatPercent(p);

/** "2 below floor"; "" when none. */
export const belowFloorText = (n: number): string => (n > 0 ? `${n} below floor` : "");

/** Totals of a margin view, for its footer line. */
export function marginTotals(rows: readonly MarginRow[]): { consignments: number; sellCzk: number; buyCzk: number; marginCzk: number; marginPercent: number | null; belowFloor: number } {
  const t = rows.reduce(
    (acc, r) => ({
      consignments: acc.consignments + r.consignments,
      sellCzk: acc.sellCzk + r.sellCzk,
      buyCzk: acc.buyCzk + r.buyCzk,
      marginCzk: acc.marginCzk + r.marginCzk,
      belowFloor: acc.belowFloor + r.belowFloor,
    }),
    { consignments: 0, sellCzk: 0, buyCzk: 0, marginCzk: 0, belowFloor: 0 },
  );
  return { ...t, marginPercent: t.sellCzk > 0 ? (t.marginCzk / t.sellCzk) * 100 : null };
}

const STATUS_RANK: Record<HaulierScore["status"], number> = { blocked: 0, warning: 1, ok: 2 };

/** Hauliers needing attention first (blocked, warning), then by trips, then by name. */
export function sortHauliers(rows: readonly HaulierScore[]): HaulierScore[] {
  return [...rows].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || b.trips - a.trips || a.name.localeCompare(b.name, "cs"));
}

export const haulierStatusLabel = (s: HaulierScore["status"]): string => HAULIER_STATUS_CHIP[s].label;

/** "2.5 days" / "—". */
export const daysText = (d: number | null): string => (d == null ? "—" : `${formatQty(d)} day${d === 1 ? "" : "s"}`);

/** "3.25 CZK/kg" / "—". */
export const perKgText = (v: number | null): string => (v == null ? "—" : `${formatQty(v)} CZK/kg`);

/** "2 · 4 500 CZK" / "—" for claims against a haulier. */
export const claimsText = (claims: number, claimedCzk: number): string => (claims > 0 ? `${claims} · ${formatMoney(claimedCzk, "CZK")}` : "—");

export const GAP_SIDE_LABELS: Record<CoverageGap["side"], string> = { SELL: "Sell", BUY: "Buy", INTERNAL: "Internal" };

/** "602 00 · LTL · +1 day": the lane a tariff could not price (no level: the scope only). */
export function gapLaneLabel(gap: Pick<CoverageGap, "postcode" | "scope" | "serviceLevel">, levelLabel: (code: string) => string): string {
  const parts = [formatPsc(gap.postcode), SCOPE_LABELS[gap.scope]];
  if (gap.serviceLevel) parts.push(levelLabel(gap.serviceLevel));
  return parts.join(" · ");
}

/** The gaps asked most often first, then the latest. */
export function sortGaps(rows: readonly CoverageGap[]): CoverageGap[] {
  return [...rows].sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt));
}

/** The Tariffs tab on the gap's side. */
export const tariffsHref = (side: CoverageGap["side"]): string => `/trucking?tab=tariffs&side=${side.toLowerCase()}`;

export interface StatementLine {
  label: string;
  sign: "+" | "−";
  amountCzk: number;
}

/** The department statement: external sell + charged exceptions + internal charges − haulier cost (= resultCzk). */
export function departmentLines(d: DepartmentResult): StatementLine[] {
  return [
    { label: "External sell", sign: "+", amountCzk: d.externalSellCzk },
    { label: "Charged exceptions", sign: "+", amountCzk: d.exceptionChargesCzk },
    { label: "Internal charges", sign: "+", amountCzk: d.internalChargesCzk },
    { label: "Claimed from hauliers", sign: "+", amountCzk: d.haulierClaimsCzk },
    { label: "Haulier cost", sign: "−", amountCzk: d.haulierCostCzk },
  ];
}

/** Internal charges by department, largest first. */
export function sortDepartments(rows: DepartmentResult["internalByDepartment"]): DepartmentResult["internalByDepartment"] {
  return [...rows].sort((a, b) => b.amountCzk - a.amountCzk || a.department.localeCompare(b.department, "cs"));
}

/** "trucking-report-2026-10-09-2026-10-15.xlsx": the fallback name of the export. */
export const reportFileName = (range: KpiRange): string => `trucking-report-${range.from}-${range.to}.xlsx`;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What a tariff change touches today: "3 open quotes and 1 open consignment are priced with this
 * tariff". null while the server does not count it.
 */
export function affectedText(affectedOpenQuotes: number | null, affectedOpenConsignments: number | null): string | null {
  if (affectedOpenQuotes == null && affectedOpenConsignments == null) return null;
  const parts = [
    affectedOpenQuotes != null ? plural(affectedOpenQuotes, "open quote") : null,
    affectedOpenConsignments != null ? plural(affectedOpenConsignments, "open consignment") : null,
  ].filter((p): p is string => p != null);
  const total = (affectedOpenQuotes ?? 0) + (affectedOpenConsignments ?? 0);
  if (total === 0) return "No open quote or consignment is priced with this tariff.";
  return `${parts.join(" and ")} ${parts.length === 1 && total === 1 ? "is" : "are"} priced with this tariff.`;
}
