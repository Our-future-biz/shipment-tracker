// What needs a look on a Co-Loading Concept sailing or service (Council Outlay 14, A7): the things
// the app already knows and used to show only on the right tab. Pure, so it is tested without React.
// Every mark is a few words with a tone; none of them stops anything.

import type { BoxFill } from "./boxUtilization";
import { cutoffState, cutoffWords, sailingDeparted, sailingStepDays } from "./sailings";

export interface AttentionFlag {
  key: string;
  tone: "red" | "amber" | "slate";
  text: string;
}

/** The days before departure from which a sailing with no box costs is marked for managers. */
export const BOX_COSTS_DUE_DAYS = 3;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
const many = (n: number, one: string, more: string) => (n === 1 ? `1 ${one}` : `${n} ${more}`);

/** What a sailing's marks are worked out from: its dates, its box in short, and what the box holds. */
export interface AttentionSailing {
  cutoffDate: string | null;
  departureDate: string | null;
  fill?: BoxFill | null;
  /** Cancelled shipments still linked. */
  cancelled?: number;
  /** Counted shipments with dangerous cargo. */
  dangerous?: number;
}

/**
 * A sailing's marks, the most pressing first. `today` is YYYY-MM-DD. `boxCostsSet` only for
 * managers (the others never learn whether costs are set): undefined leaves that mark out.
 * A sailing that has left is done: it gets no marks.
 */
export function sailingAttention(s: AttentionSailing, today: string, boxCostsSet?: boolean): AttentionFlag[] {
  if (sailingDeparted(s, today)) return [];
  const flags: AttentionFlag[] = [];
  const fill = s.fill ?? null;
  const over = [fill?.volume, fill?.weight].some((m) => m && (m.state === "over" || m.state === "beyond"));
  if (over) flags.push({ key: "over", tone: "red", text: "Over the limit" });
  const cutoff = cutoffState(s.cutoffDate, today);
  if (cutoff === "passed") flags.push({ key: "cutoff", tone: "red", text: `Cut-off passed ${cutoffWords(s.cutoffDate, today)}` });
  else if (cutoff === "near") flags.push({ key: "cutoff", tone: "amber", text: `Cut-off ${cutoffWords(s.cutoffDate, today)}` });
  if (fill && fill.missing > 0) flags.push({ key: "missing", tone: "amber", text: `${fill.missing} without weight or volume` });
  if ((s.dangerous ?? 0) > 0) flags.push({ key: "dangerous", tone: "amber", text: many(s.dangerous!, "dangerous shipment", "dangerous shipments") });
  if (boxCostsSet === false && s.departureDate && daysBetween(today, s.departureDate) <= BOX_COSTS_DUE_DAYS) flags.push({ key: "costs", tone: "amber", text: "No box costs yet" });
  if ((s.cancelled ?? 0) > 0) flags.push({ key: "cancelled", tone: "slate", text: `${many(s.cancelled!, "cancelled shipment", "cancelled shipments")} still linked` });
  if (!s.departureDate) flags.push({ key: "departure", tone: "slate", text: "No departure date" });
  return flags;
}

/**
 * A service's marks: shipments waiting for a box, and - on a service that sails every week or every
 * other week - no sailing ahead to put them on.
 */
export function serviceAttention(service: { frequency: string; waiting: number }, comingSailings: number): AttentionFlag[] {
  const flags: AttentionFlag[] = [];
  if (comingSailings === 0 && (sailingStepDays(service.frequency) !== null || service.waiting > 0)) flags.push({ key: "none-ahead", tone: "amber", text: "No sailing ahead" });
  if (service.waiting > 0) flags.push({ key: "waiting", tone: comingSailings === 0 ? "amber" : "slate", text: `${service.waiting} waiting for a sailing` });
  return flags;
}

/** The board's order: by cut-off, the soonest first; a sailing with no cut-off by its departure; the ones with neither last. */
export function byCutoff<T extends { cutoffDate: string | null; departureDate: string | null; createdAt: string }>(sailings: readonly T[]): T[] {
  const key = (s: T) => s.cutoffDate ?? s.departureDate ?? "9999-12-31";
  return [...sailings].sort((a, b) => key(a).localeCompare(key(b)) || a.createdAt.localeCompare(b.createdAt));
}

/** The room left in a box, in words: "55.8 cbm · 24,250 kg", "over by 2.1 cbm · 1,200 kg"; a dash where the box has no meter. */
export function freeWords(free: { cbm: number | null; kg: number | null }): string {
  const one = (value: number | null, unit: string, decimals: number) =>
    value === null ? null : `${value < 0 ? "over by " : ""}${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: decimals })} ${unit}`;
  return [one(free.cbm, "cbm", 1), one(free.kg, "kg", 0)].filter(Boolean).join(" · ") || "—";
}
