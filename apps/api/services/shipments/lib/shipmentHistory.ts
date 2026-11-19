import type { ShipmentHistoryEntry } from "../interfaces/interfaces";
import { CLAIM_HISTORY } from "./cargoClaim";
import { ABSENCE_COVER_ACTOR, ABSENCE_COVER_FIELD } from "./absenceCover";
import { CUTOFF_DISMISSED_FIELD } from "./cutoffDismissals";
import { HAND_OVER_FIELD } from "./handOver";
import { NUDGE_FIELD } from "./nudge";
import { RELEASE_REQUEST_FIELD } from "./releaseRequest";
import { REMEASURE_ACCEPTED, REMEASURE_COSTS_CHECKED } from "./remeasureAccept";
import { REMEASURE_INFORMED } from "./remeasureNotice";

// A job's history as a manager reads it (Council Outlay 11, step 6): every row of shipment_audit,
// the newest first, with who and when. The API keeps no catalogue of the job's field labels - the
// web's lib/columnConfig does - so a field of the job is answered by its key alone (label null) and
// the web labels it; what the app writes itself under a key of its own is labelled here. Pure;
// tested in tests/shipmentHistory.test.ts.

export const HISTORY_PAGE_SIZE = 50;
export const HISTORY_PAGE_MAX = 100;
/** A value is cut at this many characters (a remeasurement keeps whole cargo lines as JSON). */
export const HISTORY_VALUE_MAX = 2000;

/** The entries the app writes under a key of its own, by key. */
const OWN_LABELS: Record<string, string> = {
  [CLAIM_HISTORY.created]: "Claim added",
  [CLAIM_HISTORY.status]: "Claim status",
  [CLAIM_HISTORY.owner]: "Claim owner",
  [CLAIM_HISTORY.deleted]: "Claim deleted",
  [HAND_OVER_FIELD]: "Handed over by a manager",
  [ABSENCE_COVER_FIELD]: "Holiday Cover while away",
  [NUDGE_FIELD]: "Nudged by a manager",
  [CUTOFF_DISMISSED_FIELD]: "Missed cut-off dismissed",
  [RELEASE_REQUEST_FIELD]: "Release request",
  [REMEASURE_ACCEPTED]: "Remeasurement accepted",
  [REMEASURE_COSTS_CHECKED]: "Remeasurement: quantities checked on Costs",
  [REMEASURE_INFORMED]: "Remeasurement: Operations informed",
  paymentOverride: "Released before payment",
  freeTime: "Free time",
  deletedAt: "Shipment deleted",
};

/** The entries kept under a key that starts so, with what follows it named after the label. */
const OWN_PREFIXES: readonly { prefix: string; label: string }[] = [
  { prefix: "task:", label: "Task tick taken back" },
  { prefix: "trackingEvent:", label: "Tracking event" },
];

/** The label of a key the app writes itself; null for a field of the job (the web labels it). */
export function historyLabel(field: string): string | null {
  if (field in OWN_LABELS) return OWN_LABELS[field]!;
  const own = OWN_PREFIXES.find((p) => field.startsWith(p.prefix));
  return own ? `${own.label}: ${field.slice(own.prefix.length)}` : null;
}

/** A value as the page gets it: whole up to HISTORY_VALUE_MAX characters, cut with "…" beyond. */
export function historyValue(value: string | null): { value: string | null; cut: boolean } {
  if (value === null || value.length <= HISTORY_VALUE_MAX) return { value, cut: false };
  return { value: `${value.slice(0, HISTORY_VALUE_MAX)}…`, cut: true };
}

/** The page size asked for, within 1 and HISTORY_PAGE_MAX; HISTORY_PAGE_SIZE when not asked. */
export function historyLimit(asked: number | undefined): number {
  if (asked === undefined || !Number.isFinite(asked)) return HISTORY_PAGE_SIZE;
  return Math.min(HISTORY_PAGE_MAX, Math.max(1, Math.floor(asked)));
}

/** How a user is named who is no longer found: auth's look-up leaves out removed users, and auth has no read that keeps them. */
export const FORMER_USER = "former user";

type HistoryRowRead = { id: string; userId: string; field: string; oldValue: string | null; newValue: string | null; changedAt: Date };

/** A save, as rows of the same save share it: who wrote it and when, to the millisecond. */
const saveOf = (row: Pick<HistoryRowRead, "userId" | "changedAt">) => `${row.userId}|${row.changedAt.getTime()}`;

/**
 * The saves of `rows` the dated Holiday Cover's job made (lib/absenceCover): those with one of its own
 * lines. It writes as the company's service identity, which Trucking writes as too - named
 * "Trucking (system)" - so its rows are named apart (m26). A save cut by the page's end is named so
 * only on the page that holds the job's line.
 */
export const absenceCoverSaves = (rows: readonly HistoryRowRead[]): ReadonlySet<string> => new Set(rows.filter((r) => r.field === ABSENCE_COVER_FIELD).map(saveOf));

/**
 * A row read, as the page shows it, with who by name and e-mail. `who`: the users the look-up found,
 * by id; one it did not find has left ("former user"). Null when the look-up failed: then nobody is named.
 * A row of a save of the Holiday Cover's job (`coverSaves`, absenceCoverSaves) is named as that job.
 */
export function historyEntry(row: HistoryRowRead, who: ReadonlyMap<string, { name: string; email: string }> | null, coverSaves: ReadonlySet<string> = new Set()): ShipmentHistoryEntry {
  const oldValue = historyValue(row.oldValue);
  const newValue = historyValue(row.newValue);
  const person = coverSaves.has(saveOf(row)) ? { name: ABSENCE_COVER_ACTOR, email: "" } : who ? (who.get(row.userId) ?? { name: FORMER_USER, email: "" }) : undefined;
  return {
    id: row.id,
    field: row.field,
    label: historyLabel(row.field),
    oldValue: oldValue.value,
    newValue: newValue.value,
    cut: oldValue.cut || newValue.cut,
    changedAt: row.changedAt.toISOString(),
    userId: row.userId,
    userName: person?.name ?? "",
    userEmail: person?.email ?? "",
  };
}
