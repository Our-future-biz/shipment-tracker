import { and, eq, inArray, isNull } from "drizzle-orm";
import { APIError } from "encore.dev/api";
import { fx, shipments } from "~encore/clients";
import { db } from "../db/db";
import { invoiceCostTable } from "../schemas/invoiceCost.schema";
import { invoiceSellingCostTable } from "../schemas/invoiceSellingCost.schema";
import { buildJobProfit, type JobProfitRow, type MonthAverages, type ReportShipment } from "../lib/jobProfitReport";

export interface MonthSummary {
  month: string;
  jobs: number;
  revenueCzk: number;
  costCzk: number;
  profitCzk: number;
  final: boolean; // the month's average is final (month ended); else provisional
  averages: { currency: string; average: number }[]; // EUR and USD, for reference
}

export interface JobProfitReport {
  from: string;
  to: string;
  rows: JobProfitRow[];
  months: MonthSummary[];
  undated: number; // jobs with neither ATA/ATD nor ETA/ETD — not in any period
}

const PAGE = 200;

// Every shipment of the caller's company (the list endpoint pages at 200).
async function allShipments(): Promise<ReportShipment[]> {
  const out: ReportShipment[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const res = await shipments.shipmentList({ limit: PAGE, offset });
    for (const s of res.data) {
      out.push({
        id: s.id,
        jobNumber: s.jobNumber,
        customer: s.customer ?? "",
        freightMode: s.freightMode ?? "",
        status: s.status ?? "",
        tradeDirection: s.tradeDirection ?? "",
        estimatedArrival: s.estimatedArrival,
        estimatedDeparture: s.estimatedDeparture,
        actualArrival: s.actualArrival,
        actualDeparture: s.actualDeparture,
      });
    }
    if (res.data.length < PAGE || out.length >= res.pagination.total) return out;
  }
}

// ČNB monthly averages (all currencies, no ROE) for every month from..to.
async function monthAverages(from: string, to: string): Promise<{ map: MonthAverages; final: Map<string, boolean> }> {
  const map: MonthAverages = new Map();
  const final = new Map<string, boolean>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    const res = await fx.fxAverages({ year: y, all: true });
    for (const p of res.periods) {
      if (p.type !== "month") continue;
      map.set(p.key, Object.fromEntries(p.averages.map((a) => [a.currency, a.average])));
      final.set(p.key, p.final);
    }
  }
  return { map, final };
}

export async function jobProfitReport(companyId: string, from: string, to: string): Promise<JobProfitReport> {
  if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to) || from > to) {
    throw APIError.invalidArgument("Use months as YYYY-MM, from ≤ to");
  }
  const ships = await allShipments();
  const ids = ships.map((s) => s.id);
  const [buys, sells, avg] = await Promise.all([
    ids.length
      ? db.select().from(invoiceCostTable).where(and(eq(invoiceCostTable.companyId, companyId), inArray(invoiceCostTable.shipmentId, ids), isNull(invoiceCostTable.deletedAt)))
      : Promise.resolve([]),
    ids.length
      ? db.select().from(invoiceSellingCostTable).where(and(eq(invoiceSellingCostTable.companyId, companyId), inArray(invoiceSellingCostTable.shipmentId, ids), isNull(invoiceSellingCostTable.deletedAt)))
      : Promise.resolve([]),
    monthAverages(from, to),
  ]);

  const { rows, undated } = buildJobProfit(ships, buys, sells, avg.map, from, to);

  const byMonth = new Map<string, MonthSummary>();
  for (const r of rows) {
    const m = byMonth.get(r.month) ?? {
      month: r.month,
      jobs: 0,
      revenueCzk: 0,
      costCzk: 0,
      profitCzk: 0,
      final: avg.final.get(r.month) ?? false,
      averages: ["EUR", "USD"].flatMap((c) => {
        const a = avg.map.get(r.month)?.[c];
        return a ? [{ currency: c, average: a }] : [];
      }),
    };
    m.jobs += 1;
    m.revenueCzk += r.revenueCzk;
    m.costCzk += r.costCzk;
    m.profitCzk += r.profitCzk;
    byMonth.set(r.month, m);
  }
  const months = [...byMonth.values()]
    .map((m) => ({ ...m, revenueCzk: Math.round(m.revenueCzk * 100) / 100, costCzk: Math.round(m.costCzk * 100) / 100, profitCzk: Math.round(m.profitCzk * 100) / 100 }))
    .sort((a, b) => b.month.localeCompare(a.month));
  return { from, to, rows, months, undated };
}
