import type { ManagersAuditRow } from "@/hooks/useShipmentsManagersAudit";
import type { OpsCockpitAudit } from "@/hooks/useShipmentsManagersCockpit";

// The audit line of Shipments → Managers (Council Outlay 11, D23): how often, in the company's
// last seven days, something happened that a manager wants to know of - a release without payment,
// a deleted job, an approval somebody gave to their own work. The server counts; this file names
// the counts and decides what the line shows. A count of 0 is left out; a count that could not be
// read is not in the answer at all (the page's "Not known right now" line names it).

/** What each of the server's keys is called on the line and on its dialog. */
export const AUDIT_LABELS: Record<string, string> = {
  prepayment_release: "Released without payment",
  own_credit_check: "Credit Check approved by the job's own Handled By",
  own_document_approval: "Document approved for customs by its uploader",
  deleted: "Jobs deleted",
  cancelled: "Jobs cancelled",
  tick_taken_back: "Ticks taken back",
  ata_atd_changed: "ATA / ATD corrected",
  warehouse_received_moved: "Warehouse Received moved later or cleared",
  handled_by_changed: "Handled By or Holiday Cover changed",
  handed_over: "Jobs handed over by a manager",
  cutoff_dismissed: "Missed cut-offs dismissed",
  requests_decided: "Document and Customs Office requests decided",
  release_requests_decided: "Release requests decided",
};

/**
 * A key's name. A key this page does not know (a newer server counts something new) is shown by
 * the key itself, made readable: "invoice_reopened" reads "Invoice reopened".
 */
export function auditLabel(key: string): string {
  if (Object.prototype.hasOwnProperty.call(AUDIT_LABELS, key)) return AUDIT_LABELS[key]!;
  const words = key.replace(/_+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

/** Above this share of approvals, deciding requests looks like a rubber stamp. */
export const RUBBER_STAMP_ABOVE = 0.95;

/**
 * The rubber-stamp mark of a figure: "approved 97 %" when more than 95 % of the requests decided
 * were approved, null otherwise - and for a figure with no share (fewer than 10 decided, or not a
 * count of decisions). Rounded down, so "100 %" is said only when every single one was approved.
 * A share just above the line would round down to "95 %" - beside a rule of "more than 95 %" that
 * reads as a mistake - so there it is said to one decimal ("approved 95.2 %"), and "over 95 %"
 * where even the decimal would read 95.0.
 */
export function rubberStamp(approvalRate: number | null | undefined): string | null {
  if (typeof approvalRate !== "number" || !(approvalRate > RUBBER_STAMP_ABOVE)) return null;
  const line = RUBBER_STAMP_ABOVE * 100;
  const percent = Math.min(100, approvalRate * 100);
  const whole = Math.floor(percent + 1e-9);
  if (whole > line) return `approved ${whole} %`;
  const tenths = Math.floor(percent * 10 + 1e-9) / 10;
  return tenths > line ? `approved ${tenths.toFixed(1)} %` : `approved over ${line} %`;
}

/** A figure of the line as it is drawn. */
export interface AuditFigure {
  key: string;
  label: string;
  count: number;
  /** "approved 97 %", or null for no mark. */
  rubberStamp: string | null;
}

/** The figures the line shows: every count above 0, in the server's order. None for a line that was not read. */
export function auditFigures(audit: Pick<OpsCockpitAudit, "items"> | null | undefined): AuditFigure[] {
  return (audit?.items ?? []).filter((item) => item.count > 0).map((item) => ({ key: item.key, label: auditLabel(item.key), count: item.count, rubberStamp: rubberStamp(item.approvalRate) }));
}

/** The line's label: "Audit · last 7 days". */
export const auditLineLabel = (audit: Pick<OpsCockpitAudit, "days">): string => `Audit · last ${audit.days} days`;

/** What the dialog says under its title: how many rows, and that only the newest are listed when there were more. */
export function auditListNote(list: { rows: readonly unknown[]; capped: boolean }): string {
  const n = list.rows.length;
  return list.capped ? `The newest ${n} are listed: there were more` : `${n} ${n === 1 ? "row" : "rows"}`;
}

/** A row of the dialog's table, with the key the table tells its rows apart by. */
export type AuditListRow = ManagersAuditRow & { key: string };

/**
 * The dialog's rows, each with a key of its own. The server's rows have no id, and two can be the
 * same in every field - one job, one person, the same thing twice within the same instant - so the
 * key starts with the row's place in the list, which no two rows share.
 */
export const auditListRows = (rows: readonly ManagersAuditRow[]): AuditListRow[] => rows.map((row, index) => ({ ...row, key: `${index}:${row.shipmentId}:${row.at}` }));

/** The figure whose rows can be acted on from the list: a missed cut-off dismissed is taken back there (N3) - from the
 * job's dismissals as they stand now, since one dismissed when it was the job's only signal leaves no card row to do it from. */
export const TAKE_BACK_KEY = "cutoff_dismissed";

/** Whether the rows of this figure offer "Take back…". */
export const offersTakeBack = (auditKey: string | null | undefined): boolean => auditKey === TAKE_BACK_KEY;
