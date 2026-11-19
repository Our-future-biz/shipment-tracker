import { businessDay, isRealYmd } from "../../../lib/businessDate";
import { cockpitCard, rankRow, type CockpitSignal, type RankedRow } from "../../../lib/cockpit";
import type {
  OperationsMoney,
  OperationsMoneyJob,
  OperationsMoneyJobDates,
  OperationsMoneyLateInvoice,
  OperationsMoneySupplierInvoices,
  OperationsMoneyTotals,
} from "../../invoicing/interfaces/interfaces";
import type {
  MoneyAmount,
  OpsCockpitDirection,
  OpsCockpitMode,
  OpsCockpitReports,
  OpsMoneyPerson,
  OpsMoneyRow,
  OpsMoneyTiles,
  ShipmentsManagersMoney,
} from "../interfaces/interfaces";
import {
  COCKPIT_LIST_LIMIT,
  MONEY_ACCRUAL_DAYS,
  MONEY_ACCRUAL_URGENT_DAYS,
  MONEY_COST_AFTER_BILLING_DAYS,
  MONEY_COST_CLAIM_DAYS,
  MONEY_COST_CLAIM_URGENT_DAYS,
  MONEY_COST_OVER_ESTIMATE_CZK,
  MONEY_COST_OVER_ESTIMATE_PCT,
  MONEY_IN_BILLING_WORKING_DAYS,
  MONEY_MARGIN_LOW_PCT,
  MONEY_PROFIT_LOW_CZK,
  MONEY_REFUSED_DAYS,
  MONEY_SUPPLIER_INVOICE_WAITING_WORKING_DAYS,
  MONEY_TAG_NAMES,
} from "./cockpitThresholds";
import { byActiveThenEmail, handledByFilter, inDirection, inMode, isHandledBy, isOfReports, isUnbilledArrival, modeOf, unbilledTaxDate, type OpsCockpitJob } from "./managersCockpit";
import { waitedWorkingDays } from "./managersCockpitExtra";
import { personEmail } from "./shipmentEditRule";
import { workingDaysSince } from "./trackingAttention";
import { TAX_DATE_LATE_DAYS } from "./trackingThresholds";

// The Money tab of Shipments → Managers (Council Outlay 11, step 4: D15, D24-D27): what the money
// of the company's active jobs asks of a manager, worked out from what Invoicing says of each job
// (selling, costs, supplier invoices), what the customers owe, the open cost claims and since
// when a job has stood in Billing. Pure: no database, no Encore; tested in
// tests/managersMoney.test.ts. The reads are services/managersMoney.service.
//
//   the jobs   the cockpit's own - active (not Invoiced, not cancelled), of the chosen mode,
//              direction, "My reports" and Handled By, by the cockpit's own filters - and the jobs
//              that read Invoiced since lately (cockpitThresholds MONEY_INVOICED_LOOKBACK_DAYS),
//              which only the rules ABOUT invoiced jobs speak of: a loss, a supplier invoice
//              after billing, estimates nobody invoiced, supplier invoices, cost claims, what was
//              not recharged - never credit, "not invoiced" or a line not ticked
//   cards      a job appears once, with all its money tags: in URGENT when any is urgent
//   tiles      work not yet invoiced per currency, and how many rows carry each signal family
//   people     per Handled By, over the same jobs before the Handled By filter; no ranking (D27)
//
// D24: an amount is never added to one of another currency. Sums are per currency; a tag that
// has amounts in several lists them side by side. The ONE place currencies are added is the CZK
// total of "work not yet invoiced" (czkTotalOf), at today's ČNB rates and labelled so. Profit and margin are Costs Breakdown's own
// figures, in CZK at the job's rates, as Invoicing hands them over: with a rate missing the
// margin is not known - no margin tag, and the job is counted in `marginNotKnown`.
//
// D29: a fact that could not be read gives no signal and no figure - null, never 0 - and is
// named in `notKnown`.

// ─── What Invoicing says of a job ────────────────────────────────────────
// The answer of invoicing `_internalOperationsMoney`, by Invoicing's own types (type-only: the two
// services share no code). Invoicing reads its families one by one; one it could not read is
// named in `notKnown` and leaves its figures null or empty for every job - never a 0 that isn't.

/** The whole answer: the jobs, the ids that could not be read, and the families Invoicing could not read, in its own words. */
export type InvoicingMoney = OperationsMoney;
/** One job of it. */
export type InvoicingMoneyJob = OperationsMoneyJob;
/** A job's dates as the call hands them over: what chooses the ČNB rates of a job whose rates are not fixed yet (nothing is fixed by asking). */
export type InvoicingJobDates = OperationsMoneyJobDates;
/**
 * Costs Breakdown's totals in CZK, as the rules read them: profit and margin; the estimates and
 * the real costs of the buy lines that have BOTH (like for like: what the real costs came to
 * against what was estimated for the same lines); and why a figure is missing (`ratesNote`).
 */
export type InvoicingMoneyTotals = Pick<OperationsMoneyTotals, "profitCzk" | "marginPct" | "estimateOfRealCzk" | "realOfEstimatedCzk" | "ratesNote" | "missingCurrencies">;
/** A supplier invoice booked after the day the job was first invoiced: what it bills on the job in one currency (an invoice in two has two entries). */
export type InvoicingAfterBilling = OperationsMoneyLateInvoice;
/** The job's supplier invoices, counted as Accounts Payable counts them; `claimed` and `approvedOverdue` are null when not known. */
export type InvoicingSupplierInvoices = OperationsMoneySupplierInvoices;
/** Estimated buy lines with no supplier invoice yet. */
export type InvoicingEstimatesOpen = NonNullable<OperationsMoneyJob["estimatesOpen"]>;

/**
 * What is known of one job's money: Invoicing's answer with every fact that was not read as null,
 * never as nothing (D29) - the shape the rules below read.
 */
export interface JobMoney {
  /** The work not yet invoiced - valued selling lines on no open invoice - per currency; null when the lines or the customer invoices were not read. */
  notYetInvoiced: MoneyAmount[] | null;
  untickedSelling: MoneyAmount[] | null;
  sellingLines: number | null;
  costLines: number | null;
  totals: InvoicingMoneyTotals;
  /** Whether Invoicing read the customer invoices: without them no supplier invoice is said to have come after billing. */
  invoicesRead: boolean;
  notRecharged: (MoneyAmount & { code: string; label: string })[] | null;
  supplierInvoices: InvoicingSupplierInvoices | null;
  estimatesOpen: InvoicingEstimatesOpen | null;
}

/**
 * One job of Invoicing's answer as the rules read it. `invoicesRead`: the answer's own word on
 * whether it read the customer invoices (its `invoicesRead`) - the one family whose absence does
 * not show in the job: the work not yet invoiced is empty either way.
 */
