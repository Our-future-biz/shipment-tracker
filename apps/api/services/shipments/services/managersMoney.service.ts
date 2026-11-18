import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { customers, fx, invoicing } from "~encore/clients";
import { addDays, businessDay } from "../../../lib/businessDate";
import type { ShipmentsManagersMoney } from "../interfaces/interfaces";
import { COCKPIT_JOB_LIMIT, COCKPIT_READS_AT_ONCE, MONEY_ANSWER_KEPT_MINUTES, MONEY_IDS_PER_CALL, MONEY_INVOICED_JOB_LIMIT, MONEY_INVOICED_LOOKBACK_DAYS } from "../lib/cockpitThresholds";
import { INVOICED_STATUS } from "../lib/jobNumber";
import {
  buildOpsMoney,
  currenciesWithoutRate,
  czkLabel,
  isInBilling,
  jobMoneyOf,
  moneyClaimsOf,
  moneyJobs,
  needsRates,
  statusChangesOf,
  type CustomerCredit,
  type CzkRates,
  type InvoicingJobDates,
  type InvoicingMoney,
  type JobMoney,
  type MoneyJob,
  type OpsMoneyInput,
} from "../lib/managersMoney";
import { readLimiter, type Limit } from "../lib/readLimiter";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { shipmentClaimRepository } from "../repositories/shipmentClaim.repository";
import { companyHolidays } from "./companyHolidays";
import { REPORTS_NOT_KNOWN, reportEmailsOf, type OpsCockpitFilters } from "./managersCockpit.service";
import { cockpitUsers } from "./managersCockpitTeam.service";

// The Money tab of Shipments → Managers: the company's active jobs as the cockpit reads them and
// the jobs that read Invoiced since lately (shipmentRepository.managersMoneyRows - the cockpit's
// own read is not touched), what Invoicing, Customers and this database say of their money,
// judged by the pure rules of lib/managersMoney on one `now`.
//
// It only reads, and asks only reads of the others: Invoicing's `_internalOperationsMoney` (no
// sync of supplier invoices, no locking of a job's rates - that endpoint's own promise),
// Customers' `_internalCustomerCreditFacts`, and fx's rates of today (GET /fx/rates) - the sheet
// the Sales managers' cockpit compares a credit limit with, and the one the CZK total of the
// work not yet invoiced is converted at.
//
// Per answer that is read: the jobs (one statement, with each job's customer), the users and the
// holidays (a call each), and then, through one limiter (lib/readLimiter, COCKPIT_READS_AT_ONCE
// at a time):
//   open cost claims      one statement
//   in Billing since      one statement of the history, for the active jobs in Billing only (none: no statement)
//   Invoicing             one call per MONEY_IDS_PER_CALL jobs (two at most: the active jobs and the invoiced
//                         ones are at most three thousand), one after the other - never both at once, so one
//                         answer does not hold most of Invoicing's connections - with the jobs' dates, so a job
//                         whose rates are not fixed is valued as its Costs Breakdown shows it (Invoicing asks
//                         fx's read that fixes nothing)
//   Customers' credit     one call per MONEY_IDS_PER_CALL customers, of the active jobs' customers
//   today's ČNB rates     one call, after those: only when work not yet invoiced stands in another currency
//                         than CZK, or a customer owes in another currency than its limit's
// Each part may fail on its own: it then gives no signal and no figure, and the answer names it
// (D29). The jobs themselves are the answer: without them it fails.
//
// The page asks every five minutes, and every manager with the same filters asks the same: the
// facts read whole are kept in memory for MONEY_ANSWER_KEPT_MINUTES per company, mode, direction
// and "My reports" (kept below). The Handled By filter is no part of what is read - the people
// line is counted before it - so it is applied when the answer is built: picking a person reads
// nothing. Facts that lack a part are answered from but not kept: the next ask tries again.

/** What the page shows after "Not known right now:" for a part that could not be read. */
export const MONEY_NOT_KNOWN = {
  invoicing: "Invoicing: selling, costs and supplier invoices",
  credit: "customers' credit",
  claims: "cost claims",
  billingSince: "since when a job is in Billing",
} as const;

