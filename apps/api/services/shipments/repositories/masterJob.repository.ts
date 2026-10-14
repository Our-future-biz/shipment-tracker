import { and, count, eq, inArray, isNull, like } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { masterJobTable } from "../schemas/masterJob.schema";
import { shipmentTable } from "../schemas/shipment.schema";
import { mczSequence } from "../lib/masterJobSync";

class MasterJobRepository extends TenantRepository<typeof masterJobTable> {
  constructor() {
    super(db, masterJobTable, "master_job");
  }

  async findByMczNumber(mczNumber: string, companyId: string) {
    return this.getByColumnForCompany(masterJobTable.mczNumber, mczNumber, companyId);
  }

  // Highest MCZ sequence within a company — including archived (soft-deleted)
  // rows — so an MCZ number is never handed out twice.
  async maxMczSequence(companyId: string): Promise<number> {
    const rows = await this.db
      .select({ mczNumber: masterJobTable.mczNumber })
      .from(masterJobTable)
      .where(and(eq(masterJobTable.companyId, companyId), like(masterJobTable.mczNumber, "MCZ%")));
    return rows.reduce((max, r) => Math.max(max, mczSequence(r.mczNumber)), 0);
  }

  /** Live shipments per master job, for the given ids. */
  async shipmentCounts(masterJobIds: string[], companyId: string): Promise<Map<string, number>> {
    if (masterJobIds.length === 0) return new Map();
    const rows = await this.db
      .select({ masterJobId: shipmentTable.masterJobId, n: count() })
      .from(shipmentTable)
      .where(and(
        eq(shipmentTable.companyId, companyId),
        inArray(shipmentTable.masterJobId, masterJobIds),
        isNull(shipmentTable.deletedAt),
      ))
      .groupBy(shipmentTable.masterJobId);
    return new Map(rows.map((r) => [r.masterJobId as string, Number(r.n)]));
  }
}

export const masterJobRepository = new MasterJobRepository();