export function jobMoneyOf(job: InvoicingMoneyJob, invoicesRead: boolean): JobMoney {
  const sellingLines = job.sellingLines ?? null;
  const costLines = job.costLines ?? null;
  const linesRead = sellingLines !== null && costLines !== null;
  return {
    notYetInvoiced: linesRead && invoicesRead ? (job.notYetInvoiced ?? []) : null,
    untickedSelling: linesRead && invoicesRead ? (job.untickedSelling ?? []) : null,
    sellingLines,
    costLines,
    totals: {
      profitCzk: job.totals?.profitCzk ?? null,
      marginPct: job.totals?.marginPct ?? null,
      estimateOfRealCzk: job.totals?.estimateOfRealCzk ?? null,
      realOfEstimatedCzk: job.totals?.realOfEstimatedCzk ?? null,
      ratesNote: job.totals?.ratesNote ?? "",
      missingCurrencies: job.totals?.missingCurrencies ?? [],
    },
    invoicesRead,
    notRecharged: linesRead ? (job.notRecharged ?? []) : null,
    supplierInvoices: job.supplierInvoices ?? null,
    estimatesOpen: job.estimatesOpen ?? null,
  };
}

// ─── The other facts ───────────────────────────────────────────────

/** What a customer owes, as customers `_internalCustomerCreditFacts` tells it. */
export interface CustomerCredit {
  /** 0 = no limit set. */
  creditLimit: number;
  currency: string;
  unpaid: readonly MoneyAmount[];
  overdueCount: number;
}

/** An open claim on costs of a job. */
export interface MoneyClaim {
  createdAt: Date;
  /** The claimed amount; null when none was typed. */
  amount: number | null;
  /** "" when none was typed. */
  currency: string;
}

/** An open claim on costs as repositories/shipmentClaim.repository openCostClaimsByShipmentIds reads it. */
export interface OpenCostClaimRow {
  shipmentId: string;
  createdAt: Date;
  claimAmount: string | null;
  claimCurrency: string;
  supplierInvoiceId: string | null;
  supplier: string;
  invoiceNumber: string;
  reason: string;
  /** The disputed amount as it was typed before claims had a number and a currency. */
  amount: string;
  note: string;
}

/**
 * The open cost claims by job, the oldest first as read. A row freshly added with "+" and never
 * filled in is no claim yet (as the shipment's own "Claim" field reads it: repositories/
 * shipmentClaim.repository syncShipmentFlag) and is left out.
 */
export function moneyClaimsOf(rows: readonly OpenCostClaimRow[]): Map<string, MoneyClaim[]> {
  const byJob = new Map<string, MoneyClaim[]>();
  for (const row of rows) {
    const filled = !!row.supplierInvoiceId || row.claimAmount !== null || [row.supplier, row.invoiceNumber, row.reason, row.amount, row.note, row.claimCurrency].some((v) => (v ?? "").trim() !== "");
    if (!filled) continue;
    const amount = row.claimAmount === null ? null : Number(row.claimAmount);
    const claim: MoneyClaim = { createdAt: row.createdAt, amount: amount !== null && Number.isFinite(amount) ? amount : null, currency: (row.claimCurrency ?? "").trim().toUpperCase() };
    byJob.set(row.shipmentId, [...(byJob.get(row.shipmentId) ?? []), claim]);
  }
  return byJob;
}

/** Rates to convert into CZK with, and the words that say which they are. */
export interface CzkRates {
  /** CZK per 1 unit of a currency. */
  rates: Readonly<Record<string, number>>;
  /** What the page writes beside a figure converted with them: "at today's ČNB rate (18.11.)" (czkLabel). */
  label: string;
}

export interface OpsMoneyInput {
  /** The company's active jobs, as the cockpit reads them - and the jobs that read Invoicing Status "Invoiced" since lately. */
  jobs: readonly MoneyJob[];
  /** Which of `jobs` read Invoiced: no active jobs - only the rules about invoiced jobs speak of them, and no "work not yet invoiced" counts them. */
  invoicedIds: ReadonlySet<string>;
  /** What Invoicing says, by shipment id (jobMoneyOf); null when it could not be asked. A job with no entry was not read. */
  invoicing: ReadonlyMap<string, JobMoney> | null;
  /** Each job's linked customer (null: none linked), by shipment id; null when it could not be read. */
  customerOf: ReadonlyMap<string, string | null> | null;
  /** What the customers owe, by customer id; null when it could not be read. A customer with no entry was not found. */
  credit: ReadonlyMap<string, CustomerCredit> | null;
  /**
   * Today's ČNB rates, CZK per unit, for comparing what a customer owes with a limit in another currency; null when
   * not read - then no limit is said to lack a rate on them: the reads name the sheet itself when it was needed.
   */
  creditRates: Readonly<Record<string, number>> | null;
  /** The open cost claims, by shipment id (a job with none has no entry); null when they could not be read. */
  claims: ReadonlyMap<string, readonly MoneyClaim[]> | null;
  /** The last change of status of the jobs in Billing, by shipment id (statusChangesOf - no entry: it never changed); null when the history could not be read. */
  statusChangedAt: ReadonlyMap<string, StatusChange> | null;
  /**
   * Today's ČNB rates and their label, for the one CZK figure of "work not yet invoiced". Null when they were not
   * read: then only what is all in CZK has a figure, and no currency is said to have no rate - the reads name the
   * sheet itself when it was needed.
   */
  czk: CzkRates | null;
  /** The e-mails of the company's active users, trimmed and lower-cased; null when they could not be read. */
  userEmails: ReadonlySet<string> | null;
  /** The company's own days off; [] when they could not be read. */
  holidays: readonly string[];
  holidaysKnown: boolean;
  /** What the reads could not tell, in the words the page shows. This file adds what it finds missing in the facts it was handed. */
  notKnown: readonly string[];
  capped: boolean;
  mode: OpsCockpitMode;
  direction: OpsCockpitDirection;
  /** An e-mail, "nobody", or null for everyone. */
  handledBy: string | null;
  reports: OpsCockpitReports;
  /** The e-mails of the users who report to the caller; read only for "mine". */
  reportEmails: ReadonlySet<string> | null;
  now: Date;
}

// ─── Words ─────────────────────────────────────────────────────

