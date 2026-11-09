import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";
import { shipmentImportInstructionTable as t, type ShipmentImportInstructionRecord } from "../schemas/shipmentImportInstruction.schema";
import type { ImportInstructionAnswers } from "../interfaces/importInstructions";

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

  /** A new link in place of one not filled in yet, in one turn: the old URL stops working as the new one starts. */
  async replaceOpen(values: typeof t.$inferInsert): Promise<ShipmentImportInstructionRecord> {
    return db.transaction(async (tx) => {
      await tx.update(t).set({ status: "cancelled" }).where(and(eq(t.shipmentId, values.shipmentId), eq(t.companyId, values.companyId), eq(t.status, "open")));
      const [row] = await tx.insert(t).values(values).returning();
      return row!;
    });
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

  /** An answer to a form that still waits; null when somebody answered first. */
  async decide(id: string, decision: { status: "approved" | "rejected"; by: string; reason: string; answers?: ImportInstructionAnswers }, now: Date): Promise<ShipmentImportInstructionRecord | null> {
    const [row] = await db
      .update(t)
      .set({ status: decision.status, decidedBy: decision.by, decidedAt: now, reason: decision.reason, ...(decision.answers ? { answers: decision.answers } : {}) })
      .where(and(eq(t.id, id), eq(t.status, "submitted")))
      .returning();
    return row ?? null;
  }

  /** Back to waiting: an approval that could not be carried out. */
  async reopen(id: string): Promise<void> {
    await db.update(t).set({ status: "submitted", decidedBy: "", decidedAt: null, reason: "" }).where(and(eq(t.id, id), inArray(t.status, ["approved"])));
  }

  /** What waits for the one who created the link. */
  async waitingFor(companyId: string, userId: string) {
    return db
      .select({ shipmentId: t.shipmentId, jobNumber: shipmentTable.jobNumber, submittedAt: t.submittedAt, answers: t.answers })
      .from(t)
      .innerJoin(shipmentTable, eq(shipmentTable.id, t.shipmentId))
      .where(and(eq(t.companyId, companyId), eq(t.createdByUserId, userId), eq(t.status, "submitted")))
      .orderBy(desc(t.submittedAt))
      .limit(100);
  }
}

export const shipmentImportInstructionRepository = new ShipmentImportInstructionRepository();
