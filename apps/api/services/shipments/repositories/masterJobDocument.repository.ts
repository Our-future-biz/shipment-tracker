import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { masterJobDocumentTable, type MasterJobDocumentRecord } from "../schemas/masterJobDocument.schema";

class MasterJobDocumentRepository extends TenantRepository<typeof masterJobDocumentTable> {
  constructor() {
    super(db, masterJobDocumentTable, "master_job_document");
  }

  /** A master job's documents, oldest first (as a shipment's). */
  async listByMasterJobId(masterJobId: string, companyId: string): Promise<MasterJobDocumentRecord[]> {
    return this.db
      .select()
      .from(masterJobDocumentTable)
      .where(
        and(
          eq(masterJobDocumentTable.companyId, companyId),
          eq(masterJobDocumentTable.masterJobId, masterJobId),
          isNull(masterJobDocumentTable.deletedAt),
        ),
      )
      .orderBy(asc(masterJobDocumentTable.createdAt));
  }

  /** One live document of this master job in this company; null when there is none. */
  async getForMasterJob(id: string, masterJobId: string, companyId: string): Promise<MasterJobDocumentRecord | null> {
    const [row] = await this.db
      .select()
      .from(masterJobDocumentTable)
      .where(
        and(
          eq(masterJobDocumentTable.id, id),
          eq(masterJobDocumentTable.masterJobId, masterJobId),
          eq(masterJobDocumentTable.companyId, companyId),
          isNull(masterJobDocumentTable.deletedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }
}

export const masterJobDocumentRepository = new MasterJobDocumentRepository();