const DAY = 86_400_000;
/** U+2212: a minus as wide as a plus, so figures line up. */
const MINUS = "−";
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** Calendar days from `from` to `to` (YYYY-MM-DD), negative when `to` is earlier. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
/** "19.11." of a YYYY-MM-DD day. */
const dm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}.`;
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** The Prague day of what another service sends as a day ("2026-11-13") or a moment (an ISO text); null for neither. */
export function dayOfStamp(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  if (DAY_ONLY.test(text)) return isRealYmd(text) ? text : null;
  const at = text ? new Date(text) : null;
  return at && Number.isFinite(at.getTime()) ? businessDay(at) : null;
}

/** A figure with its thousands apart and `decimals` decimals, without its sign. */
function grouped(value: number, decimals: 0 | 2): string {
  const [whole, cents] = Math.abs(value).toFixed(decimals).split(".");
  const apart = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cents ? `${apart}.${cents}` : apart;
}

/** "1,450.00 EUR": thousands apart, two decimals, the currency after the number; "−320.00 EUR" below zero. */
export function moneyText(amount: number, currency: string): string {
  const cents = Math.round(amount * 100);
  return `${cents < 0 ? MINUS : ""}${grouped(cents / 100, 2)} ${currency}`;
}

/** "4,210 CZK", "−4,210 CZK": whole crowns, as margins are read. A figure under one crown keeps its hellers ("−0.40 CZK"). */
export function czkText(amount: number): string {
  const whole = Math.round(amount);
  if (whole === 0 && Math.round(amount * 100) !== 0) return moneyText(amount, "CZK");
  return `${whole < 0 ? MINUS : ""}${grouped(whole, 0)} CZK`;
}

/** "3.2 %", "−1.5 %": one decimal. */
export function percentText(percent: number): string {
  const tenths = Math.round(percent * 10);
  return `${tenths < 0 ? MINUS : ""}${(Math.abs(tenths) / 10).toFixed(1)} %`;
}

/** The amounts that are not nothing. */
const valued = (amounts: readonly MoneyAmount[]): MoneyAmount[] => amounts.filter((a) => Math.round(a.amount * 100) !== 0);

/**
 * Amounts summed PER CURRENCY (D24: never across), counted in cents, by currency code; a
 * currency whose sum is nothing is left out.
 */
export function perCurrency(amounts: readonly MoneyAmount[]): MoneyAmount[] {
  const cents = new Map<string, number>();
  for (const a of amounts) {
    const currency = a.currency.trim().toUpperCase();
    cents.set(currency, (cents.get(currency) ?? 0) + Math.round(a.amount * 100));
  }
  return [...cents]
    .filter(([, sum]) => sum !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, sum]) => ({ currency, amount: sum / 100 }));
}

/** "1,450.00 EUR, 3,200.00 CZK": each currency by itself, side by side - never one sum. */
export const amountsText = (amounts: readonly MoneyAmount[]): string =>
  perCurrency(amounts)
    .map((a) => moneyText(a.amount, a.currency))
    .join(", ");

/** CZK per 1 unit of a currency: 1 for CZK itself, null when `rates` has none for it. */
const rateOf = (currency: string, rates: Readonly<Record<string, number>> | null): number | null => {
  if (currency === "CZK") return 1;
  const rate = rates?.[currency];
  return typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
};

/** The label of a figure converted at the ČNB rates of `day` (YYYY-MM-DD): "at today's ČNB rate (18.11.)". */
export const czkLabel = (day: string): string => `at today's ČNB rate (${dm(day)})`;

/** The currencies among `amounts` that `czk` has no rate for. CZK needs none. */
export function currenciesWithoutRate(amounts: readonly MoneyAmount[], czk: CzkRates | null): string[] {
  return perCurrency(amounts)
    .map((a) => a.currency)
    .filter((currency) => currency !== "CZK" && rateOf(currency, czk?.rates ?? null) === null);
}

/**
 * The one CZK figure of amounts in several currencies - the ONLY place currencies are added
 * (D24) - at the rates handed in, with their label. Null when any currency has no rate (never a
 * sum that leaves something out), and when there are no rates to name at all. When every amount
 * is in CZK already - or there is none - no rate is used: the label is "" (nothing was converted,
 * and the page shows no CZK line beside the one CZK chip), whatever rates there are.
 */
export function czkTotalOf(amounts: readonly MoneyAmount[], czk: CzkRates | null): { amount: number; label: string } | null {
  const sums = perCurrency(amounts);
  const converted = sums.some((a) => a.currency !== "CZK");
  if (converted && (!czk || currenciesWithoutRate(amounts, czk).length > 0)) return null;
  const total = sums.reduce((sum, a) => sum + a.amount * rateOf(a.currency, czk?.rates ?? null)!, 0);
  return { amount: Math.round(total * 100) / 100, label: converted ? czk!.label : "" };
}

// ─── Signals ───────────────────────────────────────────────────

/** The families of the money signals: the stable keys the Money tab's tiles narrow its cards by. */
export const MONEY_SIGNAL_KINDS = ["margin", "not_invoiced", "unticked", "cost_after_billing", "accrual", "supplier_invoice", "cost_claim", "credit", "not_recharged"] as const;
export type MoneyKind = (typeof MONEY_SIGNAL_KINDS)[number];

export interface MoneySignal extends CockpitSignal {
  kind: MoneyKind;
}
const urgent = (rank: number, kind: MoneyKind, text: string): MoneySignal => ({ rank, text, urgent: true, kind });
const attention = (rank: number, kind: MoneyKind, text: string): MoneySignal => ({ rank, text, urgent: false, kind });

// On the cockpit's scale (lib/managersCockpit OPS_RANK), lower first. URGENT 20-29, so the money
// signals sort among themselves: a release that is due today before money that is already lost,
// then what grows by the day. ATTENTION 300-399: what waits for an invoice, the margin, the
// suppliers' side, the customer's credit, and what was never charged on.
export const MONEY_RANK = {
  creditReleaseDue: 20,
  loss: 21,
  costAfterBillingAbove: 22,
  supplierInvoiceOverdue: 23,
  notInvoicedLate: 24,
  accrualLate: 25,
  costClaimOld: 26,
  // ATTENTION
  notInvoiced: 300,
  inBilling: 302,
  unticked: 304,
  marginLow: 310,
  costOverEstimate: 312,
  costsNoSelling: 314,
  costAfterBilling: 320,
  supplierInvoiceToApprove: 330,
  supplierInvoiceRefused: 332,
  supplierInvoiceClaimed: 334,
  accrual: 340,
  costClaim: 350,
  creditOverLimit: 360,
  creditOverdue: 362,
  notRecharged: 370,
} as const;

/** A job as the Money tab reads it (repositories/shipment.repository managersMoneyRows): the cockpit's columns but the one no money rule reads. */
export type MoneyJob = Omit<OpsCockpitJob, "arrivalNoticeSent">;

type RuleJob = Pick<
  OpsCockpitJob,
  "status" | "tradeDirection" | "department" | "actualArrival" | "actualDeparture" | "actualDeliveryDate" | "houseBolRelease" | "warehouseReleasedDate" | "createdAt"
>;

/** Whether the job stands in a Billing status ("Billing […]", "Billed […]"): read as isUnbilledArrival reads it, so a job is on one side of that rule or the other. */
export const isInBilling = (job: Pick<OpsCockpitJob, "status">): boolean => job.status.toLowerCase().startsWith("bill");

/**
 * Whether the job is "billed" for the rules that turn on it (a loss, estimates nobody invoiced):
 * it reads Invoiced (`readsInvoiced`: it is no active job), or it is an active job in a Billing
 * status. Not "it has some open invoice": a job invoiced in advance that has not left yet is
 * still being worked on.
 */
export const isBilled = (job: Pick<OpsCockpitJob, "status">, readsInvoiced: boolean): boolean => readsInvoiced || isInBilling(job);

