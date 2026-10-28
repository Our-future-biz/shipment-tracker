import { and, asc, count, desc, eq, getTableColumns, gte, inArray, isNull, lte, max, ne, or, sql } from "drizzle-orm";
import { containsAllWords, foldDiacritics, foldSql } from "../../../lib/db/textSearch";
import { db } from "../db/db";
import type {
  CollectionData,
  CollectionFreightMode,
  CollectionHub,
  RailBand,
  RailDirection,
  RailRateRow,
  SupplierTariffMode,
  TariffPortCode,
} from "../interfaces/interfaces";
import {
  collectionAreaTable,
  collectionDistanceTable,
  collectionHubTable,
  collectionRateTable,
  collectionRegionTable,
  railRateTable,
  tariffTable,
  tariffVersionTable,
  type CollectionRateRecord,
  type CollectionRegionRecord,
  type NewTariffVersionRecord,
  type RailRateRecord,
  type TariffRecord,
  type TariffVersionRecord,
} from "../schemas/tariff.schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What a draft is saved with besides its rows; the tariff, number and company are set here. */
export type DraftFields = Omit<NewTariffVersionRecord, "id" | "companyId" | "tariffId" | "versionNo" | "status">;

/** What the user sets on a tariff: its name; a rail tariff's ports and import / export; a collections tariff's freight. */
export interface TariffFields {
  name: string;
  ports: TariffPortCode[];
  directions: RailDirection[];
  freightModes?: CollectionFreightMode[];
}

/** The tariff a new draft belongs to: an existing one, or a new one of the supplier. */
export type DraftTariff = { tariffId: string } | ({ supplierCustomerId: string; mode: SupplierTariffMode } & TariffFields);

/** A draft's rows: a rail tariff's place rows, or everything a collections tariff file holds. */
export type DraftRows = RailRateRow[] | CollectionData;

/** A collections version that prices on a day, with its tariff, for offers. */
export interface CollectionCandidate {
  version: TariffVersionRecord;
  tariff: TariffRecord;
}

/** How many rows of each kind a collections version has. */
export interface CollectionCounts {
  rates: number;
  regions: number;
  distances: number;
  areas: number;
}

export type ApproveResult = { ok: true; version: TariffVersionRecord } | { ok: false; reason: string };

/** Where a route's rows are looked for: the port, direction and day, and the inland place by postcode or name. */
export interface RouteQuery {
  port: TariffPortCode;
  direction: RailDirection;
  /** YYYY-MM-DD the prices must be valid on */
  date: string;
  /** ISO 3166-1 alpha-2 of the inland place */
  country: string;
  place: { postcode: string } | { name: string };
}

/** A row on a route with what pricing it needs from its version and tariff. */
export interface RouteRate extends RailRateRecord {
  versionNo: number;
  currency: string;
  versionValidTo: string | null;
  bands: RailBand[];
  tariffId: string;
  tariffName: string;
  supplierCustomerId: string;
}

// The most rows one route lookup reads: a town can have a row per postcode and terminal.
const ROUTE_ROWS = 500;

export interface RateFilter {
  search?: string;
  via?: string;
  offset: number;
  limit: number;
}

// Postgres takes at most 65535 parameters a statement; a rate row has 16 columns.
const RATE_BATCH = 1000;

const live = (companyId: string) => and(eq(tariffVersionTable.companyId, companyId), isNull(tariffVersionTable.deletedAt));

// The day before a YYYY-MM-DD date.
const dayBefore = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

async function insertRates(tx: Tx, companyId: string, versionId: string, rows: RailRateRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += RATE_BATCH) {
    await tx.insert(railRateTable).values(rows.slice(i, i + RATE_BATCH).map((r) => ({ ...r, companyId, versionId })));
  }
}

// Inserts in batches of 1000: each table has at most 9 columns, well inside Postgres' limit.
async function insertBatched<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += RATE_BATCH) await insert(rows.slice(i, i + RATE_BATCH));
}

