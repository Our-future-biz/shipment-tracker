import { and, count, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { db } from "../db/db";
import { masterJobTable, type MasterJobRecord } from "../schemas/masterJob.schema";
import { shipmentTable } from "../schemas/shipment.schema";
import { masterJobNumberForms } from "../lib/masterJobNumber";
import { shipmentRefCounterRepository } from "./shipmentRefCounter.repository";
import { masterJobContainerTable } from "../schemas/masterJobContainer.schema";
import { containerTable } from "../schemas/container.schema";
import { containsAllWords } from "../../../lib/db/textSearch";

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
const sameMczNumber = (word: string): SQL | undefined => {
  const digits = /^mcz(?:project|consol|full)?([0-9]+)$/.exec(word)?.[1];
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
  // as the insert, so two creates at the same moment never get the same number.
  async createWithMczNumber(companyId: string, createdBy = ""): Promise<MasterJobRecord> {
    return this.db.transaction(async (tx) => {
      const mczNumber = await shipmentRefCounterRepository.allocate(tx, companyId, "MCZ");
      const [created] = await tx.insert(masterJobTable).values({ companyId, mczNumber, createdBy }).returning();
      return created!;
    });
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
}

export const masterJobRepository = new MasterJobRepository();
