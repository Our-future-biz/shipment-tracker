import { and, desc, eq, gte, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { COVER_FIELDS, type CoverAssignmentRow, type OpenNoteRow } from "../lib/coverBell";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { shipmentTable as s } from "../schemas/shipment.schema";
import { shipmentAuditTable as audit } from "../schemas/shipmentAudit.schema";
import { shipmentNoteTable as note } from "../schemas/shipmentNote.schema";
import { shipmentNotesReadTable as read } from "../schemas/shipmentNotesRead.schema";

// A person is kept by e-mail; an old value may carry a name after it ("a@b.cz — Name").
const namedEmail = (column: PgColumn) => sql`lower(trim(split_part(${column}, ' — ', 1)))`;
const isOwn = (email: string): SQL => or(sql`${namedEmail(s.personInCharge)} = ${email}`, sql`${namedEmail(s.holidayCover)} = ${email}`)!;

/** What the bell reads about the shipments a user was made to cover (lib/coverBell decides what shows). */
class CoverBellRepository {
  /**
   * The changes since `since` that put this user in a live shipment's Handled By or Holiday Cover,
   * on a shipment they still cover, with when they last opened its Notes To-Do tab; the newest first.
   */
  async assignments(companyId: string, userId: string, email: string, since: Date, limit: number): Promise<CoverAssignmentRow[]> {
    return db
      .select({
        shipmentId: audit.shipmentId,
        jobNumber: s.jobNumber,
        field: audit.field,
        oldValue: audit.oldValue,
        newValue: audit.newValue,
        userId: audit.userId,
        changedAt: audit.changedAt,
        personInCharge: s.personInCharge,
        holidayCover: s.holidayCover,
        readAt: read.readAt,
      })
      .from(audit)
      .innerJoin(s, and(eq(s.id, audit.shipmentId), eq(s.companyId, companyId)))
      .leftJoin(read, and(eq(read.shipmentId, audit.shipmentId), eq(read.userId, userId), eq(read.companyId, companyId)))
      .where(
        and(
          eq(audit.companyId, companyId),
          inArray(audit.field, [...COVER_FIELDS]),
          sql`${namedEmail(audit.newValue)} = ${email}`,
          gte(audit.changedAt, since),
          isNull(s.deletedAt),
          sql`${s.status} IS DISTINCT FROM ${CANCELLED_STATUS}`,
          isOwn(email),
        ),
      )
      .orderBy(desc(audit.changedAt))
      .limit(limit);
  }

  /** The open to-dos of these shipments, in the Notes To-Do tab's order: starred first (the latest starred on top), then newest. */
  async openNotes(companyId: string, shipmentIds: readonly string[]): Promise<OpenNoteRow[]> {
    if (shipmentIds.length === 0) return [];
    return db
      .select({ shipmentId: note.shipmentId, text: note.text })
      .from(note)
      .where(and(eq(note.companyId, companyId), inArray(note.shipmentId, [...shipmentIds]), isNull(note.doneAt), isNull(note.deletedAt)))
      .orderBy(desc(note.pinned), sql`${note.pinnedAt} DESC NULLS LAST`, desc(note.createdAt));
  }

  /** This user has just opened the shipment's Notes To-Do tab. */
  async markRead(companyId: string, userId: string, shipmentId: string): Promise<void> {
    const now = new Date();
    await db
      .insert(read)
      .values({ companyId, userId, shipmentId, readAt: now })
      .onConflictDoUpdate({ target: [read.userId, read.shipmentId], set: { readAt: now, updatedAt: now } });
  }
}

export const coverBellRepository = new CoverBellRepository();
