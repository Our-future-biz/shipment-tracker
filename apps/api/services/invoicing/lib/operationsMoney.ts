// The money facts of a job as Shipments → Managers' Money tab reads them (Council Outlay 11, step 4), put
// together from rows already read. Pure, so every rule is tested on its own. The rules themselves are the
// ones the app has: work not yet invoiced is lib/receivables' unbilledOf, the totals are lib/jobCostTotals
// (Costs Breakdown), a supplier invoice is counted as Accounts Payable counts it (lib/supplierInvoices and
// the rows of services/supplierInvoice). Money is never added across currencies: every amount names its own.
//
// A part that could not be read arrives as null and answers null (a figure) or nothing (a list) - never 0.

import { businessDay } from "../../../lib/businessDate";
import { chargeLabel, toChargeCode } from "../../../lib/chargeCodes";
import { round2 } from "./invoiceCalc";
import { jobCostTotals, type CostBuyRow, type CzkRates } from "./jobCostTotals";
import { unbilledOf } from "./receivables";
import { claimsOf, daysOverdue, dueDayOf, holdsPayment, lineAmount, sumByCurrency, type CostClaimLike } from "./supplierInvoices";
import type {
  MoneyAmount,
  OperationsMoneyEstimates,
  OperationsMoneyJob,
  OperationsMoneyLateInvoice,
  OperationsMoneyNotRecharged,
  OperationsMoneyRatesNote,
  OperationsMoneySupplierInvoices,
  OperationsMoneyTotals,
} from "../interfaces/interfaces";

/**
 * The charges a delay costs, which are sold on to whoever caused it: demurrage, detention, storage and waiting,
 * in every mode's own code (lib/chargeCodes) and the two older ones.
 */
export const RECHARGED_CHARGE_CODES: readonly string[] = [
  "container_demurrage",
  "container_detention",
  "truck_waiting",
  "container_storage",
  "waiting_time",
  "cfs_storage",
  "bb_terminal_storage",
  "air_storage",
  "rail_storage",
  "bonded_storage",
  "demurrage",
  "storage",
];

const RECHARGED = new Set(RECHARGED_CHARGE_CODES);

export interface MoneySellRow {
  id: string;
  shipmentId: string;
  category: string;
  qty: string | null;
  amount: string | null;
  currency: string;
  /** Ticked for Invoice */
  invoice: boolean;
  /** The buying row it was copied from */
  sourceBuyId: string | null;
}

export interface MoneyBuyRow extends CostBuyRow {
  id: string;
  shipmentId: string;
  category: string;
  supplierInvoiceId: string | null;
  createdAt: Date;
}

/** A supplier invoice, as much of its record as the counts need. */
export interface MoneySupplierInvoice {
  id: string;
  supplierCustomerId: string | null;
  haulierId: string | null;
  vendor: string;
  invoiceNumber: string;
  numberKey: string;
  kind: string;
  dueDate: string | null;
  receivedAt: Date | null;
  createdAt: Date;
  status: string;
  /** When a manager approved or refused it */
  decidedAt: Date | null;
  paidOn: string | null;
  refusedLines: readonly { table: string; ownerId: string }[];
}

/** What the Customer Database says of a supplier, as much as the counts need. */
export interface MoneySupplierFacts {
  companyName: string;
  paymentDays: number | null;
}

export interface OperationsMoneyFacts {
  /** The jobs asked about, each answered once, in this order */
  shipmentIds: readonly string[];
  /** The Prague business day the due days are judged on */
  today: string;
  /** Selling and cost lines with each job's billing currency; null = not read */
  lines: { selling: readonly MoneySellRow[]; buying: readonly MoneyBuyRow[]; billingCurrency: ReadonlyMap<string, string> } | null;
  /** The open customer invoices with the selling rows they bill, and the day each job was first invoiced; null = not read */
  invoices: { open: readonly { shipmentId: string; sourceSellingCostIds: readonly (string | null)[] }[]; billedOn: ReadonlyMap<string, string> } | null;
  /** The supplier invoices on the jobs with their live lines (on any job); null = not read */
  supplierInvoices: {
    invoices: readonly MoneySupplierInvoice[];
    lines: readonly MoneyBuyRow[];
    /** The cost claims on those invoices and their jobs; null = not read */
    claims: readonly CostClaimLike[] | null;
    /** The suppliers by their Customer Database id; null = not read */
    suppliers: ReadonlyMap<string, MoneySupplierFacts> | null;
  } | null;
  /** The estimates with no supplier invoice yet (Accounts Payable's Expected); null = not read */
  estimates: readonly MoneyBuyRow[] | null;
  /** Each job's ČNB rates (CZK per unit); a job not in it has none known, and only its CZK amounts can be totalled */
  rates: ReadonlyMap<string, CzkRates>;
  /**
   * Why a job is not in `rates`: its rates are not fixed and its dates were not handed in, or it could not be
   * read. A job in neither was not valued at all (fx did not answer): "unreadable".
   */
  noRates: ReadonlyMap<string, "not_fixed" | "unreadable">;
}

