import type { TrackingTaxDate } from "@/hooks/useShipmentTracking";
import { formatDate } from "@/lib/date";

// The Tracking tab's sentences. Pure, so they are unit-tested.

/** The longest place the server keeps for an event. */
export const PLACE_MAX = 200;
const PLACE_SEPARATOR = " · ";

/**
 * The event's stored place: the port (prefilled, editable) and what was typed beside it (a terminal,
 * a depot) kept apart by a separator, so "Hamburg (DEHAM)" and "Hamburg CTA" never run together
 * (User Council O23). Either part alone is the place; cut to what the server keeps.
 */
export function composePlace(port: string, detail: string): string {
  return [port.trim(), detail.trim()].filter(Boolean).join(PLACE_SEPARATOR).slice(0, PLACE_MAX);
}

/** "ETA moved 7 days later", as a mark. */
export const movedDaysLabel = (days: number): string => `${days > 0 ? "+" : "−"}${Math.abs(days)} d`;

const BASIS_NAME: Record<TrackingTaxDate["basis"], string> = {
  ata: "ATA",
  atd: "ATD",
  eta: "ETA",
  etd: "ETD",
  delivery: "delivery",
  plannedDelivery: "planned delivery",
  none: "",
};

/** The date that would fix a provisional tax date. */
const ACTUAL_OF: Partial<Record<TrackingTaxDate["basis"], string>> = {
  eta: "ATA",
  etd: "ATD",
  plannedDelivery: "delivery",
};

/** The job's rates as far as this line needs them. */
export interface TaxDateRates {
  status: "locked" | "provisional";
  ratesMissing: boolean;
  rateDate: string;
  previousRateDate: string | null;
}

/** What the invoice is taxed by, whether that is firm, and what the rates and an invoice make of it. */
export function taxDateParts(tax: TrackingTaxDate, rates: TaxDateRates | undefined): string[] {
  const invoiced = tax.invoiced === true;
  let date: string;
  if (!tax.date) date = "No tax date (DUZP) yet: no date on this job says it";
  else if (tax.actual) date = `Tax date (DUZP) = ${BASIS_NAME[tax.basis]} ${formatDate(tax.date)}`;
  // An issued invoice holds its own tax date, whatever the estimate says now.
  else if (invoiced) date = `Invoiced with no ${ACTUAL_OF[tax.basis]} recorded: the invoice holds its own tax date (DUZP)`;
  else date = `Tax date (DUZP): provisional by ${BASIS_NAME[tax.basis]} ${formatDate(tax.date)}, the ${ACTUAL_OF[tax.basis]} fixes it`;

  const fx = !rates
    ? ""
    : rates.ratesMissing
      ? "ČNB rate missing for this date"
      : rates.status === "locked"
        ? `ČNB rates locked for ${formatDate(rates.rateDate)}${rates.previousRateDate ? ` (re-locked from ${formatDate(rates.previousRateDate)})` : ""}`
        : `ČNB rates provisional, ${formatDate(rates.rateDate)}`;

  const invoice = !invoiced ? "" : tax.actual ? "Invoiced: final, credit the invoice first to change it" : "Credit the invoice first to set it";
  return [date, fx, invoice].filter(Boolean);
}

/** What keeping a fact of a read notice does, in a line. */
export function readFactWords(fact: { effect: string; sets: string; alreadyKept: boolean; refusal: string }): string {
  if (fact.refusal) return fact.refusal;
  if (fact.alreadyKept) return "Already on record";
  if (fact.effect === "apply") return `Sets the ${fact.sets}`;
  if (fact.effect === "propose") return `Proposes the ${fact.sets}: someone confirms it under Events`;
  return "Recorded, no date changes";
}

interface ClockWords {
  state: string;
  freeTimeDays?: number | null;
  freeTimeFrom: string;
  lastFreeDayStated?: string | null;
  daysLeft?: number | null;
  chargeableDays: number;
  stopDay?: string | null;
}

/** The free time a box was given, in words. */
export function freeTimeWords(c: ClockWords): string {
  const counted = c.freeTimeDays != null ? `${c.freeTimeDays} d from ${c.freeTimeFrom === "gate_out" ? "leaving the terminal" : "discharge"}` : "";
  return [counted, c.lastFreeDayStated ? "carrier's date" : ""].filter(Boolean).join(" · ");
}

