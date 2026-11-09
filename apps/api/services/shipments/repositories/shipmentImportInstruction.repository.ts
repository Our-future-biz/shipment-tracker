import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { constraintOf, isUniqueViolation } from "../../../lib/db/errors";
import { shipmentTable } from "../schemas/shipment.schema";
import { shipmentImportInstructionTable as t, type ShipmentImportInstructionRecord } from "../schemas/shipmentImportInstruction.schema";
import type { ImportInstructionAnswers } from "../interfaces/importInstructions";

/** The index that keeps a shipment to one live form (schemas/shipmentImportInstruction). */
export const LIVE_FORM_INDEX = "shipment_import_instruction_live_uq";

// A person is kept by e-mail; an old value may carry a name after it ("a@b.cz — Name"), as lib/shipmentEditRule reads it.
const personEmail = (column: PgColumn) => sql`lower(btrim(split_part(${column}, ' — ', 1)))`;

class ShipmentImportInstructionRepository {
  /** The shipment's latest form that wasn't cancelled. */
  async latest(shipmentId: string, companyId: string): Promise<ShipmentImportInstructionRecord | null> {
    const [row] = await db
      .select()
      .from(t)
      .where(and(eq(t.shipmentId, shipmentId), eq(t.companyId, companyId), ne(t.status, "cancelled")))
      .orderBy(desc(t.createdAt))
      .limit(1);
    return row ?? null;
  }

  async byHash(tokenHash: string): Promise<ShipmentImportInstructionRecord | null> {
    const [row] = await db.select().from(t).where(eq(t.tokenHash, tokenHash));
    return row ?? null;
  }

  /**
   * A new link in place of one not filled in yet, in one turn: the old URL stops working as the new one
   * starts. Null when the shipment has another live form meanwhile (a link created at the same moment, or
   * the old link sent by the customer): the database keeps one.
   */
  async replaceOpen(values: typeof t.$inferInsert): Promise<ShipmentImportInstructionRecord | null> {
    try {
      return await db.transaction(async (tx) => {
        await tx.update(t).set({ status: "cancelled" }).where(and(eq(t.shipmentId, values.shipmentId), eq(t.companyId, values.companyId), eq(t.status, "open")));
        const [row] = await tx.insert(t).values(values).returning();
        return row!;
      });
    } catch (err) {
      if (isUniqueViolation(err) && constraintOf(err) === LIVE_FORM_INDEX) return null;
      throw err;
    }
  }

  async cancelOpen(shipmentId: string, companyId: string): Promise<boolean> {
    const rows = await db.update(t).set({ status: "cancelled" }).where(and(eq(t.shipmentId, shipmentId), eq(t.companyId, companyId), eq(t.status, "open"))).returning({ id: t.id });
    return rows.length > 0;
  }

  /** The customer's answers; null when the link was used, cancelled or ran out meanwhile. */
  async submit(id: string, answers: ImportInstructionAnswers, now: Date): Promise<ShipmentImportInstructionRecord | null> {
    const [row] = await db.update(t).set({ status: "submitted", answers, submittedAt: now }).where(and(eq(t.id, id), eq(t.status, "open"), gt(t.expiresAt, now))).returning();
    return row ?? null;
  }

  /**
   * An answer to a form that still waits; null when somebody answered first. What the customer sent stays
   * as it is: an approval keeps what was approved beside it.
   */
  async decide(
    id: string,
    decision: { status: "approved" | "rejected"; by: string; reason: string; approvedAnswers?: ImportInstructionAnswers },
    now: Date,
  ): Promise<ShipmentImportInstructionRecord | null> {
    const [row] = await db
      .update(t)
      .set({ status: decision.status, decidedBy: decision.by, decidedAt: now, reason: decision.reason, approvedAnswers: decision.approvedAnswers ?? null })
      .where(and(eq(t.id, id), eq(t.status, "submitted")))
      .returning();
    return row ?? null;
  }

  /** Back to waiting: an approval that could not be carried out. */
  async reopen(id: string): Promise<void> {
    await db.update(t).set({ status: "submitted", decidedBy: "", decidedAt: null, reason: "", approvedAnswers: null }).where(and(eq(t.id, id), inArray(t.status, ["approved"])));
  }

  /**
   * The completed forms of the company's live shipments that `userId` created, or whose shipment names
   * `email` as its Person in Charge or Holiday Cover; with those people, so the caller can tell who may answer.
   */
  async waitingFor(companyId: string, userId: string, email: string) {
    const mine = email.trim().toLowerCase();
    return db
      .select({
        shipmentId: t.shipmentId,
        jobNumber: shipmentTable.jobNumber,
        submittedAt: t.submittedAt,
        answers: t.answers,
        personInCharge: shipmentTable.personInCharge,
        holidayCover: shipmentTable.holidayCover,
      })
      .from(t)
      .innerJoin(shipmentTable, and(eq(shipmentTable.id, t.shipmentId), eq(shipmentTable.companyId, t.companyId), isNull(shipmentTable.deletedAt)))
      .where(
        and(
          eq(t.companyId, companyId),
          eq(t.status, "submitted"),
          mine
            ? or(eq(t.createdByUserId, userId), sql`${personEmail(shipmentTable.personInCharge)} = ${mine}`, sql`${personEmail(shipmentTable.holidayCover)} = ${mine}`)
            : eq(t.createdByUserId, userId),
        ),
      )
      .orderBy(desc(t.submittedAt))
      .limit(100);
  }
}

export const shipmentImportInstructionRepository = new ShipmentImportInstructionRepository();