const byJob = <T extends { shipmentId: string }>(rows: readonly T[]): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const list = out.get(r.shipmentId);
    if (list) list.push(r);
    else out.set(r.shipmentId, [r]);
  }
  return out;
};

const realOf = (r: CostBuyRow) => lineAmount(r.realAmount, r.realQty);
const estimateOf = (r: CostBuyRow) => lineAmount(r.estAmount, r.estQty);
const hasValue = (r: Pick<MoneySellRow, "amount" | "qty">) => lineAmount(r.amount, r.qty) !== 0;

const NO_TOTALS: OperationsMoneyTotals = {
  sellingCzk: null,
  estimateCzk: null,
  realCzk: null,
  estimateOfRealCzk: null,
  realOfEstimatedCzk: null,
  costCzk: null,
  profitCzk: null,
  marginPct: null,
  missingCurrencies: [],
  ratesNote: "",
};

/**
 * Costs Breakdown's totals of one job in CZK at its own rates. Selling, cost and profit are lib/jobCostTotals as it
 * is; the estimate and the real cost so far are the same sum over one column each - and, to compare like with
 * like, over only the lines that have both. A figure whose amounts have a currency with no rate is null and the
 * currency is named - an amount is never taken at 1. `noRate` says why a currency has none when one is missing.
 */
export function moneyTotals(
  buying: readonly MoneyBuyRow[],
  selling: readonly MoneySellRow[],
  billingCurrency: string,
  rates: CzkRates,
  noRate: Exclude<OperationsMoneyRatesNote, ""> = "missing",
): OperationsMoneyTotals {
  const main = jobCostTotals([...buying], [...selling], billingCurrency || "CZK", rates, "CZK");
  // One column alone: the rows with a value in it, the other column left blank.
  const column = (rows: CostBuyRow[]) => jobCostTotals(rows, [], "CZK", rates, "CZK");
  const estimates = column(buying.filter((r) => estimateOf(r) !== 0).map((r) => ({ ...r, realAmount: null, realQty: null })));
  const reals = column(buying.filter((r) => realOf(r) !== 0).map((r) => ({ ...r, estAmount: null, estQty: null })));
  // The lines with both: what was estimated for them, and what they cost. One not known, the two can't be compared.
  const both = buying.filter((r) => estimateOf(r) !== 0 && realOf(r) !== 0);
  const estimateOfReal = column(both.map((r) => ({ ...r, realAmount: null, realQty: null }))).costCzk;
  const realOfEstimated = column(both.map((r) => ({ ...r, estAmount: null, estQty: null }))).costCzk;
  const comparable = estimateOfReal !== null && realOfEstimated !== null;
  const sold = main.revenueCzk;
  const missingCurrencies = [...new Set([...main.missingCurrencies, ...estimates.missingCurrencies, ...reals.missingCurrencies])].sort();
  return {
    sellingCzk: sold,
    estimateCzk: estimates.costCzk,
    realCzk: reals.costCzk,
    estimateOfRealCzk: comparable ? estimateOfReal : null,
    realOfEstimatedCzk: comparable ? realOfEstimated : null,
    costCzk: main.costCzk,
    profitCzk: main.profitCzk,
    marginPct: main.profitCzk !== null && sold ? round2((main.profitCzk / sold) * 100) : null,
    missingCurrencies,
    ratesNote: missingCurrencies.length ? noRate : "",
  };
}

/**
 * The delay charges bought on a job that no selling line sells on: a buy line of those codes with a value (its real
 * cost, its estimate until then), unless a valued selling line has the same charge code or was copied from it.
 * Per charge code and currency.
 */
export function notRechargedOf(buying: readonly MoneyBuyRow[], selling: readonly MoneySellRow[]): OperationsMoneyNotRecharged[] {
  const sold = selling.filter(hasValue);
  const soldCodes = new Set(sold.map((s) => toChargeCode(s.category)));
  const soldFrom = new Set(sold.map((s) => s.sourceBuyId).filter((id): id is string => !!id));
  const byCode = new Map<string, { amount: number; currency: string }[]>();
  for (const r of buying) {
    const code = toChargeCode(r.category);
    if (!RECHARGED.has(code) || soldCodes.has(code) || soldFrom.has(r.id)) continue;
    const real = realOf(r);
    const line = real ? { amount: real, currency: r.realCurrency || "CZK" } : { amount: estimateOf(r), currency: r.estCurrency || "CZK" };
    if (!line.amount) continue;
    byCode.set(code, [...(byCode.get(code) ?? []), line]);
  }
  return [...byCode.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([code, lines]) => sumByCurrency(lines).filter((a) => a.amount !== 0).map((a) => ({ ...a, code, label: chargeLabel(code) })));
}

