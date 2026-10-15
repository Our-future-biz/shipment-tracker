import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { masterJobTable, type MasterJobRecord } from "../schemas/masterJob.schema";
import { shipmentTable } from "../schemas/shipment.schema";
import { shipmentRefCounterRepository } from "./shipmentRefCounter.repository";

class MasterJobRepository extends TenantRepository<typeof masterJobTable> {
  constructor() {
    super(db, masterJobTable, "master_job");
  }

  async findByMczNumber(mczNumber: string, companyId: string) {
    return this.getByColumnForCompany(masterJobTable.mczNumber, mczNumber, companyId);
  }

  // Inserts a master job under the company's next MCZ number, taken in the same transaction
  // as the insert, so two creates at the same moment never get the same number.
  async createWithMczNumber(companyId: string): Promise<MasterJobRecord> {
    return this.db.transaction(async (tx) => {
      const mczNumber = await shipmentRefCounterRepository.allocate(tx, companyId, "MCZ");
      const [created] = await tx.insert(masterJobTable).values({ companyId, mczNumber }).returning();
      return created!;
    });
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