/** Whether the job's margin could not be worked out: its lines were read, it has some, and there is no profit figure - a rate is missing, or the job's rates could not be had. */
export const isMarginNotKnown = (money: Pick<JobMoney, "totals" | "sellingLines" | "costLines">): boolean =>
  money.totals.profitCzk === null && money.sellingLines !== null && money.costLines !== null && money.sellingLines + money.costLines > 0;

/** `margin`, URGENT: a loss - a profit under nothing, by Costs Breakdown's own figure - on a job that is billed (isBilled). The one margin rule said of a job that reads Invoiced. */
export function lossSignals(money: Pick<JobMoney, "totals">, billed: boolean): MoneySignal[] {
  const { profitCzk } = money.totals;
  return profitCzk !== null && profitCzk < 0 && billed ? [urgent(MONEY_RANK.loss, "margin", `Loss ${czkText(profitCzk)}`)] : [];
}

/**
 * `margin`, from Costs Breakdown's own figures in CZK:
 *  - URGENT: a loss on a job that is billed (isBilled);
 *  - otherwise, on a job with selling lines: a margin under MONEY_MARGIN_LOW_PCT per cent or a
 *    profit under MONEY_PROFIT_LOW_CZK;
 *  - the real costs above their estimates - like for like: over the buy lines that have both -
 *    by more than MONEY_COST_OVER_ESTIMATE_PCT per cent AND more than MONEY_COST_OVER_ESTIMATE_CZK;
 *  - cost lines and no selling line (no figure needed: it is said with a rate missing too).
 * A figure that is not known (null: a rate is missing, or the lines were not read) gives no tag.
 */
export function marginSignals(money: Pick<JobMoney, "totals" | "sellingLines" | "costLines">, billed: boolean): MoneySignal[] {
  const out: MoneySignal[] = lossSignals(money, billed);
  const { profitCzk, marginPct, estimateOfRealCzk, realOfEstimatedCzk } = money.totals;
  if (profitCzk !== null && !out.length && money.sellingLines !== null && money.sellingLines > 0 && ((marginPct !== null && marginPct < MONEY_MARGIN_LOW_PCT) || profitCzk < MONEY_PROFIT_LOW_CZK)) {
    out.push(attention(MONEY_RANK.marginLow, "margin", marginPct !== null ? `Margin ${percentText(marginPct)} · profit ${czkText(profitCzk)}` : `Profit ${czkText(profitCzk)}`));
  }
  if (estimateOfRealCzk !== null && realOfEstimatedCzk !== null && estimateOfRealCzk > 0) {
    const over = realOfEstimatedCzk - estimateOfRealCzk;
    if (over > MONEY_COST_OVER_ESTIMATE_CZK && over > (estimateOfRealCzk * MONEY_COST_OVER_ESTIMATE_PCT) / 100) {
      out.push(attention(MONEY_RANK.costOverEstimate, "margin", `Real cost ${Math.round((over / estimateOfRealCzk) * 100)} % over estimate · +${czkText(over)}`));
    }
  }
  if (money.costLines !== null && money.costLines > 0 && money.sellingLines === 0) out.push(attention(MONEY_RANK.costsNoSelling, "margin", "Costs and no selling line"));
  return out;
}

/** Whether the status is a "Billed […]" one - the job is through billing - rather than "Billing […]". */
const isBilledStatus = (status: string): boolean => /^billed\b/i.test(status.trim());

/**
 * `not_invoiced`: a job in a Billing status for more than MONEY_IN_BILLING_WORKING_DAYS working
 * days with work left to bill - valued selling lines on no open invoice, whether or not some
 * invoice exists already - with what that work comes to, per currency. It waits on Invoicing, not
 * on the operator, and says so. A "Billed […]" status is worded as that. `since`: when the job
 * got its status; null when that is not known - then there is no tag. Nor is there one while the
 * work not yet invoiced is not known (null), or there is none.
 */
export function inBillingSignals(job: Pick<OpsCockpitJob, "status">, money: Pick<JobMoney, "notYetInvoiced">, since: Date | null, now: Date, holidays: readonly string[]): MoneySignal[] {
  const amounts = amountsText(money.notYetInvoiced ?? []);
  if (!isInBilling(job) || !amounts || !since) return [];
  if (!waitedWorkingDays(since, MONEY_IN_BILLING_WORKING_DAYS, now, holidays)) return [];
  return [attention(MONEY_RANK.inBilling, "not_invoiced", `${isBilledStatus(job.status) ? "Billed" : "In Billing"} since ${dm(businessDay(since))}, ${amounts} not invoiced · with Invoicing`)];
}

/** The newest change of a job's status, as its history tells it: what it set, and when. */
export interface StatusChange {
  status: string | null;
  at: Date;
}

/**
 * Since when a job has stood in its Billing status: the last change of its status, when that
 * change set the status it has now - or, when its history has no change of status at all, the
 * day it was created (as lib/managersCockpitExtra statusStuckSignals reads a status that never
 * changed). Null - not known - when the history could not be read, and when its last change set
 * another status than the job has: it then got there by a way the history did not record.
 */
export function billingSince(job: Pick<OpsCockpitJob, "createdAt" | "status">, change: StatusChange | undefined, historyRead: boolean): Date | null {
  if (!historyRead) return null;
  const same = (a: string) => a.trim().toLowerCase();
  if (change && same(change.status ?? "") !== same(job.status)) return null;
  const since = change ? change.at : job.createdAt;
  return since instanceof Date && Number.isFinite(since.getTime()) ? since : null;
}

/** The newest change of status of each job asked about, by shipment id (one row per job: repositories/shipmentAudit.repository latestByShipmentIds). A job with no change has no entry. */
export function statusChangesOf(rows: readonly { shipmentId: string; newValue: string | null; changedAt: Date }[]): Map<string, StatusChange> {
  return new Map(rows.map((r) => [r.shipmentId, { status: r.newValue, at: r.changedAt }]));
}

/**
 * `not_invoiced`: the AMOUNT on a job past its tax date that operations have not released for
 * billing (lib/managersCockpit isUnbilledArrival - the cockpit keeps the flags, this adds what is
 * at stake): the work not yet invoiced, per currency - whether or not some invoice exists
 * already. URGENT from TAX_DATE_LATE_DAYS days after the tax date - the cockpit's own number.
 */
export function notInvoicedSignals(
  job: Pick<OpsCockpitJob, "status" | "tradeDirection" | "department" | "actualArrival" | "actualDeparture" | "actualDeliveryDate">,
  money: Pick<JobMoney, "notYetInvoiced">,
  today: string,
): MoneySignal[] {
  const amounts = amountsText(money.notYetInvoiced ?? []);
  if (!isUnbilledArrival(job) || !amounts) return [];
  const taxDay = dayOfStamp(unbilledTaxDate(job));
  const text = `Not invoiced · ${amounts}`;
  return [taxDay && daysBetween(taxDay, today) >= TAX_DATE_LATE_DAYS ? urgent(MONEY_RANK.notInvoicedLate, "not_invoiced", text) : attention(MONEY_RANK.notInvoiced, "not_invoiced", text)];
}

