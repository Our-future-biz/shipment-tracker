// The margin of a quote against the guardrail of its freight mode (Council Outlay 6): what the
// quote sells for minus what it buys for, in CZK - worked out as every quote's is (lib/quoteMargin,
// the editor's own rules, ROE included) - against the mode's floor (lib/guardrails; Road's is
// Trucking's). Below the floor a manager must approve the margin before the quote is sent.
// The file keeps its first name: it began with the road floor alone. Pure - the floors and today's
// ČNB rates are passed in - so every rule is covered by a test. The document comes from browsers,
// so nothing about its shape is taken for granted.

import type { QuoteMarginApproval, QuoteMarginApprovalBasis, RoadMargin } from "../interfaces/interfaces";
import { containersOf, floorFor, isGuardrailMode, type GuardrailFloor, type GuardrailMode, type GuardrailSettings } from "./guardrails";
import { lineAmount, linesOf, quoteMargin, type QuoteRates } from "./quoteMargin";

export { lineAmount };

/** tariffRef of a line priced from a trucking tariff: "trucking:<tariffVersionId>:<serviceLevel>". */
export const TRUCKING_REF_PREFIX = "trucking:";

export type MarginFloor = GuardrailFloor;

/** What a margin is judged with: the floor of every freight mode, today's ČNB sheet (CZK per unit; null = none) and the company ROE %. */
export interface MarginContext extends QuoteRates {
  settings: GuardrailSettings;
  /** Trucking's floor was not read (it could not answer, or no Road quote was judged): Road's in `settings` is only a stand-in, so no Road quote passes on it. */
  roadFloorUnavailable?: boolean;
}

// An approved margin covers the margin as it is now when that is not worse by more than this many
// CZK, or this share of the selling, whichever is more - so a small move of the ČNB rate does not
// take an approval back (D10) - and its percent is not worse by more than this many points.
const APPROVAL_TOLERANCE_CZK = 100;
const APPROVAL_TOLERANCE_SHARE = 0.005;
const APPROVAL_TOLERANCE_POINTS = 0.5;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const str = (value: unknown) => (typeof value === "string" ? value : "");

/** Whether a cost line was priced from a trucking tariff. */
export function isTruckingLine(line: unknown): boolean {
  return isObject(line) && typeof line.tariffRef === "string" && line.tariffRef.startsWith(TRUCKING_REF_PREFIX);
}

/** Whether the road rule applies to a quote: it is a Road quote, or a line of it was priced from a trucking tariff. */
export function roadMarginApplies(data: unknown): boolean {
  if (!isObject(data)) return false;
  if (data.serviceType === "Road") return true;
  return [...linesOf(data.sellingLines), ...linesOf(data.buyingLines)].some(isTruckingLine);
}

/** The freight mode whose guardrail judges the quote: its own, else Road when a line was priced from a trucking tariff; null for none. */
export function guardrailModeOf(data: unknown): GuardrailMode | null {
  if (!isObject(data)) return null;
  if (isGuardrailMode(data.serviceType)) return data.serviceType;
  return roadMarginApplies(data) ? "Road" : null;
}

/**
 * Why a quote with prices cannot be sent before its Freight Mode is chosen: the mode's floor is what
 * judges its margin, so with none - or one no guardrail knows - nothing would. Null when it may go.
 */
export function freightModeGateMessage(data: unknown): string | null {
  if (guardrailModeOf(data)) return null;
  const d = isObject(data) ? data : {};
  if (!linesOf(d.sellingLines).length && !linesOf(d.buyingLines).length) return null;
  return "Choose the Freight Mode first: its margin floor decides whether the quote can be sent";
}

/** What the quote is now, as an approval records it (D10). */
export function approvalBasisOf(data: unknown): QuoteMarginApprovalBasis {
  const d = isObject(data) ? data : {};
  return {
    customerId: str(d.customerId) || null,
    serviceType: str(d.serviceType),
    containers: containersOf(d),
    salesOwner: str(d.salesOwner),
    validUntil: str(d.validUntil) || null,
  };
}

/** Why the quote is no longer what was approved; null while it is (or the approval recorded nothing). */
export function approvalEnded(approval: QuoteMarginApproval, data: unknown): string | null {
  const b = approval.basis;
  if (!b) return null;
  const now = approvalBasisOf(data);
  if (now.customerId !== b.customerId) return "the customer changed";
  if (now.serviceType !== b.serviceType) return "the freight mode changed";
  if (now.containers !== b.containers) return "the number of containers changed";
  if (now.salesOwner !== b.salesOwner) return "the Sales Owner changed";
  // No validity at all is a validity without end: as much an extension as a later date.
  if (b.validUntil && (!now.validUntil || now.validUntil > b.validUntil)) return `the validity was extended past ${b.validUntil}`;
  return null;
}

