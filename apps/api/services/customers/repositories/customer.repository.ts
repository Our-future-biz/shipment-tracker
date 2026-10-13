import { and, eq, or, ilike, desc, isNull } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerTable } from "../schemas/customer.schema";

export interface CustomerListFilters {
  search?: string;
  status?: string;
  label?: string;
  country?: string;
  limit?: number;
}

class CustomerRepository extends TenantRepository<typeof customerTable> {
  constructor() {
    super(db as never, customerTable, "customer");
  }

  async findByIco(ico: string, companyId: string) {
    return this.getByColumnForCompany(customerTable.ico, ico, companyId);
  }

  async listAll(companyId: string, limit = 2000) {
    return this.listForCompany(companyId, limit);
  }

  // Server-side filtered list, always scoped to the company.
  async listFiltered(companyId: string, f: CustomerListFilters) {
    const clauses = [eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)];
    if (f.status) clauses.push(eq(customerTable.status, f.status));
    if (f.label) clauses.push(eq(customerTable.label, f.label));
    if (f.country) clauses.push(eq(customerTable.country, f.country));
    if (f.search) {
      const s = `%${f.search}%`;
      const match = or(
        ilike(customerTable.companyName, s),
        ilike(customerTable.ico, s),
        ilike(customerTable.dic, s),
        ilike(customerTable.city, s),
      );
      if (match) clauses.push(match);
    }
    return this.db
      .select()
      .from(customerTable)
      .where(and(...clauses))
      .orderBy(desc(customerTable.createdAt))
      .limit(f.limit ?? 2000);
  }

  // Every live customer of the company with what the sales pipeline shows of it. All of them -
  // the pipeline counts every customer, so a limit would be a silent cap - and only these
  // columns: a row also carries the logo, a base64 image.
  async pipelineList(companyId: string) {
    return this.db
      .select({
        id: customerTable.id,
        companyName: customerTable.companyName,
        status: customerTable.status,
        label: customerTable.label,
        salesOwner: customerTable.salesOwner,
        createdAt: customerTable.createdAt,
      })
      .from(customerTable)
      .where(and(eq(customerTable.companyId, companyId), isNull(customerTable.deletedAt)));
  }

  async listByStatus(status: string, companyId: string, limit = 2000) {
    const rows = await this.db
      .select()
      .from(customerTable)
      .where(and(
        eq(customerTable.companyId, companyId),
        eq(customerTable.status, status),
        isNull(customerTable.deletedAt),
      ))
      .orderBy(desc(customerTable.createdAt))
      .limit(limit);
    return rows;
  }
}

export const customerRepository = new CustomerRepository();