/** `unticked`: valued selling lines that are not ticked, on a job in Billing: profit ignores them and they keep the job from reading Invoiced. */
export function untickedSignals(job: Pick<OpsCockpitJob, "status">, money: Pick<JobMoney, "untickedSelling">): MoneySignal[] {
  const amounts = amountsText(money.untickedSelling ?? []);
  if (!isInBilling(job) || !amounts) return [];
  return [attention(MONEY_RANK.unticked, "unticked", `Selling line not ticked · ${amounts}: holds the job open`)];
}

/**
 * `cost_after_billing`: supplier invoices booked after the job was invoiced, within the last
 * MONEY_COST_AFTER_BILLING_DAYS days - then the tag clears by itself. URGENT those above their
 * estimate, ATTENTION the others. One tag of each, naming MONEY_TAG_NAMES of the invoices, each
 * with what it bills per currency, and the day it was booked (the latest, of several). An entry
 * with no day it was booked on cannot be bounded and is not said.
 */
export function costAfterBillingSignals(money: Pick<JobMoney, "supplierInvoices">, today: string): MoneySignal[] {
  // An invoice in two currencies comes as two entries: it is one invoice.
  const invoices = new Map<string, { name: string; aboveEstimate: boolean; amounts: MoneyAmount[]; bookedOn: string }>();
  for (const entry of money.supplierInvoices?.afterBilling ?? []) {
    const bookedOn = dayOfStamp(entry.bookedOn);
    const age = bookedOn ? daysBetween(bookedOn, today) : null;
    if (!bookedOn || age === null || age > MONEY_COST_AFTER_BILLING_DAYS) continue;
    const invoice = invoices.get(entry.id) ?? { name: entry.supplier.trim() || entry.number.trim() || "supplier", aboveEstimate: false, amounts: [], bookedOn };
    invoice.aboveEstimate ||= entry.aboveEstimate;
    invoice.amounts.push({ currency: entry.currency, amount: entry.amount });
    invoices.set(entry.id, invoice);
  }
  const text = (list: readonly { name: string; amounts: MoneyAmount[]; bookedOn: string }[], above: boolean) => {
    const names = list.slice(0, MONEY_TAG_NAMES).map((i) => [i.name, amountsText(i.amounts)].filter(Boolean).join(" "));
    const named = [...names, ...(list.length > MONEY_TAG_NAMES ? [`and ${list.length - MONEY_TAG_NAMES} more`] : [])].join("; ");
    const latest = list.reduce((day, i) => (i.bookedOn > day ? i.bookedOn : day), list[0]!.bookedOn);
    const what = list.length === 1 ? "Supplier invoice after billing" : `${list.length} supplier invoices after billing`;
    return `${what}${above ? ", above estimate" : ""} · ${named} · ${list.length === 1 ? "booked" : "the latest booked"} ${dm(latest)}`;
  };
  const above = [...invoices.values()].filter((i) => i.aboveEstimate);
  const within = [...invoices.values()].filter((i) => !i.aboveEstimate);
  return [
    ...(above.length ? [urgent(MONEY_RANK.costAfterBillingAbove, "cost_after_billing", text(above, true))] : []),
    ...(within.length ? [attention(MONEY_RANK.costAfterBilling, "cost_after_billing", text(within, false))] : []),
  ];
}

/**
 * `accrual`: estimates with no supplier invoice MONEY_ACCRUAL_DAYS days after the job's tax date;
 * URGENT from MONEY_ACCRUAL_URGENT_DAYS days, or once the job is billed (isBilled: it reads
 * Invoiced, or stands in a Billing status) - the cost is then missing from a job whose revenue is
 * booked. An open invoice alone does not make it so: a job invoiced in advance is not through.
 */
export function accrualSignals(
  job: Pick<OpsCockpitJob, "tradeDirection" | "department" | "actualArrival" | "actualDeparture" | "actualDeliveryDate">,
  money: Pick<JobMoney, "estimatesOpen">,
  today: string,
  billed: boolean,
): MoneySignal[] {
  if (!money.estimatesOpen || !(money.estimatesOpen.lines > 0)) return [];
  const { lines, oldestSince } = money.estimatesOpen;
  const taxDay = dayOfStamp(unbilledTaxDate(job));
  const age = taxDay ? daysBetween(taxDay, today) : null;
  const late = billed || (age !== null && age >= MONEY_ACCRUAL_URGENT_DAYS);
  if (!late && !(age !== null && age >= MONEY_ACCRUAL_DAYS)) return [];
  const since = dayOfStamp(oldestSince);
  const text = `${plural(lines, "estimate")} with no supplier invoice${since ? ` · since ${dm(since)}` : ""}`;
  return [late ? urgent(MONEY_RANK.accrualLate, "accrual", text) : attention(MONEY_RANK.accrual, "accrual", text)];
}

/** Whether something that waits since `since` (a day or a moment) has waited for more than `n` working days. */
function waitedOver(since: string, n: number, now: Date, holidays: readonly string[]): boolean {
  const text = since.trim();
  if (DAY_ONLY.test(text)) return isRealYmd(text) && workingDaysSince(text, businessDay(now), holidays) > n;
  const at = new Date(text);
  return Number.isFinite(at.getTime()) && waitedWorkingDays(at, n, now, holidays);
}

/**
 * `supplier_invoice`: URGENT one approved and overdue; ATTENTION those waiting for approval for
 * more than MONEY_SUPPLIER_INVOICE_WAITING_WORKING_DAYS working days (with no day to count from:
 * no tag), one claimed, and one refused within the last MONEY_REFUSED_DAYS days - Invoicing counts
 * every refused invoice the job ever had, so the tag goes by the day the last one was refused and
 * clears by itself; with no such day there is no tag. A count that is not known (null) gives none.
 */
export function supplierInvoiceSignals(money: Pick<JobMoney, "supplierInvoices">, now: Date, holidays: readonly string[]): MoneySignal[] {
  if (!money.supplierInvoices) return [];
  const { toApprove, refused, claimed, approvedOverdue, oldestWaitingSince, lastRefusedOn } = money.supplierInvoices;
  const words = (n: number, what: string) => (n === 1 ? `Supplier invoice ${what}` : `${n} supplier invoices ${what}`);
  const out: MoneySignal[] = [];
  if (approvedOverdue !== null && approvedOverdue > 0) out.push(urgent(MONEY_RANK.supplierInvoiceOverdue, "supplier_invoice", words(approvedOverdue, "approved, overdue")));
  const since = dayOfStamp(oldestWaitingSince);
  if (toApprove > 0 && since && waitedOver(oldestWaitingSince!, MONEY_SUPPLIER_INVOICE_WAITING_WORKING_DAYS, now, holidays)) {
    out.push(attention(MONEY_RANK.supplierInvoiceToApprove, "supplier_invoice", `${plural(toApprove, "supplier invoice")} to approve since ${dm(since)}`));
  }
  const refusedOn = dayOfStamp(lastRefusedOn);
  const refusedAgo = refusedOn ? daysBetween(refusedOn, businessDay(now)) : null;
  if (refused > 0 && refusedAgo !== null && refusedAgo <= MONEY_REFUSED_DAYS) out.push(attention(MONEY_RANK.supplierInvoiceRefused, "supplier_invoice", words(refused, "refused")));
  if (claimed !== null && claimed > 0) out.push(attention(MONEY_RANK.supplierInvoiceClaimed, "supplier_invoice", words(claimed, "claimed")));
  return out;
}

