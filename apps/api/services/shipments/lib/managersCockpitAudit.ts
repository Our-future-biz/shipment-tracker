import type { ManagersAuditList, OpsCockpitAudit, OpsCockpitAuditItem } from "../interfaces/interfaces";
import { ABSENCE_COVER_FIELD } from "./absenceCover";
import { APPROVAL_RATE_MIN_DECIDED, AUDIT_DAYS, AUDIT_LIST_LIMIT } from "./cockpitThresholds";
import { CUTOFF_DISMISSED_FIELD } from "./cutoffDismissals";
import { CANCELLED_STATUS, isCreditApproval } from "./fieldDefaults";
import { HAND_OVER_FIELD } from "./handOver";
import { personEmail } from "./shipmentEditRule";

// The audit line of Shipments → Managers (Council Outlay 11, D23): what happened in the company
// over the last week that a manager wants to know of without being told - a job released unpaid,
// a credit check approved by the one who handles the job, a tick taken back, an arrival date
// changed after the fact. A count per kind, and behind each count the rows it stands for
// (GET /shipments/managers-audit). Nothing here judges: it lists. Pure - the reads are
// services/managersCockpitAudit.service; tested in tests/managersCockpitAudit.test.ts.
//
// It is the company's: no mode, direction or Handled By narrows it, and it reaches the jobs the
// cockpit no longer shows (invoiced, cancelled, deleted) - they are what it is for.

/** The kinds, in the order the line shows them. */
export const AUDIT_KEYS = [
  "prepayment_release",
  "own_credit_check",
  "own_document_approval",
  "deleted",
  "cancelled",
  "tick_taken_back",
  "ata_atd_changed",
  "warehouse_received_moved",
  "handled_by_changed",
  "handed_over",
  "cutoff_dismissed",
  "requests_decided",
  "release_requests_decided",
] as const;
export type AuditKey = (typeof AUDIT_KEYS)[number];
export const isAuditKey = (value: string): value is AuditKey => (AUDIT_KEYS as readonly string[]).includes(value);

/** One thing that happened, as the line counts it and its drill-down lists it. */
export interface AuditEntry {
  key: AuditKey;
  shipmentId: string;
  jobNumber: string;
  /** Who did it, by e-mail (a request's answer: as they were named then); "" when not known. */
  who: string;
  at: Date;
  what: string;
  /** Of a decided request: whether it was approved. */
  approved?: boolean;
}

// ─── Words ──────────────────────────────────────────────────────

