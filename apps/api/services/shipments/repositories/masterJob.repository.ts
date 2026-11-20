import { and, asc, between, count, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { masterJobTable, type MasterJobRecord, type NewMasterJobRecord } from "../schemas/masterJob.schema";
import { shipmentTable } from "../schemas/shipment.schema";
import { MASTER_JOB_LETTERS_PATTERN, masterJobNumberFor, masterJobNumberForms } from "../lib/masterJobNumber";
import { shipmentRefCounterRepository } from "./shipmentRefCounter.repository";
import { masterJobContainerTable } from "../schemas/masterJobContainer.schema";
import { containerTable } from "../schemas/container.schema";
import { containsAllWords } from "../../../lib/db/textSearch";
import { BILL_OF_LADING_KEY_PATTERN, billOfLadingKey } from "../../../lib/billOfLading";

// The Master B/L as two are compared (lib/billOfLading): letters and digits only, upper case.
const MASTER_BOL_KEY = sql<string>`regexp_replace(upper(${masterJobTable.masterBolNumber}), ${BILL_OF_LADING_KEY_PATTERN}, '', 'g')`;

/**
 * What the main search looks in for a master job: its MCZ number, master B/L and booking, the
 * transport (vessel, voyage, shipping line), the ports, the containers on its master BL and on
 * its live houses (a Full Load shows its houses' containers), and its houses' job numbers.
 */
const HOUSES = sql`${shipmentTable} WHERE ${shipmentTable.masterJobId} = ${masterJobTable.id} AND ${shipmentTable.deletedAt} IS NULL`;
const MASTER_JOB_SEARCHED_TEXT: SQL[] = [
  sql`${masterJobTable.mczNumber}`,
  sql`${masterJobTable.masterBolNumber}`,
  sql`${masterJobTable.bookingNumber}`,
  sql`${masterJobTable.vessel}`,
  sql`${masterJobTable.voyage}`,
  sql`${masterJobTable.shippingLine}`,
  sql`${masterJobTable.pol}`,
  sql`${masterJobTable.pod}`,
  sql`(SELECT string_agg(${masterJobContainerTable.containerNumber}, ' ') FROM ${masterJobContainerTable} WHERE ${masterJobContainerTable.masterJobId} = ${masterJobTable.id} AND ${masterJobContainerTable.deletedAt} IS NULL)`,
  sql`(SELECT string_agg(${containerTable.containerNumber}, ' ') FROM ${containerTable} WHERE ${containerTable.deletedAt} IS NULL AND ${containerTable.shipmentId} IN (SELECT ${shipmentTable.id} FROM ${HOUSES}))`,
  sql`(SELECT string_agg(${shipmentTable.jobNumber}, ' ') FROM ${HOUSES})`,
];

// A word typed as an MCZ reference also finds the job by its number, whatever its letters are now
// (the letters follow the Load Type): mcz00000007 finds MCZCONSOL00000007. Digits still being
// typed find the numbers they start.
const MCZ_WORD = new RegExp(`^mcz${MASTER_JOB_LETTERS_PATTERN.toLowerCase()}([0-9]+)$`);
const sameMczNumber = (word: string): SQL | undefined => {
  const digits = MCZ_WORD.exec(word)?.[1];
  return digits === undefined ? undefined : sql`substring(${masterJobTable.mczNumber} from '^MCZ[A-Z]*([0-9]+)$') LIKE ${`${digits}%`}`;
};

class MasterJobRepository extends TenantRepository<typeof masterJobTable> {
  constructor() {
    super(db, masterJobTable, "master_job");
  }

  /** The live master job with this number, whatever letters it or the reference asked for carry. */
  async findByMczNumber(mczNumber: string, companyId: string): Promise<MasterJobRecord | null> {
    const [row] = await this.db
      .select()
      .from(masterJobTable)
      .where(and(eq(masterJobTable.companyId, companyId), inArray(masterJobTable.mczNumber, masterJobNumberForms(mczNumber)), isNull(masterJobTable.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  // Inserts a master job under the company's next MCZ number, taken in the same transaction
  // as the insert, so two creates at the same moment never get the same number. `values`: what it
  // starts with (one made from houses); a Load Type among them gives the number its letters at once
  // (lib/masterJobNumber).
  async createWithMczNumber(
    companyId: string,
    createdBy = "",
    values: Omit<Partial<NewMasterJobRecord>, "id" | "companyId" | "mczNumber" | "createdBy"> = {},
  ): Promise<MasterJobRecord> {
    return this.db.transaction(async (tx) => {
      const mczNumber = masterJobNumberFor(await shipmentRefCounterRepository.allocate(tx, companyId, "MCZ"), values.loadType);
      const [created] = await tx.insert(masterJobTable).values({ ...values, companyId, mczNumber, createdBy }).returning();
      return created!;
    });
  }

  /**
   * The company's live shipments among `ids`, in one read (step 3 review, minor 4): the houses a
   * master job is made from (masterJobService.create). An id of another company's or a deleted
   * shipment is left out.
   */
  async liveShipmentsByIds(companyId: string, ids: readonly string[]) {
    if (!ids.length) return [];
    return this.db
      .select()
      .from(shipmentTable)
      .where(and(eq(shipmentTable.companyId, companyId), inArray(shipmentTable.id, [...ids]), isNull(shipmentTable.deletedAt)));
  }

  /**
   * The master job a document reading files its houses under, for its Master B/L: the company's
   * live master job with that Master B/L (compared by billOfLadingKey; the oldest) when there is
   * one, else a new one under the next MCZ number, holding the Master B/L. Check and insert are one
   * transaction under an advisory lock on the B/L, so two readings of one pre-alert at the same
   * moment make one master job.
   */
  async findOrCreateForMasterBol(companyId: string, masterBol: string, createdBy = ""): Promise<{ row: MasterJobRecord; reused: boolean }> {
    const key = billOfLadingKey(masterBol);
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`master-job-mbl:${companyId}:${key}`}))`);
      const [found] = await tx
        .select()
        .from(masterJobTable)
        .where(and(eq(masterJobTable.companyId, companyId), isNull(masterJobTable.deletedAt), sql`${MASTER_BOL_KEY} = ${key}`))
        .orderBy(asc(masterJobTable.createdAt), asc(masterJobTable.id));
      if (found) return { row: found, reused: true };
      const mczNumber = await shipmentRefCounterRepository.allocate(tx, companyId, "MCZ");
      const [created] = await tx.insert(masterJobTable).values({ companyId, mczNumber, createdBy, masterBolNumber: masterBol.trim() }).returning();
      return { row: created!, reused: false };
    });
  }

  /** The company's live master job with this Master B/L (by billOfLadingKey; the oldest), or null. */
  async liveByMasterBol(companyId: string, masterBol: string): Promise<{ id: string; mczNumber: string } | null> {
    const key = billOfLadingKey(masterBol);
    if (!key) return null;
    const [row] = await this.db
      .select({ id: masterJobTable.id, mczNumber: masterJobTable.mczNumber })
      .from(masterJobTable)
      .where(and(eq(masterJobTable.companyId, companyId), isNull(masterJobTable.deletedAt), sql`${MASTER_BOL_KEY} = ${key}`))
      .orderBy(asc(masterJobTable.createdAt), asc(masterJobTable.id));
    return row ?? null;
  }

  /**
   * The main search (the top bar): the company's live master jobs these words find (every word
   * somewhere in MASTER_JOB_SEARCHED_TEXT), the newest `limit` and how many in all - the same
   * company and deleted rules as the master job list (listForCompany).
   */
  async searchMain(companyId: string, search: string, limit: number): Promise<{ rows: MasterJobRecord[]; total: number }> {
    const match = containsAllWords(MASTER_JOB_SEARCHED_TEXT, search, sameMczNumber);
    if (!match) return { rows: [], total: 0 };
    const where = and(eq(masterJobTable.companyId, companyId), isNull(masterJobTable.deletedAt), match);
    const [rows, [{ value: total }]] = await Promise.all([
      this.db.select().from(masterJobTable).where(where).orderBy(desc(masterJobTable.createdAt), desc(masterJobTable.id)).limit(limit),
      this.db.select({ value: count() }).from(masterJobTable).where(where),
    ]);
    return { rows, total: Number(total) };
  }

  /** The MCZ number of each of the company's live master jobs among `ids`, by id - one query for a whole page of shipments. */
  async mczNumbersByIds(ids: readonly string[], companyId: string): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: masterJobTable.id, mczNumber: masterJobTable.mczNumber })
      .from(masterJobTable)
      .where(and(eq(masterJobTable.companyId, companyId), inArray(masterJobTable.id, [...ids]), isNull(masterJobTable.deletedAt)));
    return new Map(rows.map((r) => [r.id, r.mczNumber]));
  }

  /** Number and Person in Charge of the company's live master jobs among `ids` (for Accounts Payable). */
  async basicsByIds(companyId: string, ids: string[]): Promise<{ id: string; mczNumber: string; personInCharge: string }[]> {
    if (!ids.length) return [];
    return this.db
      .select({ id: masterJobTable.id, mczNumber: masterJobTable.mczNumber, personInCharge: masterJobTable.personInCharge })
      .from(masterJobTable)
      .where(and(eq(masterJobTable.companyId, companyId), inArray(masterJobTable.id, ids), isNull(masterJobTable.deletedAt)));
  }

  /** Live shipments per master job, for the given ids. */
  async shipmentCounts(masterJobIds: string[], companyId: string): Promise<Map<string, number>> {
    if (masterJobIds.length === 0) return new Map();
    const rows = await this.db
      .select({ masterJobId: shipmentTable.masterJobId, n: count() })
      .from(shipmentTable)
      .where(and(
        eq(shipmentTable.companyId, companyId),
        inArray(shipmentTable.masterJobId, masterJobIds),
        isNull(shipmentTable.deletedAt),
      ))
      .groupBy(shipmentTable.masterJobId);
    return new Map(rows.map((r) => [r.masterJobId as string, Number(r.n)]));
  }

  /**
   * What Shipments → Managers reads of the company's live master jobs: those among `ids` (the
   * ones its jobs are houses of), and those that have not departed with an ETD from `etdFrom` to
   * `etdTo` - a master job nobody linked a shipment to is found by its date alone. One query.
   */
  async cockpitFacts(companyId: string, ids: readonly string[], etdFrom: string, etdTo: string) {
    const departingSoon = and(isNull(masterJobTable.actualDeparture), between(masterJobTable.estimatedDeparture, etdFrom, etdTo));
    return this.db
      .select({
        id: masterJobTable.id,
        mczNumber: masterJobTable.mczNumber,
        freightMode: masterJobTable.freightMode,
        tradeDirection: masterJobTable.tradeDirection,
        shipper: masterJobTable.shipper,
        consignee: masterJobTable.consignee,
        personInCharge: masterJobTable.personInCharge,
        holidayCover: masterJobTable.holidayCover,
        closingDate: masterJobTable.closingDate,
        estimatedDeparture: masterJobTable.estimatedDeparture,
        actualDeparture: masterJobTable.actualDeparture,
        actualArrival: masterJobTable.actualArrival,
      })
      .from(masterJobTable)
      .where(and(
        eq(masterJobTable.companyId, companyId),
        isNull(masterJobTable.deletedAt),
        ids.length ? or(inArray(masterJobTable.id, [...ids]), departingSoon) : departingSoon,
      ));
  }
}

export const masterJobRepository = new MasterJobRepository();