async function insertCollection(tx: Tx, companyId: string, versionId: string, data: CollectionData): Promise<void> {
  const own = { companyId, versionId };
  await insertBatched(data.rates, (b) => tx.insert(collectionRateTable).values(b.map((r) => ({ ...r, ...own }))));
  await insertBatched(data.regions, (b) => tx.insert(collectionRegionTable).values(b.map((r) => ({ ...r, ...own }))));
  await insertBatched(data.distances, (b) => tx.insert(collectionDistanceTable).values(b.map((r) => ({ ...r, ...own }))));
  await insertBatched(data.areas, (b) => tx.insert(collectionAreaTable).values(b.map((r) => ({ ...r, ...own }))));
}

async function insertRows(tx: Tx, companyId: string, versionId: string, rows: DraftRows): Promise<void> {
  if (Array.isArray(rows)) await insertRates(tx, companyId, versionId, rows);
  else await insertCollection(tx, companyId, versionId, rows);
}

// A version's rows of every kind, removed when its draft is read again or thrown away.
async function deleteRows(tx: Tx, versionId: string): Promise<void> {
  await tx.delete(railRateTable).where(eq(railRateTable.versionId, versionId));
  await tx.delete(collectionRateTable).where(eq(collectionRateTable.versionId, versionId));
  await tx.delete(collectionRegionTable).where(eq(collectionRegionTable.versionId, versionId));
  await tx.delete(collectionDistanceTable).where(eq(collectionDistanceTable.versionId, versionId));
  await tx.delete(collectionAreaTable).where(eq(collectionAreaTable.versionId, versionId));
}

class TariffRepository {
  /** The company's live tariffs of a mode, of the given suppliers when named, by name. */
  async list(companyId: string, mode: SupplierTariffMode, supplierIds?: string[]): Promise<TariffRecord[]> {
    const clauses = [eq(tariffTable.companyId, companyId), isNull(tariffTable.deletedAt), eq(tariffTable.mode, mode)];
    if (supplierIds) clauses.push(inArray(tariffTable.supplierCustomerId, supplierIds));
    return db.select().from(tariffTable).where(and(...clauses)).orderBy(asc(tariffTable.name));
  }

  async get(companyId: string, id: string): Promise<TariffRecord | null> {
    const [row] = await db
      .select()
      .from(tariffTable)
      .where(and(eq(tariffTable.id, id), eq(tariffTable.companyId, companyId), isNull(tariffTable.deletedAt)));
    return row ?? null;
  }

  async update(companyId: string, id: string, fields: Partial<TariffFields>): Promise<TariffRecord | null> {
    const [row] = await db
      .update(tariffTable)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(tariffTable.id, id), eq(tariffTable.companyId, companyId), isNull(tariffTable.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** The live versions of the tariffs, newest first. */
  async versionsOf(companyId: string, tariffIds: string[]): Promise<TariffVersionRecord[]> {
    if (!tariffIds.length) return [];
    return db
      .select()
      .from(tariffVersionTable)
      .where(and(live(companyId), inArray(tariffVersionTable.tariffId, tariffIds)))
      .orderBy(desc(tariffVersionTable.versionNo));
  }

  async getVersion(companyId: string, id: string): Promise<TariffVersionRecord | null> {
    const [row] = await db.select().from(tariffVersionTable).where(and(eq(tariffVersionTable.id, id), live(companyId)));
    return row ?? null;
  }

  /**
   * Saves a new draft with its rows, in one transaction: a new tariff first when there is none, or
   * the tariff's row locked so two uploads cannot take the same version number.
   */
  async createDraft(companyId: string, tariff: DraftTariff, fields: DraftFields, rows: DraftRows): Promise<TariffVersionRecord> {
    return db.transaction(async (tx) => {
      let tariffId: string;
      if ("tariffId" in tariff) {
        tariffId = tariff.tariffId;
        await tx.select({ id: tariffTable.id }).from(tariffTable).where(eq(tariffTable.id, tariffId)).for("update");
      } else {
        const [created] = await tx.insert(tariffTable).values({ companyId, ...tariff }).returning({ id: tariffTable.id });
        tariffId = created!.id;
      }
      // Discarded drafts keep their numbers, so a number is never reused.
      const [{ last }] = await tx.select({ last: max(tariffVersionTable.versionNo) }).from(tariffVersionTable).where(eq(tariffVersionTable.tariffId, tariffId));
      const [version] = await tx
        .insert(tariffVersionTable)
        .values({ ...fields, companyId, tariffId, versionNo: (last ?? 0) + 1, status: "draft" })
        .returning();
      await insertRows(tx, companyId, version!.id, rows);
      return version!;
    });
  }

  /** Replaces a draft's layout, findings and rows (its layout was corrected); null when it is no draft. */
  async replaceDraft(companyId: string, versionId: string, fields: Partial<DraftFields>, rows: DraftRows): Promise<TariffVersionRecord | null> {
    return db.transaction(async (tx) => {
      const [version] = await tx
        .update(tariffVersionTable)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(tariffVersionTable.id, versionId), live(companyId), eq(tariffVersionTable.status, "draft")))
        .returning();
      if (!version) return null;
      await deleteRows(tx, versionId);
      await insertRows(tx, companyId, versionId, rows);
      return version;
    });
  }

