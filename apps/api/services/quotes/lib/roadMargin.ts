// The margin of a road quote against the Trucking margin floor: what the quote sells for minus
// what it buys for, in CZK. Below the floor a manager must approve the margin before the quote is
// sent. Pure - the floor and today's ČNB rates are passed in - so every rule is covered by a test.
// The document comes from browsers, so nothing about its shape is taken for granted.

import type { QuoteMarginApproval, RoadMargin } from "../interfaces/interfaces";

/** tariffRef of a line priced from a trucking tariff: "trucking:<tariffVersionId>:<serviceLevel>". */
export const TRUCKING_REF_PREFIX = "trucking:";

export interface MarginFloor {
  percent: number;
  minAmountCzk: number;
}

/** What a margin is judged with: the floor, and today's ČNB rates (CZK per unit; null = none) of the currencies asked for. */
export interface MarginContext {
  floor: MarginFloor;
  /** The business day the rates are for. */
  today: string;
  rates: Record<string, number | null>;
}

// An approved margin covers the margin as it is now when that is not worse by more than this.
const APPROVAL_TOLERANCE_CZK = 0.005;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const roundCents = (value: number) => Math.round(value * 100) / 100;

function linesOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** Whether a cost line was priced from a trucking tariff. */
export function isTruckingLine(line: unknown): boolean {
  return isObject(line) && typeof line.tariffRef === "string" && line.tariffRef.startsWith(TRUCKING_REF_PREFIX);
}

/** Whether the margin rule applies to a quote: it is a Road quote, or a line of it was priced from a trucking tariff. */
export function roadMarginApplies(data: unknown): boolean {
  if (!isObject(data)) return false;
  if (data.serviceType === "Road") return true;
  return [...linesOf(data.sellingLines), ...linesOf(data.buyingLines)].some(isTruckingLine);
}

// A line's currency: its own, else the quote's (EUR when the quote names none), as the editor reads it.
function currencyOf(line: Record<string, unknown>, data: Record<string, unknown>): string {
  if (typeof line.currency === "string" && line.currency) return line.currency;
  return typeof data.currency === "string" && data.currency ? data.currency : "EUR";
}

// A line's amount: qty × unit price when both are set, else the amount.
function amountOf(line: Record<string, unknown>): number {
  if (isNumber(line.qty) && isNumber(line.unitPrice)) return line.qty * line.unitPrice;
  return isNumber(line.amount) ? line.amount : Number(line.amount) || 0;
}

// The rate a sent quote stored for the currency (data.fx), when it has one.
function storedRate(data: Record<string, unknown>, currency: string): number | null {
  const rate = isObject(data.fx) && isObject(data.fx.rates) ? data.fx.rates[currency] : undefined;
  return isNumber(rate) && rate > 0 ? rate : null;
}

/** The currencies of a quote's lines that need today's ČNB rate: not CZK and not stored on the quote. */
export function currenciesToResolve(data: unknown): string[] {
  if (!isObject(data) || !roadMarginApplies(data)) return [];
  const currencies = new Set<string>();
  for (const line of [...linesOf(data.sellingLines), ...linesOf(data.buyingLines)]) {
    const currency = currencyOf(line, data);
    if (currency !== "CZK" && storedRate(data, currency) === null) currencies.add(currency);
  }
  return [...currencies].sort();
}

/** The approval stored on a quote, when it is one. */
export function approvalOf(data: unknown): QuoteMarginApproval | null {
  const a = isObject(data) ? data.marginApproval : undefined;
  if (!isObject(a) || !isNumber(a.marginCzk)) return null;
  if (typeof a.byUserId !== "string" || typeof a.at !== "string") return null;
  return {
    byUserId: a.byUserId,
    byName: typeof a.byName === "string" ? a.byName : "",
    at: a.at,
    reason: typeof a.reason === "string" ? a.reason : "",
    marginCzk: a.marginCzk,
    marginPercent: isNumber(a.marginPercent) ? a.marginPercent : null,
  };
}

