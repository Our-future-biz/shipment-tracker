import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/db";
import { coLoadingBoxCostChangeTable as changes, coLoadingBoxCostTable as costs, type CoLoadingBoxCostChangeRecord, type CoLoadingBoxCostRecord } from "../schemas/coLoadingBoxCost.schema";
import type { BoxCostLineInput } from "../lib/coLoadingBoxCosts";

const text = (amount: number | null) => (amount === null ? null : amount.toFixed(2));

// The costs of a sailing's boxes and the record of their changes. Every statement names the company.
export const coLoadingBoxCostRepository = {
  async list(sailingId: string, companyId: string): Promise<CoLoadingBoxCostRecord[]> {
    return db
      .select()
      .from(costs)
      .where(and(eq(costs.companyId, companyId), eq(costs.sailingId, sailingId)))
      .orderBy(asc(costs.containerNo), asc(costs.kind));
  },

  /** Writes the changed costs of one container and a record of each change, together or not at all. */
  async save(
    sailingId: string,
    companyId: string,
    containerNo: number,
    changed: { old: BoxCostLineInput | null; next: BoxCostLineInput }[],
    by: { id: string; name: string },
  ): Promise<void> {
    if (!changed.length) return;
    await db.transaction(async (tx) => {
      for (const { old, next } of changed) {
        await tx
          .insert(costs)
          .values({ companyId, sailingId, containerNo, kind: next.kind, amount: text(next.amount), currency: next.currency, note: next.note, updatedById: by.id, updatedByName: by.name })
          .onConflictDoUpdate({
            target: [costs.companyId, costs.sailingId, costs.containerNo, costs.kind],
            set: { amount: text(next.amount), currency: next.currency, note: next.note, updatedById: by.id, updatedByName: by.name, updatedAt: sql`now()` },
          });
        await tx.insert(changes).values({
          companyId,
          sailingId,
          containerNo,
          kind: next.kind,
          oldAmount: text(old?.amount ?? null),
          oldCurrency: old?.currency ?? "",
          oldNote: old?.note ?? "",
          newAmount: text(next.amount),
          newCurrency: next.currency,
          newNote: next.note,
          changedById: by.id,
          changedByName: by.name,
        });
      }
    });
  },

  /** The record of changes, the last one first. */
  async changes(sailingId: string, companyId: string): Promise<CoLoadingBoxCostChangeRecord[]> {
    return db
      .select()
      .from(changes)
      .where(and(eq(changes.companyId, companyId), eq(changes.sailingId, sailingId)))
      .orderBy(desc(changes.changedAt), asc(changes.containerNo), asc(changes.kind))
      .limit(500);
  },
};