/** A part that may fail without taking the answer with it: null when it did. */
async function part<T>(name: string, read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (err) {
    log.warn(err, "a part of Shipments → Managers' Money tab could not be read", { part: name });
    return null;
  }
}

function chunked<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// ─── The jobs ───────────────────────────────────────────────────

/** A job as the read hands it over: the cockpit's columns (but the arrival notice, which no money rule reads), its Invoicing Status and its linked customer. */
type MoneyRow = MoneyJob & { invoicingStatus: string; customerId: string | null };

interface JobsRead {
  /** The active jobs (at most COCKPIT_JOB_LIMIT) and after them the jobs that read Invoiced since lately (at most MONEY_INVOICED_JOB_LIMIT). */
  jobs: MoneyRow[];
  /** Which of them read Invoiced. */
  invoicedIds: Set<string>;
  /** There were more of either than are kept. */
  capped: boolean;
}

/**
 * One statement: the active jobs first, then the invoiced ones, each the newest first. One more
 * of each than is kept is asked for, so "capped" means some were left out - of either.
 */
async function moneyJobsRead(companyId: string, today: string): Promise<JobsRead> {
  const rows: MoneyRow[] = await shipmentRepository.managersMoneyRows(companyId, addDays(today, -MONEY_INVOICED_LOOKBACK_DAYS), COCKPIT_JOB_LIMIT + 1 + MONEY_INVOICED_JOB_LIMIT + 1);
  const isInvoiced = (row: MoneyRow) => row.invoicingStatus === INVOICED_STATUS;
  const active = rows.filter((r) => !isInvoiced(r));
  const invoiced = rows.filter(isInvoiced);
  const kept = invoiced.slice(0, MONEY_INVOICED_JOB_LIMIT);
  return {
    jobs: [...active.slice(0, COCKPIT_JOB_LIMIT), ...kept],
    invoicedIds: new Set(kept.map((r) => r.id)),
    capped: active.length > COCKPIT_JOB_LIMIT || invoiced.length > MONEY_INVOICED_JOB_LIMIT,
  };
}

// ─── Invoicing ──────────────────────────────────────────────────

interface InvoicingRead {
  byJob: Map<string, JobMoney>;
  /** What Invoicing itself could not read, in its own words after "Invoicing: ". */
  notKnown: string[];
}

/** The dates Invoicing values a job by while its ČNB rates are not fixed - as its Costs Breakdown shows it. Handing them over fixes nothing. */
const datesOf = (job: MoneyJob): InvoicingJobDates => ({
  shipmentId: job.id,
  tradeDirection: job.tradeDirection,
  estimatedArrival: job.estimatedArrival,
  estimatedDeparture: job.estimatedDeparture,
  actualArrival: job.actualArrival,
  actualDeparture: job.actualDeparture,
});

/**
 * What Invoicing says of the jobs. It fails as a whole when a call does, or answers with something
 * unreadable. Its calls go one after the other: each reads a handful of statements over two
 * thousand jobs, and two at once would take most of Invoicing's connections for one page.
 */
async function invoicingMoney(jobs: readonly MoneyJob[], run: Limit): Promise<InvoicingRead> {
  const answers: InvoicingMoney[] = [];
  for (const chunk of chunked(jobs, MONEY_IDS_PER_CALL)) {
    answers.push(await run(() => invoicing._internalOperationsMoney({ shipmentIds: chunk.map((j) => j.id), jobDates: chunk.map(datesOf) })));
  }
  const byJob = new Map<string, JobMoney>();
  const notKnown: string[] = [];
  for (const answer of answers) {
    if (!Array.isArray(answer?.jobs)) throw new Error("an unreadable answer from invoicing's operations-money");
    // A job Invoicing names as unreadable has no facts, whatever else it sent of it.
    const unreadable = new Set(answer.unreadable ?? []);
    // Invoicing's own word on its customer invoices: only a plain yes lets a job read "not invoiced".
    for (const job of answer.jobs) if (!unreadable.has(job.shipmentId)) byJob.set(job.shipmentId, jobMoneyOf(job, answer.invoicesRead === true));
    for (const gap of answer.notKnown ?? []) notKnown.push(/^invoicing\b/i.test(gap) ? gap : `Invoicing: ${gap}`);
  }
  return { byJob, notKnown: [...new Set(notKnown)] };
}