/**
 * `cost_claim`: the job's open cost claims older than MONEY_COST_CLAIM_DAYS days, as one tag with
 * what they claim per currency; URGENT when the oldest is older than MONEY_COST_CLAIM_URGENT_DAYS.
 * (An ACCEPTED claim with no credit note is not said: the claim does not store whether its credit
 * note came.)
 */
export function costClaimSignals(claims: readonly MoneyClaim[], today: string): MoneySignal[] {
  const old = claims.map((claim) => ({ claim, day: businessDay(claim.createdAt) })).filter((c) => daysBetween(c.day, today) > MONEY_COST_CLAIM_DAYS);
  if (!old.length) return [];
  const oldest = old.reduce((first, c) => (c.day < first ? c.day : first), old[0]!.day);
  const amounts = amountsText(old.flatMap(({ claim }) => (claim.amount !== null && claim.currency.trim() ? [{ currency: claim.currency, amount: claim.amount }] : [])));
  const text = `${old.length === 1 ? `Cost claim open since ${dm(oldest)}` : `${old.length} cost claims open, the oldest since ${dm(oldest)}`}${amounts ? ` · ${amounts}` : ""}`;
  return [daysBetween(oldest, today) > MONEY_COST_CLAIM_URGENT_DAYS ? urgent(MONEY_RANK.costClaimOld, "cost_claim", text) : attention(MONEY_RANK.costClaim, "cost_claim", text)];
}

/** Whether what a customer owes is over its credit limit - or cannot be said. */
export type OverLimit = "over" | "not_over" | "not_known";

/** Whether comparing what the customer owes with its limit needs rates: it has a limit and owes in another currency than the limit's. */
export function needsRates(credit: CustomerCredit): boolean {
  const limit = credit.currency.trim().toUpperCase();
  return credit.creditLimit > 0 && perCurrency(credit.unpaid).some((u) => u.currency !== limit);
}

/**
 * Whether the customer's unpaid invoices exceed its credit limit. No limit set: not over. All of
 * it owed in the limit's own currency: compared as it is. Otherwise both sides go through CZK at
 * today's ČNB rates, as the Sales managers' cockpit compares them (quotes utils/managersFacts
 * overLimitCzk) - but where a rate is missing this says "not known" instead of leaving the amount
 * out: only when what CAN be converted is over the limit already (and nothing left out is a
 * credit) is it "over" all the same.
 */
export function overLimit(credit: CustomerCredit, rates: Readonly<Record<string, number>> | null): OverLimit {
  if (!(credit.creditLimit > 0)) return "not_over";
  const limitCurrency = credit.currency.trim().toUpperCase();
  const owed = perCurrency(credit.unpaid);
  if (owed.every((u) => u.currency === limitCurrency)) return (owed[0]?.amount ?? 0) > credit.creditLimit ? "over" : "not_over";
  const limitRate = rateOf(limitCurrency, rates);
  if (limitRate === null) return "not_known";
  let known = 0;
  let allKnown = true;
  let lowerBound = true;
  for (const u of owed) {
    const rate = rateOf(u.currency, rates);
    if (rate !== null) known += u.amount * rate;
    else {
      allKnown = false;
      if (u.amount < 0) lowerBound = false;
    }
  }
  const over = known > credit.creditLimit * limitRate;
  if (allKnown) return over ? "over" : "not_over";
  return over && lowerBound ? "over" : "not_known";
}

/** What is known of the credit of a job's customer. */
export interface JobCredit {
  over: OverLimit;
  /** How many of the customer's invoices are overdue. */
  overdue: number;
}

/**
 * Whether a release decision is due on the job: it has arrived (ATA) and is not released - no
 * House BoL release, no Warehouse Released - and not delivered either: cargo that was handed over
 * is past any release.
 */
export const releaseDue = (job: Pick<OpsCockpitJob, "actualArrival" | "houseBolRelease" | "warehouseReleasedDate" | "actualDeliveryDate">): boolean =>
  !!job.actualArrival && !job.houseBolRelease.trim() && !job.warehouseReleasedDate && !job.actualDeliveryDate;

/**
 * `credit`: the job's customer is over its credit limit, or has overdue invoices. URGENT when a
 * release decision is due on the job (releaseDue), ATTENTION otherwise. `credit`: null when it is
 * not known, or the job has no linked customer - then there is no tag.
 */
export function creditSignals(job: Pick<OpsCockpitJob, "actualArrival" | "houseBolRelease" | "warehouseReleasedDate" | "actualDeliveryDate">, credit: JobCredit | null): MoneySignal[] {
  if (!credit) return [];
  const due = releaseDue(job);
  const out: MoneySignal[] = [];
  const add = (rank: number, text: string) => out.push(due ? urgent(MONEY_RANK.creditReleaseDue, "credit", text) : attention(rank, "credit", text));
  if (credit.over === "over") add(MONEY_RANK.creditOverLimit, "Customer over limit");
  if (credit.overdue > 0) add(MONEY_RANK.creditOverdue, `Customer has overdue invoices · ${credit.overdue}`);
  return out;
}

/** `not_recharged`: demurrage, detention, storage or waiting that was bought and has no selling line of its charge code - one tag per kind, its amounts per currency. */
export function notRechargedSignals(money: Pick<JobMoney, "notRecharged">): MoneySignal[] {
  const byLabel = new Map<string, MoneyAmount[]>();
  for (const line of money.notRecharged ?? []) {
    const label = line.label.trim() || line.code.trim() || "Charge";
    byLabel.set(label, [...(byLabel.get(label) ?? []), { currency: line.currency, amount: line.amount }]);
  }
  return [...byLabel].flatMap(([label, lines]) => {
    const amounts = amountsText(lines);
    return amounts ? [attention(MONEY_RANK.notRecharged, "not_recharged", `${label} bought, not sold on · ${amounts}`)] : [];
  });
}

// ─── The answer ──────────────────────────────────────────────────

