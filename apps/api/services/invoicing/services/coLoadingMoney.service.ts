import log from "encore.dev/log";
import { fx } from "~encore/clients";
import { coLoadingMoney } from "../lib/coLoadingMoney";
import type { CzkRates } from "../lib/jobCostTotals";
import { invoiceRepository } from "../repositories/invoice.repository";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { sellingCostRepository } from "../repositories/sellingCost.repository";
import type { CoLoadingMoneyItem, CoLoadingMoneyJob } from "../interfaces/interfaces";

class CoLoadingMoneyService {
  /**
   * Each shipment's money for a sailing's Earnings (lib/coLoadingMoney): three reads for all of
   * them and one question to fx, which fixes no rate. A shipment fx could not value keeps its CZK
   * amounts; its other currencies are named as missing.
   */
  async forJobs(companyId: string, jobs: CoLoadingMoneyJob[]): Promise<CoLoadingMoneyItem[]> {
    const ids = [...new Set(jobs.map((j) => j.shipmentId))];
    if (!ids.length) return [];
    const [buys, sells, open] = await Promise.all([
      invoiceCostRepository.listByShipmentIds(companyId, ids),
      sellingCostRepository.listByShipmentIds(companyId, ids),
      invoiceRepository.listOpenInvoicesWithSources(ids, companyId),
    ]);
    const invoiced = new Set(open.flatMap((i) => i.sourceSellingCostIds).filter((id): id is string => !!id));
    const invoicedJobs = new Set(open.map((i) => i.shipmentId));

    // Every job is asked for EUR, the currency the tab shows, and for the currencies its lines are in.
    const currencies = new Set<string>(["EUR"]);
    for (const r of sells) if (r.currency && r.currency !== "CZK") currencies.add(r.currency);
    for (const r of buys) for (const c of [r.estCurrency, r.realCurrency]) if (c && c !== "CZK") currencies.add(c);
    const rates = new Map<string, CzkRates>();
    try {
      const answer = await fx._internalFxJobRatesRead({
        jobs: jobs.map(({ shipmentId, ...dates }) => ({ shipmentId, dates, invoiced: invoicedJobs.has(shipmentId) })),
        currencies: [...currencies],
      });
      for (const j of answer.jobs) rates.set(j.shipmentId, Object.fromEntries(j.rates.map((r) => [r.currency, r.rate])));
      if (answer.unreadable.length) log.warn("Co-Loading earnings: job rates not readable", { count: answer.unreadable.length });
    } catch (err) {
      log.warn(err, "Co-Loading earnings: the job rates could not be read");
    }

    return ids.map((shipmentId) => ({
      shipmentId,
      ...coLoadingMoney(
        buys.filter((r) => r.shipmentId === shipmentId),
        sells.filter((r) => r.shipmentId === shipmentId),
        rates.get(shipmentId) ?? {},
        invoiced,
      ),
    }));
  }
}

export const coLoadingMoneyService = new CoLoadingMoneyService();