// ─── Customers' credit, today's rates ─────────────────────────────────────

/** What the customers owe, by customer id: one call per MONEY_IDS_PER_CALL of them, none for none. */
async function customersCredit(customerIds: readonly string[], run: Limit): Promise<Map<string, CustomerCredit>> {
  const answers = await Promise.all(chunked(customerIds, MONEY_IDS_PER_CALL).map((chunk) => run(() => customers._internalCustomerCreditFacts({ customerIds: chunk }))));
  return new Map<string, CustomerCredit>(answers.flatMap((a) => a.customers).map((c) => [c.customerId, c]));
}

/** Today's ČNB sheet: CZK per unit of each currency, and the day of the fixing it holds (null: not said). */
async function todaysRates(run: Limit): Promise<{ rates: Record<string, number>; day: string | null }> {
  const sheet = await run(() => fx.fxRatesOn({}));
  return { rates: Object.fromEntries(sheet.rates.filter((r) => r.rate > 0).map((r) => [r.currency, r.rate])), day: sheet.fixingDate ?? sheet.date ?? null };
}

// ─── The answer ──────────────────────────────────────────────────

/** The filters the facts are read for: everything but Handled By, which narrows nothing that is read. */
type MoneyScope = Pick<OpsCockpitFilters, "mode" | "direction" | "reports" | "userId">;

/** The facts as read - everything an answer is built from but the Handled By filter - and whether all of them were: only whole ones are worth keeping. */
interface MoneyRead {
  facts: Omit<OpsMoneyInput, "handledBy">;
  whole: boolean;
}

async function readMoney(companyId: string, filters: MoneyScope, now: Date): Promise<MoneyRead> {
  const today = businessDay(now);
  const [{ jobs, invoicedIds, capped }, users, uploaded] = await Promise.all([moneyJobsRead(companyId, today), cockpitUsers(), companyHolidays(companyId, today)]);
  // As the cockpit: who reports to whom is the users' to say, and an empty page would read as "nobody has anything".
  if (filters.reports === "mine" && !users) throw APIError.unavailable(REPORTS_NOT_KNOWN);
  const userEmails = users && new Set(users.map((u) => u.email));
  const reportEmails = reportEmailsOf(users, filters.userId);
  // The facts are read for the jobs of the mode, the direction and "My reports": the people line counts them all.
  const asked = moneyJobs(jobs, { mode: filters.mode, direction: filters.direction, reports: filters.reports, reportEmails, userEmails });
  const ids = asked.map((j) => j.id);
  // Credit, and since when a job is in Billing, are asked of the active jobs alone: no rule says them of an invoiced one.
  const active = asked.filter((j) => !invoicedIds.has(j.id));
  const customerIds = [...new Set(active.flatMap((j) => (j.customerId ? [j.customerId] : [])))];
  const inBilling = active.filter(isInBilling).map((j) => j.id);

  // Every statement and call from here on goes through the one limiter, in the order it is asked for.
  const run = readLimiter(COCKPIT_READS_AT_ONCE);
  const [money, credit, claims, statusChanges] = await Promise.all([
    part(MONEY_NOT_KNOWN.invoicing, () => invoicingMoney(asked, run)),
    part(MONEY_NOT_KNOWN.credit, () => customersCredit(customerIds, run)),
    part(MONEY_NOT_KNOWN.claims, () => run(() => shipmentClaimRepository.openCostClaimsByShipmentIds(companyId, ids))),
    part(MONEY_NOT_KNOWN.billingSince, () => run(() => shipmentAuditRepository.latestByShipmentIds(companyId, [{ fields: ["status"], shipmentIds: inBilling }]))),
  ]);

  // Today's sheet is asked for once, and only when something stands in another currency: work not
  // yet invoiced (for its one CZK total), or what a customer owes against a limit in another one.
  const unbilled = active.flatMap((j) => money?.byJob.get(j.id)?.notYetInvoiced ?? []);
  const ratesNeeded = currenciesWithoutRate(unbilled, null).length > 0 || (!!credit && [...credit.values()].some(needsRates));
  const sheet = ratesNeeded ? await part("today's ČNB rates", () => todaysRates(run)) : null;
  // Without the sheet there is no rate in it: a figure only for what is all in CZK - which names no rate (lib czkTotalOf).
  const czk: CzkRates = { rates: sheet?.rates ?? {}, label: czkLabel(sheet?.day ?? today) };

  const facts: MoneyRead["facts"] = {
    jobs,
    invoicedIds,
    invoicing: money?.byJob ?? null,
    customerOf: new Map(jobs.map((j) => [j.id, j.customerId ?? null])),
    credit,
    creditRates: sheet?.rates ?? null,
    claims: claims && moneyClaimsOf(claims),
    statusChangedAt: statusChanges && statusChangesOf(statusChanges),
    czk,
    userEmails,
    holidays: uploaded ?? [],
    holidaysKnown: uploaded !== null,
    notKnown: [
      ...(money ? money.notKnown : [MONEY_NOT_KNOWN.invoicing]),
      ...(credit ? [] : [MONEY_NOT_KNOWN.credit]),
      ...(claims ? [] : [MONEY_NOT_KNOWN.claims]),
      ...(statusChanges ? [] : [MONEY_NOT_KNOWN.billingSince]),
    ],
    capped,
    mode: filters.mode,
    direction: filters.direction,
    reports: filters.reports,
    reportEmails,
    now,
  };
  // Whole: every part read, every job answered by Invoicing, the rates read where they were needed, the holidays known.
  const whole = !!money && money.notKnown.length === 0 && ids.every((id) => money.byJob.has(id)) && !!credit && !(ratesNeeded && !sheet) && !!claims && !!statusChanges && uploaded !== null;
  return { facts, whole };
}