const text = (value: string | null | undefined) => (value ?? "").trim();
/** "10.11.2026" of a stored YYYY-MM-DD day; anything else as it is. */
const czDay = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}` : value);
const dayOr = (value: string | null | undefined, none: string) => (text(value) ? czDay(text(value)) : none);
const personOr = (value: string | null | undefined) => text(value) || "nobody";

// ─── The job's history ──────────────────────────────────────────────

/** A change in a job's history (shipment_audit) with what the line shows of its job. */
export interface HistoryRow {
  shipmentId: string;
  jobNumber: string;
  /** The job's Handled By as it is now. */
  personInCharge: string;
  /** Who made the change. */
  userId: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: Date;
}

/** A tick taken back is kept under "task:<its key>" (services/task.service reopen). */
const TASK_FIELD_PREFIX = "task:";

/** The kinds read off the job's history. */
export const HISTORY_KEYS = ["own_credit_check", "deleted", "cancelled", "tick_taken_back", "ata_atd_changed", "warehouse_received_moved", "handled_by_changed", "handed_over", "cutoff_dismissed"] as const;
export type HistoryKey = (typeof HISTORY_KEYS)[number];
export const isHistoryKey = (key: AuditKey): key is HistoryKey => (HISTORY_KEYS as readonly string[]).includes(key);

/** What the history is asked for: these fields whatever they changed to, fields that start so, and a field only when it turned into a value. */
export interface HistoryAsk {
  fields: string[];
  fieldPrefixes: string[];
  turnedInto: { field: string; value: string }[];
}

const ASKS: Record<HistoryKey, Partial<HistoryAsk>> = {
  // With the changes of Handled By after it: who handled the job when its credit was approved (handledByAt).
  own_credit_check: { fields: ["creditCheck", "personInCharge"] },
  deleted: { fields: ["deletedAt"] },
  // A status changes many times in a job's life; only the one change is asked for.
  cancelled: { turnedInto: [{ field: "status", value: CANCELLED_STATUS }] },
  tick_taken_back: { fieldPrefixes: [TASK_FIELD_PREFIX] },
  ata_atd_changed: { fields: ["actualArrival", "actualDeparture"] },
  warehouse_received_moved: { fields: ["warehouseReceivedDate"] },
  // With the hand-overs and the cover job's lines: a change saved with one is not this kind's (savedWithOwnLine).
  handled_by_changed: { fields: ["personInCharge", "holidayCover", HAND_OVER_FIELD, ABSENCE_COVER_FIELD] },
  handed_over: { fields: [HAND_OVER_FIELD] },
  cutoff_dismissed: { fields: [CUTOFF_DISMISSED_FIELD] },
};

/** What the history has to be asked for these kinds - every one of them by default. */
export function historyAsk(keys: readonly HistoryKey[] = HISTORY_KEYS): HistoryAsk {
  const asks = keys.map((key) => ASKS[key]);
  return {
    fields: [...new Set(asks.flatMap((a) => a.fields ?? []))],
    fieldPrefixes: [...new Set(asks.flatMap((a) => a.fieldPrefixes ?? []))],
    turnedInto: asks.flatMap((a) => a.turnedInto ?? []),
  };
}

/**
 * Who handled the job at the moment `at`: what the first change of Handled By after it replaced -
 * or, with none since, who handles it now. `rows`: the job's history rows read (they reach back
 * past `at`, so every later change is among them). A change saved in the same turn as `at` is
 * already in force then: only strictly later ones are undone.
 */
export function handledByAt(row: Pick<HistoryRow, "shipmentId" | "personInCharge" | "changedAt">, rows: readonly HistoryRow[]): string {
  const later = rows
    .filter((r) => r.shipmentId === row.shipmentId && r.field === "personInCharge" && r.changedAt.getTime() > row.changedAt.getTime())
    .sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime())[0];
  return personEmail(later ? later.oldValue : row.personInCharge);
}

/**
 * Everybody who handled the job at the moment of `row`: who handles it after that save
 * (handledByAt) and - when the same save changed Handled By - who did before it. Somebody who
 * approves a job's credit and hands the job on in one save approved their own job all the same,
 * as did somebody who took it and approved it.
 */
export function handledByAround(row: Pick<HistoryRow, "shipmentId" | "personInCharge" | "changedAt">, rows: readonly HistoryRow[]): string[] {
  const sameSave = rows.filter((r) => r.shipmentId === row.shipmentId && r.field === "personInCharge" && r.changedAt.getTime() === row.changedAt.getTime());
  return [...new Set([handledByAt(row, rows), ...sameSave.map((r) => personEmail(r.oldValue))])].filter(Boolean);
}

/** The lines that say on their own why Handled By or Holiday Cover changed: a manager's hand-over, the cover job's set or clear. */
const OWN_LINE_FIELDS: readonly string[] = [HAND_OVER_FIELD, ABSENCE_COVER_FIELD];

/**
 * Whether a change of Handled By or Holiday Cover was made by a manager's hand-over or by the
 * dated Holiday Cover's job (lib/absenceCover): their own line stands in the job's history at the
 * same moment (it is written in the change's turn). A hand-over is counted there, as "handed
 * over"; the cover job's set and clear - one per job of an absence - are no change of hands a
 * manager is to look into, and are not counted at all (m16).
 */
const savedWithOwnLine = (row: Pick<HistoryRow, "shipmentId" | "changedAt">, rows: readonly HistoryRow[]): boolean =>
  rows.some((r) => OWN_LINE_FIELDS.includes(r.field) && r.shipmentId === row.shipmentId && r.changedAt.getTime() === row.changedAt.getTime());

const PEOPLE_LABEL: Record<string, string> = { personInCharge: "Handled By", holidayCover: "Holiday Cover" };
const ACTUAL_LABEL: Record<string, string> = { actualArrival: "ATA", actualDeparture: "ATD" };

/** The kind a history row counts as and its line; null when it is none of them. */
function historyEntry(row: HistoryRow, rows: readonly HistoryRow[], emailOf: ReadonlyMap<string, string> | null): Pick<AuditEntry, "key" | "what"> | null {
  const before = text(row.oldValue);
  const after = text(row.newValue);
  switch (row.field) {
    case "creditCheck": {
      // Approved (lib/fieldDefaults isCreditApproval, as the stamp of Approved By reads it) by the very
      // person who handled the job then - before or after that save, when it changed Handled By too.
      // Without the users nobody can say who that was: not said.
      const who = emailOf?.get(row.userId);
      if (!who || !isCreditApproval(row.newValue, row.oldValue) || !handledByAround(row, rows).includes(who)) return null;
      return { key: "own_credit_check", what: `Credit Check ${before || "not set"} → ${after}, by the job's own Handled By` };
    }
    case "deletedAt":
      return after ? { key: "deleted", what: "Job deleted" } : null;
    case "status":
      return after === CANCELLED_STATUS && before !== CANCELLED_STATUS ? { key: "cancelled", what: `Status ${before || "none"} → ${after}` } : null;
    case "actualArrival":
    case "actualDeparture":
      // Typed for the first time it is no news; changed or cleared afterwards it is.
      return before && before !== after ? { key: "ata_atd_changed", what: `${ACTUAL_LABEL[row.field]} ${czDay(before)} → ${dayOr(after, "cleared")}` } : null;
    case "warehouseReceivedDate":
      // Moved later, or cleared: the cargo was said to be in before it was. Moved earlier is a correction.
      return before && (!after || after > before) ? { key: "warehouse_received_moved", what: `Warehouse Received ${czDay(before)} → ${dayOr(after, "cleared")}` } : null;
    case "personInCharge":
    case "holidayCover": {
      // From one person to another (or to nobody), outside a hand-over. Naming somebody where
      // nobody was is no change of hands; nor is the same person written another way.
      const from = personEmail(row.oldValue);
      if (!from || from === personEmail(row.newValue) || savedWithOwnLine(row, rows)) return null;
      return { key: "handled_by_changed", what: `${PEOPLE_LABEL[row.field]} ${personOr(row.oldValue)} → ${personOr(row.newValue)}` };
    }
    case HAND_OVER_FIELD:
      // One line per job of a manager's hand-over (lib/handOver handOverLine): "<from> → <to>: <reason>".
      return { key: "handed_over", what: `Handed over · ${after}` };
    case CUTOFF_DISMISSED_FIELD:
      // A missed cut-off dismissed (lib/cutoffDismissals). Taking a dismissal back is written under
      // the same field, with the dismissal as its old value: only the dismissal counts.
      return before ? null : { key: "cutoff_dismissed", what: `Missed cut-off dismissed · ${after}` };
    default:
      return row.field.startsWith(TASK_FIELD_PREFIX) ? { key: "tick_taken_back", what: `Tick "${row.field.slice(TASK_FIELD_PREFIX.length)}" ${after || "taken back"}` } : null;
  }
}

