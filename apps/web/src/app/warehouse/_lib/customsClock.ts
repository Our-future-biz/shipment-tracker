import type { interfaces } from "@/lib/api/client";
import { addDays, businessDayOf, businessToday } from "@/lib/date";

// Days under customs control and the EU temporary-storage deadline (UCC art. 149) of a position.
// The same rules as the server (apps/api/services/warehouse/services/warehouseStockCustoms.ts),
// read from the gate record: the regime from its customs mode / status and operation type, the
// start from the receipt of its lifecycle. Pure (tested in customsClock.test.ts); display only.
//
//   under control  not "Customs Cleared/Released", and T1 (transit, in temporary storage on
//                  arrival), RDT (temporary storage) or "Cargo storage (bonded)" (customs warehouse)
//   counting       the receipt day (Prague) is day 1
//   deadline       receipt day + 90 days; a customs warehouse has none
//   warning        10 days left or fewer; overdue after the deadline; stopped when it left

type Movement = interfaces.GateMovementItem;

export type CustomsRegime = "" | "Temporary storage" | "Transit T1" | "Customs warehouse";
export type CustomsClockState = "none" | "not_started" | "ok" | "warning" | "overdue" | "stopped";

export const CUSTOMS_CLEARED = "Customs Cleared/Released";
export const BONDED_OPERATION = "Cargo storage (bonded)";
export const TEMPORARY_STORAGE_DAYS = 90;
export const CUSTOMS_WARNING_DAYS = 10;

export interface CustomsClock {
  regime: CustomsRegime;
  state: CustomsClockState;
  startDate: string;
  stopDate: string;
  daysUnderControl: number;
  deadline: string;
  daysLeft: number | null;
  note: string;
}


const DAY = 86_400_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: string | null | undefined): s is string => !!s && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const dayNo = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / DAY);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function customsRegime(m: Pick<Movement, "customsMode" | "customsStatus" | "operationType">): CustomsRegime {
  if (m.customsStatus === CUSTOMS_CLEARED) return "";
  if (m.customsMode === "T1") return "Transit T1";
  if (m.customsMode === "RDT") return "Temporary storage";
  if (m.operationType === BONDED_OPERATION) return "Customs warehouse";
  return "";
}

const hasDeadline = (r: CustomsRegime) => r === "Temporary storage" || r === "Transit T1";

export function customsClock(p: { regime: CustomsRegime; start: string | null; stop?: string | null; today: string }): CustomsClock {
  const empty = { startDate: "", stopDate: "", daysUnderControl: 0, deadline: "", daysLeft: null };
  if (!p.regime) return { regime: "", state: "none", ...empty, note: "" };
  const label = p.regime.toLowerCase();
  if (!isDate(p.start)) return { regime: p.regime, state: "not_started", ...empty, note: `${label} · counted from the receipt` };
  const stopped = isDate(p.stop);
  const end = stopped ? p.stop! : p.today;
  const daysUnderControl = Math.max(1, dayNo(end) - dayNo(p.start) + 1);
  const deadline = hasDeadline(p.regime) ? addDays(p.start, TEMPORARY_STORAGE_DAYS) : "";
  const daysLeft = deadline ? dayNo(deadline) - dayNo(end) : null;
  const state: CustomsClockState = stopped ? "stopped" : daysLeft === null ? "ok" : daysLeft < 0 ? "overdue" : daysLeft <= CUSTOMS_WARNING_DAYS ? "warning" : "ok";
  const parts = [label, `day ${daysUnderControl}`];
  if (deadline) {
    const left = daysLeft! < 0 ? `${plural(-daysLeft!, "day")} overdue` : daysLeft === 0 ? "deadline today" : `${plural(daysLeft!, "day")} left`;
    parts.push(`deadline ${deadline}${stopped ? "" : ` (${left})`}`);
  } else parts.push("no 90-day limit");
  if (stopped) parts.push(`stopped ${p.stop}`);
  return { regime: p.regime, state, startDate: p.start, stopDate: stopped ? p.stop! : "", daysUnderControl, deadline, daysLeft, note: parts.join(" · ") };
}

// A lifecycle time as a Prague day: a typed YYYY-MM-DD stays, an instant is converted.
const dayOf = (at: string | null | undefined) => (!at ? null : isDate(at) ? at : businessDayOf(at) || null);

export type CustomsClockFields = Pick<Movement, "customsMode" | "customsStatus" | "operationType"> & { lifecycle?: Pick<Movement["lifecycle"], "steps"> | null };

/** The counter of a gate record, from its receipt to its leaving (or today). */
export function movementCustomsClock(m: CustomsClockFields, today: string = businessToday()): CustomsClock {
  const steps = m.lifecycle?.steps ?? [];
  const received = steps.find((s) => s.stage === "received");
  const left = steps.find((s) => s.stage === "left");
  return customsClock({
    regime: customsRegime(m),
    start: received?.done ? dayOf(received.at) : null,
    stop: left?.done ? dayOf(left.at) : null,
    today,
  });
}

/** The counter is running and needs action: 10 days left or fewer, or overdue. */
export const customsDue = (c: Pick<CustomsClock, "state">) => c.state === "warning" || c.state === "overdue";

/** Sort value: least time left first (overdue below zero); without a deadline or control last. */
export const customsClockSort = (c: { state: string; daysLeft: number | null }) =>
  c.state === "ok" || c.state === "warning" || c.state === "overdue" ? (c.daysLeft ?? 100_000) : Number.MAX_SAFE_INTEGER;

/** Short chip text: "8 days left", "3 days overdue", "Day 40" (customs warehouse), "" when none. */
export function customsChipText(c: CustomsClock): string {
  if (c.state === "none") return "";
  if (c.state === "not_started") return "From receipt";
  if (c.state === "stopped") return `Stopped (day ${c.daysUnderControl})`;
  if (c.daysLeft === null) return `Day ${c.daysUnderControl}`;
  if (c.daysLeft < 0) return `${plural(-c.daysLeft, "day")} overdue`;
  if (c.daysLeft === 0) return "Deadline today";
  return `${plural(c.daysLeft, "day")} left`;
}

/** Hover text: how the counter is counted. */
export function customsHint(c: CustomsClock): string {
  if (c.state === "none") return "Not under customs control";
  const head = `${c.regime}: counted from the receipt in the warehouse (receipt day = day 1, Prague time)`;
  if (c.state === "not_started") return `${head} — not received yet`;
  return [
    head,
    `received ${c.startDate}, day ${c.daysUnderControl}`,
    c.deadline ? `deadline ${c.deadline} (receipt + ${TEMPORARY_STORAGE_DAYS} days, UCC art. 149)` : "customs warehouse — no 90-day limit",
    c.stopDate ? `stopped ${c.stopDate}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The note on the release gates' Customs line: "temporary storage · day 83 · deadline … (8 days left)". */
export function customsReleaseNote(m: CustomsClockFields, today?: string): string {
  const c = movementCustomsClock(m, today);
  return c.state === "none" ? "" : c.note;
}
