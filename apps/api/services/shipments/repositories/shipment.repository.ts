import { eq, like } from "drizzle-orm";
import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";

class ShipmentRepository extends BaseRepository<typeof shipmentTable> {
  constructor() {
    super(db as never, shipmentTable, "shipment");
  }

  async findByJobNumber(jobNumber: string) {
    return this.getByColumn(shipmentTable.jobNumber, jobNumber);
  }

  // Highest numeric CZ job number across ALL shipments — including archived
  // (soft-deleted) ones — so a reference is never reused.
  async maxCzJobNumber(): Promise<number> {
    const rows = await this.db
      .select({ jobNumber: shipmentTable.jobNumber })
      .from(shipmentTable)
      .where(like(shipmentTable.jobNumber, "CZ%"));
    let max = 0;
    for (const r of rows) {
      const jn = r.jobNumber;
      if (jn.startsWith("CZQ")) continue;
      const num = parseInt(jn.slice(2), 10);
      if (!Number.isNaN(num) && num > max) max = num;
    }
    return max;
  }

  async findByMasterJobId(masterJobId: string) {
    const rows = await this.db
      .select()
      .from(shipmentTable)
      .where(eq(shipmentTable.masterJobId, masterJobId));
    return rows;
  }
}

export const shipmentRepository = new ShipmentRepository();
