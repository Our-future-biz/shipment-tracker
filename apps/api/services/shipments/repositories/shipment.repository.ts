import { and, eq, or, ilike, isNull, like, desc, asc, count, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentTable } from "../schemas/shipment.schema";

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
 * What a shipment has to be ready for — the dates behind "Needs Attention".
 *
 * Plain dates count while they are still ahead. The four compliance items carry a
 * status, so they count only while that status says the work is open, and they stay
 * on the list after their date has passed (`keepsOverdue`) until someone confirms them:
 *   VGM / SI   — by their closing date, unless Confirmed (VGM also: Not Applicable);
 *   AMS / ISF  — when Pending, they must be filed 4 days before departure.
 *
 * Statuses are free text with decoration ("Confirmed (Green)"), hence the LIKE matches.
 */
const statusHas = (column: PgColumn, fragment: string) => sql`lower(${column}) LIKE ${`%${fragment}%`}`;
const FILED_BEFORE_DEPARTURE = sql`${shipmentTable.estimatedDeparture} - 4`;

const DEADLINE_DEFS = {
  cargoReadinessDate: { date: sql`${shipmentTable.cargoReadinessDate}`, keepsOverdue: false },
  closingDate: { date: sql`${shipmentTable.closingDate}`, keepsOverdue: false },
  estimatedDeparture: { date: sql`${shipmentTable.estimatedDeparture}`, keepsOverdue: false },
  estimatedArrival: { date: sql`${shipmentTable.estimatedArrival}`, keepsOverdue: false },
  etaWarehouse: { date: sql`${shipmentTable.etaWarehouse}`, keepsOverdue: false },
  plannedDeliveryDate: { date: sql`${shipmentTable.plannedDeliveryDate}`, keepsOverdue: false },
  vgmClosing: {
    date: sql`CASE WHEN NOT (${statusHas(shipmentTable.vgm, "confirmed")} OR ${statusHas(shipmentTable.vgm, "not applicable")})
      THEN ${shipmentTable.vgmClosing} END`,
    keepsOverdue: true,
  },
  siClosing: {
    date: sql`CASE WHEN NOT ${statusHas(shipmentTable.shippingInstructions, "confirmed")} THEN ${shipmentTable.siClosing} END`,
    keepsOverdue: true,
  },
  amsDeadline: {
    date: sql`CASE WHEN ${statusHas(shipmentTable.ams, "pending")} THEN ${FILED_BEFORE_DEPARTURE} END`,
    keepsOverdue: true,
  },
  isfDeadline: {
    date: sql`CASE WHEN ${statusHas(shipmentTable.isf, "pending")} THEN ${FILED_BEFORE_DEPARTURE} END`,
    keepsOverdue: true,
  },
};
type DeadlineDef = (typeof DEADLINE_DEFS)[keyof typeof DEADLINE_DEFS];
const DEADLINES = Object.values(DEADLINE_DEFS);

/** Deadline fields that stay due after their date has passed, until their status is confirmed. */
export const OVERDUE_DEADLINE_FIELDS: ReadonlySet<string> = new Set(
  Object.entries(DEADLINE_DEFS).filter(([, d]) => d.keepsOverdue).map(([field]) => field),
);

// Due within `days` days from today, today included (1 = today or tomorrow).
const isDueWithin = ({ date, keepsOverdue }: DeadlineDef, days: number) =>
  keepsOverdue
    ? sql`(${date}) <= CURRENT_DATE + ${days}::int`
    : sql`(${date}) BETWEEN CURRENT_DATE AND CURRENT_DATE + ${days}::int`;
const anyDueWithin = (days: number) => sql`(${sql.join(DEADLINES.map((d) => isDueWithin(d, days)), sql` OR `)})`;

const ACTIVE = sql`${shipmentTable.invoicingStatus} IS DISTINCT FROM 'Invoiced'`;

const TILE_PREDICATES = {
  active: ACTIVE,
  attention: sql`${ACTIVE} AND ${anyDueWithin(1)}`,
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
   * "attention" is an active shipment with any deadline today or tomorrow, or an
   * overdue compliance item — the same
   * rows the 24-hour Needs Attention table lists.
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

  /**
   * Active shipments with a deadline within `days` days from today (or an overdue
   * compliance item), soonest deadline first, over the whole company dataset. `today` is the database's date, so the caller
   * can tell how far off each returned date is.
   */
  async dueWithinDays(companyId: string, days: number) {
    // LEAST ignores NULLs; a date outside the window is nulled so it cannot win the ordering.
    const soonest = sql`LEAST(${sql.join(DEADLINES.map((d) => sql`CASE WHEN ${isDueWithin(d, days)} THEN (${d.date}) END`), sql`, `)})`;
    // Each deadline's date, or NULL when it does not apply (no date, or its work is confirmed).
    const dates = Object.fromEntries(
      Object.entries(DEADLINE_DEFS).map(([field, d]) => [field, sql<string | null>`(${d.date})::text`]),
    ) as Record<keyof typeof DEADLINE_DEFS, ReturnType<typeof sql<string | null>>>;

    return this.db
      .select({
        id: shipmentTable.id,
        jobNumber: shipmentTable.jobNumber,
        customer: shipmentTable.customer,
        tradeDirection: shipmentTable.tradeDirection,
        status: shipmentTable.status,
        ...dates,
        today: sql<string>`CURRENT_DATE::text`,
      })
      .from(shipmentTable)
      .where(and(
        eq(shipmentTable.companyId, companyId),
        isNull(shipmentTable.deletedAt),
        ACTIVE,
        anyDueWithin(days),
      ))
      .orderBy(soonest, shipmentTable.jobNumber)
      .limit(200);
  }

  /** The plate number of a truck (TCZ…): the one its shipments carry, "" if none has it yet. */
  async truckPlate(companyId: string, truck: string): Promise<string> {
    const [row] = await this.db
      .select({ plateNumber: shipmentTable.plateNumber })
      .from(shipmentTable)
      .where(
        and(
          eq(shipmentTable.companyId, companyId),
          eq(shipmentTable.warehouseTruck, truck),
          sql`${shipmentTable.plateNumber} <> ''`,
          isNull(shipmentTable.deletedAt),
        ),
      )
      .limit(1);
    return row?.plateNumber ?? "";
  }

  /** Writes a truck's plate number to every shipment on that truck. */
  async setTruckPlate(companyId: string, truck: string, plateNumber: string) {
    await this.db
      .update(shipmentTable)
      .set({ plateNumber, updatedAt: new Date() })
      .where(and(eq(shipmentTable.companyId, companyId), eq(shipmentTable.warehouseTruck, truck), isNull(shipmentTable.deletedAt)));
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
