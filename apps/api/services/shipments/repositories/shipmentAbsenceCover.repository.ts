import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db, type Tx } from "../db/db";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { INVOICED_STATUS } from "../lib/jobNumber";
import { shipmentAbsenceCoverTable as covers, type AbsenceCoverOutcome, type NewShipmentAbsenceCoverRecord, type ShipmentAbsenceCoverRecord } from "../schemas/shipmentAbsenceCover.schema";
import { shipmentTable } from "../schemas/shipment.schema";

// Who a person field names: the e-mail before the name an old value may carry after it, trimmed and
// lower case - lib/shipmentEditRule personEmail in SQL, as repositories/shipment.repository has it.
const TRIMMED_WHITESPACE = " \t\n\r ";
const personEmailOf = (column: PgColumn): SQL => sql`lower(btrim(split_part(${column}, ' — ', 1), ${TRIMMED_WHITESPACE}))`;

// An active job: live, not invoiced and not cancelled (the cockpit's own rule).
const ACTIVE = sql`${shipmentTable.deletedAt} IS NULL AND ${shipmentTable.invoicingStatus} IS DISTINCT FROM ${INVOICED_STATUS} AND ${shipmentTable.status} IS DISTINCT FROM ${CANCELLED_STATUS}`;

const open = isNull(covers.clearedAt);

// How a row the cover job set ends when somebody changed the job's cover since (services/absenceCover #clear).
const HAND_CHANGED: AbsenceCoverOutcome = "changed";

// The rows of the dated Holiday Cover (schemas/shipmentAbsenceCover.schema): what the cover job set
// and has still to clear. Every statement is of one company, but the list of companies with rows open.
class ShipmentAbsenceCoverRepository {
  /** The companies with a cover still to clear: the cover job looks at them even when auth tells of no absence of theirs. */
  async companiesWithOpen(): Promise<string[]> {
    const rows = await db.selectDistinct({ companyId: covers.companyId }).from(covers).where(open);
    return rows.map((r) => r.companyId);
  }

  /** The company's open rows, the oldest first. */
  async openOfCompany(companyId: string): Promise<ShipmentAbsenceCoverRecord[]> {
    return db.select().from(covers).where(and(eq(covers.companyId, companyId), open)).orderBy(asc(covers.createdAt));
  }

  /**
   * The company's active jobs whose Handled By is `email` and that have no Holiday Cover - those the
   * absence's cover is set on - the oldest first, at most `limit`. A job a person took this cover off
   * is left out, because that stands, and so such jobs never fill the list and keep the newer ones
   * waiting: its row of the absence was set (set_at) and is still open, so the empty cover now is
   * somebody's doing, or was closed as changed by somebody (HAND_CHANGED). Any other row leaves the
   * job in: one whose write has not gone through (set_at empty), and one the cover job closed itself -
   * cleared when the absence was moved to later days or named another cover for a while, or its job
   * gone - so the cover is set again once the absence is in force with it.
   */
  async jobsToCover(companyId: string, email: string, absence: { id: string; coverEmail: string }, limit: number): Promise<{ id: string; jobNumber: string }[]> {
    const done = sql`NOT EXISTS (
      SELECT 1 FROM ${covers} done
      WHERE done.shipment_id = ${shipmentTable.id}
        AND done.absence_id = ${absence.id}
        AND lower(done.cover_email) = ${absence.coverEmail.trim().toLowerCase()}
        AND done.set_at IS NOT NULL
        AND (done.cleared_at IS NULL OR done.outcome = ${HAND_CHANGED})
    )`;
    return db
      .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), ACTIVE, sql`${personEmailOf(shipmentTable.personInCharge)} = ${email.trim().toLowerCase()}`, sql`${personEmailOf(shipmentTable.holidayCover)} = ''`, done))
      .orderBy(asc(shipmentTable.createdAt))
      .limit(limit);
  }

  /** The open row of an absence on a job; null for none. */
  async openOf(companyId: string, absenceId: string, shipmentId: string): Promise<ShipmentAbsenceCoverRecord | null> {
    const [row] = await db
      .select()
      .from(covers)
      .where(and(eq(covers.companyId, companyId), eq(covers.absenceId, absenceId), eq(covers.shipmentId, shipmentId), open))
      .limit(1);
    return row ?? null;
  }

  /**
   * The open row of the absence on the job, recorded before the job is written: a run that stops
   * between the two leaves a row to clear, never a cover nobody clears. Two runs at once record it
   * once (the open row is unique per absence and job).
   */
  async ensureOpen(row: NewShipmentAbsenceCoverRecord): Promise<ShipmentAbsenceCoverRecord | null> {
    await db.insert(covers).values(row).onConflictDoNothing();
    return this.openOf(row.companyId, row.absenceId, row.shipmentId);
  }

  /**
   * The row is marked set in the job's write turn (`tx`) that sets its cover, so the cover and the
   * mark land together or not at all. False when the row was closed meanwhile (its absence over, by a
   * run at the same moment): the cover is then not set, as nothing would clear it.
   */
  async markSet(tx: Tx, companyId: string, id: string, at: Date): Promise<boolean> {
    const rows = await tx
      .update(covers)
      .set({ setAt: at })
      .where(and(eq(covers.companyId, companyId), eq(covers.id, id), open, isNull(covers.setAt)))
      .returning({ id: covers.id });
    return rows.length > 0;
  }

  /** Closes an open row; false when it was closed already (by a run at the same moment). */
  async close(companyId: string, id: string, outcome: AbsenceCoverOutcome, at: Date): Promise<boolean> {
    const rows = await db
      .update(covers)
      .set({ clearedAt: at, outcome })
      .where(and(eq(covers.companyId, companyId), eq(covers.id, id), open))
      .returning({ id: covers.id });
    return rows.length > 0;
  }

  /** The row goes over to the user's next absence, which names the same cover: the job keeps it. */
  async moveTo(companyId: string, id: string, absence: { id: string; fromDate: string; toDate: string }): Promise<void> {
    await db
      .update(covers)
      .set({ absenceId: absence.id, fromDate: absence.fromDate, toDate: absence.toDate })
      .where(and(eq(covers.companyId, companyId), eq(covers.id, id), open));
  }
}

export const shipmentAbsenceCoverRepository = new ShipmentAbsenceCoverRepository();
