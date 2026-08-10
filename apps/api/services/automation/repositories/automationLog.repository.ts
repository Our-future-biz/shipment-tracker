import { eq, and, desc } from "drizzle-orm";
import { db } from "../db/db";
import { automationLogTable } from "../schemas/automationLog.schema";

class AutomationLogRepository {
  async listByShipmentId(shipmentId: string, companyId: string, limit = 100) {
    return db
      .select()
      .from(automationLogTable)
      .where(and(eq(automationLogTable.companyId, companyId), eq(automationLogTable.shipmentId, shipmentId)))
      .orderBy(desc(automationLogTable.createdAt))
      .limit(limit);
  }

  async create(data: { companyId: string; shipmentId: string; ruleName: string; action: string; details?: unknown; triggeredById?: string | null }) {
    const [row] = await db.insert(automationLogTable).values(data as never).returning();
    return row!;
  }
}

export const automationLogRepository = new AutomationLogRepository();
