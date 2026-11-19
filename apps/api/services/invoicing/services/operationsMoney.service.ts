import log from "encore.dev/log";
import { customers, fx, shipments } from "~encore/clients";
import { businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { operationsMoneyJobs, type MoneySupplierFacts, type OperationsMoneyFacts } from "../lib/operationsMoney";
import type { CzkRates } from "../lib/jobCostTotals";
import type { CostClaimLike } from "../lib/supplierInvoices";
import { billingSettingsRepository } from "../repositories/billingSettings.repository";
import { invoiceRepository } from "../repositories/invoice.repository";
import { invoiceCostRepository } from "../repositories/invoiceCost.repository";
import { sellingCostRepository } from "../repositories/sellingCost.repository";
import { supplierInvoiceRepository } from "../repositories/supplierInvoice.repository";
import type { OperationsMoney, OperationsMoneyJobDates } from "../interfaces/interfaces";

// Shipments → Managers, the Money tab (Council Outlay 11, step 4): the money facts of up to two thousand jobs,
// each family read once for all of them and put together by the pure rules of lib/operationsMoney.
//
// READ ONLY. It never gathers a supplier invoice from the lines (Accounts Payable's page does, on every
// opening) and never fixes a job's ČNB rates (opening its Costs tab does): the rates are asked of fx's read
// that fixes nothing. So an invoice number typed before Accounts Payable existed and never gathered is not a
// supplier invoice here yet, and a job valued here is not fixed by it.
//
// Each family is read on its own: one that fails is named in `notKnown` and its figures are null or empty for
// every job - never a 0 that isn't (D29) - while the others still answer.

/** The families, as the page names one that could not be read. */
export const MONEY_PARTS = {
  lines: "selling and cost lines",
  invoices: "customer invoices",
  supplierInvoices: "supplier invoices",
  claims: "cost claims on supplier invoices",
  terms: "suppliers' payment days",
  estimates: "estimates with no supplier invoice",
  rates: "ČNB rates of the jobs",
} as const;

const COST_CLAIM_IDS_PER_CALL = 2000;
const SUPPLIERS_PER_CALL = 500;
/** Ids in one statement: far under the 65,535 parameters Postgres takes. */
const IDS_PER_STATEMENT = 10_000;

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

type Lines = NonNullable<OperationsMoneyFacts["lines"]>;
type Invoices = NonNullable<OperationsMoneyFacts["invoices"]>;
type SupplierInvoices = NonNullable<OperationsMoneyFacts["supplierInvoices"]>;

/**
 * The cost claims on these jobs and against these invoices, as Accounts Payable reads them: a claim tied to an
 * invoice record that is gone disputes the invoice by its number on the job, so it is handed on as not tied.
 */
async function costClaims(companyId: string, shipmentIds: string[], invoiceIds: string[]): Promise<CostClaimLike[]> {
  const seen = new Map<string, CostClaimLike>();
  for (const ids of chunks(shipmentIds, COST_CLAIM_IDS_PER_CALL)) for (const c of (await shipments._internalCostClaims({ shipmentIds: ids })).claims) seen.set(c.id, c);
  for (const ids of chunks(invoiceIds, COST_CLAIM_IDS_PER_CALL)) for (const c of (await shipments._internalCostClaims({ supplierInvoiceIds: ids })).claims) seen.set(c.id, c);
  const claims = [...seen.values()];
  const known = new Set(invoiceIds);
  const others = [...new Set(claims.map((c) => c.supplierInvoiceId).filter((id): id is string => !!id && !known.has(id)))];
  const live = others.length ? await supplierInvoiceRepository.liveIds(companyId, others) : new Set<string>();
  return claims.map((c) => (c.supplierInvoiceId && !known.has(c.supplierInvoiceId) && !live.has(c.supplierInvoiceId) ? { ...c, supplierInvoiceId: null } : c));
}

/** The suppliers' names and payment days from the Customer Database. */
async function suppliersOf(ids: string[]): Promise<Map<string, MoneySupplierFacts>> {
  const out = new Map<string, MoneySupplierFacts>();
  for (const batch of chunks(ids, SUPPLIERS_PER_CALL)) {
    for (const s of (await customers._internalSupplierFacts({ ids: batch })).suppliers) out.set(s.id, { companyName: s.companyName, paymentDays: s.paymentDays });
  }
  return out;
}

class OperationsMoneyService {
  async forJobs(companyId: string, shipmentIds: string[], jobDates: OperationsMoneyJobDates[] = []): Promise<OperationsMoney> {
    const asked = [...new Set(shipmentIds.map((id) => id.trim().toLowerCase()))];
    const ids = asked.filter(isUuid);
    const unreadable = asked.filter((id) => !isUuid(id));
    if (!ids.length) return { jobs: [], invoicesRead: true, unreadable, notKnown: [] };

    const failed = new Set<string>();
    const part = async <T>(name: string, read: () => Promise<T>): Promise<T | null> => {
      try {
        return await read();
      } catch (err) {
        log.warn(err, "a part of the Money tab's facts could not be read", { part: name });
        failed.add(name);
        return null;
      }
    };

    // A few statements at a time (the pool has ten connections): the lines first, then the rest.
    const lines = await part(MONEY_PARTS.lines, async (): Promise<Lines> => {
      const [selling, buying, billing] = await Promise.all([
        sellingCostRepository.listByShipmentIds(companyId, ids),
        invoiceCostRepository.listByShipmentIds(companyId, ids),
        billingSettingsRepository.currenciesOf(companyId, ids),
      ]);
      return { selling, buying, billingCurrency: new Map(billing.map((b) => [b.shipmentId, b.billingCurrency])) };
    });
    const [invoices, estimates, headers] = await Promise.all([
      part(MONEY_PARTS.invoices, async (): Promise<Invoices> => {
        const [open, billedOn] = await Promise.all([invoiceRepository.listOpenInvoicesWithSources(ids, companyId), invoiceRepository.firstBilledOn(companyId, ids)]);
        return { open, billedOn };
      }),
      part(MONEY_PARTS.estimates, () => supplierInvoiceRepository.expectedLinesOfShipments(companyId, ids)),
      part(MONEY_PARTS.supplierInvoices, () => supplierInvoiceRepository.listOfShipments(companyId, ids)),
    ]);
    const [supplierInvoices, rates] = await Promise.all([
      headers
        ? part(MONEY_PARTS.supplierInvoices, async (): Promise<SupplierInvoices> => {
            if (!headers.length) return { invoices: [], lines: [], claims: [], suppliers: new Map() };
            // The invoices' live lines, on these jobs and any other (a refused invoice has none: they were taken off).
            const live = headers.filter((h) => h.status !== "refused").map((h) => h.id);
            const invoiceLines = (await Promise.all(chunks(live, IDS_PER_STATEMENT).map((batch) => supplierInvoiceRepository.costLinesOf(companyId, batch)))).flat();
            const supplierIds = [...new Set(headers.map((h) => h.supplierCustomerId ?? h.haulierId).filter((id): id is string => !!id))];
            const [claims, suppliers] = await Promise.all([
              part(MONEY_PARTS.claims, () => costClaims(companyId, [...new Set(invoiceLines.map((l) => l.shipmentId))], headers.map((h) => h.id))),
              part(MONEY_PARTS.terms, () => suppliersOf(supplierIds)),
            ]);
            return { invoices: headers, lines: invoiceLines, claims, suppliers };
          })
        : null,
      // Without the lines there is nothing to total.
      lines ? part(MONEY_PARTS.rates, () => this.rates(ids, lines, invoices, jobDates)) : null,
    ]);

    const jobs = operationsMoneyJobs({
      shipmentIds: ids,
      today: businessDay(new Date()),
      lines,
      invoices,
      supplierInvoices,
      estimates,
      rates: rates?.rates ?? new Map(),
      noRates: rates?.noRates ?? new Map(),
      staleRates: rates?.staleRates ?? new Set(),
    });
    return { jobs, invoicesRead: invoices !== null, unreadable, notKnown: Object.values(MONEY_PARTS).filter((name) => failed.has(name)) };
  }

  /**
   * The ČNB rates each job is valued at, as its Costs Breakdown would show them - asked of fx's read that fixes
   * nothing (fx `_internalFxJobRatesRead`), and only for the jobs with an amount in another currency than CZK,
   * and only those currencies. A job fx could not value is not among the rates but in `noRates`, with why: its
   * rates are not fixed and its dates were not handed in ("not_fixed"), or it could not be read ("unreadable").
   * Its totals then name the currencies with no rate, and say which of the two it is.
   */
  private async rates(ids: string[], lines: Lines, invoices: Invoices | null, jobDates: OperationsMoneyJobDates[]): Promise<Pick<OperationsMoneyFacts, "rates" | "noRates" | "staleRates">> {
    const foreign = new Map<string, Set<string>>();
    const add = (shipmentId: string, currency: string | null | undefined) => {
      if (!currency || currency === "CZK") return;
      foreign.set(shipmentId, (foreign.get(shipmentId) ?? new Set()).add(currency));
    };
    for (const r of lines.selling) add(r.shipmentId, r.currency);
    for (const r of lines.buying) {
      add(r.shipmentId, r.estCurrency);
      add(r.shipmentId, r.realCurrency);
    }
    for (const [shipmentId, currency] of lines.billingCurrency) add(shipmentId, currency);
    const need = ids.filter((id) => foreign.has(id));
    if (!need.length) return { rates: new Map(), noRates: new Map() };

    const datesOf = new Map(jobDates.map((d) => [d.shipmentId.trim().toLowerCase(), d]));
    const { jobs, notFixed, unreadable } = await fx._internalFxJobRatesRead({
      jobs: need.map((shipmentId) => {
        const d = datesOf.get(shipmentId);
        return {
          shipmentId,
          dates: d
            ? { tradeDirection: d.tradeDirection ?? "", estimatedArrival: d.estimatedArrival ?? null, estimatedDeparture: d.estimatedDeparture ?? null, actualArrival: d.actualArrival ?? null, actualDeparture: d.actualDeparture ?? null }
            : null,
          // An open invoice holds the job's fixed rates where they are; not known when the invoices could not be read.
          invoiced: invoices ? invoices.billedOn.has(shipmentId) : null,
        };
      }),
      currencies: [...new Set([...foreign.values()].flatMap((set) => [...set]))],
    });
    if (unreadable.length) log.warn("the Money tab: job rates not readable", { count: unreadable.length });
    const rates = new Map<string, CzkRates>(jobs.map((j) => [j.shipmentId, Object.fromEntries(j.rates.map((r) => [r.currency, r.rate]))]));
    const noRates = new Map<string, "not_fixed" | "unreadable">([...notFixed.map((id) => [id, "not_fixed"] as const), ...unreadable.map((id) => [id, "unreadable"] as const)]);
    // A job valued at the last old fixing because its date's fixing was not imported: its margin is stale, and says so (m20).
    const staleRates = new Set(jobs.filter((j) => j.ratesMissing).map((j) => j.shipmentId));
    return { rates, noRates, staleRates };
  }
}

export const operationsMoneyService = new OperationsMoneyService();
