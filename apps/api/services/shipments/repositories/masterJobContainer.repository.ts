import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { masterJobContainerTable, type MasterJobContainerRecord } from "../schemas/masterJobContainer.schema";
import { normalizeContainerNumber } from "../lib/cargoProjection";
import type { MasterJobContainerLine } from "../interfaces/interfaces";

class MasterJobContainerRepository extends TenantRepository<typeof masterJobContainerTable> {
  constructor() {
    super(db, masterJobContainerTable, "master_job_container");
  }

  async listByMasterJobId(masterJobId: string, companyId: string): Promise<MasterJobContainerRecord[]> {
    return this.db
      .select()
      .from(masterJobContainerTable)
      .where(
        and(
          eq(masterJobContainerTable.companyId, companyId),
          eq(masterJobContainerTable.masterJobId, masterJobId),
          isNull(masterJobContainerTable.deletedAt),
        ),
      )
      .orderBy(asc(masterJobContainerTable.position), asc(masterJobContainerTable.createdAt));
  }

  // Replace-all: nothing points at these rows (the houses hold their own copies),
  // so the list is simply rewritten in the given order.
  async replaceForMasterJob(masterJobId: string, companyId: string, lines: MasterJobContainerLine[]): Promise<void> {
    await this.db
      .delete(masterJobContainerTable)
      .where(and(eq(masterJobContainerTable.companyId, companyId), eq(masterJobContainerTable.masterJobId, masterJobId)));
    if (lines.length === 0) return;
    await this.db.insert(masterJobContainerTable).values(
      lines.map((line, i) => ({
        companyId,
        masterJobId,
        position: i,
        containerNumber: normalizeContainerNumber(line.containerNumber),
        sealNumber: line.sealNumber.trim(),
        type: line.type,
        shipmentIds: [...new Set(line.shipmentIds)],
      })),
    );
  }
}

export const masterJobContainerRepository = new MasterJobContainerRepository();