/** What the page shows after "Not known right now:" for what this file finds missing in the facts it was handed. */
export const MONEY_GAPS = {
  jobsNotRead: (n: number) => `Invoicing: ${plural(n, "job")} could not be read`,
  customersNotFound: (n: number) => `customers' credit: ${plural(n, "customer")} of these jobs not found`,
  limitNotCompared: (n: number) => `customers' credit: the limit of ${plural(n, "customer")} could not be compared (no ČNB rate today)`,
  marginRateMissing: (n: number) => `margin of ${plural(n, "job")}: a ČNB rate is missing`,
  marginRatesNotRead: (n: number) => `margin of ${plural(n, "job")}: their rates are not fixed yet and could not be read`,
  czkTotal: (currencies: readonly string[]) => `the CZK total of work not yet invoiced: no ČNB rate for ${currencies.join(", ")}`,
} as const;

type Filters = Pick<OpsMoneyInput, "mode" | "direction" | "reports" | "reportEmails" | "userEmails">;

/**
 * The jobs the Money tab is about before its Handled By filter: of the chosen mode and direction,
 * and with "My reports" those the caller's reports handle - the cockpit's own rules. The people
 * line is counted over these, so these are the jobs the facts are read for.
 */
export function moneyJobs<J extends Pick<OpsCockpitJob, "tradeDirection" | "freightMode" | "department" | "personInCharge">>(jobs: readonly J[], filters: Filters): J[] {
  return jobs.filter((job) => inMode(job, filters.mode) && inDirection(job, filters.direction) && isOfReports(job, filters.reports, filters.reportEmails, filters.userEmails));
}

/** What is known of the credit of the job's customer; null when it is not, or the job has no linked customer. */
function jobCredit(jobId: string, input: Pick<OpsMoneyInput, "customerOf" | "credit" | "creditRates">): JobCredit | null {
  const customerId = input.customerOf?.get(jobId);
  const facts = customerId ? input.credit?.get(customerId) : undefined;
  return facts ? { over: overLimit(facts, input.creditRates), overdue: facts.overdueCount } : null;
}

/**
 * Every money signal of one job. A fact that is not known gives none. Of a job that reads
 * Invoiced (`input.invoicedIds`) only the rules about invoiced jobs speak: a loss, supplier
 * invoices after billing, estimates nobody invoiced, supplier invoices, cost claims and what was
 * not recharged - never credit, "not invoiced" or a selling line not ticked.
 */
export function moneySignals(
  job: RuleJob & { id: string },
  input: Pick<OpsMoneyInput, "invoicing" | "invoicedIds" | "customerOf" | "credit" | "creditRates" | "claims" | "statusChangedAt" | "holidays" | "now">,
): MoneySignal[] {
  const today = businessDay(input.now);
  const money = input.invoicing?.get(job.id);
  const closed = input.invoicedIds.has(job.id);
  const billed = isBilled(job, closed);
  const claims = input.claims?.get(job.id) ?? [];
  return [
    ...(money
      ? [
          ...(closed ? lossSignals(money, billed) : marginSignals(money, billed)),
          ...(closed ? [] : inBillingSignals(job, money, billingSince(job, input.statusChangedAt?.get(job.id), input.statusChangedAt !== null), input.now, input.holidays)),
          ...(closed ? [] : notInvoicedSignals(job, money, today)),
          ...(closed ? [] : untickedSignals(job, money)),
          ...costAfterBillingSignals(money, today),
          ...accrualSignals(job, money, today, billed),
          ...supplierInvoiceSignals(money, input.now, input.holidays),
          ...notRechargedSignals(money),
        ]
      : []),
    ...costClaimSignals(claims, today),
    ...(closed ? [] : creditSignals(job, jobCredit(job.id, input))),
  ];
}

/** One job judged: its facts, and its row on a card. */
interface Judged {
  job: MoneyJob;
  /** Who handles it, "" for nobody. */
  email: string;
  /** What Invoicing says of it; null when that was not read. */
  money: JobMoney | null;
  /** It reads Invoiced: no active job. */
  invoiced: boolean;
  ranked: RankedRow<OpsMoneyRow> | null;
}

function judge(job: MoneyJob, input: OpsMoneyInput): Judged {
  const row: Omit<OpsMoneyRow, "tags"> = {
    id: job.id,
    jobNumber: job.jobNumber,
    customer: job.customer,
    mode: modeOf(job),
    tradeDirection: job.tradeDirection,
    status: job.status,
    handledBy: job.personInCharge.trim(),
    holidayCover: job.holidayCover.trim(),
    invoiced: input.invoicedIds.has(job.id),
  };
  // Every money signal has its kind, so every tag carries one (lib/cockpit rankRow hands it through).
  return { job, email: personEmail(job.personInCharge), money: input.invoicing?.get(job.id) ?? null, invoiced: row.invoiced, ranked: rankRow<OpsMoneyRow>(row, moneySignals(job, input)) };
}

/** Which of Invoicing's families are known: one that was not read is null on every job it answered, and a figure made of it is null - never 0. */
interface Known {
  /** The selling and cost lines: margins, losses, what was not recharged. */
  lines: boolean;
  /** The customer invoices. */
  invoices: boolean;
  /** The lines and the customer invoices: the work not yet invoiced, the lines not ticked. */
  unbilled: boolean;
  estimates: boolean;
  supplierInvoices: boolean;
}

function knownOf(jobs: readonly Judged[], read: boolean): Known {
  const answered = jobs.flatMap((j) => (j.money ? [j.money] : []));
  const lines = read && answered.every((m) => m.sellingLines !== null && m.costLines !== null);
  const invoices = read && answered.every((m) => m.invoicesRead);
  return {
    lines,
    invoices,
    unbilled: lines && invoices && answered.every((m) => m.notYetInvoiced !== null),
    estimates: read && answered.every((m) => m.estimatesOpen !== null),
    supplierInvoices: read && answered.every((m) => m.supplierInvoices !== null),
  };
}

/**
 * The families that could not be judged in this answer, in MONEY_SIGNAL_KINDS' order: a tile of
 * one shows no figure - its 0 would say "none", which nobody knows. A family of which only a part
 * is missing (a supplier invoice count, a job's rate, since when a job is in Billing) is judged by
 * the rest and is not among them: `notKnown` names what it lacks.
 */
export function signalsNotKnownOf(known: Known, input: Pick<OpsMoneyInput, "customerOf" | "credit" | "claims">): MoneyKind[] {
  const unread: Record<MoneyKind, boolean> = {
    margin: !known.lines,
    not_invoiced: !known.unbilled,
    unticked: !known.unbilled,
    // Without the customer invoices nothing is known to have come after billing.
    cost_after_billing: !known.supplierInvoices || !known.invoices,
    accrual: !known.estimates,
    supplier_invoice: !known.supplierInvoices,
    cost_claim: input.claims === null,
    credit: input.customerOf === null || input.credit === null,
    not_recharged: !known.lines,
  };
  return MONEY_SIGNAL_KINDS.filter((kind) => unread[kind]);
}

/**
 * The people line: everybody named in Handled By on one of `jobs` (nobody is ""), in the
 * cockpit's order - by their ACTIVE jobs, so somebody with only invoiced ones comes after. The
 * figures count what the rows show, the jobs that read Invoiced too; the work not yet invoiced is
 * the active jobs'. A supplier invoice waiting for approval is counted once per person, however
 * many of their jobs it has lines on. A figure whose part was not read is null.
 */