/** Where a box's clock stands, in a word and a colour; no colour when there is nothing to watch. */
export function clockStatus(c: ClockWords): { text: string; tone: "red" | "amber" | "green" | "slate" | null } {
  const days = (n: number) => (n === 1 ? "1 day" : `${n} days`);
  switch (c.state) {
    case "chargeable":
      return { text: `${days(c.chargeableDays)} over`, tone: "red" };
    case "ending":
      return { text: c.daysLeft ? `Ends in ${days(c.daysLeft)}` : "Ends today", tone: "amber" };
    case "running":
      return { text: `${days(c.daysLeft ?? 0)} left`, tone: "green" };
    case "returned":
      return { text: c.chargeableDays > 0 ? `Returned ${days(c.chargeableDays)} over` : "Returned in time", tone: c.chargeableDays > 0 ? "red" : "slate" };
    case "not_started":
      return { text: "Not started", tone: null };
    default:
      return { text: "Not set", tone: null };
  }
}

/** How long after the delivery a claim's notice was given. No deadline: the legal day counts per mode are still to be checked. */
export function noticeWords(delivered?: string | null, notice?: string | null): string {
  if (!delivered || !notice) return "";
  const days = Math.round((Date.parse(`${notice}T00:00:00Z`) - Date.parse(`${delivered}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return "On the day of delivery";
  const count = Math.abs(days) === 1 ? "1 day" : `${Math.abs(days)} days`;
  return days > 0 ? `${count} after delivery` : `${count} before delivery`;
}

/**
 * Whether this person may record, close or strike an event of this kind: the server's rule
 * (assertMayRecord) is the details rule, except for the kinds Customs keeps up, which `recordable`
 * then still lists.
 */
export function mayRecordKind(tracking: { mayChangeDetails: boolean; recordable: readonly { kind: string }[] }, kind: string): boolean {
  return tracking.mayChangeDetails || tracking.recordable.some((r) => r.kind === kind);
}

/** The notice a moved date the customer was told of asks for: a delivery date its advice, an ETA its change. */
export const noticeKindOfMoved = (field: string): "delivery_advice" | "eta_change" => (field === "plannedDeliveryDate" ? "delivery_advice" : "eta_change");

/** A kind of event a person records for a day ahead: only a new ETD or ETA is a plan (the server's `planned`). */
export const mayLieAhead = (sets: string | undefined): boolean => sets === "ETD" || sets === "ETA";

/** A container number as written in a line of text: no spaces, upper case. */
const squeezed = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/**
 * Whether a detention cost line is already on Costs for this box: a line of the detention code that
 * names the container (however spaced), or, on a job of one box, any detention line - its words may
 * have been rewritten since.
 */
export function detentionLineOn(lines: readonly { category: string; description: string | null }[], containerNumber: string, boxes: number, code: string): boolean {
  const detention = lines.filter((l) => l.category === code);
  if (boxes === 1 && detention.length > 0) return true;
  const number = squeezed(containerNumber);
  return !!number && detention.some((l) => squeezed(l.description ?? "").includes(number));
}

export type CustomerState = "done" | "next" | "open" | "unconfirmed";

/**
 * The milestones' states as the customer's link shows them (the server's publicStates in
 * apps/api/services/shipments/lib/customerLink.ts - keep the two alike): a step whose planned day passed with
 * no actual is "not yet confirmed", never late; only the first open step is the next one; an earlier step
 * nobody noted while a later one happened is only planned (User Council E2, Q15). Keyed by milestone key.
 */
export function customerStates(milestones: readonly { key: string; state: "done" | "next" | "late" | "open" | "planned" }[]): Map<string, CustomerState> {
  const lastDone = milestones.reduce((last, m, i) => (m.state === "done" ? i : last), -1);
  let reached = false;
  const states = new Map<string, CustomerState>();
  milestones.forEach((m, i) => {
    let state: CustomerState;
    if (m.state === "done") state = "done";
    else if (i < lastDone) state = "open";
    else {
      state = m.state === "late" ? "unconfirmed" : m.state === "next" && !reached ? "next" : "open";
      if (m.state === "late" || m.state === "next") reached = true;
    }
    states.set(m.key, state);
  });
  return states;
}

/**
 * The word printed beside a step for the customer, on their link and in the Tracking tab's customer view alike,
 * so the preview reads as the link does (User Council E2): an open step with a planned day is "Planned", one
 * with no day yet is "Still to come". Never "late" (Q15).
 */
export function customerStateName(state: CustomerState, hasPlanned: boolean): string {
  if (state === "done") return "Done";
  if (state === "next") return "Next step";
  if (state === "unconfirmed") return "Not yet confirmed";
  return hasPlanned ? "Planned" : "Still to come";
}
