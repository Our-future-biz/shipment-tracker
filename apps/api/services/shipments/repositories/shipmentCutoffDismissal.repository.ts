import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import type { CutoffKey } from "../lib/managersCockpit";
import {
  shipmentCutoffDismissalTable as dismissals,
  type NewShipmentCutoffDismissalRecord,
  type ShipmentCutoffDismissalRecord,
} from "../schemas/shipmentCutoffDismissal.schema";
import { shipmentAuditRepository } from "./shipmentAudit.repository";

/** The line a dismissal, or taking one back, leaves in the job's history. */
type History = { userId: string; field: string; oldValue: string | null; newValue: string | null };

// The missed cut-offs managers dismissed (lib/cutoffDismissals). A dismissal and its line in the job's history
// are written together or not at all; taking one back sets deleted_at, so the row stays as the record.
class ShipmentCutoffDismissalRepository {
  /** The live dismissals of these jobs: one query, for both pages' cut-off rule. */
  async liveByShipmentIds(shipmentIds: readonly string[], companyId: string): Promise<{ shipmentId: string; cutoff: CutoffKey; cutoffDate: string }[]> {
    if (shipmentIds.length === 0) return [];
    return db
      .select({ shipmentId: dismissals.shipmentId, cutoff: dismissals.cutoff, cutoffDate: dismissals.cutoffDate })
      .from(dismissals)
      .where(and(eq(dismissals.companyId, companyId), inArray(dismissals.shipmentId, [...shipmentIds]), isNull(dismissals.deletedAt)));
  }

  /** A job's live dismissals, the oldest first. */
  async listForShipment(shipmentId: string, companyId: string): Promise<ShipmentCutoffDismissalRecord[]> {
    return db
      .select()
      .from(dismissals)
      .where(and(eq(dismissals.companyId, companyId), eq(dismissals.shipmentId, shipmentId), isNull(dismissals.deletedAt)))
      .orderBy(asc(dismissals.createdAt));
  }

  /** The live dismissal of this cut-off and date, if any. */
  async findLive(companyId: string, shipmentId: string, cutoff: CutoffKey, cutoffDate: string): Promise<ShipmentCutoffDismissalRecord | null> {
    const [row] = await db
      .select()
      .from(dismissals)
      .where(and(eq(dismissals.companyId, companyId), eq(dismissals.shipmentId, shipmentId), eq(dismissals.cutoff, cutoff), eq(dismissals.cutoffDate, cutoffDate), isNull(dismissals.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /**
   * The new dismissal with its line in the job's history; null when this cut-off and date is
   * dismissed already (a second click): then nothing is written, no second history line either.
   */
  async createWithHistory(values: NewShipmentCutoffDismissalRecord, history: History): Promise<ShipmentCutoffDismissalRecord | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .insert(dismissals)
        .values(values)
        .onConflictDoNothing({
          target: [dismissals.companyId, dismissals.shipmentId, dismissals.cutoff, dismissals.cutoffDate],
          where: sql`deleted_at IS NULL`,
        })
        .returning();
      if (!row) return null;
      await shipmentAuditRepository.create({ companyId: values.companyId, shipmentId: values.shipmentId, ...history }, tx);
      return row;
    });
  }

  /**
   * Takes a live dismissal back, with its line in the job's history; null when there is none
   * (never was, or already taken back): then nothing is written.
   */
  async takeBack(
    id: string,
    shipmentId: string,
    companyId: string,
    history: (row: ShipmentCutoffDismissalRecord) => History,
  ): Promise<ShipmentCutoffDismissalRecord | null> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(dismissals)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(dismissals.id, id), eq(dismissals.shipmentId, shipmentId), eq(dismissals.companyId, companyId), isNull(dismissals.deletedAt)))
        .returning();
      if (!row) return null;
      await shipmentAuditRepository.create({ companyId, shipmentId, ...history(row) }, tx);
      return row;
    });
  }
}

export const shipmentCutoffDismissalRepository = new ShipmentCutoffDismissalRepository();