  /**
   * Approves a draft without errors, in one transaction with the tariff's row locked. Active
   * versions its dates overlap give way: one that started earlier now ends the day before it
   * starts, one that starts on or after that day is superseded. A draft that would end inside an
   * earlier version is refused: the dates after it would be left without prices. The tariff
   * remembers the draft's layout for the next upload.
   */
  async approve(companyId: string, versionId: string, by: string): Promise<ApproveResult> {
    return db.transaction(async (tx): Promise<ApproveResult> => {
      const [draft] = await tx.select().from(tariffVersionTable).where(and(eq(tariffVersionTable.id, versionId), live(companyId)));
      if (!draft) return { ok: false, reason: "not_found" };
      await tx.select({ id: tariffTable.id }).from(tariffTable).where(eq(tariffTable.id, draft.tariffId)).for("update");
      const [version] = await tx.select().from(tariffVersionTable).where(eq(tariffVersionTable.id, versionId)).for("update");
      if (!version || version.deletedAt || version.status !== "draft") return { ok: false, reason: "This version is not a draft any more" };
      if (version.errorCount > 0) return { ok: false, reason: "The draft still has errors; correct the layout or the file first" };
      const from = version.validFrom;
      if (!from) return { ok: false, reason: "The draft has no start of validity" };

      const active = await tx
        .select()
        .from(tariffVersionTable)
        .where(and(eq(tariffVersionTable.tariffId, version.tariffId), isNull(tariffVersionTable.deletedAt), eq(tariffVersionTable.status, "active"), ne(tariffVersionTable.id, versionId)));
      const now = new Date();
      for (const other of active) {
        const overlaps = (other.validTo === null || other.validTo >= from) && (version.validTo === null || other.validFrom === null || other.validFrom <= version.validTo);
        if (!overlaps) continue;
        if (other.validFrom !== null && other.validFrom < from && version.validTo !== null && (other.validTo === null || other.validTo > version.validTo)) {
          return { ok: false, reason: `This version ends on ${version.validTo}, inside version ${other.versionNo}; approving it would leave the days after it without prices. Give it the same end date or none.` };
        }
        if (other.validFrom !== null && other.validFrom < from) {
          await tx.update(tariffVersionTable).set({ validTo: dayBefore(from), updatedAt: now }).where(eq(tariffVersionTable.id, other.id));
        } else {
          await tx.update(tariffVersionTable).set({ status: "superseded", supersededAt: now, updatedAt: now }).where(eq(tariffVersionTable.id, other.id));
        }
      }
      const [approved] = await tx
        .update(tariffVersionTable)
        .set({ status: "active", activatedAt: now, activatedBy: by, updatedAt: now })
        .where(eq(tariffVersionTable.id, versionId))
        .returning();
      await tx.update(tariffTable).set({ layout: version.layout, updatedAt: now }).where(eq(tariffTable.id, version.tariffId));
      return { ok: true, version: approved! };
    });
  }

