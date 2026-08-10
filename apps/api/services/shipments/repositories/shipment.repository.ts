import { and, eq, or, ilike, isNull, like, desc, asc, count } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";

export interface ShipmentListFilters {
  customerId?: string;
  status?: string;
  search?: string;
  limit: number;
  offset: number;
  sortDirection: "asc" | "desc";
}

class ShipmentRepository extends TenantRepository<typeof shipmentTable> {
  constructor() {
    super(db as never, shipmentTable, "shipment");
  }

  async findByJobNumber(jobNumber: string, companyId: string) {
    return this.getByColumnForCompany(shipmentTable.jobNumber, jobNumber, companyId);
  }

  // Highest numeric CZ job number within a company — including archived (soft-deleted)
  // rows — so a reference is never reused. Job numbers are a per-company sequence.
  async maxCzJobNumber(companyId: string): Promise<number> {
    const rows = await this.db
      .select({ jobNumber: shipmentTable.jobNumber })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), like(shipmentTable.jobNumber, "CZ%")));
    let max = 0;
    for (const r of rows) {
      const jn = r.jobNumber;
      if (jn.startsWith("CZQ")) continue;
      const num = parseInt(jn.slice(2), 10);
      if (!Number.isNaN(num) && num > max) max = num;
    }
    return max;
  }

  async findByCustomerId(customerId: string, companyId: string) {
    return this.db
      .select()
      .from(shipmentTable)
      .where(and(
        eq(shipmentTable.companyId, companyId),
        eq(shipmentTable.customerId, customerId),
        isNull(shipmentTable.deletedAt),
      ));
  }

  async findByMasterJobId(masterJobId: string, companyId: string) {
    return this.db
      .select()
      .from(shipmentTable)
      .where(and(
        eq(shipmentTable.companyId, companyId),
        eq(shipmentTable.masterJobId, masterJobId),
        isNull(shipmentTable.deletedAt),
      ));
  }

  // Server-side filtered + paginated list, always scoped to the company.
  async listFiltered(companyId: string, f: ShipmentListFilters) {
    const clauses = [eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)];
    if (f.customerId) clauses.push(eq(shipmentTable.customerId, f.customerId));
    if (f.status) clauses.push(eq(shipmentTable.status, f.status));
    if (f.search) {
      const s = `%${f.search}%`;
      const match = or(
        ilike(shipmentTable.jobNumber, s),
        ilike(shipmentTable.shipper, s),
        ilike(shipmentTable.consignee, s),
        ilike(shipmentTable.customer, s),
        ilike(shipmentTable.pol, s),
        ilike(shipmentTable.pod, s),
      );
      if (match) clauses.push(match);
    }
    const where = and(...clauses);
    const direction = f.sortDirection === "asc" ? asc : desc;

    const [rows, [{ value: total }]] = await Promise.all([
      this.db.select().from(shipmentTable).where(where).orderBy(direction(shipmentTable.createdAt)).limit(f.limit).offset(f.offset),
      this.db.select({ value: count() }).from(shipmentTable).where(where),
    ]);
    return { data: rows, total: Number(total) };
  }

  // Company-scoped full scan for the dashboard aggregates.
  async listAllForCompany(companyId: string, limit = 5000) {
    return this.db
      .select()
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)))
      .orderBy(desc(shipmentTable.createdAt))
      .limit(limit);
  }
}

export const shipmentRepository = new ShipmentRepository();
