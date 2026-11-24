// "Rolled" and "sailed" customer notices of a Co-Loading sailing (Council Outlay 14, C6): after a
// departure, or after shipments were moved on to a later sailing, one list says which customers
// were told and records the rest together. It is the shipment's own customer-notice record
// (lib/customerNotice): the app sends nothing, it keeps the user's word. Pure.

export type SailingNoticeKind = "sailed" | "rolled";
export const isSailingNoticeKind = (kind: unknown): kind is SailingNoticeKind => kind === "sailed" || kind === "rolled";
export const NOTICE_NOTE_MAX = 500;
export const NOTICE_AT_ONCE_MAX = 200;

export interface NoticeLink {
  shipmentId: string;
  jobNumber: string;
  customer: string;
  status: string;
  linkedAt: Date;
  /** Null while the shipment is on the sailing. */
  removedAt: Date | null;
  removedReason: string;
  removedNote: string;
  /** Where a moved shipment went: "WEEK 52"; "" when not known. */
  movedTo: string;
}

export interface ToldNotice {
  shipmentId: string;
  toldAt: Date;
  toldByName: string;
  channel: string;
}

export interface NoticeRow {
  shipmentId: string;
  jobNumber: string;
  customer: string;
  /** For a rolled shipment: where it went and why, and when it was moved (ISO). */
  movedTo?: string;
  reason?: string;
  movedAt?: string;
  /** Who told the customer, how and when (ISO); null while nobody has. */
  told: { at: string; byName: string; channel: string } | null;
}

/** The latest notice of a shipment made at or after `since`: telling counts only once the thing has happened. */
const toldSince = (notices: readonly ToldNotice[], shipmentId: string, since: Date): NoticeRow["told"] => {
  const found = notices.filter((n) => n.shipmentId === shipmentId && n.toldAt.getTime() >= since.getTime()).sort((a, b) => b.toldAt.getTime() - a.toldAt.getTime())[0];
  return found ? { at: found.toldAt.toISOString(), byName: found.toldByName, channel: found.channel } : null;
};

/**
 * The shipments on the sailing whose customers are told it has sailed: every one on it now but the
 * cancelled, with who told its customer since it was linked. By job number.
 */
export function sailedRows(links: readonly NoticeLink[], notices: readonly ToldNotice[], cancelledStatus: string): NoticeRow[] {
  return links
    .filter((l) => l.removedAt === null && l.status !== cancelledStatus)
    .map((l) => ({ shipmentId: l.shipmentId, jobNumber: l.jobNumber, customer: l.customer, told: toldSince(notices, l.shipmentId, l.linkedAt) }))
    .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
}

/**
 * The shipments moved on from this sailing to another, each once - by its last move - with who told
 * its customer since that move. The last moved first. One that is back on this sailing is left out.
 */
export function rolledRows(links: readonly NoticeLink[], notices: readonly ToldNotice[], cancelledStatus: string): NoticeRow[] {
  // A shipment that came back and is on this sailing now was not rolled from it: it sails with it.
  const here = new Set(links.filter((l) => l.removedAt === null).map((l) => l.shipmentId));
  const last = new Map<string, NoticeLink>();
  for (const l of links) {
    if (l.removedAt === null || l.removedReason !== "moved" || l.status === cancelledStatus || here.has(l.shipmentId)) continue;
    const seen = last.get(l.shipmentId);
    if (!seen || seen.removedAt!.getTime() < l.removedAt.getTime()) last.set(l.shipmentId, l);
  }
  return [...last.values()]
    .sort((a, b) => b.removedAt!.getTime() - a.removedAt!.getTime())
    .map((l) => ({
      shipmentId: l.shipmentId,
      jobNumber: l.jobNumber,
      customer: l.customer,
      movedTo: l.movedTo,
      reason: l.removedNote,
      movedAt: l.removedAt!.toISOString(),
      told: toldSince(notices, l.shipmentId, l.removedAt!),
    }));
}

/** Why these shipments cannot be recorded as told, or null: each must be on the list of that kind. */
export function recordRefusal(shipmentIds: readonly string[], rows: readonly NoticeRow[], kind: SailingNoticeKind): string | null {
  if (shipmentIds.length === 0) return "Tick the shipments whose customers were told.";
  if (shipmentIds.length > NOTICE_AT_ONCE_MAX) return `At most ${NOTICE_AT_ONCE_MAX} shipments at once.`;
  const known = new Set(rows.map((r) => r.shipmentId));
  if (!shipmentIds.every((id) => known.has(id))) return kind === "sailed" ? "A ticked shipment is no longer on this sailing: read the list again." : "A ticked shipment was not moved on from this sailing: read the list again.";
  return null;
}

/** What the notice says on the shipment's own record: "Sailed on WEEK 51", "Rolled from WEEK 51 to WEEK 52: Box full". */
export function noticeSubject(kind: SailingNoticeKind, sailingName: string, row: Pick<NoticeRow, "movedTo" | "reason">): string {
  if (kind === "sailed") return `Sailed on ${sailingName}`;
  return `Rolled from ${sailingName}${row.movedTo ? ` to ${row.movedTo}` : ""}${row.reason ? `: ${row.reason}` : ""}`.slice(0, 500);
}