/** The approval stored on a quote, when it is one. */
export function approvalOf(data: unknown): QuoteMarginApproval | null {
  const a = isObject(data) ? data.marginApproval : undefined;
  if (!isObject(a) || !isNumber(a.marginCzk)) return null;
  if (typeof a.byUserId !== "string" || typeof a.at !== "string") return null;
  const b = isObject(a.basis) ? a.basis : null;
  return {
    byUserId: a.byUserId,
    byName: typeof a.byName === "string" ? a.byName : "",
    at: a.at,
    reason: typeof a.reason === "string" ? a.reason : "",
    marginCzk: a.marginCzk,
    marginPercent: isNumber(a.marginPercent) ? a.marginPercent : null,
    ...(b
      ? {
          basis: {
            customerId: str(b.customerId) || null,
            serviceType: str(b.serviceType),
            containers: isNumber(b.containers) ? b.containers : 0,
            salesOwner: str(b.salesOwner),
            validUntil: str(b.validUntil) || null,
          },
        }
      : {}),
  };
}

/**
 * The margin of a quote against its mode's guardrail, or null when no guardrail applies to it. A
 * line no rate converts is left out of the sums and the margin is unknown - which counts as below
 * the floor; so does selling with no buying (D5). A quote with no lines has no margin and is not below.
 */
export function roadMargin(data: unknown, ctx: MarginContext): RoadMargin | null {
  const mode = guardrailModeOf(data);
  if (!mode) return null;
  const floor = floorFor(mode, data, ctx.settings);
  const margin = quoteMargin(data, ctx)!;
  const { marginCzk, marginPercent } = margin;
  const d = isObject(data) ? data : {};
  // Judged by value, not by lines: an empty or zero buying line is no buying (D5).
  const priced = (value: unknown) => linesOf(value).some((line) => lineAmount(line) !== 0);
  const noBuying = priced(d.sellingLines) && !priced(d.buyingLines);
  // Without Trucking's floor a Road quote cannot be judged: it waits rather than pass on a stand-in.
  const floorUnknown = mode === "Road" && ctx.roadFloorUnavailable === true;
  const belowFloor =
    !margin.empty &&
    (floorUnknown || noBuying || marginCzk === null || (marginPercent !== null && marginPercent < floor.percent) || marginCzk < floor.minAmountCzk);
  const approval = approvalOf(data);
  const tolerance = Math.max(APPROVAL_TOLERANCE_CZK, margin.sellingCzk * APPROVAL_TOLERANCE_SHARE);
  const ended = approval ? approvalEnded(approval, data) : null;
  const approvalValid =
    approval !== null &&
    marginCzk !== null &&
    ended === null &&
    marginCzk >= approval.marginCzk - tolerance &&
    // An approval given with nothing sold (no percent) covers only a quote that still sells nothing.
    (approval.marginPercent === null ? marginPercent === null : marginPercent === null || marginPercent >= approval.marginPercent - APPROVAL_TOLERANCE_POINTS);
  return {
    mode,
    sellingCzk: margin.sellingCzk,
    buyingCzk: margin.buyingCzk,
    marginCzk,
    marginPercent,
    floorPercent: floor.percent,
    floorMinCzk: floor.minAmountCzk,
    belowFloor,
    approval,
    approvalValid,
    needsApproval: belowFloor && !approvalValid,
    problem: margin.problem ?? (floorUnknown ? "Trucking's margin floor could not be read" : null),
    noBuying,
    approvalEnded: ended,
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
  // Known, but nothing to judge it against at the moment (Trucking's floor could not be read).
  if (margin.problem && !margin.approvalValid) return `The margin cannot be judged: ${margin.problem}. Try again in a moment.`;
  if (margin.noBuying) return `The quote sells with no buying lines, so its margin cannot be judged. Enter the buying, or ${approve.charAt(0).toLowerCase()}${approve.slice(1)}`;
  const ended = margin.approval && margin.approvalEnded ? ` The approval no longer covers it: ${margin.approvalEnded}.` : "";
  return `The margin of ${formatMargin(margin.marginCzk, margin.marginPercent)} is below the ${margin.mode} floor of ${floor}.${ended} ${approve}`;
}
