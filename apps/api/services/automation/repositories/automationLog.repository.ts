import { and, desc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { automationLogTable as t, type AutomationLogRecord } from "../schemas/automationLog.schema";

class AutomationLogRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "automation_log");
  }

  async listByShipmentId(shipmentId: string, companyId: string, limit = 100): Promise<AutomationLogRecord[]> {
    return this.db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(desc(t.createdAt))
      .limit(limit);
  }
}

export const automationLogRepository = new AutomationLogRepository();
