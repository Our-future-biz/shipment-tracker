// The bell's "To-dos on shipments you now cover" (owner decision, 17 Nov 2026): a person made a
// shipment's Handled By or Holiday Cover by somebody else is shown its open to-dos, so they see what
// they now cover. Who is told and when it stops is decided here, pure, so it is unit-tested; the
// repository only narrows the rows down (the company, the person's e-mail, live shipments).

import type { CoverNotesNotice } from "../interfaces/interfaces";
import { personEmail } from "./shipmentEditRule";

/** The shipment's fields a change of which makes a person cover it, as the audit log names them. */
export const COVER_FIELDS = ["personInCharge", "holidayCover"] as const;
const ROLE: Record<(typeof COVER_FIELDS)[number], CoverNotesNotice["role"]> = { personInCharge: "Handled By", holidayCover: "Holiday Cover" };

/** How many open to-dos' titles a line shows. */
export const COVER_TITLES_SHOWN = 3;

/** A change of a shipment's Handled By or Holiday Cover to the reader, with the shipment as it is now. */
export interface CoverAssignmentRow {
  shipmentId: string;
  jobNumber: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  /** Who made the change. */
  userId: string;
  changedAt: Date;
  /** The shipment's people now. */
  personInCharge: string;
  holidayCover: string;
  /** When the reader last opened the shipment's Notes To-Do tab; null when never. */
  readAt: Date | null;
}

/** An open to-do of a shipment, in the tab's order. */
export interface OpenNoteRow {
  shipmentId: string;
  text: string;
}

const isCoverField = (field: string): field is (typeof COVER_FIELDS)[number] => (COVER_FIELDS as readonly string[]).includes(field);

/**
 * Whether this change tells the reader: it put them in the field, and somebody else made it - not
 * the reader naming themselves, nor a value that already named them only rewritten (an e-mail with
 * a name after it, normalized).
 */
export function tellsReader(row: Pick<CoverAssignmentRow, "field" | "oldValue" | "newValue" | "userId">, me: { userId: string; email: string }): boolean {
  if (!isCoverField(row.field) || row.userId === me.userId) return false;
  return personEmail(row.newValue) === me.email && personEmail(row.oldValue) !== me.email;
}

/**
 * The bell's lines, one per shipment (its latest change that tells the reader), the newest first.
 * A line stays while the reader is still the shipment's Handled By or Holiday Cover, has not opened
 * its Notes To-Do tab since the change, and the shipment has a to-do open; it goes once any of that
 * ends - the tab opened, the to-dos finished, the person changed again.
 */
export function coverNotices(
  rows: readonly CoverAssignmentRow[],
  openNotes: readonly OpenNoteRow[],
  me: { userId: string; email: string },
  names: ReadonlyMap<string, string>,
): CoverNotesNotice[] {
  const open = new Map<string, string[]>();
  for (const note of openNotes) open.set(note.shipmentId, [...(open.get(note.shipmentId) ?? []), note.text]);
  const done = new Set<string>();
  const out: CoverNotesNotice[] = [];
  for (const row of [...rows].sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime())) {
    if (done.has(row.shipmentId) || !tellsReader(row, me)) continue;
    done.add(row.shipmentId);
    const stillCovers = [row.personInCharge, row.holidayCover].map(personEmail).includes(me.email);
    const notSeen = !row.readAt || row.changedAt > row.readAt;
    const titles = open.get(row.shipmentId) ?? [];
    if (!stillCovers || !notSeen || titles.length === 0) continue;
    out.push({
      shipmentId: row.shipmentId,
      jobNumber: row.jobNumber,
      role: ROLE[row.field as (typeof COVER_FIELDS)[number]],
      by: names.get(row.userId) ?? "",
      at: row.changedAt.toISOString(),
      openCount: titles.length,
      titles: titles.slice(0, COVER_TITLES_SHOWN),
    });
  }
  return out;
}
