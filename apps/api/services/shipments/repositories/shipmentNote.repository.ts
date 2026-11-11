import { eq, and, isNull, desc, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentNoteTable, type NewShipmentNoteRecord, type ShipmentNoteRecord } from "../schemas/shipmentNote.schema";

/** What a change of a note may set: its text, and whether (and by whom) it is done. */
export type NoteChange = Partial<Pick<NewShipmentNoteRecord, "text" | "details" | "dueDate" | "doneAt" | "doneById" | "pinned" | "pinnedAt">>;

const noteOf = (id: string, shipmentId: string, companyId: string) =>
  and(
    eq(shipmentNoteTable.id, id),
    eq(shipmentNoteTable.shipmentId, shipmentId),
    eq(shipmentNoteTable.companyId, companyId),
    isNull(shipmentNoteTable.deletedAt),
  );

class ShipmentNoteRepository extends TenantRepository<typeof shipmentNoteTable> {
  constructor() {
    super(db, shipmentNoteTable, "shipment_note");
  }

  /** The shipment's to-dos: open before done, starred first (the latest starred on top), then newest first. */
  async listByShipmentId(shipmentId: string, companyId: string): Promise<ShipmentNoteRecord[]> {
    return this.db
      .select()
      .from(shipmentNoteTable)
      .where(and(eq(shipmentNoteTable.companyId, companyId), eq(shipmentNoteTable.shipmentId, shipmentId), isNull(shipmentNoteTable.deletedAt)))
      .orderBy(sql`${shipmentNoteTable.doneAt} IS NOT NULL`, desc(shipmentNoteTable.pinned), sql`${shipmentNoteTable.pinnedAt} DESC NULLS LAST`, desc(shipmentNoteTable.createdAt));
  }

  /**
   * A to-do ticked off that already was (by somebody else at the same moment, or from a page not
   * reloaded since) keeps who ticked it and when: the first tick stands.
   */
  async updateNote(id: string, shipmentId: string, companyId: string, change: NoteChange): Promise<ShipmentNoteRecord | null> {
    const { doneAt, doneById, ...rest } = change;
    const ticked =
      doneAt instanceof Date
        ? {
            doneAt: sql`COALESCE(${shipmentNoteTable.doneAt}, ${doneAt})`,
            doneById: sql`CASE WHEN ${shipmentNoteTable.doneAt} IS NULL THEN ${doneById ?? null}::uuid ELSE ${shipmentNoteTable.doneById} END`,
          }
        : { ...("doneAt" in change ? { doneAt } : {}), ...("doneById" in change ? { doneById } : {}) };
    const [row] = await this.db
      .update(shipmentNoteTable)
      .set({ ...rest, ...ticked, updatedAt: new Date() })
      .where(noteOf(id, shipmentId, companyId))
      .returning();
    return row ?? null;
  }

  /** Whether a note was deleted. */
  async deleteNote(id: string, shipmentId: string, companyId: string): Promise<boolean> {
    const rows = await this.db
      .update(shipmentNoteTable)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(noteOf(id, shipmentId, companyId))
      .returning({ id: shipmentNoteTable.id });
    return rows.length > 0;
  }
}

export const shipmentNoteRepository = new ShipmentNoteRepository();
