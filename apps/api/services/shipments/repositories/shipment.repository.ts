import { and, eq, or, ilike, isNull, like, desc, asc, count, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";
import { IMPORT_TASK_COUNT, EXPORT_TASK_COUNT } from "../taskCatalog";

/**
 * Predicates behind the Shipments overview tiles. Shared by the list filter and
 * the counts endpoint so a tile's number always matches the rows it opens.
 *
 * trade_direction is free text and has been written as both "Import" and
 * "IMPORT" over time, so every comparison against it is case-insensitive.
 */
// Relevant date: export -> departure, otherwise arrival.
const RELEVANT_ETA = sql`CASE WHEN lower(${shipmentTable.tradeDirection}) = 'export'
       THEN ${shipmentTable.estimatedDeparture}
       ELSE ${shipmentTable.estimatedArrival} END`;

/**
 * Outstanding workflow tasks.
 *
 * A shipment_task row only exists once someone ticks that task, and ticking is
 * write-once, so a `completed = false` row is never written — testing for one
 * would match nothing. Instead compare how many tasks have been ticked against
 * how many the shipment's direction defines (see taskCatalog.ts).
 */
const HAS_OPEN_TASK = sql`(
  SELECT COUNT(*) FROM shipment_task t
  WHERE t.shipment_id = ${shipmentTable.id}
    AND t.completed = true
    AND t.deleted_at IS NULL
) < CASE WHEN lower(${shipmentTable.tradeDirection}) = 'export'
         THEN ${EXPORT_TASK_COUNT} ELSE ${IMPORT_TASK_COUNT} END`;

const TILE_PREDICATES = {
  active: sql`${shipmentTable.invoicingStatus} IS DISTINCT FROM 'Invoiced'`,
  attention: sql`${RELEVANT_ETA} IS NOT NULL
    AND ${RELEVANT_ETA} >= CURRENT_DATE
    AND ${RELEVANT_ETA} <= CURRENT_DATE + 3
    AND ${HAS_OPEN_TASK}`,
  import: sql`lower(${shipmentTable.tradeDirection}) = 'import'`,
  export: sql`lower(${shipmentTable.tradeDirection}) = 'export'`,
  week: sql`${RELEVANT_ETA} IS NOT NULL
    AND date_trunc('week', ${RELEVANT_ETA}) = date_trunc('week', CURRENT_DATE)`,
  nextweek: sql`${RELEVANT_ETA} IS NOT NULL
    AND date_trunc('week', ${RELEVANT_ETA}) = date_trunc('week', CURRENT_DATE + 7)`,
} as const;

export type TileId = keyof typeof TILE_PREDICATES;

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
      const predicate = TILE_PREDICATES[f.tile as TileId];
      if (predicate) clauses.push(predicate);
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

    const [row] = await this.db
      .select({
        active: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.active})`,
        attention: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.attention})`,
        importCount: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.import})`,
        exportCount: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.export})`,
        week: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.week})`,
        nextWeek: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.nextweek})`,
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