/** The day a supplier invoice was booked, as Accounts Payable shows it: its first line's Received stamp, else when the record was made. */
const bookedOn = (h: Pick<MoneySupplierInvoice, "receivedAt" | "createdAt">) => businessDay(h.receivedAt ?? h.createdAt);

const supplierIdOf = (h: Pick<MoneySupplierInvoice, "supplierCustomerId" | "haulierId">) => h.supplierCustomerId ?? h.haulierId;

/** Whether a line is above its estimate, as Accounts Payable marks it: both amounts there, in one currency, the real one higher. */
const aboveEstimate = (l: CostBuyRow) =>
  l.estAmount !== null && l.realAmount !== null && l.estCurrency === l.realCurrency && Math.round((realOf(l) - estimateOf(l)) * 100) / 100 > 0.005;

/**
 * The supplier invoices of one job, counted as Accounts Payable counts its rows. `ownLines` are the invoices' live
 * lines on this job; `jobsOf` the jobs each invoice has a live line on (a claim typed before it could be tied to an
 * invoice disputes it by its number on one of them). `billedOn` is the day the job was first invoiced (null: not
 * invoiced; undefined: not known - then no invoice is said to have come after it). "After billing" is a later day
 * than that one: an invoice booked on the day itself is not listed (Accounts Payable's own mark counts that day too).
 */
export function supplierInvoicesOf(
  invoices: readonly MoneySupplierInvoice[],
  ownLines: readonly MoneyBuyRow[],
  jobsOf: ReadonlyMap<string, readonly string[]>,
  claims: readonly CostClaimLike[] | null,
  suppliers: ReadonlyMap<string, MoneySupplierFacts> | null,
  billedOn: string | null | undefined,
  today: string,
): OperationsMoneySupplierInvoices {
  const linesOf = new Map<string, MoneyBuyRow[]>();
  for (const l of ownLines) if (l.supplierInvoiceId) linesOf.set(l.supplierInvoiceId, [...(linesOf.get(l.supplierInvoiceId) ?? []), l]);
  const factsOf = (h: MoneySupplierInvoice) => {
    const id = supplierIdOf(h);
    return id ? (suppliers?.get(id) ?? null) : null;
  };
  const waiting = invoices.filter((h) => h.status === "booked");
  // An approved invoice's due day may hang on the supplier's payment days. Those not read, the invoices overdue by the
  // due day stored on them are counted all the same; only with none of them is "how many are overdue" not known.
  const owed = invoices.filter((h) => h.status === "approved" && !h.paidOn);
  const overdue = owed.filter((h) => daysOverdue(dueDayOf({ dueDate: h.dueDate, receivedAt: h.receivedAt ?? h.createdAt, kind: h.kind }, factsOf(h)?.paymentDays ?? null).due, today) > 0);
  const termsUnknown = suppliers === null && overdue.length === 0 && owed.some((h) => h.kind !== "credit_note" && !h.dueDate && !!supplierIdOf(h));

  const afterBilling: OperationsMoneyLateInvoice[] = [];
  if (billedOn) {
    for (const h of invoices) {
      // A refused invoice bills nothing any more, and a paid one is history.
      if (h.status === "refused" || h.paidOn || bookedOn(h) <= billedOn) continue;
      const lines = linesOf.get(h.id) ?? [];
      const above = lines.some(aboveEstimate);
      const billed = sumByCurrency(lines.filter((l) => l.realAmount !== null).map((l) => ({ amount: realOf(l), currency: l.realCurrency })));
      for (const a of billed) {
        afterBilling.push({ id: h.id, number: h.invoiceNumber, supplier: factsOf(h)?.companyName || h.vendor, bookedOn: bookedOn(h), currency: a.currency, amount: a.amount, aboveEstimate: above });
      }
    }
  }
  const refusals = invoices.filter((h) => h.status === "refused");
  const refusedDays = refusals.flatMap((h) => (h.decidedAt ? [businessDay(h.decidedAt)] : [])).sort();
  return {
    toApprove: waiting.length,
    refused: refusals.length,
    lastRefusedOn: refusedDays.at(-1) ?? null,
    claimed: claims === null ? null : invoices.filter((h) => holdsPayment(claimsOf({ id: h.id, numberKey: h.numberKey, shipmentIds: jobsOf.get(h.id) ?? [] }, claims))).length,
    approvedOverdue: termsUnknown ? null : overdue.length,
    oldestWaitingSince: waiting.length ? waiting.map(bookedOn).sort()[0]! : null,
    afterBilling: afterBilling.sort((a, b) => a.number.localeCompare(b.number) || a.currency.localeCompare(b.currency)),
  };
}

