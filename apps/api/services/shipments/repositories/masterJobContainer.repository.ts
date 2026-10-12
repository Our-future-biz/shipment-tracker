import { asc, eq } from "drizzle-orm";
import { db } from "../db/db";
import { masterJobContainerTable } from "../schemas/masterJobContainer.schema";
import { normalizeContainerNumber } from "../services/cargoProjection";
import type { MasterJobContainerLine } from "../interfaces/interfaces";

class MasterJobContainerRepository {
  async listByMasterJobId(masterJobId: string) {
    return db
      .select()
      .from(masterJobContainerTable)
      .where(eq(masterJobContainerTable.masterJobId, masterJobId))
      .orderBy(asc(masterJobContainerTable.position), asc(masterJobContainerTable.createdAt));
  }

  // Replace-all: nothing points at these rows (the houses hold their own copies),
  // so the list is simply rewritten in the given order.
  async replaceForMasterJob(masterJobId: string, companyId: string, lines: MasterJobContainerLine[]) {
    await db.delete(masterJobContainerTable).where(eq(masterJobContainerTable.masterJobId, masterJobId));
    if (lines.length === 0) return;
    await db.insert(masterJobContainerTable).values(
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
