import { and, eq, or, ilike, inArray, isNotNull, isNull, notInArray, desc, asc, count, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { shipmentTable, type NewShipmentRecord, type ShipmentRecord } from "../schemas/shipment.schema";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { shipmentRefCounterRepository } from "./shipmentRefCounter.repository";
import { masterJobTable } from "../schemas/masterJob.schema";
import { containsAllWords } from "../../../lib/db/textSearch";

/** A new shipment's own fields; the repository sets the company and the job number. */
export type NewShipmentData = Omit<NewShipmentRecord, "companyId" | "jobNumber">;

/**
 * Predicates behind the Shipments overview tiles. Shared by the list filter and
 * the counts endpoint so a tile's number always matches the rows it opens.
 *
 * trade_direction is free text and has been written as both "Import" and
 * "IMPORT" over time, so every comparison against it is case-insensitive.
 */
// The business's calendar day. The database runs in UTC, where CURRENT_DATE would still
// be yesterday for the first hours of a Prague morning.
const TODAY = sql`(now() AT TIME ZONE 'Europe/Prague')::date`;

// Relevant date: export -> departure, otherwise arrival.
const RELEVANT_ETA = sql`CASE WHEN lower(${shipmentTable.tradeDirection}) = 'export'
       THEN ${shipmentTable.estimatedDeparture}
       ELSE ${shipmentTable.estimatedArrival} END`;

/**
 * What a shipment has to be ready for — the dates behind "Needs Attention".
 *
 * Plain dates count while they are still ahead. The four compliance items carry a
 * status, so they count only while that status says the work is open, and they stay
 * on the list after their date has passed (`keepsOverdue`) until someone confirms them
 * or the shipment departs:
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

// An overdue compliance item stays due only until the vessel sails; after that it can no
// longer be acted on, and without this bound every old unconfirmed shipment would sit
// on the list forever.
const NOT_DEPARTED = sql`(${shipmentTable.estimatedDeparture} IS NULL OR ${shipmentTable.estimatedDeparture} >= ${TODAY})`;

// Due within `days` days from today, today included (1 = today or tomorrow).
const isDueWithin = ({ date, keepsOverdue }: DeadlineDef, days: number) =>
  keepsOverdue
    ? sql`((${date}) >= ${TODAY} OR ${NOT_DEPARTED}) AND (${date}) <= ${TODAY} + ${days}::int`
    : sql`(${date}) BETWEEN ${TODAY} AND ${TODAY} + ${days}::int`;
const anyDueWithin = (days: number) => sql`(${sql.join(DEADLINES.map((d) => isDueWithin(d, days)), sql` OR `)})`;

// A cancelled shipment drops out of every count, deadline and warning.
const NOT_CANCELLED = sql`${shipmentTable.status} IS DISTINCT FROM ${CANCELLED_STATUS}`;

const ACTIVE = sql`${shipmentTable.invoicingStatus} IS DISTINCT FROM 'Invoiced' AND ${NOT_CANCELLED}`;

const TILE_PREDICATES = {
  active: ACTIVE,
  attention: sql`${ACTIVE} AND ${anyDueWithin(1)}`,
  import: sql`lower(${shipmentTable.tradeDirection}) = 'import' AND ${NOT_CANCELLED}`,
  export: sql`lower(${shipmentTable.tradeDirection}) = 'export' AND ${NOT_CANCELLED}`,
  week: sql`${RELEVANT_ETA} IS NOT NULL
    AND date_trunc('week', ${RELEVANT_ETA}) = date_trunc('week', ${TODAY})
    AND ${NOT_CANCELLED}`,
  nextweek: sql`${RELEVANT_ETA} IS NOT NULL
    AND date_trunc('week', ${RELEVANT_ETA}) = date_trunc('week', ${TODAY} + 7)
    AND ${NOT_CANCELLED}`,
} as const;

export type TileId = keyof typeof TILE_PREDICATES;

/**
 * The shipments list's warehouse filter, by the two dates a shipment carries (written back
 * by the warehouse Gate Log): in → (received) → stock → (released) → out. "in" holds the
 * ones not yet received whose ETA Warehouse/HUB is less than 7 days away (or passed).
 */
const WAREHOUSE_PREDICATES = {
  in: sql`${shipmentTable.warehouseReceivedDate} IS NULL
    AND ${shipmentTable.warehouseReleasedDate} IS NULL
    AND ${shipmentTable.etaWarehouse} IS NOT NULL
    AND ${shipmentTable.etaWarehouse} < ${TODAY} + 7`,
  stock: sql`${shipmentTable.warehouseReceivedDate} IS NOT NULL AND ${shipmentTable.warehouseReleasedDate} IS NULL`,
  out: sql`${shipmentTable.warehouseReleasedDate} IS NOT NULL`,
} as const;

export type WarehouseSectionId = keyof typeof WAREHOUSE_PREDICATES;

/**
 * Customs page filters. "urgent": an Urgent shipment whose deadline (a Prague wall time,
 * "YYYY-MM-DD HH:mm") falls within the next 24 hours or has passed, and that customs has
 * not released yet. A malformed deadline is skipped rather than failing the query.
 */
const CUSTOMS_DEADLINE_AT = sql`CASE WHEN ${shipmentTable.customsDeadline} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}$'
  THEN to_timestamp(${shipmentTable.customsDeadline}, 'YYYY-MM-DD HH24:MI')::timestamp END`;
const CUSTOMS_PREDICATES = {
  urgent: sql`${shipmentTable.customsPriority} = 'Urgent'
    AND ${shipmentTable.customsStatus} <> 'Customs Cleared/Released'
    AND ${NOT_CANCELLED}
    AND ${CUSTOMS_DEADLINE_AT} < (now() AT TIME ZONE 'Europe/Prague') + interval '24 hours'`,
} as const;

export type CustomsFilterId = keyof typeof CUSTOMS_PREDICATES;

export interface ShipmentListFilters {
  /** Overview tile filter: active | attention | import | export | week | nextweek */
  tile?: string;
  customerId?: string;
  /** The houses of the master job with this MCZ number. */
  masterJobMcz?: string;
  status?: string;
  /** UI status bucket — a coarse grouping over the many free-text status values. */
  statusBucket?: string;
  /** Warehouse page: in | stock | out */
  warehouse?: string;
  /** Customs page: urgent */
  customs?: string;
  /** Invoicing page: billing (Shipment Status Billing) | not-invoiced | invoiced (Invoicing Status) */
  invoicing?: string;
  search?: string;
  limit: number;
  offset: number;
  sortDirection: "asc" | "desc";
}

// Invoicing page queue. "Billing" is the Shipment Status operations set when a job is ready to
// be invoiced (stored with its direction); Invoicing Status is Invoiced / Not Invoiced.
type InvoicingFilterId = "billing" | "not-invoiced" | "invoiced";
const INVOICING_PREDICATES: Record<InvoicingFilterId, ReturnType<typeof sql>> = {
  billing: sql`${shipmentTable.status} IN ('Billing [IMP]', 'Billing [EXP]', 'Billing [DOM]')`,
  "not-invoiced": sql`${shipmentTable.invoicingStatus} IS DISTINCT FROM 'Invoiced' AND ${NOT_CANCELLED}`,
  invoiced: sql`${shipmentTable.invoicingStatus} = 'Invoiced'`,
};

// The status column holds long free-text labels ("Booked For Further Transport [IMP]", …).
// The shipments UI groups them into coarse buckets; each bucket matches if the status
// contains any of these fragments.
const STATUS_BUCKETS: Record<string, string[]> = {
  active: ["active", "pending", "new"],
  "in-transit": ["transport", "shipped", "pre-alert", "loaded"],
  customs: ["customs"],
  delivered: ["billed", "billing", "delivered"],
};

/** A live shipment as the quote it names needs to know it. */
export interface NamingShipment {
  id: string;
  jobNumber: string;
}

/** What the company's live shipments say about one customer. */
export interface CustomerShipmentFactsRow {
  customerId: string;
  /** The oldest of the customer's shipments: when it was created, and which it is. */
  firstShipmentAt: Date;
  firstShipmentId: string;
  firstJobNumber: string;
  /** When the newest one was created. */
  lastShipmentAt: Date;
  shipmentCount: number;
}

// The Sales Number as it is compared: rows written before it was stored trimmed may carry
// spaces around it.
const SALES_NUMBER = sql<string>`btrim(${shipmentTable.salesNumber})`;

class ShipmentRepository extends TenantRepository<typeof shipmentTable> {
  constructor() {
    super(db, shipmentTable, "shipment");
  }

  // The live shipments of the company whose Sales Number is `reference`, the oldest first - the
  // order a quote takes its link by - read under a lock on that reference, which `tx` holds
  // until it ends: whoever acts on the list does so alone. A statement sees what was committed
  // before it began, so the read sees everything whoever held the lock before has written.
  private async lockLiveBySalesNumber(tx: Pick<typeof this.db, "execute" | "select">, companyId: string, reference: string): Promise<NamingShipment[]> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`shipment-from-quote:${companyId}:${reference}`}))`);
    return tx
      .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), sql`${SALES_NUMBER} = ${reference}`))
      .orderBy(asc(shipmentTable.createdAt), asc(shipmentTable.id));
  }

  /** The live shipments of the company whose Sales Number is `reference`, the oldest first (no lock). */
  async liveBySalesNumber(companyId: string, reference: string): Promise<NamingShipment[]> {
    return this.db
      .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), sql`${SALES_NUMBER} = ${reference}`))
      .orderBy(asc(shipmentTable.createdAt), asc(shipmentTable.id));
  }

  /** Every company that has shipments, deleted ones included (a deleted shipment can leave a quote to unlink). */
  async companyIds(): Promise<string[]> {
    const rows = await this.db.selectDistinct({ companyId: shipmentTable.companyId }).from(shipmentTable);
    return rows.map((r) => r.companyId);
  }

  /**
   * Every live shipment of the company whose Sales Number has the format of a sales quote
   * reference - `pattern`, a regular expression - with that reference, the oldest first.
   */
  async salesReferenceShipments(companyId: string, pattern: string): Promise<(NamingShipment & { reference: string })[]> {
    return this.db
      .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber, reference: SALES_NUMBER })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), sql`${SALES_NUMBER} ~ ${pattern}`))
      .orderBy(asc(shipmentTable.createdAt), asc(shipmentTable.id));
  }

  /**
   * Reads the live shipments that name `reference` and hands them to `tell`, under the lock on
   * the reference and until `tell` is done. Two such reports about one quote can therefore not
   * overtake each other: the one that runs later has read the newer list.
   */
  async withLiveBySalesNumber<T>(companyId: string, reference: string, tell: (shipments: NamingShipment[]) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => tell(await this.lockLiveBySalesNumber(tx, companyId, reference)));
  }

  /**
   * Inserts the shipment made from a quote (its Sales Number is the quote's reference) - unless a live shipment already names that quote and
   * a second one is not allowed: then nothing is inserted and that shipment (the oldest) is
   * returned. Check and insert are one transaction under an advisory lock on the reference, so
   * of two requests at the same moment the second finds the shipment of the first.
   */
  async createFromQuote(
    companyId: string,
    reference: string,
    data: NewShipmentData,
    allowSecond: boolean,
  ): Promise<{ created: ShipmentRecord } | { existing: NamingShipment }> {
    return this.db.transaction(async (tx) => {
      const [existing] = await this.lockLiveBySalesNumber(tx, companyId, reference);
      if (existing && !allowSecond) return { existing };
      const jobNumber = await shipmentRefCounterRepository.allocate(tx, companyId, "CZ");
      const [created] = await tx
        .insert(shipmentTable)
        .values({ ...data, jobNumber, companyId, salesNumber: reference, createdFromQuote: true })
        .returning();
      return { created: created! };
    });
  }

  /**
   * Inserts a shipment under the company's next CZ job number. The number is taken in the
   * same transaction as the insert, so two creates at the same moment never get the same one.
   */
  async createWithJobNumber(companyId: string, data: NewShipmentData): Promise<ShipmentRecord> {
    return this.db.transaction(async (tx) => {
      const jobNumber = await shipmentRefCounterRepository.allocate(tx, companyId, "CZ");
      const [created] = await tx.insert(shipmentTable).values({ ...data, jobNumber, companyId }).returning();
      return created!;
    });
  }

  /**
   * What the company's live shipments say about each customer they are for: the first one - the
   * oldest, by creation and then by id, as wherever shipments are put in order - when the newest
   * was created, and how many there are. Shipments without a customer record can place no
   * customer and are only counted.
   */
  async customerFacts(companyId: string): Promise<{ customers: CustomerShipmentFactsRow[]; shipmentsWithoutCustomer: number }> {
    const live = and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt));
    const [customers, [{ value }]] = await Promise.all([
      this.db
        // One row per customer: the first in the order below, its oldest shipment. The window
        // functions have seen all of the customer's rows before the others are dropped.
        .selectDistinctOn([shipmentTable.customerId], {
          customerId: shipmentTable.customerId,
          firstShipmentAt: shipmentTable.createdAt,
          firstShipmentId: shipmentTable.id,
          firstJobNumber: shipmentTable.jobNumber,
          lastShipmentAt: sql`max(${shipmentTable.createdAt}) over (partition by ${shipmentTable.customerId})`.mapWith(shipmentTable.createdAt),
          shipmentCount: sql`count(*) over (partition by ${shipmentTable.customerId})`.mapWith(Number),
        })
        .from(shipmentTable)
        .where(and(live, isNotNull(shipmentTable.customerId)))
        .orderBy(asc(shipmentTable.customerId), asc(shipmentTable.createdAt), asc(shipmentTable.id)),
      this.db
        .select({ value: count() })
        .from(shipmentTable)
        .where(and(live, isNull(shipmentTable.customerId))),
    ]);
    return {
      // The query keeps only shipments with a customer, so customerId is set on every row.
      customers: customers.flatMap((c): CustomerShipmentFactsRow[] => (c.customerId ? [{ ...c, customerId: c.customerId }] : [])),
      shipmentsWithoutCustomer: Number(value),
    };
  }

  /** A few fields of the company's live shipments among `ids` (Trucking's view of its jobs). */
  async basicsByIds(companyId: string, ids: string[]) {
    if (!ids.length) return [];
    return this.db
      .select({
        id: shipmentTable.id,
        jobNumber: shipmentTable.jobNumber,
        customerId: shipmentTable.customerId,
        customer: shipmentTable.customer,
        status: shipmentTable.status,
        tradeDirection: shipmentTable.tradeDirection,
        freightMode: shipmentTable.freightMode,
        pickupDate: shipmentTable.pickupDate,
        plannedDeliveryDate: shipmentTable.plannedDeliveryDate,
        department: shipmentTable.department,
      })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), inArray(shipmentTable.id, ids), isNull(shipmentTable.deletedAt)));
  }

  async findByJobNumber(jobNumber: string, companyId: string) {
    return this.getByColumnForCompany(shipmentTable.jobNumber, jobNumber, companyId);
  }

  /** Of the given ids, those of live shipments of this customer in this company. */
  async idsOfCustomer(companyId: string, customerId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const rows = await this.db
      .select({ id: shipmentTable.id })
      .from(shipmentTable)
      .where(
        and(
          eq(shipmentTable.companyId, companyId),
          eq(shipmentTable.customerId, customerId),
          isNull(shipmentTable.deletedAt),
          inArray(shipmentTable.id, ids),
        ),
      );
    return rows.map((r) => r.id);
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
        NOT_CANCELLED,
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
    if (f.masterJobMcz) {
      clauses.push(
        inArray(
          shipmentTable.masterJobId,
          this.db
            .select({ id: masterJobTable.id })
            .from(masterJobTable)
            .where(and(eq(masterJobTable.companyId, companyId), eq(masterJobTable.mczNumber, f.masterJobMcz), isNull(masterJobTable.deletedAt))),
        ),
      );
    }
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
    if (f.warehouse) {
      const predicate = WAREHOUSE_PREDICATES[f.warehouse as WarehouseSectionId];
      if (predicate) clauses.push(predicate);
    }
    if (f.customs) {
      const predicate = CUSTOMS_PREDICATES[f.customs as CustomsFilterId];
      if (predicate) clauses.push(predicate);
    }
    if (f.invoicing) {
      const predicate = INVOICING_PREDICATES[f.invoicing as InvoicingFilterId];
      if (predicate) clauses.push(predicate);
    }
    // Every word typed, anywhere in these columns, without regard to diacritics or case.
    if (f.search) {
      const match = containsAllWords([shipmentTable.jobNumber, shipmentTable.shipper, shipmentTable.consignee, shipmentTable.customer, shipmentTable.pol, shipmentTable.pod], f.search);
      if (match) clauses.push(match);
    }
    const where = and(...clauses);
    const direction = f.sortDirection === "asc" ? asc : desc;

    const [rows, [{ value: total }]] = await Promise.all([
      this.db.select().from(shipmentTable).where(where).orderBy(direction(shipmentTable.createdAt), direction(shipmentTable.id)).limit(f.limit).offset(f.offset),
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
    // Each deadline's date, or NULL when it does not apply (no date, its work is confirmed,
    // or it is overdue on a shipment that has already departed).
    const dates = Object.fromEntries(
      Object.entries(DEADLINE_DEFS).map(([field, d]) => [
        field,
        d.keepsOverdue
          ? sql<string | null>`(CASE WHEN (${d.date}) >= ${TODAY} OR ${NOT_DEPARTED} THEN (${d.date}) END)::text`
          : sql<string | null>`(${d.date})::text`,
      ]),
    ) as Record<keyof typeof DEADLINE_DEFS, ReturnType<typeof sql<string | null>>>;

    return this.db
      .select({
        id: shipmentTable.id,
        jobNumber: shipmentTable.jobNumber,
        customerId: shipmentTable.customerId,
        customer: shipmentTable.customer,
        tradeDirection: shipmentTable.tradeDirection,
        status: shipmentTable.status,
        ...dates,
        today: sql<string>`(${TODAY})::text`,
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
  /**
   * What the dashboard reads of the company's live shipments, newest first: only the columns it
   * counts and lists (not whole ~150-column rows), and none whose status is in `excludedStatuses`.
   */
  async dashboardRows(companyId: string, excludedStatuses: string[], limit = 5000) {
    return this.db
      .select({
        id: shipmentTable.id,
        jobNumber: shipmentTable.jobNumber,
        shipper: shipmentTable.shipper,
        consignee: shipmentTable.consignee,
        status: shipmentTable.status,
        estimatedDeparture: shipmentTable.estimatedDeparture,
        estimatedArrival: shipmentTable.estimatedArrival,
        closingDate: shipmentTable.closingDate,
        cargoReadinessDate: shipmentTable.cargoReadinessDate,
        pickupDate: shipmentTable.pickupDate,
      })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), or(isNull(shipmentTable.status), notInArray(shipmentTable.status, excludedStatuses))))
      .orderBy(desc(shipmentTable.createdAt))
      .limit(limit);
  }
}

export const shipmentRepository = new ShipmentRepository();
