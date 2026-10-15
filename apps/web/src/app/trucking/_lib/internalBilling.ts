import type { InternalCharge, InternalMonth } from "@/hooks/useTruckingMoney";
import { businessDayOf } from "@/lib/date";
import type { ActionState, StatusChip } from "./consignments";

// Internal billing: what Trucking charges the other departments for the consignments it carries
// for their jobs, month by month (the month of delivery, Prague). A manager closes a month into one
// statement per department; a closed month never changes. Tested in internalBilling.test.ts.

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 2026" for "2026-10"; the text as it is when it is not a month. */
export function monthLabel(month: string): string {
  const m = month.match(/^(\d{4})-(\d{2})$/);
  if (!m) return month;
  const name = MONTH_NAMES[Number(m[2]) - 1];
  return name ? `${name} ${m[1]}` : month;
}

/** The month ("2026-10") of a stored time on the company's calendar (Prague); "" for none. */
export const monthOf = (at: string | null | undefined) => businessDayOf(at).slice(0, 7);

export const MONTH_STATUS_CHIP: Record<InternalMonth["status"], StatusChip> = {
  OPEN: { label: "Open", tone: "b", hint: "Charges are still added as consignments are delivered" },
  CLOSED: { label: "Closed", tone: "g", hint: "Closed by a manager into statements; it never changes — corrections go into the next open month" },
};

export const CHARGE_KIND_LABELS: Record<InternalCharge["kind"], string> = { CHARGE: "Charge", EXCEPTION: "Exception", ADJUSTMENT: "Adjustment" };

/** A charge the Internal tariff could not price: recorded at 0 and flagged in its description. */
export const isNotPriced = (c: Pick<InternalCharge, "description">) => /not priced/i.test(c.description);

/** The sum of a month's totals over its departments. */
export const monthTotal = (m: Pick<InternalMonth, "totals">) => m.totals.reduce((sum, t) => sum + t.amount, 0);
export const monthCount = (m: Pick<InternalMonth, "totals">) => m.totals.reduce((sum, t) => sum + t.count, 0);

/** Whether a month can be closed now, and why not. */
export function closeMonthState(month: Pick<InternalMonth, "status" | "month">, charges: readonly Pick<InternalCharge, "description">[], manager: boolean, currentMonth: string): ActionState {
  if (!manager) return { allowed: false, reason: "Only a manager closes a month" };
  if (month.status === "CLOSED") return { allowed: false, reason: "Already closed" };
  if (month.month >= currentMonth) return { allowed: false, reason: "The month is not over yet" };
  const notPriced = charges.filter(isNotPriced).length;
  if (notPriced) return { allowed: false, reason: `${notPriced} charge${notPriced === 1 ? " is" : "s are"} not priced — add an Internal tariff that covers them first` };
  return { allowed: true, reason: "" };
}

/** What an internal consignment is charged in its month: its charges there, summed (adjustments included). */
export function consignmentInternalAmount(charges: readonly Pick<InternalCharge, "consignmentId" | "amount" | "description">[], consignmentId: string): { amount: number; notPriced: boolean } | null {
  const own = charges.filter((c) => c.consignmentId === consignmentId);
  if (!own.length) return null;
  return { amount: own.reduce((sum, c) => sum + c.amount, 0), notPriced: own.some(isNotPriced) };
}
