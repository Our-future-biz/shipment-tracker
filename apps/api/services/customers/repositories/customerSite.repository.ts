import { and, eq, asc, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerSiteTable, type CustomerSiteRecord, type NewCustomerSiteRecord } from "../schemas/customerSite.schema";
import { clearOtherDefaultSites } from "./customerAddress.repository";

/** What an edit of a site from before sites were linked to addresses (no address) may change. */
export type SitePatch = Partial<Omit<NewCustomerSiteRecord, "id" | "companyId" | "customerId" | "addressId" | "createdAt" | "updatedAt" | "deletedAt">>;

class CustomerSiteRepository extends TenantRepository<typeof customerSiteTable> {
  constructor() {
    super(db, customerSiteTable, "customer_site");
  }

  // Scoped by company as well as customer, so a guessed customerId from another
  // company returns nothing.
  async findByCustomer(customerId: string, companyId: string) {
    return this.db
      .select()
      .from(customerSiteTable)
      .where(and(
        eq(customerSiteTable.companyId, companyId),
        eq(customerSiteTable.customerId, customerId),
        isNull(customerSiteTable.deletedAt),
      ))
      .orderBy(asc(customerSiteTable.createdAt));
  }

  /** The live site of an address; null when it has none. */
  async findByAddress(addressId: string, companyId: string) {
    const [row] = await this.db
      .select()
      .from(customerSiteTable)
      .where(and(eq(customerSiteTable.companyId, companyId), eq(customerSiteTable.addressId, addressId), isNull(customerSiteTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /**
   * An edit of a live site of the customer that has no address; null when there is none. Made the
   * default, the customer's other default site stops being it in the same transaction. The site is
   * locked first, so one deleted meanwhile changes nobody else.
   */
  async updateInCustomer(id: string, companyId: string, customerId: string, patch: SitePatch): Promise<CustomerSiteRecord | null> {
    return this.db.transaction(async (tx) => {
      const live = and(eq(customerSiteTable.id, id), eq(customerSiteTable.companyId, companyId), eq(customerSiteTable.customerId, customerId), isNull(customerSiteTable.deletedAt));
      const [found] = await tx.select({ id: customerSiteTable.id }).from(customerSiteTable).where(live).limit(1).for("update");
      if (!found) return null;
      if (patch.isDefault) await clearOtherDefaultSites(tx, companyId, customerId, id);
      const [row] = await tx.update(customerSiteTable).set({ ...patch, updatedAt: new Date() }).where(live).returning();
      return row ?? null;
    });
  }
}

export const customerSiteRepository = new CustomerSiteRepository();
