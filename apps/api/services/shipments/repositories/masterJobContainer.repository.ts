import { and, asc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db, type Tx } from "../db/db";
import { masterJobTable } from "../schemas/masterJob.schema";
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

  // The master job's row, locked for the transaction: its container list is rewritten by one
  // writer at a time (two saves at once never leave every container twice).
  private async lockMasterJob(tx: Tx, masterJobId: string, companyId: string): Promise<void> {
    await tx
      .select({ id: masterJobTable.id })
      .from(masterJobTable)
      .where(and(eq(masterJobTable.id, masterJobId), eq(masterJobTable.companyId, companyId)))
      .for("update");
  }

  // Replace-all: nothing points at these rows (the houses hold their own copies), so the list is
  // simply rewritten in the given order - in one transaction, under the master job's lock.
  async replaceForMasterJob(masterJobId: string, companyId: string, lines: MasterJobContainerLine[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockMasterJob(tx, masterJobId, companyId);
      await this.writeList(tx, masterJobId, companyId, lines);
    });
  }

  /**
   * Takes a shipment out of the master job's containers, read and written under the master job's
   * lock: a save of the list at the same moment is never undone by a copy read before it.
   */
  async unassignShipment(masterJobId: string, companyId: string, shipmentId: string, toLine: (c: MasterJobContainerRecord) => MasterJobContainerLine): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockMasterJob(tx, masterJobId, companyId);
      const containers = await tx
        .select()
        .from(masterJobContainerTable)
        .where(and(eq(masterJobContainerTable.companyId, companyId), eq(masterJobContainerTable.masterJobId, masterJobId), isNull(masterJobContainerTable.deletedAt)))
        .orderBy(asc(masterJobContainerTable.position), asc(masterJobContainerTable.createdAt));
      if (!containers.some((c) => c.shipmentIds.includes(shipmentId))) return;
      await this.writeList(tx, masterJobId, companyId, containers.map((c) => ({ ...toLine(c), shipmentIds: c.shipmentIds.filter((s) => s !== shipmentId) })));
    });
  }

  private async writeList(tx: Tx, masterJobId: string, companyId: string, lines: MasterJobContainerLine[]): Promise<void> {
    await tx
      .delete(masterJobContainerTable)
      .where(and(eq(masterJobContainerTable.companyId, companyId), eq(masterJobContainerTable.masterJobId, masterJobId)));
    if (lines.length === 0) return;
    await tx.insert(masterJobContainerTable).values(
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
