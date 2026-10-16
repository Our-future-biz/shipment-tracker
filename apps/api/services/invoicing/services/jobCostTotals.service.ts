import { billingSettingsRepository } from "../repositories/billingSettings.repository";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { sellingCostRepository } from "../repositories/sellingCost.repository";
import { jobCostTotals } from "../lib/jobCostTotals";
import type { JobCostInput, ShipmentCostTotals } from "../interfaces/interfaces";

class JobCostTotalsService {
  /** Each job's revenue, cost and profit (see lib/jobCostTotals), read in three queries for all of them. */
  async forJobs(companyId: string, jobs: JobCostInput[], currency: string): Promise<ShipmentCostTotals[]> {
    const ids = [...new Set(jobs.map((j) => j.shipmentId))];
    const [buys, sells, billing] = await Promise.all([
      invoiceCostRepository.listByShipmentIds(companyId, ids),
      sellingCostRepository.listByShipmentIds(companyId, ids),
      billingSettingsRepository.currenciesOf(companyId, ids),
    ]);
    const billingOf = new Map(billing.map((b) => [b.shipmentId, b.billingCurrency]));
    return jobs.map((job) => ({
      shipmentId: job.shipmentId,
      ...jobCostTotals(
        buys.filter((r) => r.shipmentId === job.shipmentId),
        sells.filter((r) => r.shipmentId === job.shipmentId),
        billingOf.get(job.shipmentId) || "CZK",
        Object.fromEntries(job.rates.map((r) => [r.currency, r.rate])),
        currency,
      ),
    }));
  }
}

export const jobCostTotalsService = new JobCostTotalsService();