// The facts as last read whole, and when (the `now` they were read on), per company and scope.
// Kept per process: two instances of the API each keep their own, which costs a read each and
// nothing else. An entry past its minutes is dropped when the next facts are read.
const kept = new Map<string, { at: number; read: Promise<MoneyRead> }>();
const KEPT_MS = MONEY_ANSWER_KEPT_MINUTES * 60_000;

/** Forgets everything kept: the next ask reads. For the tests, which read one company many ways. */
export const forgetMoneyAnswers = (): void => kept.clear();

/** One key per company and scope. "My reports" is the caller's own: it is kept per user; everything else is the same for every manager. */
const keyOf = (companyId: string, scope: MoneyScope): string => JSON.stringify([companyId, scope.mode, scope.direction, scope.reports, scope.reports === "mine" ? scope.userId : ""]);

class ManagersMoneyService {
  /**
   * The Money tab's answer. Facts read whole within the last MONEY_ANSWER_KEPT_MINUTES for the
   * same company, mode, direction and "My reports" are answered from: nothing is read (`asOf`
   * says how old they are), whichever Handled By is asked for. Facts that lack a part - or a read
   * that failed - are not kept. Two asks at the same moment share one read.
   */
  async money(companyId: string, filters: OpsCockpitFilters, now = new Date()): Promise<ShipmentsManagersMoney> {
    const key = keyOf(companyId, filters);
    const last = kept.get(key);
    const age = last ? now.getTime() - last.at : -1;
    let read = last && age >= 0 && age < KEPT_MS ? last.read : null;
    if (!read) {
      for (const [k, entry] of kept) if (now.getTime() - entry.at >= KEPT_MS) kept.delete(k);
      const fresh = readMoney(companyId, filters, now);
      kept.set(key, { at: now.getTime(), read: fresh });
      // Not whole, or not read at all: not kept - unless a newer read has taken its place meanwhile.
      const forget = () => {
        if (kept.get(key)?.read === fresh) kept.delete(key);
      };
      fresh.then((r) => r.whole || forget(), forget);
      read = fresh;
    }
    // The one filter that is applied here: the tiles and cards are narrowed, the people line is not.
    return buildOpsMoney({ ...(await read).facts, handledBy: filters.handledBy });
  }
}

export const managersMoneyService = new ManagersMoneyService();