  /** Throws a draft away: the version is soft-deleted, its rows (read from the kept file) removed. False when it is no draft. */
  async discard(companyId: string, versionId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [version] = await tx
        .update(tariffVersionTable)
        .set({ deletedAt: new Date() })
        .where(and(eq(tariffVersionTable.id, versionId), live(companyId), eq(tariffVersionTable.status, "draft")))
        .returning({ id: tariffVersionTable.id });
      if (!version) return false;
      await deleteRows(tx, versionId);
      return true;
    });
  }

  /** A version's rows in sheet order, a page of them, with how many match. */
  async rates(companyId: string, versionId: string, filter: RateFilter): Promise<{ rows: RailRateRecord[]; total: number }> {
    const clauses = [eq(railRateTable.companyId, companyId), eq(railRateTable.versionId, versionId)];
    const match = filter.search ? containsAllWords([railRateTable.place, railRateTable.postcode, railRateTable.region, railRateTable.note], filter.search) : undefined;
    if (match) clauses.push(match);
    if (filter.via) clauses.push(eq(railRateTable.via, filter.via));
    const where = and(...clauses);
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(railRateTable).where(where).orderBy(asc(railRateTable.rowNo)).offset(filter.offset).limit(filter.limit),
      db.select({ total: count() }).from(railRateTable).where(where),
    ]);
    return { rows, total };
  }

  /**
   * The rows of the tariffs for the port and direction whose approved version prices on the day,
   * at the inland place: rows whose postcode range holds the postcode, or whose place is the name
   * (diacritics and case aside). In tariff and sheet order.
   */
  async ratesOnRoute(companyId: string, q: RouteQuery): Promise<RouteRate[]> {
    const place =
      "postcode" in q.place
        ? and(lte(railRateTable.postcodeFrom, q.place.postcode), gte(railRateTable.postcodeTo, q.place.postcode))
        : sql`${foldSql(sql`${railRateTable.place}`)} = ${foldDiacritics(q.place.name.trim())}`;
    return db
      .select({
        ...getTableColumns(railRateTable),
        versionNo: tariffVersionTable.versionNo,
        currency: tariffVersionTable.currency,
        versionValidTo: tariffVersionTable.validTo,
        bands: sql<RailBand[]>`${tariffVersionTable.layout}->'bands'`,
        tariffId: tariffTable.id,
        tariffName: tariffTable.name,
        supplierCustomerId: tariffTable.supplierCustomerId,
      })
      .from(railRateTable)
      .innerJoin(tariffVersionTable, eq(tariffVersionTable.id, railRateTable.versionId))
      .innerJoin(tariffTable, eq(tariffTable.id, tariffVersionTable.tariffId))
      .where(
        and(
          eq(tariffTable.companyId, companyId),
          isNull(tariffTable.deletedAt),
          eq(tariffTable.mode, "rail"),
          sql`${q.port} = ANY(${tariffTable.ports})`,
          sql`${q.direction} = ANY(${tariffTable.directions})`,
          isNull(tariffVersionTable.deletedAt),
          eq(tariffVersionTable.status, "active"),
          lte(tariffVersionTable.validFrom, q.date),
          or(isNull(tariffVersionTable.validTo), gte(tariffVersionTable.validTo, q.date)),
          eq(railRateTable.companyId, companyId),
          eq(railRateTable.country, q.country),
          or(isNull(railRateTable.validFrom), lte(railRateTable.validFrom, q.date)),
          or(isNull(railRateTable.validTo), gte(railRateTable.validTo, q.date)),
          place,
        ),
      )
      .orderBy(asc(tariffTable.name), asc(railRateTable.rowNo))
      .limit(ROUTE_ROWS);
  }

  // ── Collections ──

  /** A collections version's price rows, table by table, lightest first. */
  async collectionRates(versionId: string): Promise<CollectionRateRecord[]> {
    return db
      .select()
      .from(collectionRateTable)
      .where(eq(collectionRateTable.versionId, versionId))
      .orderBy(asc(collectionRateTable.matrix), asc(collectionRateTable.weightToKg), asc(collectionRateTable.rowNo));
  }

  /** The region of a postcode in a version's list: its first row, as the tariff's own calculator takes it. */
  async regionOf(versionId: string, postcode: string): Promise<CollectionRegionRecord | null> {
    const [row] = await db
      .select()
      .from(collectionRegionTable)
      .where(and(eq(collectionRegionTable.versionId, versionId), eq(collectionRegionTable.postcode, postcode)))
      .orderBy(asc(collectionRegionTable.rowNo))
      .limit(1);
    return row ?? null;
  }

  /** The km between two regions of a version, whichever way round the list has them; null when it has neither. */
  async distanceBetween(versionId: string, a: string, b: string): Promise<number | null> {
    const rows = await db
      .select({ fromRegion: collectionDistanceTable.fromRegion, km: collectionDistanceTable.km })
      .from(collectionDistanceTable)
      .where(
        and(
          eq(collectionDistanceTable.versionId, versionId),
          or(
            and(eq(collectionDistanceTable.fromRegion, a), eq(collectionDistanceTable.toRegion, b)),
            and(eq(collectionDistanceTable.fromRegion, b), eq(collectionDistanceTable.toRegion, a)),
          ),
        ),
      );
    if (!rows.length) return null;
    // The way round asked for first.
    return (rows.find((r) => r.fromRegion === a) ?? rows[0]!).km;
  }

  /** The zone of a postcode in a version's areas: the narrowest area that holds it. */
  async areaOf(versionId: string, postcode: string): Promise<{ zone: string; country: string } | null> {
    const [row] = await db
      .select({ zone: collectionAreaTable.zone, country: collectionAreaTable.country })
      .from(collectionAreaTable)
      .where(and(eq(collectionAreaTable.versionId, versionId), lte(collectionAreaTable.postcodeFrom, postcode), gte(collectionAreaTable.postcodeTo, postcode)))
      .orderBy(sql`(${collectionAreaTable.postcodeTo}::int - ${collectionAreaTable.postcodeFrom}::int)`, asc(collectionAreaTable.rowNo))
      .limit(1);
    return row ?? null;
  }

  async collectionCounts(versionId: string): Promise<CollectionCounts> {
    const countOf = async (table: typeof collectionRateTable | typeof collectionRegionTable | typeof collectionDistanceTable | typeof collectionAreaTable) => {
      const [{ n }] = await db.select({ n: count() }).from(table).where(eq(table.versionId, versionId));
      return n;
    };
    const [rates, regions, distances, areas] = await Promise.all([
      countOf(collectionRateTable),
      countOf(collectionRegionTable),
      countOf(collectionDistanceTable),
      countOf(collectionAreaTable),
    ]);
    return { rates, regions, distances, areas };
  }

  /** The collections versions that price on the day, of tariffs ticked for the freight, with their tariffs. */
  async collectionCandidates(companyId: string, freightMode: CollectionFreightMode, date: string): Promise<CollectionCandidate[]> {
    return db
      .select({ version: tariffVersionTable, tariff: tariffTable })
      .from(tariffVersionTable)
      .innerJoin(tariffTable, eq(tariffTable.id, tariffVersionTable.tariffId))
      .where(
        and(
          eq(tariffTable.companyId, companyId),
          isNull(tariffTable.deletedAt),
          eq(tariffTable.mode, "collection"),
          sql`${freightMode} = ANY(${tariffTable.freightModes})`,
          live(companyId),
          eq(tariffVersionTable.status, "active"),
          lte(tariffVersionTable.validFrom, date),
          or(isNull(tariffVersionTable.validTo), gte(tariffVersionTable.validTo, date)),
        ),
      )
      .orderBy(asc(tariffTable.name));
  }

  /** Our hubs, one per freight mode that has one. */
  async hubs(companyId: string): Promise<CollectionHub[]> {
    const rows = await db.select().from(collectionHubTable).where(eq(collectionHubTable.companyId, companyId));
    return rows.map((r) => ({ freightMode: r.freightMode, postcode: r.postcode, country: r.country, label: r.label }));
  }

  /** Sets the hub of a freight mode. */
  async setHub(companyId: string, hub: CollectionHub, by: string | null): Promise<void> {
    const values = { postcode: hub.postcode, country: hub.country, label: hub.label, updatedAt: new Date(), updatedBy: by };
    await db
      .insert(collectionHubTable)
      .values({ companyId, freightMode: hub.freightMode, ...values })
      .onConflictDoUpdate({ target: [collectionHubTable.companyId, collectionHubTable.freightMode], set: values });
  }

  /** The terminals a version's rows run via, for filtering. */
  async vias(companyId: string, versionId: string): Promise<string[]> {
    const rows = await db
      .selectDistinct({ via: railRateTable.via })
      .from(railRateTable)
      .where(and(eq(railRateTable.companyId, companyId), eq(railRateTable.versionId, versionId), ne(railRateTable.via, "")))
      .orderBy(asc(railRateTable.via));
    return rows.map((r) => r.via);
  }
}

export const tariffRepository = new TariffRepository();
