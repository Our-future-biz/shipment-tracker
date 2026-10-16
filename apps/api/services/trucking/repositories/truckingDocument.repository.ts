import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Tx } from "../db/db";
import { truckingDocumentTable, type NewTruckingDocumentRecord, type TruckingDocumentRecord } from "../schemas/truckingConsignment.schema";

const d = truckingDocumentTable;

class TruckingDocumentRepository {
  async insert(tx: Tx | typeof db, values: NewTruckingDocumentRecord): Promise<TruckingDocumentRecord> {
    const [row] = await tx.insert(d).values(values).returning();
    return row!;
  }

  /** A consignment's documents, newest first. */
  async list(companyId: string, consignmentId: string): Promise<TruckingDocumentRecord[]> {
    return db
      .select()
      .from(d)
      .where(and(eq(d.companyId, companyId), eq(d.consignmentId, consignmentId), isNull(d.deletedAt)))
      .orderBy(desc(d.createdAt));
  }

  async find(companyId: string, id: string): Promise<TruckingDocumentRecord | null> {
    const [row] = await db.select().from(d).where(and(eq(d.companyId, companyId), eq(d.id, id), isNull(d.deletedAt)));
    return row ?? null;
  }

  /** Which of the consignments have a POD document. */
  async withPod(companyId: string, consignmentIds: string[]): Promise<Set<string>> {
    if (!consignmentIds.length) return new Set();
    const rows = await db
      .selectDistinct({ id: d.consignmentId })
      .from(d)
      .where(and(eq(d.companyId, companyId), inArray(d.consignmentId, consignmentIds), eq(d.kind, "POD"), isNull(d.deletedAt)));
    return new Set(rows.map((r) => r.id));
  }

  /** Holds a transaction-scoped lock on the consignment's POD until the transaction ends (one POD per stop). */
  async lockPod(tx: Tx, companyId: string, consignmentId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`trucking-pod:${companyId}:${consignmentId}`}))`);
  }

  /** Soft-deletes a live document (a replaced POD); null when it is no longer live. */
  async retire(tx: Tx, companyId: string, id: string): Promise<TruckingDocumentRecord | null> {
    const now = new Date();
    const [row] = await tx
      .update(d)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(d.companyId, companyId), eq(d.id, id), isNull(d.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** Whether the consignment has a POD document. */
  async hasPod(companyId: string, consignmentId: string, reader: Tx | typeof db = db): Promise<boolean> {
    const [row] = await reader
      .select({ id: d.id })
      .from(d)
      .where(and(eq(d.companyId, companyId), eq(d.consignmentId, consignmentId), eq(d.kind, "POD"), isNull(d.deletedAt)))
      .limit(1);
    return !!row;
  }
}

export const truckingDocumentRepository = new TruckingDocumentRepository();
