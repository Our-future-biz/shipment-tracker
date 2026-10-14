import { APIError } from "encore.dev/api";
import { fx, shipments } from "~encore/clients";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { sellingCostRepository } from "../repositories/sellingCost.repository";
import { buildJobProfit, type MonthAverages, type ReportShipment } from "../lib/jobProfitReport";
import type { JobProfitReport, MonthSummary } from "../interfaces/interfaces";

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

const cents = (v: number) => Math.round(v * 100) / 100;

class JobProfitReportService {
  /** Job revenue, cost and profit in CZK at each month's fixed ČNB average; from/to are YYYY-MM. */
  async build(companyId: string, from: string, to: string): Promise<JobProfitReport> {
    if (from > to) throw APIError.invalidArgument("The first month must not be after the last one");
    const ships = await allShipments();
    const ids = ships.map((s) => s.id);
    const [buys, sells, avg] = await Promise.all([
      invoiceCostRepository.listByShipmentIds(companyId, ids),
      sellingCostRepository.listByShipmentIds(companyId, ids),
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
      .map((m) => ({ ...m, revenueCzk: cents(m.revenueCzk), costCzk: cents(m.costCzk), profitCzk: cents(m.profitCzk) }))
      .sort((a, b) => b.month.localeCompare(a.month));
    return { from, to, rows, months, undated };
  }
}

export const jobProfitReportService = new JobProfitReportService();
