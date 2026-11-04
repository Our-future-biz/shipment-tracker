import { and, desc, eq, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerTable, type CustomerRecord } from "../schemas/customer.schema";
import { customerSupplierRatingTable, type CustomerSupplierRatingRecord } from "../schemas/customerSupplierRating.schema";

/** A rating as it is set: the stars (null clears it), why, and who. */
export interface SupplierRatingWrite {
  rating: number | null;
  reason: string;
  setBy: string;
  setByUserId: string | null;
}

class CustomerSupplierRatingRepository extends TenantRepository<typeof customerSupplierRatingTable> {
  constructor() {
    super(db, customerSupplierRatingTable, "customer_supplier_rating");
  }

  /**
   * Sets the live customer's rating and keeps the change in its history, in one transaction. Cleared,
   * the customer goes back to not rated (no one, no time); the history row still says who cleared it.
   * Null when there is no such live customer.
   */
  async setRating(companyId: string, customerId: string, write: SupplierRatingWrite): Promise<CustomerRecord | null> {
    return this.db.transaction(async (tx) => {
      const rated = write.rating !== null;
      const now = new Date();
      const [row] = await tx
        .update(customerTable)
        .set({
          supplierRating: write.rating,
          supplierRatingReason: rated ? write.reason : "",
          supplierRatingBy: rated ? write.setBy : "",
          supplierRatingByUserId: rated ? write.setByUserId : null,
          supplierRatingAt: rated ? now : null,
          updatedAt: now,
        })
        .where(and(eq(customerTable.id, customerId), eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)))
        .returning();
      if (!row) return null;
      await tx.insert(customerSupplierRatingTable).values({ companyId, customerId, ...write, createdAt: now, updatedAt: now });
      return row;
    });
  }

  /** Every change of the customer's rating, newest first. */
  async listForCustomer(companyId: string, customerId: string): Promise<CustomerSupplierRatingRecord[]> {
    return this.db
      .select()
      .from(customerSupplierRatingTable)
      .where(and(
        eq(customerSupplierRatingTable.companyId, companyId),
        eq(customerSupplierRatingTable.customerId, customerId),
        isNull(customerSupplierRatingTable.deletedAt),
      ))
      .orderBy(desc(customerSupplierRatingTable.createdAt), desc(customerSupplierRatingTable.id));
  }
}

export const customerSupplierRatingRepository = new CustomerSupplierRatingRepository();