/**
 * The history rows as entries of the line, in the rows' order. `emailOf`: the company's users, id
 * to e-mail; null when they could not be read - then `who` is "" and no credit check is said to
 * be anybody's own.
 */
export function historyEntries(rows: readonly HistoryRow[], emailOf: ReadonlyMap<string, string> | null): AuditEntry[] {
  return rows.flatMap((row): AuditEntry[] => {
    const entry = historyEntry(row, rows, emailOf);
    return entry ? [{ ...entry, shipmentId: row.shipmentId, jobNumber: row.jobNumber, who: emailOf?.get(row.userId) ?? "", at: row.changedAt }] : [];
  });
}

// ─── The other tables ───────────────────────────────────────────────

/** A manager's release of a job on prepayment that was not paid (shipment_release_override). */
export interface OverrideRow {
  shipmentId: string;
  jobNumber: string;
  kind: string;
  reason: string;
  /** False when Invoicing could not be asked whether the job was paid: released unchecked. */
  checked: boolean;
  /** Who released it, as recorded then. */
  by: string;
  createdAt: Date;
}

export function overrideEntries(rows: readonly OverrideRow[]): AuditEntry[] {
  return rows.map((r) => ({
    key: "prepayment_release" as const,
    shipmentId: r.shipmentId,
    jobNumber: r.jobNumber,
    who: text(r.by),
    at: r.createdAt,
    what: `${r.kind === "house_bol" ? "House BoL released" : "Warehouse Released set"} on prepayment${r.checked ? "" : ", payment not checked"} · ${text(r.reason)}`,
  }));
}

