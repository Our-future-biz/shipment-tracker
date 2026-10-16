// Customs control of a position and the EU temporary-storage counter. Pure, display only:
// nothing here is stored except what the stock sync copies onto its rows.
//
//   under control  customs status not "Customs Cleared/Released", and
//                  customs mode T1 → "Transit T1" (on arrival in temporary storage),
//                  customs mode RDT → "Temporary storage",
//                  operation type "Cargo storage (bonded)" → "Customs warehouse" (procedure 71).
//                  Anything else (SCP, JSD, T2L, ATA Carnet, C-Goods) is not counted.
//   counting       from the receipt day (Prague time); the receipt day is day 1, as the storage
//                  clock counts.
//   deadline       temporary storage and T1 transit: receipt day + 90 days (UCC art. 149 — the
//                  day of the event itself is not counted, Reg. 1182/71). A customs warehouse has
//                  no 90-day limit: the days are shown, no deadline.
//   warning        10 days left or fewer; overdue once the deadline has passed.
//   stopped        the cargo left, or customs cleared/released it.

import { CUSTOMS_CLEARED } from "./customs";
import { addDays, dayNo, isIsoDate } from "./storage";

export type CustomsRegime = "" | "Temporary storage" | "Transit T1" | "Customs warehouse";
export const CUSTOMS_REGIMES: Exclude<CustomsRegime, "">[] = ["Temporary storage", "Transit T1", "Customs warehouse"];
export const BONDED_OPERATION = "Cargo storage (bonded)";
/** UCC art. 149: goods in temporary storage must be placed under a procedure within 90 days. */
export const TEMPORARY_STORAGE_DAYS = 90;
/** The counter warns with this many days left or fewer. */
export const CUSTOMS_WARNING_DAYS = 10;

export type CustomsClockState = "none" | "not_started" | "ok" | "warning" | "overdue" | "stopped";

export interface CustomsClockInfo {
  /** "" = not under customs control. */
  regime: CustomsRegime;
  state: CustomsClockState;
  /** YYYY-MM-DD (Prague) the goods came under control here; "" when not received. */
  startDate: string;
  /** YYYY-MM-DD the counter stopped (left / cleared); "" while running. */
  stopDate: string;
  /** Days under customs control, receipt day = day 1 (0 when not started). */
  daysUnderControl: number;
  /** YYYY-MM-DD; "" for a customs warehouse (no 90-day limit) or when not started. */
  deadline: string;
  /** Days to the deadline (negative = overdue); null without a deadline. */
  daysLeft: number | null;
  /** One line, e.g. "temporary storage · day 83 · deadline 2026-12-12 (8 days left)". */
  note: string;
}

export interface CustomsInputs {
  customsMode: string;
  customsStatus: string;
  operationType: string;
}

/** The customs regime the position is held under, "" when it is not under customs control. */
export function customsRegime(m: CustomsInputs): CustomsRegime {
  if (m.customsStatus === CUSTOMS_CLEARED) return "";
  if (m.customsMode === "T1") return "Transit T1";
  if (m.customsMode === "RDT") return "Temporary storage";
  if (m.operationType === BONDED_OPERATION) return "Customs warehouse";
  return "";
}

export const hasDeadline = (regime: CustomsRegime) => regime === "Temporary storage" || regime === "Transit T1";

/** The deadline of goods received on `start` (YYYY-MM-DD), "" when the regime has none. */
export const customsDeadline = (regime: CustomsRegime, start: string) => (hasDeadline(regime) && isIsoDate(start) ? addDays(start, TEMPORARY_STORAGE_DAYS) : "");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The customs counter from the receipt day `start` to `stop` (left / cleared) or `today`, all
 * YYYY-MM-DD in Prague time.
 */
export function customsClock(p: { regime: CustomsRegime; start: string | null; stop?: string | null; today: string }): CustomsClockInfo {
  const empty = { startDate: "", stopDate: "", daysUnderControl: 0, deadline: "", daysLeft: null };
  if (!p.regime) return { regime: "", state: "none", ...empty, note: "" };
  const label = p.regime.toLowerCase();
  if (!isIsoDate(p.start)) return { regime: p.regime, state: "not_started", ...empty, note: `${label} · counted from the receipt` };
  const stopped = isIsoDate(p.stop);
  const end = stopped ? p.stop! : p.today;
  const daysUnderControl = Math.max(1, dayNo(end) - dayNo(p.start) + 1);
  const deadline = customsDeadline(p.regime, p.start);
  const daysLeft = deadline ? dayNo(deadline) - dayNo(end) : null;
  const state: CustomsClockState = stopped ? "stopped" : daysLeft === null ? "ok" : daysLeft < 0 ? "overdue" : daysLeft <= CUSTOMS_WARNING_DAYS ? "warning" : "ok";
  const parts = [label, `day ${daysUnderControl}`];
  if (deadline) {
    const left = daysLeft! < 0 ? `${plural(-daysLeft!, "day")} overdue` : daysLeft === 0 ? "deadline today" : `${plural(daysLeft!, "day")} left`;
    parts.push(`deadline ${deadline}${stopped ? "" : ` (${left})`}`);
  } else {
    parts.push("no 90-day limit");
  }
  if (stopped) parts.push(`stopped ${p.stop}`);
  return { regime: p.regime, state, startDate: p.start, stopDate: stopped ? p.stop! : "", daysUnderControl, deadline, daysLeft, note: parts.join(" · ") };
}

/** Sort value: least time left first (overdue below zero); without a deadline or control last. */
export const customsClockSort = (c: Pick<CustomsClockInfo, "state" | "daysLeft">) =>
  c.state === "ok" || c.state === "warning" || c.state === "overdue" ? (c.daysLeft ?? 100_000) : Number.MAX_SAFE_INTEGER;
