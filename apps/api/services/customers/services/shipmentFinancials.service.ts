import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { fx, invoicing, shipments } from "~encore/clients";
import { customerService } from "./customer.service";
import type { ShipmentFinancials } from "../interfaces/interfaces";

/**
 * Revenue, cost and profit of a customer's shipments, worked out on the server exactly as each
 * job's Costs Breakdown does (invoicing lib/jobCostTotals) at the job's own ČNB rates (fx).
 * Authoritative for the customer's Shipments tab. The stored rollups on the customer
 * (totalRevenue / totalProfit, written by the shipments service from the shipment's own
 * selling/buying fields) are a separate, older figure and are not these numbers.
 */
class ShipmentFinancialsService {
  async forShipments(companyId: string, customerId: string, shipmentIds: string[], currency: string): Promise<ShipmentFinancials[]> {
    await customerService.requireLive(customerId, companyId);
    // Only the customer's own live shipments: ids of anyone else's are simply not answered.
    const { shipmentIds: own } = await shipments._internalCustomerShipmentIds({ customerId, shipmentIds: [...new Set(shipmentIds)] });
    if (!own.length) return [];

    // The rates each job is valued at (locked at ATA/ATD, provisional before). A job whose rates
    // can't be read gets no totals rather than failing the whole list.
    const jobs = await Promise.all(
      own.map(async (shipmentId) => {
        try {
          const r = await fx.fxJobRates({ shipmentId });
          return { shipmentId, rates: r.rates.map((x) => ({ currency: x.currency, rate: x.rate })), ok: true };
        } catch (err) {
          log.warn("customer financials: job rates not readable", { shipmentId, error: err instanceof Error ? err.message : String(err) });
          return { shipmentId, rates: [], ok: false };
        }
      }),
    );
    const readable = jobs.filter((j) => j.ok).map(({ shipmentId, rates }) => ({ shipmentId, rates }));
    const totals = readable.length
      ? (await invoicing._internalShipmentCostTotals({ jobs: readable, currency })).items
      : [];
    const byId = new Map(totals.map((t) => [t.shipmentId, t]));
    return own.map((shipmentId) => {
      const t = byId.get(shipmentId);
      return t
        ? { ...t, currency }
        : { shipmentId, currency, revenueCzk: null, costCzk: null, profitCzk: null, revenue: null, cost: null, profit: null, missingCurrencies: [] };
    });
  }
}

export const shipmentFinancialsService = new ShipmentFinancialsService();

/** The currency asked for: three letters, upper case. */
export function currencyOf(raw: string | undefined): string {
  const c = (raw || "CZK").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) throw APIError.invalidArgument("currency must be a 3-letter code");
  return c;
}
