import { and, eq, ne, or, ilike, inArray, isNotNull, isNull, notInArray, desc, asc, count, sql, getTableColumns, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { TenantRepository } from "../../../lib/db/repository";
import { db, type Tx } from "../db/db";
import { shipmentTable, type NewShipmentRecord, type ShipmentRecord } from "../schemas/shipment.schema";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { DATE_MOVED_WINDOW_DAYS } from "../lib/trackingThresholds";
import { ROAD_DEPARTMENT } from "../../../lib/deliveryDated";
import { shipmentAuditTable } from "../schemas/shipmentAudit.schema";
import { shipmentCustomerNoticeTable } from "../schemas/shipmentCustomerNotice.schema";
import { shipmentTrackingEventTable } from "../schemas/shipmentTrackingEvent.schema";
import { shipmentRefCounterRepository, type Tx as CounterTx } from "./shipmentRefCounter.repository";
import { jobNumberFor } from "../lib/jobNumber";
import { masterJobNumberForms } from "../lib/masterJobNumber";
import { masterJobTable } from "../schemas/masterJob.schema";
import { containerTable } from "../schemas/container.schema";
import { shipmentEventOutboxTable } from "../schemas/shipmentEventOutbox.schema";
import { containsAllWords, escapeLike, foldDiacritics, foldSql } from "../../../lib/db/textSearch";
import { JOB_NUMBER_PATTERN, referenceSearchDigits } from "../../../lib/jobNumber";
import type { PeopleRewrite, ShipmentPeople } from "../lib/people";
import { plainSalesReference } from "../../../lib/salesReference";
import { plainSalesReferenceSql } from "../../../lib/db/salesReferenceSql";
import { BILL_OF_LADING_KEY_PATTERN, billOfLadingKey } from "../../../lib/billOfLading";

/** A new shipment's own fields; the repository sets the company and the job number. */
export type NewShipmentData = Omit<NewShipmentRecord, "companyId" | "jobNumber">;

/** What decides a shipment's reference letters (lib/jobNumber), whether they are final, and the quote it names. */
export type ShipmentReference = Pick<
  ShipmentRecord,
  "id" | "jobNumber" | "freightMode" | "loadType" | "salesNumber" | "jobNumberFinal" | "invoicingStatus"
>;

/**
 * Predicates behind the Shipments overview tiles. Shared by the list filter and
 * the counts endpoint so a tile's number always matches the rows it opens.
 *
 * trade_direction is free text and has been written as both "Import" and
 * "IMPORT" over time, so every comparison against it is case-insensitive.
 */
// The business's calendar day. The database runs in UTC, where CURRENT_DATE would still
// be yesterday for the first hours of a Prague morning.
/**
 * What the Shipments search looks in: the parties and the route, every reference a shipment is
 * known by (B/Ls, booking, customer's and sales references, MRN, warehouse and release
 * references), the transport (vessel, voyage, line, agent), the cargo, its master job's MCZ and
 * its container numbers.
 */
const MCZ_TEXT = sql`(SELECT ${masterJobTable.mczNumber} FROM ${masterJobTable} WHERE ${masterJobTable.id} = ${shipmentTable.masterJobId})`;
const containerText = (column: PgColumn) =>
  sql`(SELECT string_agg(${column}, ' ') FROM ${containerTable} WHERE ${containerTable.shipmentId} = ${shipmentTable.id} AND ${containerTable.deletedAt} IS NULL)`;

const SEARCHED_TEXT = [
  shipmentTable.jobNumber,
  shipmentTable.shipper,
  shipmentTable.consignee,
  shipmentTable.customer,
  shipmentTable.pol,
  shipmentTable.pod,
  shipmentTable.origin,
  shipmentTable.destination,
  shipmentTable.personalReference,
  shipmentTable.customerReference,
  shipmentTable.salesNumber,
  shipmentTable.bookingNumber,
  shipmentTable.houseBolNumber,
  shipmentTable.masterBolNumber,
  shipmentTable.switchBolNumber,
  shipmentTable.mrn,
  shipmentTable.warehouseReference,
  shipmentTable.releaseReference,
  shipmentTable.redeliveryReference,
  shipmentTable.vessel,
  shipmentTable.voyage,
  shipmentTable.shippingLine,
  shipmentTable.agent,
  shipmentTable.cargoDescription,
  shipmentTable.hsCode,
  MCZ_TEXT,
  containerText(containerTable.containerNumber),
];

// The Load Type as the grid shows it: by Air Freight a Full Load reads "Single Shipment" (it is
// still stored as Full Load), the web's loadTypeLabel.
const LOAD_TYPE_TEXT = sql`CASE WHEN ${shipmentTable.loadType} = 'Full Load' AND ${shipmentTable.freightMode} ~* '^air'
  THEN 'Single Shipment' ELSE ${shipmentTable.loadType} END`;

const SHIPMENT_COLUMNS: Record<string, PgColumn> = getTableColumns(shipmentTable);
/** Grid columns whose text is not a shipment column of the same name, or not as it is stored. */
const RELATED_TEXT: Record<string, SQL> = {
  masterJob: MCZ_TEXT,
  containerNumber: containerText(containerTable.containerNumber),
  sealNumber: containerText(containerTable.sealNumber),
  loadType: LOAD_TYPE_TEXT,
};

/**
 * The text of the grid columns the user has chosen, as the Shipments search looks in it: a
 * shipment column as stored, a date as the grid shows it (DD.MM.YYYY), the master job's MCZ
 * and the containers' numbers and seals. A column worked out in the browser (weeks, totals,
 * profit) or an unknown key is left out; the Internal Reference is always searched.
 */
export function searchedColumns(keys: string[]): (PgColumn | SQL)[] {
  const text: (PgColumn | SQL)[] = [shipmentTable.jobNumber];
  for (const key of new Set(keys)) {
    if (key === "jobNumber") continue;
    const related = Object.hasOwn(RELATED_TEXT, key) ? RELATED_TEXT[key] : undefined;
    if (related) {
      text.push(related);
      continue;
    }
    const column = Object.hasOwn(SHIPMENT_COLUMNS, key) ? SHIPMENT_COLUMNS[key] : undefined;
    if (!column) continue;
    const type = column.getSQLType();
    if (type === "text") text.push(column);
    else if (type === "date") text.push(sql`to_char(${column}, 'DD.MM.YYYY')`);
    else if (type.startsWith("numeric") || type === "integer") text.push(sql`${column}::text`);
  }
  return text;
}

// The digits of a shipment's reference, whatever its letters (lib/jobNumber); null for other text.
const JOB_NUMBER_DIGITS = sql`substring(${shipmentTable.jobNumber} from ${sql.raw(`'${JOB_NUMBER_PATTERN}'`)})`;

// A word typed as a reference also finds the job by its number, whatever its letters are now: the
// letters follow the Freight Mode and Load Type, so CZ00000023 finds CZFCL00000023, and CZFCL…
// finds the job that is CZLCL… since. Digits still being typed find the numbers they start.
const sameJobNumber = (word: string): SQL | undefined => {
  const digits = referenceSearchDigits(word);
  return digits === null ? undefined : sql`${JOB_NUMBER_DIGITS} LIKE ${`${digits}%`}`;
};

/**
 * The Shipments search: every word typed, in the chosen grid columns (searchedColumns) or else in
 * SEARCHED_TEXT, without regard to diacritics or case - a reference also by its number.
 */
export function searchMatch(search: string, columnKeys?: string[]): SQL | undefined {
  return containsAllWords(columnKeys?.length ? searchedColumns(columnKeys) : SEARCHED_TEXT, search, sameJobNumber);
}

const TODAY = sql`(now() AT TIME ZONE 'Europe/Prague')::date`;

// Relevant date: export -> departure, otherwise arrival.
const RELEVANT_ETA = sql`CASE WHEN lower(${shipmentTable.tradeDirection}) = 'export'
       THEN ${shipmentTable.estimatedDeparture}
       ELSE ${shipmentTable.estimatedArrival} END`;

// What is due on a shipment - the dates behind "Needs Attention" - is judged in TypeScript, on one
// rule set with Shipments → Managers (lib/needsAttention, lib/managersCockpit cutoffsOf): the two
// cards, the Overview tile's count and the list the tile opens all come from it. No statement
// here says what is due; needsAttentionCandidates only bounds what those rules read.

// AMS and ISF with no deadline typed are due 4 days before the ETD (lib/managersCockpit
// filedBeforeDeparture): that day is a cut-off date of the job, for the read's bounds.
const FILED_BEFORE_DEPARTURE = sql`${shipmentTable.estimatedDeparture} - 4`;

// A cancelled shipment drops out of every count, deadline and warning.
const NOT_CANCELLED = sql`${shipmentTable.status} IS DISTINCT FROM ${CANCELLED_STATUS}`;

const ACTIVE = sql`${shipmentTable.invoicingStatus} IS DISTINCT FROM 'Invoiced' AND ${NOT_CANCELLED}`;

// An ETD or ETA that moved lately, by somebody or by the app. EXISTS bounded by date: the audit log
// is the longest table here, and this runs inside the list's and the tiles' own queries.
const DATE_MOVED_LATELY = sql`EXISTS (
  SELECT 1 FROM ${shipmentAuditTable} moved
  WHERE moved.shipment_id = ${shipmentTable.id}
    AND moved.field IN ('estimatedDeparture', 'estimatedArrival')
    AND moved.changed_at >= now() - make_interval(days => ${DATE_MOVED_WINDOW_DAYS}::int)
    AND COALESCE(moved.old_value, '') <> '' AND COALESCE(moved.new_value, '') <> ''
    AND moved.old_value <> moved.new_value
)`;

// The Overview tile "Needs Attention" is not among these: what is due is judged in TypeScript
// (lib/needsAttention), and its list is asked for by ids (attentionMatch).
const TILE_PREDICATES = {
  active: ACTIVE,
  etamoved: sql`${ACTIVE} AND ${DATE_MOVED_LATELY}`,
  // Opened from Shipments → Managers, whose tile counts the same in TypeScript (lib/managersCockpit),
  // on the rows of managersCockpitRows. Its cut-off and booking tiles have no list filter: they
  // are judged by rules no statement here repeats, and narrow the cockpit's own cards instead.
  claims: sql`${ACTIVE} AND ${shipmentTable.claim} = 'Yes'`,
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

/** The rows a tile of this id opens; undefined for "all", for "attention" (see attentionMatch) and for an id that is no tile. */
export function tilePredicate(tile: string | undefined): SQL | undefined {
  return tile && Object.hasOwn(TILE_PREDICATES, tile) ? TILE_PREDICATES[tile as TileId] : undefined;
}

/** The list's tile filter that is answered by ids instead of a predicate. */
export const ATTENTION_TILE = "attention";

/**
 * The rows the Overview tile "Needs Attention" opens: the jobs the rule named (lib/needsAttention
 * urgentIds, worked out by the service for this request). With none it finds nothing - never
 * everything, which a missing filter would.
 */
export function attentionMatch(ids: readonly string[] | undefined): SQL {
  return ids?.length ? inArray(shipmentTable.id, [...ids]) : sql`false`;
}

// Who a person field names: the e-mail, before the name an old value may carry after it
// ("a@b.cz — Name"), trimmed and lower-cased - lib/shipmentEditRule personEmail, in SQL. btrim
// alone takes off spaces only; JavaScript's trim() also takes what typed or pasted text carries
// (tab, line feed, carriage return, no-break space), so those are named.
const TRIMMED_WHITESPACE = " \t\n\r\u00a0";
const personEmailOf = (column: PgColumn) => sql`lower(btrim(split_part(${column}, ' — ', 1), ${TRIMMED_WHITESPACE}))`;

/** The value of the list's Handled By filter that asks for the jobs nobody handles. */
// A legacy Handled By typed as "nobody" collides with this word and cannot be asked for: accepted, new values are user e-mails.
const HANDLED_BY_NOBODY = "nobody";

/**
 * The list's Handled By filter: the jobs whose Handled By names this e-mail (in any case), or
 * with "nobody" the jobs it names nobody on. Undefined when nothing is asked for.
 */
export function handledByMatch(handledBy: string | undefined): SQL | undefined {
  const asked = (handledBy ?? "").trim().toLowerCase();
  if (!asked) return undefined;
  return sql`${personEmailOf(shipmentTable.personInCharge)} = ${asked === HANDLED_BY_NOBODY ? "" : asked}`;
}

// How a job travels - lib/trackingEvents freightKindOf, in SQL. Keep the two the same, rule for rule:
//   road  a Trucking job (Trade Direction Domestic, or the Road Department: lib/deliveryDated
//         isDeliveryDated, both trimmed, in any case), or "road" anywhere in the Freight Mode;
//   air   otherwise, a Freight Mode that starts with "air";
//   rail  otherwise, one that starts with "rail";
//   sea   everything else - a job with no Freight Mode too.
// tests/db/managersListFilters.db.test.ts reads the same rows both ways.
const IS_TRUCKING_JOB = sql`(${shipmentTable.tradeDirection} ~* '^\\s*domestic\\s*$' OR ${shipmentTable.department} ~* ${`^\\s*${ROAD_DEPARTMENT}\\s*$`})`;
const IS_ROAD = sql`(${IS_TRUCKING_JOB} OR ${shipmentTable.freightMode} ~* 'road')`;
const IS_AIR = sql`${shipmentTable.freightMode} ~* '^\\s*air'`;
const IS_RAIL = sql`${shipmentTable.freightMode} ~* '^\\s*rail'`;
const MODE_PREDICATES = {
  road: IS_ROAD,
  air: sql`(NOT ${IS_ROAD} AND ${IS_AIR})`,
  rail: sql`(NOT ${IS_ROAD} AND ${IS_RAIL})`,
  sea: sql`(NOT ${IS_ROAD} AND NOT ${IS_AIR} AND NOT ${IS_RAIL})`,
} as const;

export type ModeFilterId = keyof typeof MODE_PREDICATES;

/** The list's mode filter (sea | air | rail | road); undefined for anything else, "all" among it. */
export function modeMatch(mode: string | undefined): SQL | undefined {
  return mode && Object.hasOwn(MODE_PREDICATES, mode) ? MODE_PREDICATES[mode as ModeFilterId] : undefined;
}

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
  /** Overview tile filter: active | attention | etamoved | import | export | week | nextweek, and Shipments → Managers' claims */
  tile?: string;
  /** With tile "attention": the jobs Needs Attention's URGENT list names, worked out by the service (lib/needsAttention). */
  attentionIds?: readonly string[];
  /** Handled By: an e-mail (in any case), or "nobody" for the jobs with nobody in it. */
  handledBy?: string;
  /** How the job travels: sea | air | rail | road (lib/trackingEvents freightKindOf). */
  mode?: string;
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
  /** Invoicing page: all (released for billing or invoiced) | billing (Billing, not invoiced yet) | not-invoiced | invoiced (Invoicing Status) */
  invoicing?: string;
  search?: string;
  /** The grid columns (their keys) the search looks in; without them, SEARCHED_TEXT. */
  searchColumns?: string[];
  limit: number;
  offset: number;
  sortDirection: "asc" | "desc";
}

// Invoicing page queue. "Billing" is the Shipment Status operations set when a job is ready to
// be invoiced (stored with its direction); Invoicing Status is Invoiced / Not Invoiced.
// A job reaches the Invoicing page only once operations release it (Billing) or once it is invoiced.
type InvoicingFilterId = "all" | "billing" | "not-invoiced" | "invoiced" | "unbilled-arrivals";
const BILLING_STATUS = sql`${shipmentTable.status} IN ('Billing [IMP]', 'Billing [EXP]', 'Billing [DOM]')`;
const INVOICED = sql`${shipmentTable.invoicingStatus} = 'Invoiced'`;
// The date a job is taxed by has passed: ATA, ATD by direction, or the delivery of a job dated by it.
// Operations hasn't released it yet, so the page's other views don't show it.
const IS_DELIVERY_DATED = sql`(lower(${shipmentTable.tradeDirection}) = 'domestic' OR lower(${shipmentTable.department}) = ${ROAD_DEPARTMENT.toLowerCase()})`;
const TAX_DATE_REACHED = sql`CASE
  WHEN ${IS_DELIVERY_DATED} THEN ${shipmentTable.actualDeliveryDate} IS NOT NULL
  WHEN lower(${shipmentTable.tradeDirection}) = 'export' THEN ${shipmentTable.actualDeparture} IS NOT NULL
  ELSE ${shipmentTable.actualArrival} IS NOT NULL END`;
const INVOICING_PREDICATES: Record<InvoicingFilterId, ReturnType<typeof sql>> = {
  all: sql`(${BILLING_STATUS} OR ${INVOICED}) AND ${NOT_CANCELLED}`,
  billing: sql`${BILLING_STATUS} AND ${shipmentTable.invoicingStatus} IS DISTINCT FROM 'Invoiced'`,
  "not-invoiced": sql`${shipmentTable.invoicingStatus} IS DISTINCT FROM 'Invoiced' AND ${NOT_CANCELLED}`,
  invoiced: INVOICED,
  "unbilled-arrivals": sql`${TAX_DATE_REACHED} AND ${shipmentTable.status} NOT ILIKE 'bill%' AND ${ACTIVE}`,
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
  /** Read where it decides something: a revision doesn't take over an invoiced shipment. */
  invoicingStatus?: string;
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
// ...and as a quote is found by it: without the letters of the quote's Freight Mode
// (lib/salesReference), so a shipment whose copy is from before the quote's letters changed still
// names that quote, also before the quote-renamed event has moved the copy.
const PLAIN_SALES_NUMBER = plainSalesReferenceSql(SALES_NUMBER);

// The House B/L as two are compared (lib/billOfLading): letters and digits only, upper case.
const HOUSE_BOL_KEY = sql<string>`regexp_replace(upper(${shipmentTable.houseBolNumber}), ${BILL_OF_LADING_KEY_PATTERN}, '', 'g')`;

// The columns of a ShipmentReference.
const REFERENCE_FIELDS = {
  id: shipmentTable.id,
  jobNumber: shipmentTable.jobNumber,
  freightMode: shipmentTable.freightMode,
  loadType: shipmentTable.loadType,
  salesNumber: shipmentTable.salesNumber,
  jobNumberFinal: shipmentTable.jobNumberFinal,
  invoicingStatus: shipmentTable.invoicingStatus,
};

// The company's next CZ number, with the letters of the new job's Freight Mode and Load Type
// (CZAIR00000023, lib/jobNumber).
async function nextJobNumber(tx: CounterTx, companyId: string, data: NewShipmentData): Promise<string> {
  return jobNumberFor(await shipmentRefCounterRepository.allocate(tx, companyId, "CZ"), data.freightMode, data.loadType);
}

class ShipmentRepository extends TenantRepository<typeof shipmentTable> {
  constructor() {
    super(db, shipmentTable, "shipment");
  }

  /**
   * Runs `work` in one transaction that holds the shipment's write turn: what an update writes
   * (its audit entries, its containers and cargo lines, the shipment row) lands all or nothing,
   * and two writes of the same shipment take turns (the lock lasts until the transaction ends),
   * so a line list is never half replaced or stored twice.
   */
  async writeTurn<T>(shipmentId: string, companyId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`shipments-write:${companyId}:${shipmentId}`}))`);
      return work(tx);
    });
  }

  /**
   * In the shipment's write turn: its Sales Number becomes `next` only while it still names the quote
   * `previous` (compared without the Freight Mode letters) - a change made meanwhile stays. Whether it moved.
   */
  async moveSalesNumber(tx: Tx, id: string, companyId: string, previous: string, next: string): Promise<boolean> {
    const rows = await tx
      .update(shipmentTable)
      .set({ salesNumber: next, updatedAt: new Date() })
      .where(and(
        eq(shipmentTable.id, id),
        eq(shipmentTable.companyId, companyId),
        isNull(shipmentTable.deletedAt),
        sql`${plainSalesReferenceSql(sql`btrim(${shipmentTable.salesNumber})`)} = ${plainSalesReference(previous)}`,
      ))
      .returning({ id: shipmentTable.id });
    return rows.length > 0;
  }

  /**
   * A quote's reference took the letters of its Freight Mode (quote-renamed): every shipment of the
   * company that names the quote under another spelling (compared without the letters) names it
   * as `to`, each with a line in its history for its Sales Reference, old → new, as `userId`, in
   * one transaction. The rows are read locked and only those that still differ are rewritten, so
   * the same event delivered again - at the same time too - finds nothing left and writes no second
   * line. The job numbers rewritten.
   */
  async followQuoteRename(companyId: string, from: string, to: string, userId: string): Promise<string[]> {
    return this.db.transaction(async (tx) => {
      const naming = await tx
        .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber, salesNumber: shipmentTable.salesNumber })
        .from(shipmentTable)
        .where(and(
          eq(shipmentTable.companyId, companyId),
          sql`${plainSalesReferenceSql(shipmentTable.salesNumber)} = ${plainSalesReference(from)}`,
          ne(shipmentTable.salesNumber, to),
        ))
        .for("update");
      if (!naming.length) return [];
      await tx
        .update(shipmentTable)
        .set({ salesNumber: to })
        .where(and(eq(shipmentTable.companyId, companyId), inArray(shipmentTable.id, naming.map((s) => s.id))));
      await tx.insert(shipmentAuditTable).values(
        naming.map((s) => ({ companyId, shipmentId: s.id, userId, field: "salesNumber", oldValue: s.salesNumber, newValue: to })),
      );
      return naming.map((s) => s.jobNumber);
    });
  }

  /** The base update - inside a write turn when `tx` is given. */
  override async updateForCompany(id: string, companyId: string, data: Partial<NewShipmentRecord>, tx?: Tx): Promise<ShipmentRecord | null> {
    if (!tx) return super.updateForCompany(id, companyId, data);
    const [row] = await tx
      .update(shipmentTable)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(shipmentTable.id, id), eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)))
      .returning();
    return row ?? null;
  }

  // The live shipments of the company whose Sales Number is `reference`, the oldest first - the
  // order a quote takes its link by - read under a lock on that reference, which `tx` holds
  // until it ends: whoever acts on the list does so alone. A statement sees what was committed
  // before it began, so the read sees everything whoever held the lock before has written.
  private async lockLiveBySalesNumber(tx: Pick<typeof this.db, "execute" | "select">, companyId: string, reference: string): Promise<NamingShipment[]> {
    // One lock for the quote, whichever letters the reference is written with.
    const plain = plainSalesReference(reference);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`shipment-from-quote:${companyId}:${plain}`}))`);
    return tx
      .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), sql`${PLAIN_SALES_NUMBER} = ${plain}`))
      .orderBy(asc(shipmentTable.createdAt), asc(shipmentTable.id));
  }

  /** The live shipments of the company whose Sales Number is `reference` (whatever its letters), the oldest first (no lock). */
  async liveBySalesNumber(companyId: string, reference: string): Promise<NamingShipment[]> {
    return this.db
      .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber, invoicingStatus: shipmentTable.invoicingStatus })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), sql`${PLAIN_SALES_NUMBER} = ${plainSalesReference(reference)}`))
      .orderBy(asc(shipmentTable.createdAt), asc(shipmentTable.id));
  }

  /**
   * The live shipments of the company whose Sales Number is one of `references` (compared without
   * the letters of a quote's Freight Mode), with their Sales Number as stored and the shipment's
   * status, the oldest first.
   */
  async liveBySalesNumbers(companyId: string, references: string[]): Promise<(NamingShipment & { reference: string; status: string })[]> {
    if (!references.length) return [];
    return this.db
      .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber, reference: SALES_NUMBER, status: shipmentTable.status })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), inArray(PLAIN_SALES_NUMBER, references.map(plainSalesReference))))
      .orderBy(asc(shipmentTable.createdAt), asc(shipmentTable.id));
  }

  /**
   * The quote references (Sales Number) of the live shipments whose job number contains `text`,
   * case and diacritics aside, each once - at most `limit`. For the Quotes list's "Shipment (job no.)"
   * filter, which finds a quote by any of its shipments.
   */
  async salesNumbersByJobNumber(companyId: string, text: string, limit: number): Promise<string[]> {
    const folded = foldDiacritics(text.trim());
    if (!folded) return [];
    const rows = await this.db
      .selectDistinct({ reference: SALES_NUMBER })
      .from(shipmentTable)
      .where(
        and(
          eq(shipmentTable.companyId, companyId),
          isNull(shipmentTable.deletedAt),
          sql`${SALES_NUMBER} <> ''`,
          sql`${foldSql(sql`coalesce(${shipmentTable.jobNumber}, '')`)} LIKE ${`%${escapeLike(folded)}%`}`,
        ),
      )
      .limit(limit);
    return rows.map((r) => r.reference);
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
      const jobNumber = await nextJobNumber(tx, companyId, data);
      const [created] = await tx
        .insert(shipmentTable)
        .values({ ...data, jobNumber, companyId, salesNumber: reference, createdFromQuote: true })
        .returning();
      return { created: created! };
    });
  }

  /**
   * Soft-deletes a live shipment and writes the shipment-deleted event it owes in the same
   * transaction: both commit, or neither (services/shipmentEvents publishes it after the commit).
   * In `tx` when given - the shipment's write turn, so the delete takes its turn with whatever
   * else writes the shipment - else in a transaction of its own. False when the shipment was not
   * live any more.
   */
  async softDeleteWithEvent(id: string, companyId: string, actor: { userId: string; role: string }, tx?: Tx): Promise<boolean> {
    if (!tx) return db.transaction((own) => this.softDeleteWithEvent(id, companyId, actor, own));
    const now = new Date();
    const [row] = await tx
      .update(shipmentTable)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(shipmentTable.id, id), eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)))
      .returning({ id: shipmentTable.id });
    if (!row) return false;
    await tx.insert(shipmentEventOutboxTable).values({
      createdAt: sql`clock_timestamp()`,
      companyId,
      shipmentId: id,
      event: { shipmentId: id, companyId },
      actingUserId: actor.userId,
      actingRole: actor.role,
    });
    return true;
  }

  /**
   * Inserts a shipment under the company's next CZ job number. The number is taken in the
   * same transaction as the insert, so two creates at the same moment never get the same one.
   * `alongside` writes what comes with the new shipment (its containers and cargo lines) in that
   * transaction too, handed the row just inserted: the shipment is stored with them or not at all,
   * so a failure there leaves no shipment behind for a retry to duplicate. Nobody else can see the
   * row before the commit, so no write turn is needed for it.
   */
  async createWithJobNumber(
    companyId: string,
    data: NewShipmentData,
    alongside?: (tx: Tx, created: ShipmentRecord) => Promise<void>,
  ): Promise<ShipmentRecord> {
    return db.transaction(async (tx) => {
      const jobNumber = await nextJobNumber(tx, companyId, data);
      const [created] = await tx.insert(shipmentTable).values({ ...data, jobNumber, companyId }).returning();
      if (alongside) await alongside(tx, created!);
      return created!;
    });
  }

  /**
   * Inserts the shipment a document reading makes for one House B/L - unless a live shipment of the
   * company already has that House B/L (compared by billOfLadingKey): then nothing is inserted and
   * that shipment (the oldest) is returned. Check and insert are one transaction under an advisory
   * lock on the B/L, so of two creates at the same moment (a reading sent twice) the second finds
   * the shipment of the first. `alongside` as in createWithJobNumber.
   */
  async createForHouseBol(
    companyId: string,
    houseBol: string,
    data: NewShipmentData,
    alongside?: (tx: Tx, created: ShipmentRecord) => Promise<void>,
  ): Promise<{ created: ShipmentRecord } | { existing: NamingShipment }> {
    const key = billOfLadingKey(houseBol);
    return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`shipment-house-bol:${companyId}:${key}`}))`);
      const [existing] = await tx
        .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber })
        .from(shipmentTable)
        .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), sql`${HOUSE_BOL_KEY} = ${key}`))
        .orderBy(asc(shipmentTable.createdAt), asc(shipmentTable.id));
      if (existing) return { existing };
      const jobNumber = await nextJobNumber(tx, companyId, data);
      const [created] = await tx.insert(shipmentTable).values({ ...data, jobNumber, companyId }).returning();
      if (alongside) await alongside(tx, created!);
      return { created: created! };
    });
  }

  /** The company's live shipments whose House B/L is one of `houseBols` (by billOfLadingKey), with that key, the oldest first. */
  async liveByHouseBols(companyId: string, houseBols: string[]): Promise<(NamingShipment & { key: string })[]> {
    const keys = [...new Set(houseBols.map(billOfLadingKey).filter(Boolean))];
    if (!keys.length) return [];
    return this.db
      .select({ id: shipmentTable.id, jobNumber: shipmentTable.jobNumber, key: HOUSE_BOL_KEY })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), inArray(HOUSE_BOL_KEY, keys)))
      .orderBy(asc(shipmentTable.createdAt), asc(shipmentTable.id));
  }

  /** A live shipment as it is inside its write turn: what every write before the turn was taken left. Null when there is none. */
  async getInTurn(tx: Tx, id: string, companyId: string): Promise<ShipmentRecord | null> {
    const [row] = await tx
      .select()
      .from(shipmentTable)
      .where(and(eq(shipmentTable.id, id), eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)));
    return row ?? null;
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

  /**
   * A few fields of the company's live shipments among `ids` (Trucking's view of its jobs, who
   * Accounts Payable asks about a supplier invoice, and the job of a warehouse record the main
   * search finds).
   */
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
        personInCharge: shipmentTable.personInCharge,
        holidayCover: shipmentTable.holidayCover,
        invoicingStatus: shipmentTable.invoicingStatus,
        warehouseReceivedDate: shipmentTable.warehouseReceivedDate,
        warehouseReleasedDate: shipmentTable.warehouseReleasedDate,
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

  /**
   * The customer's open jobs (Accounts Receivable's work not yet invoiced): live, not Cancelled, newest first, at
   * most `limit` - the caller asks one more than it shows, to tell it was capped.
   */
  async openJobIdsOfCustomer(companyId: string, customerId: string, limit: number): Promise<string[]> {
    const rows = await this.db
      .select({ id: shipmentTable.id })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), eq(shipmentTable.customerId, customerId), isNull(shipmentTable.deletedAt), NOT_CANCELLED))
      .orderBy(desc(shipmentTable.createdAt), desc(shipmentTable.id))
      .limit(limit);
    return rows.map((r) => r.id);
  }

  /** How many live shipments of the company are for the customer (the Customer Database asks before a delete). */
  async countOfCustomer(companyId: string, customerId: string): Promise<number> {
    const [{ value }] = await this.db
      .select({ value: count() })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), eq(shipmentTable.customerId, customerId), isNull(shipmentTable.deletedAt)));
    return Number(value);
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
            .where(and(eq(masterJobTable.companyId, companyId), inArray(masterJobTable.mczNumber, masterJobNumberForms(f.masterJobMcz)), isNull(masterJobTable.deletedAt))),
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
    if (f.tile === ATTENTION_TILE) {
      clauses.push(attentionMatch(f.attentionIds));
    } else if (f.tile && f.tile !== "all") {
      const predicate = tilePredicate(f.tile);
      if (predicate) clauses.push(predicate);
    }
    const handledBy = handledByMatch(f.handledBy);
    if (handledBy) clauses.push(handledBy);
    const mode = modeMatch(f.mode);
    if (mode) clauses.push(mode);
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
      const match = searchMatch(f.search, f.searchColumns);
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
   * The main search (the top bar): the company's live shipments the Shipments search finds by
   * these words (searchMatch over SEARCHED_TEXT), the newest `limit` of them and how many in all.
   * The same company and deleted rules as listFiltered, which the Shipments list reads.
   */
  async searchMain(companyId: string, search: string, limit: number) {
    const match = searchMatch(search);
    if (!match) return { rows: [], total: 0 };
    const where = and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), match);
    const [rows, [{ value: total }]] = await Promise.all([
      this.db
        .select({
          id: shipmentTable.id,
          jobNumber: shipmentTable.jobNumber,
          customer: shipmentTable.customer,
          customerId: shipmentTable.customerId,
          pol: shipmentTable.pol,
          pod: shipmentTable.pod,
          status: shipmentTable.status,
          tradeDirection: shipmentTable.tradeDirection,
          freightMode: shipmentTable.freightMode,
          etd: shipmentTable.estimatedDeparture,
          eta: shipmentTable.estimatedArrival,
        })
        .from(shipmentTable)
        .where(where)
        .orderBy(desc(shipmentTable.createdAt), desc(shipmentTable.id))
        .limit(limit),
      this.db.select({ value: count() }).from(shipmentTable).where(where),
    ]);
    return { rows, total: Number(total) };
  }


  /**
   * Counts for the Shipments overview tiles, computed in SQL over the whole
   * company dataset (not just the current page).
   *
   * "Needs Attention" is not counted here: the service counts the jobs the deadline rules name
   * (lib/needsAttention) - the same rows the URGENT card lists and the tile opens.
   */
  async tileCounts(companyId: string) {
    const base = and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt));

    const [row] = await this.db
      .select({
        active: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.active})`,
        etaMoved: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.etamoved})`,
        importCount: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.import})`,
        exportCount: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.export})`,
        week: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.week})`,
        nextWeek: sql<number>`COUNT(*) FILTER (WHERE ${TILE_PREDICATES.nextweek})`,
      })
      .from(shipmentTable)
      .where(base);

    return {
      active: Number(row?.active ?? 0),
      etaMoved: Number(row?.etaMoved ?? 0),
      import: Number(row?.importCount ?? 0),
      export: Number(row?.exportCount ?? 0),
      week: Number(row?.week ?? 0),
      nextWeek: Number(row?.nextWeek ?? 0),
    };
  }

  /**
   * The company's active jobs Needs Attention may list, the newest first, as lib/needsAttention
   * reads them. The rules are there; this only keeps them from reading every job, and must find
   * every job they could name (`range` is lib/needsAttention candidateRange):
   *
   *   a plain date (cargo ready, pick-up, ETD, ETA, ETA warehouse, planned delivery) from today
   *   to the end of the ATTENTION window; or, on a job that has not left (no ATD, ATA or actual
   *   delivery), a cut-off date in that span, or one that passed - while the ETD is today or
   *   later, or, with no ETD, while the cut-off's own date is not before `passedSince`.
   *
   * A cut-off's status is not asked: whether its work is done is the rule's to say. AMS and ISF
   * with no deadline typed are due 4 days before the ETD, so that day counts as a cut-off date.
   */
  async needsAttentionCandidates(companyId: string, range: { from: string; until: string; passedSince: string }, limit: number) {
    const from = sql`${range.from}::date`;
    const until = sql`${range.until}::date`;
    const anyOf = (conditions: SQL[]) => sql`(${sql.join(conditions, sql` OR `)})`;
    const plainDates = [
      shipmentTable.cargoReadinessDate,
      shipmentTable.pickupDate,
      shipmentTable.estimatedDeparture,
      shipmentTable.estimatedArrival,
      shipmentTable.etaWarehouse,
      shipmentTable.plannedDeliveryDate,
    ];
    const typedCutoffs = [shipmentTable.closingDate, shipmentTable.vgmClosing, shipmentTable.siClosing, shipmentTable.amsDeadline, shipmentTable.isfDeadline];
    const cutoffDates = [...typedCutoffs, sql`(${FILED_BEFORE_DEPARTURE})`];
    const notLeft = sql`${shipmentTable.actualDeparture} IS NULL AND ${shipmentTable.actualArrival} IS NULL AND ${shipmentTable.actualDeliveryDate} IS NULL`;
    const dateAhead = anyOf(plainDates.map((date) => sql`${date} BETWEEN ${from} AND ${until}`));
    const cutoffAhead = anyOf(cutoffDates.map((date) => sql`${date} BETWEEN ${from} AND ${until}`));
    // Passed, with the ETD still to come: any of them, the day 4 days before the ETD too.
    const passedBeforeEtd = sql`(${shipmentTable.estimatedDeparture} >= ${from} AND ${anyOf(cutoffDates.map((date) => sql`${date} < ${from}`))})`;
    // Passed, with no ETD: only lately (and there is no day 4 days before an ETD).
    const passedLately = sql`(${shipmentTable.estimatedDeparture} IS NULL AND ${anyOf(typedCutoffs.map((date) => sql`(${date} >= ${range.passedSince}::date AND ${date} < ${from})`))})`;

    return this.db
      .select({
        id: shipmentTable.id,
        jobNumber: shipmentTable.jobNumber,
        customerId: shipmentTable.customerId,
        customer: shipmentTable.customer,
        tradeDirection: shipmentTable.tradeDirection,
        status: shipmentTable.status,
        cargoReadinessDate: shipmentTable.cargoReadinessDate,
        pickupDate: shipmentTable.pickupDate,
        estimatedDeparture: shipmentTable.estimatedDeparture,
        actualDeparture: shipmentTable.actualDeparture,
        estimatedArrival: shipmentTable.estimatedArrival,
        // With the ATD, what the shared cut-off rule reads "the job has left" from (lib/managersCockpit cutoffsOf).
        actualArrival: shipmentTable.actualArrival,
        actualDeliveryDate: shipmentTable.actualDeliveryDate,
        etaWarehouse: shipmentTable.etaWarehouse,
        warehouseReceivedDate: shipmentTable.warehouseReceivedDate,
        plannedDeliveryDate: shipmentTable.plannedDeliveryDate,
        closingDate: shipmentTable.closingDate,
        closingTime: shipmentTable.closingTime,
        vgmClosing: shipmentTable.vgmClosing,
        vgmClosingTime: shipmentTable.vgmClosingTime,
        vgm: shipmentTable.vgm,
        siClosing: shipmentTable.siClosing,
        siClosingTime: shipmentTable.siClosingTime,
        shippingInstructions: shipmentTable.shippingInstructions,
        ams: shipmentTable.ams,
        amsDeadline: shipmentTable.amsDeadline,
        amsDeadlineTime: shipmentTable.amsDeadlineTime,
        isf: shipmentTable.isf,
        isfDeadline: shipmentTable.isfDeadline,
        isfDeadlineTime: shipmentTable.isfDeadlineTime,
      })
      .from(shipmentTable)
      .where(and(
        eq(shipmentTable.companyId, companyId),
        isNull(shipmentTable.deletedAt),
        ACTIVE,
        sql`(${dateAhead} OR (${notLeft} AND (${cutoffAhead} OR ${passedBeforeEtd} OR ${passedLately})))`,
      ))
      .orderBy(desc(shipmentTable.createdAt), desc(shipmentTable.id))
      .limit(limit);
  }

  /**
   * The active shipments whose dates may need a look: something actual happened or a plan has passed,
   * or the customer was told something, or a source proposes a date. The rules are lib/trackingAttention;
   * this only keeps them from reading every shipment. When there are more than `limit`, the ones that
   * happened longest ago stay: those are the most likely past the tax date or delivered and not billed.
   */
  async trackingAttentionCandidates(companyId: string, limit: number) {
    return this.db
      .select({
        id: shipmentTable.id,
        jobNumber: shipmentTable.jobNumber,
        customerId: shipmentTable.customerId,
        customer: shipmentTable.customer,
        tradeDirection: shipmentTable.tradeDirection,
        freightMode: shipmentTable.freightMode,
        department: shipmentTable.department,
        status: shipmentTable.status,
        estimatedDeparture: shipmentTable.estimatedDeparture,
        actualDeparture: shipmentTable.actualDeparture,
        estimatedArrival: shipmentTable.estimatedArrival,
        actualArrival: shipmentTable.actualArrival,
        etaWarehouse: shipmentTable.etaWarehouse,
        warehouseReceivedDate: shipmentTable.warehouseReceivedDate,
        plannedDeliveryDate: shipmentTable.plannedDeliveryDate,
        actualDeliveryDate: shipmentTable.actualDeliveryDate,
      })
      .from(shipmentTable)
      .where(and(
        eq(shipmentTable.companyId, companyId),
        isNull(shipmentTable.deletedAt),
        ACTIVE,
        sql`(
          ${shipmentTable.actualDeparture} IS NOT NULL OR ${shipmentTable.actualArrival} IS NOT NULL OR ${shipmentTable.actualDeliveryDate} IS NOT NULL
          OR ${shipmentTable.estimatedArrival} < ${TODAY} OR ${shipmentTable.estimatedDeparture} < ${TODAY}
          OR EXISTS (SELECT 1 FROM ${shipmentCustomerNoticeTable} told WHERE told.shipment_id = ${shipmentTable.id} AND told.deleted_at IS NULL)
          OR EXISTS (SELECT 1 FROM ${containerTable} box WHERE box.shipment_id = ${shipmentTable.id} AND box.deleted_at IS NULL AND (box.free_time_days IS NOT NULL OR box.last_free_day IS NOT NULL))
          OR EXISTS (SELECT 1 FROM ${shipmentTrackingEventTable} proposed WHERE proposed.shipment_id = ${shipmentTable.id} AND proposed.effect = 'proposed' AND proposed.deleted_at IS NULL)
        )`,
      ))
      // LEAST skips the dates a job doesn't have; one with none of them comes after, the newest first.
      .orderBy(
        sql`LEAST(${shipmentTable.actualDeparture}, ${shipmentTable.actualArrival}, ${shipmentTable.actualDeliveryDate}) ASC NULLS LAST`,
        desc(shipmentTable.createdAt),
      )
      .limit(limit);
  }

  /**
   * Every active job of the company as Shipments → Managers reads it, the newest first: what
   * lib/trackingAttention needs, who handles it, its cut-offs with their statuses, customs, the
   * booking confirmation, the claim flag, and the columns the step 2 rules go by (lib/managersCockpit
   * and lib/managersCockpitExtra) - with whether the customer was sent an arrival notice, so that
   * needs no read of its own. The rules are there; this judges nothing.
   */
  async managersCockpitRows(companyId: string, limit: number) {
    return this.db
      .select({
        id: shipmentTable.id,
        jobNumber: shipmentTable.jobNumber,
        customer: shipmentTable.customer,
        tradeDirection: shipmentTable.tradeDirection,
        freightMode: shipmentTable.freightMode,
        department: shipmentTable.department,
        status: shipmentTable.status,
        estimatedDeparture: shipmentTable.estimatedDeparture,
        actualDeparture: shipmentTable.actualDeparture,
        estimatedArrival: shipmentTable.estimatedArrival,
        actualArrival: shipmentTable.actualArrival,
        etaWarehouse: shipmentTable.etaWarehouse,
        warehouseReceivedDate: shipmentTable.warehouseReceivedDate,
        plannedDeliveryDate: shipmentTable.plannedDeliveryDate,
        actualDeliveryDate: shipmentTable.actualDeliveryDate,
        personInCharge: shipmentTable.personInCharge,
        holidayCover: shipmentTable.holidayCover,
        closingDate: shipmentTable.closingDate,
        vgmClosing: shipmentTable.vgmClosing,
        vgmClosingTime: shipmentTable.vgmClosingTime,
        vgm: shipmentTable.vgm,
        siClosing: shipmentTable.siClosing,
        siClosingTime: shipmentTable.siClosingTime,
        shippingInstructions: shipmentTable.shippingInstructions,
        ams: shipmentTable.ams,
        amsDeadline: shipmentTable.amsDeadline,
        amsDeadlineTime: shipmentTable.amsDeadlineTime,
        isf: shipmentTable.isf,
        isfDeadline: shipmentTable.isfDeadline,
        isfDeadlineTime: shipmentTable.isfDeadlineTime,
        customsPriority: shipmentTable.customsPriority,
        customsStatus: shipmentTable.customsStatus,
        customsDeadline: shipmentTable.customsDeadline,
        bookingConfirmation: shipmentTable.bookingConfirmation,
        claim: shipmentTable.claim,
        cargoReadinessDate: shipmentTable.cargoReadinessDate,
        pickupDate: shipmentTable.pickupDate,
        closingTime: shipmentTable.closingTime,
        masterBolNumber: shipmentTable.masterBolNumber,
        masterBolType: shipmentTable.masterBolType,
        houseBolType: shipmentTable.houseBolType,
        houseBolRelease: shipmentTable.houseBolRelease,
        bolDraft: shipmentTable.bolDraft,
        plateNumber: shipmentTable.plateNumber,
        creditCheck: shipmentTable.creditCheck,
        dangerous: shipmentTable.dangerous,
        loadType: shipmentTable.loadType,
        masterJobId: shipmentTable.masterJobId,
        customsProcedure: shipmentTable.customsProcedure,
        customsOffice: shipmentTable.customsOffice,
        mrn: shipmentTable.mrn,
        warehouseReleasedDate: shipmentTable.warehouseReleasedDate,
        createdAt: shipmentTable.createdAt,
        updatedAt: shipmentTable.updatedAt,
        arrivalNoticeSent: sql<boolean>`EXISTS (
          SELECT 1 FROM ${shipmentCustomerNoticeTable} told
          WHERE told.shipment_id = ${shipmentTable.id} AND told.kind = 'arrival_notice' AND told.deleted_at IS NULL
        )`,
      })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), ACTIVE))
      .orderBy(desc(shipmentTable.createdAt), desc(shipmentTable.id))
      .limit(limit);
  }

  /** Those of these shipments whose ETD or ETA moved lately (the list's "ETD / ETA moved" tile), by id. */
  async dateMovedLately(companyId: string, shipmentIds: readonly string[]): Promise<string[]> {
    if (shipmentIds.length === 0) return [];
    const rows = await this.db
      .select({ id: shipmentTable.id })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), inArray(shipmentTable.id, [...shipmentIds]), isNull(shipmentTable.deletedAt), DATE_MOVED_LATELY));
    return rows.map((r) => r.id);
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

  /** The reference fields (ShipmentReference) of the company's live shipments: what the reference backfill reads. */
  async referencesOf(companyId: string): Promise<ShipmentReference[]> {
    return this.db
      .select(REFERENCE_FIELDS)
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)));
  }

  /**
   * One live shipment's reference fields, read inside its write turn: what every write before the
   * turn was taken has left. Null when there is no such shipment.
   */
  async referenceInTurn(tx: Tx, id: string, companyId: string): Promise<ShipmentReference | null> {
    const [row] = await tx
      .select(REFERENCE_FIELDS)
      .from(shipmentTable)
      .where(and(eq(shipmentTable.id, id), eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)));
    return row ?? null;
  }

  /**
   * Renames a live shipment's reference to `to` inside a write turn - only while it still reads
   * what `to` was worked out from (`from`: its reference, Freight Mode and Load Type), so a write
   * made since wins. Null when nothing was renamed.
   */
  async renameJobNumber(
    tx: Tx,
    companyId: string,
    from: Pick<ShipmentReference, "id" | "jobNumber" | "freightMode" | "loadType">,
    to: string,
  ): Promise<ShipmentRecord | null> {
    const [row] = await tx
      .update(shipmentTable)
      .set({ jobNumber: to, updatedAt: new Date() })
      .where(
        and(
          eq(shipmentTable.id, from.id),
          eq(shipmentTable.companyId, companyId),
          isNull(shipmentTable.deletedAt),
          eq(shipmentTable.jobNumber, from.jobNumber),
          eq(shipmentTable.freightMode, from.freightMode),
          eq(shipmentTable.loadType, from.loadType),
        ),
      )
      .returning();
    return row ?? null;
  }

  /**
   * Marks a live shipment's reference final inside its write turn and gives it back as it is now:
   * what Invoicing makes the invoice number of. updatedAt stays - nothing a user sees changed.
   * Null when there is no such shipment.
   */
  async markJobNumberFinal(tx: Tx, id: string, companyId: string): Promise<string | null> {
    const [row] = await tx
      .update(shipmentTable)
      .set({ jobNumberFinal: true })
      .where(and(eq(shipmentTable.id, id), eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)))
      .returning({ jobNumber: shipmentTable.jobNumber });
    return row?.jobNumber ?? null;
  }

  /** The columns that name people, of the company's live shipments: what the people backfill reads. */
  async peopleOf(companyId: string): Promise<ShipmentPeople[]> {
    return this.db
      .select({
        id: shipmentTable.id,
        personInCharge: shipmentTable.personInCharge,
        holidayCover: shipmentTable.holidayCover,
        salesPerson: shipmentTable.salesPerson,
        switchBolApprovedBy: shipmentTable.switchBolApprovedBy,
        createdBy: shipmentTable.createdBy,
        approvedBy: shipmentTable.approvedBy,
        houseBolRelease: shipmentTable.houseBolRelease,
      })
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt)));
  }

  /**
   * Replaces stored people values in the company's live shipments, all in one transaction: a
   * rewrite changes only the rows that still hold its `from`, so an edit made since the read is
   * kept. updatedAt is left as it is - nobody edited the shipments. Returns the values changed.
   */
  async rewritePeople(companyId: string, rewrites: PeopleRewrite[]): Promise<number> {
    if (!rewrites.length) return 0;
    return this.db.transaction(async (tx) => {
      let changed = 0;
      for (const { field, from, to } of rewrites) {
        const rows = await tx
          .update(shipmentTable)
          .set({ [field]: to })
          .where(and(eq(shipmentTable.companyId, companyId), isNull(shipmentTable.deletedAt), eq(shipmentTable[field], from)))
          .returning({ id: shipmentTable.id });
        changed += rows.length;
      }
      return changed;
    });
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