/** The estimates of one job with no supplier invoice yet: how many, since when, and what they come to per currency. */
export function estimatesOpenOf(lines: readonly MoneyBuyRow[]): OperationsMoneyEstimates {
  return {
    lines: lines.length,
    oldestSince: lines.length ? lines.map((l) => businessDay(l.createdAt)).sort()[0]! : null,
    amounts: sumByCurrency(lines.map((l) => ({ amount: estimateOf(l), currency: l.estCurrency }))).filter((a) => a.amount !== 0),
  };
}

/** The money facts of every job asked about, one entry each. */
export function operationsMoneyJobs(facts: OperationsMoneyFacts): OperationsMoneyJob[] {
  const selling = facts.lines ? byJob(facts.lines.selling) : null;
  const buying = facts.lines ? byJob(facts.lines.buying) : null;
  const open = facts.invoices ? byJob(facts.invoices.open) : null;
  const estimates = facts.estimates ? byJob(facts.estimates) : null;

  // Which invoices are on which job: by their live lines, and a refused one by the lines it keeps (they are off the job).
  const si = facts.supplierInvoices;
  const invoicesOfJob = new Map<string, Set<MoneySupplierInvoice>>();
  const liveJobsOf = new Map<string, string[]>();
  const invoiceLines = si ? byJob(si.lines.filter((l) => !!l.supplierInvoiceId)) : new Map<string, MoneyBuyRow[]>();
  if (si) {
    const byId = new Map(si.invoices.map((h) => [h.id, h]));
    const put = (shipmentId: string, h: MoneySupplierInvoice) => invoicesOfJob.set(shipmentId, (invoicesOfJob.get(shipmentId) ?? new Set()).add(h));
    for (const l of si.lines) {
      const h = l.supplierInvoiceId ? byId.get(l.supplierInvoiceId) : undefined;
      if (!h || h.status === "refused") continue;
      put(l.shipmentId, h);
      const jobs = liveJobsOf.get(h.id) ?? [];
      if (!jobs.includes(l.shipmentId)) liveJobsOf.set(h.id, [...jobs, l.shipmentId]);
    }
    for (const h of si.invoices) {
      if (h.status !== "refused") continue;
      for (const kept of h.refusedLines) if (kept.table === "invoice_cost") put(kept.ownerId, h);
    }
  }

  return facts.shipmentIds.map((shipmentId): OperationsMoneyJob => {
    const sells = selling ? (selling.get(shipmentId) ?? []) : null;
    const buys = buying ? (buying.get(shipmentId) ?? []) : null;
    const openInvoices = open ? (open.get(shipmentId) ?? []) : null;
    const unbilled = (rows: readonly MoneySellRow[]): MoneyAmount[] => (openInvoices ? unbilledOf(rows, openInvoices).amounts : []);
    return {
      shipmentId,
      notYetInvoiced: sells ? unbilled(sells) : [],
      untickedSelling: sells ? unbilled(sells.filter((r) => !r.invoice)) : [],
      sellingLines: sells ? sells.filter(hasValue).length : null,
      costLines: buys ? buys.filter((r) => realOf(r) !== 0 || estimateOf(r) !== 0).length : null,
      totals:
        sells && buys
          ? moneyTotals(
              buys,
              sells,
              facts.lines!.billingCurrency.get(shipmentId) || "CZK",
              facts.rates.get(shipmentId) ?? {},
              facts.rates.has(shipmentId) ? "missing" : (facts.noRates.get(shipmentId) ?? "unreadable"),
            )
          : NO_TOTALS,
      invoicedOn: facts.invoices ? (facts.invoices.billedOn.get(shipmentId) ?? null) : null,
      notRecharged: sells && buys ? notRechargedOf(buys, sells) : [],
      supplierInvoices: si
        ? supplierInvoicesOf(
            [...(invoicesOfJob.get(shipmentId) ?? [])],
            invoiceLines.get(shipmentId) ?? [],
            liveJobsOf,
            si.claims,
            si.suppliers,
            facts.invoices ? (facts.invoices.billedOn.get(shipmentId) ?? null) : undefined,
            facts.today,
          )
        : null,
      estimatesOpen: estimates ? estimatesOpenOf(estimates.get(shipmentId) ?? []) : null,
    };
  });
}
