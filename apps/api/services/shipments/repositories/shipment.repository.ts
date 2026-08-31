import { and, eq, or, ilike, isNull, like, desc, asc, count, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";

export interface ShipmentListFilters {
  /** Overview tile filter: active | attention | import | export | week | nextweek */
  tile?: string;
  customerId?: string;
  status?: string;
  /** UI status bucket — a coarse grouping over the many free-text status values. */
  statusBucket?: string;
  search?: string;
  limit: number;
  offset: number;
  sortDirection: "asc" | "desc";
}

// The status column holds long free-text labels ("Booked For Further Transport [IMP]", …).
// The shipments UI groups them into coarse buckets; each bucket matches if the status
// contains any of these fragments.
const STATUS_BUCKETS: Record<string, string[]> = {
  active: ["active", "pending", "new"],
  "in-transit": ["transport", "shipped", "pre-alert", "loaded"],
  customs: ["customs"],
  delivered: ["billed", "billing", "delivered"],
};

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

  // Customer rollups as a single SQL aggregate — selling/buying are numeric, so Postgres
  // sums them exactly instead of loading every shipment row into JS.
  async customerRollups(customerId: string, companyId: string) {
    const [row] = await this.db
      .select({
        totalRevenue: sql<string>`COALESCE(SUM(${shipmentTable.selling}), 0)`,
        totalProfit: sql<string>`COALESCE(SUM(${shipmentTable.selling} - ${shipmentTable.buying}), 0)`,
        totalShipments: count(),
        lastActivityDate: sql<string | null>`MAX(COALESCE(${shipmentTable.estimatedArrival}::text, ${shipmentTable.createdAt}::date::text))`,
      })
      .from(shipmentTable)
      .where(and(
        eq(shipmentTable.companyId, companyId),
        eq(shipmentTable.customerId, customerId),
        isNull(shipmentTable.deletedAt),
      ));
    return {
      totalRevenue: Number(row?.totalRevenue ?? 0),
      totalProfit: Number(row?.totalProfit ?? 0),
      totalShipments: Number(row?.totalShipments ?? 0),
      lastActivityDate: row?.lastActivityDate ?? "",
    };
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
    if (f.statusBucket && f.statusBucket !== "all") {
      const fragments = STATUS_BUCKETS[f.statusBucket];
      if (fragments) {
        const bucketMatch = or(...fragments.map((frag) => ilike(shipmentTable.status, `%${frag}%`)));
        if (bucketMatch) clauses.push(bucketMatch);
      }
    }
    if (f.tile && f.tile !== "all") {
      const relevantEta = sql`COALESCE(
        CASE WHEN lower(${shipmentTable.tradeDirection}) = 'export'
             THEN ${shipmentTable.estimatedDeparture}
             ELSE ${shipmentTable.estimatedArrival} END, NULL)`;
      if (f.tile === "active") {
        clauses.push(sql`${shipmentTable.invoicingStatus} IS DISTINCT FROM 'Invoiced'`);
      } else if (f.tile === "attention") {
        clauses.push(sql`${relevantEta} IS NOT NULL
          AND ${relevantEta} >= CURRENT_DATE
          AND ${relevantEta} <= CURRENT_DATE + 3
          AND EXISTS (SELECT 1 FROM shipment_task t
                      WHERE t.shipment_id = ${shipmentTable.id}
                        AND t.completed = false AND t.deleted_at IS NULL)`);
      } else if (f.tile === "import" || f.tile === "export") {
        clauses.push(eq(shipmentTable.tradeDirection, f.tile === "import" ? "Import" : "Export"));
      } else if (f.tile === "week") {
        clauses.push(sql`${relevantEta} IS NOT NULL
          AND date_trunc('week', ${relevantEta}) = date_trunc('week', CURRENT_DATE)`);
      } else if (f.tile === "nextweek") {
        clauses.push(sql`${relevantEta} IS NOT NULL
          AND date_trunc('week', ${relevantEta}) = date_trunc('week', CURRENT_DATE + 7)`);
      }
    }
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


  /**
   * Counts for the Shipments overview tiles, computed in SQL over the whole
   * company dataset (not just the current page).
   *
   * "attention" mirrors the mockup: a relevant ETA within 3 days AND at least
   * one open task. Import uses estimatedArrival, export uses estimatedDeparture.
   */
  async tileCounts(companyId: string) {
    const base = and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt));

    // Relevant date: export -> departure, otherwise arrival.
    const relevantEta = sql`COALESCE(
      CASE WHEN lower(${shipmentTable.tradeDirection}) = 'export'
           THEN ${shipmentTable.estimatedDeparture}
           ELSE ${shipmentTable.estimatedArrival} END, NULL)`;

    const openTasks = sql`EXISTS (
      SELECT 1 FROM shipment_task t
      WHERE t.shipment_id = ${shipmentTable.id}
        AND t.completed = false
        AND t.deleted_at IS NULL
    )`;

    const [row] = await this.db
      .select({
        active: sql<number>`COUNT(*) FILTER (WHERE ${shipmentTable.invoicingStatus} IS DISTINCT FROM 'Invoiced')`,
        attention: sql<number>`COUNT(*) FILTER (WHERE ${relevantEta} IS NOT NULL
          AND ${relevantEta} >= CURRENT_DATE
          AND ${relevantEta} <= CURRENT_DATE + 3
          AND ${openTasks})`,
        importCount: sql<number>`COUNT(*) FILTER (WHERE ${shipmentTable.tradeDirection} = 'Import')`,
        exportCount: sql<number>`COUNT(*) FILTER (WHERE ${shipmentTable.tradeDirection} = 'Export')`,
        week: sql<number>`COUNT(*) FILTER (WHERE ${relevantEta} IS NOT NULL
          AND date_trunc('week', ${relevantEta}) = date_trunc('week', CURRENT_DATE))`,
        nextWeek: sql<number>`COUNT(*) FILTER (WHERE ${relevantEta} IS NOT NULL
          AND date_trunc('week', ${relevantEta}) = date_trunc('week', CURRENT_DATE + 7))`,
      })
      .from(shipmentTable)
      .where(base);

    return {
      active: Number(row?.active ?? 0),
      attention: Number(row?.attention ?? 0),
      import: Number(row?.importCount ?? 0),
      export: Number(row?.exportCount ?? 0),
      week: Number(row?.week ?? 0),
      nextWeek: Number(row?.nextWeek ?? 0),
    };
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