function peopleOf(jobs: readonly Judged[], known: Known, input: Pick<OpsMoneyInput, "claims" | "userEmails">): OpsMoneyPerson[] {
  const { claims, userEmails } = input;
  const people = new Map<string, { person: OpsMoneyPerson; unbilled: MoneyAmount[]; waiting: Set<string> }>();
  for (const j of jobs) {
    const mine = people.get(j.email) ?? {
      person: {
        handledBy: j.email,
        isUser: userEmails ? userEmails.has(j.email) : null,
        active: 0,
        notYetInvoiced: null,
        jobsAtLoss: known.lines ? 0 : null,
        estimatesOpen: known.estimates ? 0 : null,
        supplierInvoicesWaiting: known.supplierInvoices ? 0 : null,
        costClaimsOpen: claims ? 0 : null,
      },
      unbilled: [],
      waiting: new Set<string>(),
    };
    const { person } = mine;
    if (!j.invoiced) {
      person.active += 1;
      mine.unbilled.push(...(j.money?.notYetInvoiced ?? []));
    }
    if (person.estimatesOpen !== null) person.estimatesOpen += Math.max(0, j.money?.estimatesOpen?.lines ?? 0);
    // Invoicing puts an invoice on every job it has a live line on: by its id, a carrier's invoice over three jobs is one to approve, not three.
    for (const id of j.money?.supplierInvoices?.waitingIds ?? []) mine.waiting.add(id);
    // Every job whose profit is under nothing, at any stage: the cards say "profit −80,262 CZK" of a job
    // still being worked on, and a 0 beside them would contradict them. A margin not known is no loss.
    const profit = j.money?.totals.profitCzk ?? null;
    if (person.jobsAtLoss !== null && profit !== null && profit < 0) person.jobsAtLoss += 1;
    if (person.costClaimsOpen !== null) person.costClaimsOpen += claims?.get(j.job.id)?.length ?? 0;
    people.set(j.email, mine);
  }
  return [...people.values()]
    .map(({ person, unbilled, waiting }) => ({
      ...person,
      notYetInvoiced: known.unbilled ? perCurrency(unbilled) : null,
      supplierInvoicesWaiting: person.supplierInvoicesWaiting === null ? null : waiting.size,
    }))
    .sort(byActiveThenEmail);
}

export function buildOpsMoney(input: OpsMoneyInput): ShipmentsManagersMoney {
  const { now, mode, direction, reports } = input;
  const handledBy = handledByFilter(input.handledBy);

  // As the cockpit: the people line is counted before the Handled By filter - it is what the filter is picked from.
  const scoped = moneyJobs(input.jobs, input).map((job) => judge(job, input));
  const shown = scoped.filter((j) => isHandledBy(j.job, handledBy));
  const rows = shown.flatMap((j) => (j.ranked ? [j.ranked] : []));

  // Every family is in the answer, 0 for none: the page reads a tile's count without asking whether it is there.
  const signals: Record<string, number> = Object.fromEntries(MONEY_SIGNAL_KINDS.map((kind) => [kind, 0]));
  for (const r of rows) for (const kind of new Set(r.row.tags.map((t) => t.kind))) signals[kind] = (signals[kind] ?? 0) + 1;

  const read = input.invoicing !== null;
  const known = knownOf(scoped, read);
  // Work not yet invoiced is the active jobs': a job that reads Invoiced has none to count.
  const active = shown.filter((j) => !j.invoiced);
  const unbilled = active.flatMap((j) => j.money?.notYetInvoiced ?? []);
  // A currency is said to have no rate only on a sheet that was read: one that could not be read is no "ČNB has none".
  const noRate = known.unbilled && input.czk ? currenciesWithoutRate(unbilled, input.czk) : [];
  // Why a margin is not known, as Invoicing says it of the job: its rates are there and one is
  // missing - or they are not fixed yet and could not be had. Both are counted in the one figure.
  const noMargin = known.lines ? shown.flatMap((j) => (j.money && isMarginNotKnown(j.money) ? [j.money.totals.ratesNote] : [])) : [];
  const ratesNotRead = noMargin.filter((note) => note === "not_fixed" || note === "unreadable").length;
  const tiles: OpsMoneyTiles = {
    notYetInvoiced: known.unbilled ? perCurrency(unbilled) : null,
    notYetInvoicedCzk: known.unbilled ? czkTotalOf(unbilled, input.czk) : null,
    notYetInvoicedJobs: known.unbilled ? active.filter((j) => valued(j.money?.notYetInvoiced ?? []).length > 0).length : null,
    signals,
    signalsNotKnown: signalsNotKnownOf(known, input),
    marginNotKnown: known.lines ? noMargin.length : null,
  };

  // What the facts handed in lack, over the jobs they were read for: named, never counted as nothing.
  const jobsNotRead = read ? scoped.filter((j) => !j.money).length : 0;
  // Credit is the active jobs' alone.
  const customers = new Set(scoped.flatMap((j) => (j.invoiced ? [] : (input.customerOf?.get(j.job.id) ?? []))));
  const notFound = input.credit ? [...customers].filter((id) => !input.credit!.has(id)).length : 0;
  // The same for a limit: "no ČNB rate today" only when today's sheet was read and lacks one.
  const notCompared = input.credit && input.creditRates ? [...customers].filter((id) => input.credit!.has(id) && overLimit(input.credit!.get(id)!, input.creditRates) === "not_known").length : 0;

  const byJobNumber = (a: OpsMoneyRow, b: OpsMoneyRow) => a.jobNumber.localeCompare(b.jobNumber);
  return {
    asOf: now.toISOString(),
    today: businessDay(now),
    mode,
    direction,
    handledBy,
    reports,
    tiles,
    urgent: cockpitCard(rows.filter((r) => r.urgent), COCKPIT_LIST_LIMIT, byJobNumber),
    attention: cockpitCard(rows.filter((r) => !r.urgent), COCKPIT_LIST_LIMIT, byJobNumber),
    people: peopleOf(scoped, known, input),
    capped: input.capped,
    holidaysKnown: input.holidaysKnown,
    notKnown: [
      ...new Set([
        ...input.notKnown,
        ...(jobsNotRead ? [MONEY_GAPS.jobsNotRead(jobsNotRead)] : []),
        ...(notFound ? [MONEY_GAPS.customersNotFound(notFound)] : []),
        ...(notCompared ? [MONEY_GAPS.limitNotCompared(notCompared)] : []),
        ...(noMargin.length - ratesNotRead ? [MONEY_GAPS.marginRateMissing(noMargin.length - ratesNotRead)] : []),
        ...(ratesNotRead ? [MONEY_GAPS.marginRatesNotRead(ratesNotRead)] : []),
        ...(noRate.length ? [MONEY_GAPS.czkTotal(noRate)] : []),
      ]),
    ],
  };
}
