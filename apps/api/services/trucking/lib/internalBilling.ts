import { APIError } from "encore.dev/api";
import { businessDay } from "../../../lib/businessDate";
import type { InternalCharge, InternalMonth } from "../interfaces/internal.interfaces";
import type { TruckingInternalChargeRecord, TruckingInternalMonthRecord, TruckingInternalStatementRecord } from "../schemas/internal.schema";
import { roundToStep } from "./rateEngine";

// Internal billing rules (Phase 6 C): the month a charge belongs to, which rows a correction must
// still reverse, what keeps a month from closing, the statements a close makes and the numbers
// they get. Pure. Which consignments are internal at all is lib/internalRules.ts.

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The Prague calendar month of an instant: "2026-10". */
export const monthOf = (at: Date): string => businessDay(at).slice(0, 7);

/** "2026-10" checked; throws invalid_argument. */
export function cleanMonth(v: unknown): string {
  if (typeof v !== "string" || !MONTH.test(v)) throw APIError.invalidArgument("The month must look like 2026-10");
  return v;
}

/** `month` and the `back` months before it, newest first. */
export function monthsBack(month: string, back: number): string[] {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return Array.from({ length: back + 1 }, (_, i) => {
    const n = y * 12 + (m - 1) - i;
    return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
  });
}

export const MAX_STATEMENT_NUMBER = 9_999;

/** ICZ20260001 */
export const formatStatementNumber = (year: number, n: number) => `ICZ${year}${String(n).padStart(4, "0")}`;

/** Text that marks a charge no Internal tariff priced. */
export const NOT_PRICED = "Not priced";

/** The rows of `charges` no later row reverses. */
export function unreversed<T extends Pick<TruckingInternalChargeRecord, "id" | "reversesId">>(charges: T[]): T[] {
  const reversed = new Set(charges.map((c) => c.reversesId).filter((x): x is string => !!x));
  return charges.filter((c) => !reversed.has(c.id));
}

/**
 * The month a new row goes into: its own month while open, else the current month (an
 * adjustment, with a note saying which closed month it belongs to).
 */
export function targetMonth(own: string, current: string, closed: ReadonlySet<string>): { month: string; note: string } {
  if (!closed.has(own)) return { month: own, note: "" };
  return { month: current, note: ` (belongs to ${own}, which is closed)` };
}

/** Why a month cannot be closed now, or null. `charges` = the month's rows; `reversedIds` = rows reversed anywhere. */
export function closeRefusal(month: string, current: string, closed: boolean, charges: Pick<TruckingInternalChargeRecord, "id" | "notPriced" | "consignmentRef">[], reversedIds: ReadonlySet<string>): string | null {
  if (closed) return `${month} is already closed`;
  if (month >= current) return `${month} is not over yet: a month is closed once it has ended`;
  const open = charges.filter((c) => c.notPriced && !reversedIds.has(c.id));
  if (open.length) return `${open.length} charge${open.length === 1 ? " is" : "s are"} not priced (${open.map((c) => c.consignmentRef).join(", ")}): add an Internal tariff valid then, void the POD and stamp it again`;
  return null;
}

/** One statement per receiving department with its total and line count, by department name. */
export function statementGroups(charges: Pick<TruckingInternalChargeRecord, "department" | "amount">[]): { department: string; amount: number; lineCount: number }[] {
  const by = new Map<string, { department: string; amount: number; lineCount: number }>();
  for (const c of charges) {
    const g = by.get(c.department) ?? { department: c.department, amount: 0, lineCount: 0 };
    g.amount = roundToStep(g.amount + c.amount, 0.01);
    g.lineCount += 1;
    by.set(c.department, g);
  }
  return [...by.values()].sort((a, b) => a.department.localeCompare(b.department, "cs"));
}

/** A consignment's internal line: the sum of all its rows and the statements of the closed months they are in. */
export function consignmentLine(
  charges: Pick<TruckingInternalChargeRecord, "amount" | "month" | "department">[],
  statements: Pick<TruckingInternalStatementRecord, "number" | "month" | "department">[],
): { amount: number; statementNumbers: string[] } | null {
  if (!charges.length) return null;
  const amount = roundToStep(charges.reduce((a, c) => a + c.amount, 0), 0.01);
  const numbers = statements.filter((s) => charges.some((c) => c.month === s.month && c.department === s.department)).map((s) => s.number);
  return { amount, statementNumbers: [...new Set(numbers)].sort() };
}

export const chargeItem = (c: TruckingInternalChargeRecord): InternalCharge => ({
  id: c.id,
  month: c.month,
  consignmentId: c.consignmentId,
  consignmentRef: c.consignmentRef,
  shipmentId: c.shipmentId,
  jobNumber: c.jobNumber,
  department: c.department,
  deliveredAt: c.deliveredAt.toISOString(),
  serviceLevel: c.serviceLevel,
  chargeableKg: c.chargeableKg,
  tariffVersionId: c.tariffVersionId,
  amount: c.amount,
  currency: "CZK",
  kind: c.kind,
  description: c.description,
  createdAt: c.createdAt.toISOString(),
});

/** A month as the list shows it: open or closed, totals per department, its statements. */
export function monthItem(
  month: string,
  closed: TruckingInternalMonthRecord | null,
  charges: Pick<TruckingInternalChargeRecord, "department" | "amount">[],
  statements: Pick<TruckingInternalStatementRecord, "number">[],
): InternalMonth {
  return {
    month,
    status: closed ? "CLOSED" : "OPEN",
    closedAt: closed ? closed.closedAt.toISOString() : null,
    closedBy: closed ? closed.closedBy : null,
    totals: statementGroups(charges).map((g) => ({ department: g.department, count: g.lineCount, amount: g.amount })),
    statementNumbers: statements.map((s) => s.number).sort(),
  };
}