/** A document approved for customs by the user who uploaded it. */
export interface OwnApprovalRow {
  shipmentId: string;
  jobNumber: string;
  fileName: string;
  documentType: string;
  reviewedById: string;
  reviewedAt: Date;
}

export function ownApprovalEntries(rows: readonly OwnApprovalRow[], emailOf: ReadonlyMap<string, string> | null): AuditEntry[] {
  return rows.map((r) => ({
    key: "own_document_approval" as const,
    shipmentId: r.shipmentId,
    jobNumber: r.jobNumber,
    who: emailOf?.get(r.reviewedById) ?? "",
    at: r.reviewedAt,
    what: `Approved for customs their own upload · ${[text(r.documentType), text(r.fileName)].filter(Boolean).join(" · ")}`,
  }));
}

/** A request a manager answered: a document change, a Customs Office change, a release on prepayment. */
export interface DecidedRow {
  shipmentId: string;
  jobNumber: string;
  status: string;
  /** Who answered, as named then. */
  decidedByName: string;
  decidedAt: Date;
  /** What was asked for, in a few words. */
  asked: string;
  comment: string;
}

export function decidedEntries(key: "requests_decided" | "release_requests_decided", rows: readonly DecidedRow[]): AuditEntry[] {
  return rows.map((r) => {
    const approved = r.status === "approved";
    const why = text(r.comment);
    return {
      key,
      shipmentId: r.shipmentId,
      jobNumber: r.jobNumber,
      who: text(r.decidedByName),
      at: r.decidedAt,
      what: `${r.asked} · ${approved ? "approved" : "rejected"}${why ? `: ${why}` : ""}`,
      approved,
    };
  });
}

// ─── The line and its drill-down ──────────────────────────────────────

/** The kinds whose count comes with an approval rate. */
const RATED: readonly AuditKey[] = ["requests_decided", "release_requests_decided"];

/**
 * The line: one item for every key in `known`, in AUDIT_KEYS' order, 0 when nothing happened - a
 * key that is not in `known` could not be read and gets no item (not known is not zero, D29).
 * A decided-requests item carries its approval rate from APPROVAL_RATE_MIN_DECIDED decisions on.
 */
export function auditLine(entries: readonly AuditEntry[], known: readonly AuditKey[]): OpsCockpitAudit {
  const items = AUDIT_KEYS.filter((key) => known.includes(key)).map((key): OpsCockpitAuditItem => {
    const mine = entries.filter((e) => e.key === key);
    const rated = RATED.includes(key) && mine.length >= APPROVAL_RATE_MIN_DECIDED;
    return { key, count: mine.length, ...(rated ? { approvalRate: mine.filter((e) => e.approved).length / mine.length } : {}) };
  });
  return { days: AUDIT_DAYS, items };
}

/** The rows of one key, the newest first, cut at AUDIT_LIST_LIMIT. `cut`: the read itself did not reach everything. */
export function auditList(entries: readonly AuditEntry[], key: AuditKey, cut = false): ManagersAuditList {
  const mine = entries.filter((e) => e.key === key).sort((a, b) => b.at.getTime() - a.at.getTime() || a.jobNumber.localeCompare(b.jobNumber));
  return {
    rows: mine.slice(0, AUDIT_LIST_LIMIT).map((e) => ({ shipmentId: e.shipmentId, jobNumber: e.jobNumber, who: e.who, at: e.at.toISOString(), what: e.what })),
    capped: cut || mine.length > AUDIT_LIST_LIMIT,
  };
}
