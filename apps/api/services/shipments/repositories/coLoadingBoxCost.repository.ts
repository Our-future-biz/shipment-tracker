import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/db";
import { coLoadingBoxCostChangeTable as changes, coLoadingBoxCostTable as costs, type CoLoadingBoxCostChangeRecord, type CoLoadingBoxCostRecord } from "../schemas/coLoadingBoxCost.schema";
import { coLoadingSailingTable as sailings } from "../schemas/coLoadingSailing.schema";
import { boxCostChanges, boxCostsChangedBy, type BoxCostLineInput } from "../lib/coLoadingBoxCosts";

/** The container's costs were changed by somebody else since the dialog read them: nothing was written. */
export class BoxCostsChangedMeanwhile extends Error {
  constructor(readonly by: string) {
    super("box costs changed meanwhile");
  }
}

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

  /**
   * Writes one container's costs and a record of each line that changed, together or not at all.
   * The sailing's row is locked first, so two saves go one after the other and each record's "old"
   * figure is the one it really replaced. With `expected` (what the dialog showed), a save over
   * costs changed meanwhile throws BoxCostsChangedMeanwhile and writes nothing.
   */
  async save(sailingId: string, companyId: string, containerNo: number, next: BoxCostLineInput[], expected: BoxCostLineInput[] | null, by: { id: string; name: string }): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.select({ id: sailings.id }).from(sailings).where(and(eq(sailings.id, sailingId), eq(sailings.companyId, companyId))).for("update");
      const stored = (
        await tx
          .select()
          .from(costs)
          .where(and(eq(costs.companyId, companyId), eq(costs.sailingId, sailingId), eq(costs.containerNo, containerNo)))
      ).map((r) => ({ kind: r.kind, amount: r.amount === null ? null : Number(r.amount), currency: r.currency, note: r.note, updatedByName: r.updatedByName }));
      const changedBy = expected ? boxCostsChangedBy(stored, expected) : null;
      if (changedBy !== null) throw new BoxCostsChangedMeanwhile(changedBy);
      const changed = boxCostChanges(stored, next);
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

  /** A change of the sailing itself that moves its box costs - its number of containers, its departure date - into the same record. */
  async recordSailingChanges(
    sailingId: string,
    companyId: string,
    changed: { kind: string; oldAmount: number | null; newAmount: number | null; oldNote: string; newNote: string }[],
    by: { id: string; name: string },
  ): Promise<void> {
    if (!changed.length) return;
    await db.insert(changes).values(
      changed.map((c) => ({
        companyId,
        sailingId,
        // 0: the change is of the sailing, not of one container.
        containerNo: 0,
        kind: c.kind,
        oldAmount: c.oldAmount === null ? null : String(c.oldAmount),
        newAmount: c.newAmount === null ? null : String(c.newAmount),
        oldNote: c.oldNote,
        newNote: c.newNote,
        changedById: by.id,
        changedByName: by.name,
      })),
    );
  },

  /** The containers of a sailing that have a cost with an amount. */
  async costedContainers(sailingId: string, companyId: string): Promise<number[]> {
    const rows = await db
      .selectDistinct({ containerNo: costs.containerNo })
      .from(costs)
      .where(and(eq(costs.companyId, companyId), eq(costs.sailingId, sailingId), isNotNull(costs.amount)))
      .orderBy(asc(costs.containerNo));
    return rows.map((r) => r.containerNo);
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
