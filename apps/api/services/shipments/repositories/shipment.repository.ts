import { eq } from "drizzle-orm";
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

  async findByMasterJobId(masterJobId: string) {
    const rows = await this.db
      .select()
      .from(shipmentTable)
      .where(eq(shipmentTable.masterJobId, masterJobId));
    return rows;
  }
}

export const shipmentRepository = new ShipmentRepository();
