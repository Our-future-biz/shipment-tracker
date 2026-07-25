import { and, eq, desc, isNull } from "drizzle-orm";
import { BaseRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { customerTable } from "../schemas/customer.schema";

class CustomerRepository extends BaseRepository<typeof customerTable> {
  constructor() {
    super(db as never, customerTable, "customer");
  }

  async findByIco(ico: string) {
    return this.getByColumn(customerTable.ico, ico);
  }

  async listAll(limit = 2000) {
    const rows = await this.db
      .select()
      .from(customerTable)
      .where(isNull(customerTable.deletedAt))
      .orderBy(desc(customerTable.createdAt))
      .limit(limit);
    return rows;
  }

  async listByStatus(status: string, limit = 2000) {
    const rows = await this.db
      .select()
      .from(customerTable)
      .where(and(eq(customerTable.status, status), isNull(customerTable.deletedAt)))
      .orderBy(desc(customerTable.createdAt))
      .limit(limit);
    return rows;
  }
}

export const customerRepository = new CustomerRepository();
