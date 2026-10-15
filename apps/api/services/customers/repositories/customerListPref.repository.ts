import { eq, and, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerListPrefTable, type CustomerListPrefRecord } from "../schemas/customerListPref.schema";

class CustomerListPrefRepository extends TenantRepository<typeof customerListPrefTable> {
  constructor() {
    super(db, customerListPrefTable, "customer_list_pref");
  }

  async get(companyId: string, userId: string, prefKey: string): Promise<CustomerListPrefRecord | null> {
    const [row] = await this.db
      .select()
      .from(customerListPrefTable)
      .where(and(
        eq(customerListPrefTable.companyId, companyId),
        eq(customerListPrefTable.userId, userId),
        eq(customerListPrefTable.prefKey, prefKey),
        isNull(customerListPrefTable.deletedAt),
      ))
      .limit(1);
    return row ?? null;
  }

  // One statement, so two saves at once can't both insert.
  async set(companyId: string, userId: string, prefKey: string, value: unknown): Promise<void> {
    await this.db
      .insert(customerListPrefTable)
      .values({ companyId, userId, prefKey, value })
      .onConflictDoUpdate({
        target: [customerListPrefTable.companyId, customerListPrefTable.userId, customerListPrefTable.prefKey],
        targetWhere: sql`deleted_at IS NULL`,
        set: { value, updatedAt: new Date() },
      });
  }
}

export const customerListPrefRepository = new CustomerListPrefRepository();
