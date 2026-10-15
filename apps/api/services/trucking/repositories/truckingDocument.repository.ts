import { and, desc, eq, isNull } from "drizzle-orm";
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
