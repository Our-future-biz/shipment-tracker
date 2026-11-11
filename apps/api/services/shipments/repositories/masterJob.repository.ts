import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { masterJobTable, type MasterJobRecord } from "../schemas/masterJob.schema";
import { shipmentTable } from "../schemas/shipment.schema";
import { masterJobNumberForms } from "../lib/masterJobNumber";
import { shipmentRefCounterRepository } from "./shipmentRefCounter.repository";

class MasterJobRepository extends TenantRepository<typeof masterJobTable> {
  constructor() {
    super(db, masterJobTable, "master_job");
  }

  /** The live master job with this number, whatever letters it or the reference asked for carry. */
  async findByMczNumber(mczNumber: string, companyId: string): Promise<MasterJobRecord | null> {
    const [row] = await this.db
      .select()
      .from(masterJobTable)
      .where(and(eq(masterJobTable.companyId, companyId), inArray(masterJobTable.mczNumber, masterJobNumberForms(mczNumber)), isNull(masterJobTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  // Inserts a master job under the company's next MCZ number, taken in the same transaction
  // as the insert, so two creates at the same moment never get the same number.
  async createWithMczNumber(companyId: string, createdBy = ""): Promise<MasterJobRecord> {
    return this.db.transaction(async (tx) => {
      const mczNumber = await shipmentRefCounterRepository.allocate(tx, companyId, "MCZ");
      const [created] = await tx.insert(masterJobTable).values({ companyId, mczNumber, createdBy }).returning();
      return created!;
    });
  }

  /** The MCZ number of each of the company's live master jobs among `ids`, by id - one query for a whole page of shipments. */
  async mczNumbersByIds(ids: readonly string[], companyId: string): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: masterJobTable.id, mczNumber: masterJobTable.mczNumber })
      .from(masterJobTable)
      .where(and(eq(masterJobTable.companyId, companyId), inArray(masterJobTable.id, [...ids]), isNull(masterJobTable.deletedAt)));
    return new Map(rows.map((r) => [r.id, r.mczNumber]));
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