/**
 * The margin of a quote, or null when the rule does not apply to it. Each line is converted to
 * CZK with the rate the quote stored when it was sent, else today's; a line no rate converts is
 * left out of the sums and the margin is unknown - which counts as below the floor.
 */
export function roadMargin(data: unknown, ctx: MarginContext): RoadMargin | null {
  if (!isObject(data) || !roadMarginApplies(data)) return null;
  const missing = new Set<string>();
  const sum = (lines: Record<string, unknown>[]) => {
    let total = 0;
    for (const line of lines) {
      const currency = currencyOf(line, data);
      const rate = currency === "CZK" ? 1 : (storedRate(data, currency) ?? ctx.rates[currency] ?? null);
      if (rate === null) missing.add(currency);
      else total += amountOf(line) * rate;
    }
    return roundCents(total);
  };
  const sellingCzk = sum(linesOf(data.sellingLines));
  const buyingCzk = sum(linesOf(data.buyingLines));
  const problem = missing.size ? [...missing].sort().map((c) => `No ČNB rate for ${c} on ${ctx.today}`).join("; ") : null;

  const marginCzk = problem ? null : roundCents(sellingCzk - buyingCzk);
  const marginPercent = marginCzk !== null && sellingCzk !== 0 ? roundCents((marginCzk / sellingCzk) * 100) : null;
  const belowFloor =
    marginCzk === null || (marginPercent !== null && marginPercent < ctx.floor.percent) || marginCzk < ctx.floor.minAmountCzk;
  const approval = approvalOf(data);
  const approvalValid = approval !== null && marginCzk !== null && marginCzk >= approval.marginCzk - APPROVAL_TOLERANCE_CZK;
  return {
    sellingCzk,
    buyingCzk,
    marginCzk,
    marginPercent,
    floorPercent: ctx.floor.percent,
    floorMinCzk: ctx.floor.minAmountCzk,
    belowFloor,
    approval,
    approvalValid,
    needsApproval: belowFloor && !approvalValid,
    problem,
  };
}

/** "4 250 CZK", "95.50 EUR": thousands apart, cents only when there are any. */
export function formatMoney(amount: number, currency: string): string {
  const [whole, cents] = Math.abs(amount).toFixed(2).split(".");
  const grouped = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${amount < 0 ? "-" : ""}${grouped}${cents === "00" ? "" : `.${cents}`} ${currency}`;
}

/** "4 250 CZK": whole crowns. */
export function formatCzk(amount: number): string {
  return formatMoney(Math.round(amount), "CZK");
}

/** "4.2 %": one decimal at most. */
export function formatPercent(percent: number): string {
  return `${Number(percent.toFixed(1))} %`;
}

/** "380 CZK (4.2 %)": a margin as the history and the refusals name it. */
export function formatMargin(marginCzk: number, marginPercent: number | null): string {
  return marginPercent === null ? formatCzk(marginCzk) : `${formatCzk(marginCzk)} (${formatPercent(marginPercent)})`;
}

/** Why a quote whose margin needs approval cannot be sent: the sentence the user is shown. */
export function marginGateMessage(margin: RoadMargin): string {
  const floor = `${formatPercent(margin.floorPercent)} / ${formatCzk(margin.floorMinCzk)}`;
  const approve = "A manager must approve it before the quote is sent.";
  // The margin is unknown exactly when a rate is missing: no approval can cover that (one is
  // compared with a known margin), so the sentence says what makes the quote sendable instead.
  if (margin.marginCzk === null) {
    return `The margin cannot be worked out: ${margin.problem}. The quote can be sent once the rate is available or its lines are in CZK.`;
  }
  return `The margin of ${formatMargin(margin.marginCzk, margin.marginPercent)} is below the floor of ${floor}. ${approve}`;
}
