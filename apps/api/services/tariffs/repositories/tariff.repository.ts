import { APIError } from "encore.dev/api";
import { and, asc, count, desc, eq, getTableColumns, gte, inArray, isNull, lte, max, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { containsAllWords, foldDiacritics, foldSql } from "../../../lib/db/textSearch";
import { db } from "../db/db";
import type {
  CollectionData,
  CollectionFreightMode,
  CollectionHub,
  OceanData,
  OceanPort,
  RailBand,
  RailDirection,
  RailRateRow,
  SupplierTariffMode,
  TariffFinding,
  TariffPortCode,
} from "../interfaces/interfaces";
import {
  collectionAreaTable,
  collectionDistanceTable,
  collectionHubTable,
  collectionRateTable,
  collectionRegionTable,
  oceanPortTable,
  oceanRateTable,
  railRateTable,
  tariffTable,
  tariffVersionTable,
  type CollectionRateRecord,
  type CollectionRegionRecord,
  type NewTariffVersionRecord,
  type OceanPortRecord,
  type OceanRateRecord,
  type RailRateRecord,
  type TariffRecord,
  type TariffVersionRecord,
} from "../schemas/tariff.schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What a draft is saved with besides its rows; the tariff, number and company are set here. */
export interface DraftFields extends Omit<NewTariffVersionRecord, "id" | "companyId" | "tariffId" | "versionNo" | "status"> {}

/** What the user sets on a tariff: its name; a rail tariff's ports and import / export; a collections tariff's freight. */
export interface TariffFields {
  name: string;
  ports: TariffPortCode[];
  directions: RailDirection[];
  freightModes?: CollectionFreightMode[];
}

/** A new draft of an existing tariff. */
export interface ExistingDraftTariff {
  tariffId: string;
}

/** A new draft that starts a new tariff of the supplier. */
export interface NewDraftTariff extends TariffFields {
  supplierCustomerId: string;
  mode: SupplierTariffMode;
}

/** The tariff a new draft belongs to: an existing one, or a new one of the supplier. */
export type DraftTariff = ExistingDraftTariff | NewDraftTariff;

/** A draft's rows: a rail tariff's place rows, or everything a collections or an ocean tariff file holds. */
export type DraftRows = RailRateRow[] | CollectionData | OceanData;

/** An ocean rate with the UN/LOCODEs its port names mean. */
export interface OceanRateWithPorts extends OceanRateRecord {
  polCode: string | null;
  podCode: string | null;
}

/** What a page of an ocean version's rates is searched by. */
export interface OceanRateFilter {
  search?: string;
  table?: number;
  offset: number;
  limit: number;
}

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

/** The draft approved, as it now is. */
export interface ApproveSuccess {
  ok: true;
  version: TariffVersionRecord;
}

/** Why a draft is not approved: "not_found", or a sentence for the user. */
export interface ApproveRefusal {
  ok: false;
  reason: string;
}

export type ApproveResult = ApproveSuccess | ApproveRefusal;

/** The port name as the pick left it. */
export interface OceanPortPicked {
  ok: true;
  port: OceanPortRecord;
}

/** Why a port was not picked. */
export interface OceanPortRefusal {
  ok: false;
  /** not_draft: the version was approved or thrown away meanwhile; no_such_name: it has no such port name */
  reason: "not_draft" | "no_such_name";
}

export type SetOceanPortResult = OceanPortPicked | OceanPortRefusal;

/** A page of rows with how many match in all. */
export interface RowPage<T> {
  rows: T[];
  total: number;
}

/** What a collections postcode area gives: its zone and the country of its prices. */
export interface AreaZone {
  zone: string;
  country: string;
}

/** A port name a user picked or left out on a version, as the next upload takes it over. */
export interface OceanPick extends Pick<OceanPort, "side" | "name" | "code" | "status"> {}

/** An inland place found by its postcode. */
export interface PostcodePlace {
  postcode: string;
}

/** An inland place found by its name. */
export interface NamedPlace {
  name: string;
}

/** Where a route's rows are looked for: the port, direction and day, and the inland place by postcode or name. */
export interface RouteQuery {
  port: TariffPortCode;
  direction: RailDirection;
  /** YYYY-MM-DD the prices must be valid on */
  date: string;
  /** ISO 3166-1 alpha-2 of the inland place */
  country: string;
  place: PostcodePlace | NamedPlace;
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

// Postgres takes at most 65535 parameters a statement; the widest row (rail_rate) has 16 columns.
const RATE_BATCH = 1000;

const live = (companyId: string) => and(eq(tariffVersionTable.companyId, companyId), isNull(tariffVersionTable.deletedAt));

// The day before a YYYY-MM-DD date.
const dayBefore = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

// Inserts in batches of RATE_BATCH rows, well inside Postgres' parameter limit.
async function insertBatched<T>(rows: T[], insert: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < rows.length; i += RATE_BATCH) await insert(rows.slice(i, i + RATE_BATCH));
}

async function insertRates(tx: Tx, companyId: string, versionId: string, rows: RailRateRow[]): Promise<void> {
  await insertBatched(rows, (b) => tx.insert(railRateTable).values(b.map((r) => ({ ...r, companyId, versionId }))));
}

async function insertCollection(tx: Tx, companyId: string, versionId: string, data: CollectionData): Promise<void> {
  const own = { companyId, versionId };
  await insertBatched(data.rates, (b) => tx.insert(collectionRateTable).values(b.map((r) => ({ ...r, ...own }))));
  await insertBatched(data.regions, (b) => tx.insert(collectionRegionTable).values(b.map((r) => ({ ...r, ...own }))));
  await insertBatched(data.distances, (b) => tx.insert(collectionDistanceTable).values(b.map((r) => ({ ...r, ...own }))));
  await insertBatched(data.areas, (b) => tx.insert(collectionAreaTable).values(b.map((r) => ({ ...r, ...own }))));
}

async function insertOcean(tx: Tx, companyId: string, versionId: string, data: OceanData): Promise<void> {
  const own = { companyId, versionId };
  await insertBatched(data.rates, (b) => tx.insert(oceanRateTable).values(b.map(({ table, ...r }) => ({ ...r, tableNo: table, ...own }))));
  await insertBatched(data.ports, (b) => tx.insert(oceanPortTable).values(b.map((p) => ({ ...p, ...own }))));
}

async function insertRows(tx: Tx, companyId: string, versionId: string, rows: DraftRows): Promise<void> {
  if (Array.isArray(rows)) await insertRates(tx, companyId, versionId, rows);
  else if ("regions" in rows) await insertCollection(tx, companyId, versionId, rows);
  else await insertOcean(tx, companyId, versionId, rows);
}

// Every table of a version's rows: each has the version and the company.
const ROW_TABLES = [railRateTable, collectionRateTable, collectionRegionTable, collectionDistanceTable, collectionAreaTable, oceanRateTable, oceanPortTable] as const;

// A version's rows of every kind, removed when its draft is read again or thrown away.
async function deleteRows(tx: Tx, companyId: string, versionId: string): Promise<void> {
  for (const table of ROW_TABLES) await tx.delete(table).where(and(eq(table.companyId, companyId), eq(table.versionId, versionId)));
}

const polPort = alias(oceanPortTable, "pol_port");
const podPort = alias(oceanPortTable, "pod_port");

// The port name of a rate on one side, in the rate's own version and company.
const portOfRate = (port: typeof polPort | typeof podPort, side: "pol" | "pod", name: typeof oceanRateTable.polName | typeof oceanRateTable.podName) =>
  and(eq(port.companyId, oceanRateTable.companyId), eq(port.versionId, oceanRateTable.versionId), eq(port.side, side), eq(port.name, name));

// Ocean rates with the codes their port names mean (a name without a match gives null).
const oceanRatesWithPorts = () =>
  db
    .select({ ...getTableColumns(oceanRateTable), polCode: polPort.code, podCode: podPort.code })
    .from(oceanRateTable)
    .leftJoin(polPort, portOfRate(polPort, "pol", oceanRateTable.polName))
    .leftJoin(podPort, portOfRate(podPort, "pod", oceanRateTable.podName));

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
   * the company's live tariff row locked so two uploads cannot take the same version number (the
   * unique index is the backstop) and a draft is never put under another company's tariff.
   */
  async createDraft(companyId: string, tariff: DraftTariff, fields: DraftFields, rows: DraftRows): Promise<TariffVersionRecord> {
    return db.transaction(async (tx) => {
      let tariffId: string;
      if ("tariffId" in tariff) {
        tariffId = tariff.tariffId;
        const [locked] = await tx
          .select({ id: tariffTable.id })
          .from(tariffTable)
          .where(and(eq(tariffTable.id, tariffId), eq(tariffTable.companyId, companyId), isNull(tariffTable.deletedAt)))
          .for("update");
        if (!locked) throw APIError.notFound("Tariff not found");
      } else {
        const [created] = await tx.insert(tariffTable).values({ companyId, ...tariff }).returning({ id: tariffTable.id });
        tariffId = created!.id;
      }
      // Discarded drafts keep their numbers, so a number is never reused.
      const [{ last }] = await tx
        .select({ last: max(tariffVersionTable.versionNo) })
        .from(tariffVersionTable)
        .where(and(eq(tariffVersionTable.companyId, companyId), eq(tariffVersionTable.tariffId, tariffId)));
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
      await deleteRows(tx, companyId, versionId);
      await insertRows(tx, companyId, versionId, rows);
      return version;
    });
  }

  /**
   * Approves a draft without errors, in one transaction with the tariff's row locked. Active
   * versions its dates overlap give way: one that started earlier now ends the day before it
   * starts, one that starts on or after that day is superseded. A draft that would end inside an
   * earlier version is refused: the dates after it would be left without prices. So is an ocean
   * draft with a port name still to match, counted under the version's lock so a layout read again
   * meanwhile cannot slip pending ports through. The tariff remembers the draft's layout for the
   * next upload.
   */
  async approve(companyId: string, versionId: string, by: string): Promise<ApproveResult> {
    return db.transaction(async (tx): Promise<ApproveResult> => {
      const [draft] = await tx.select().from(tariffVersionTable).where(and(eq(tariffVersionTable.id, versionId), live(companyId)));
      if (!draft) return { ok: false, reason: "not_found" };
      await tx
        .select({ id: tariffTable.id })
        .from(tariffTable)
        .where(and(eq(tariffTable.id, draft.tariffId), eq(tariffTable.companyId, companyId)))
        .for("update");
      const [version] = await tx
        .select()
        .from(tariffVersionTable)
        .where(and(eq(tariffVersionTable.id, versionId), eq(tariffVersionTable.companyId, companyId)))
        .for("update");
      if (!version || version.deletedAt || version.status !== "draft") return { ok: false, reason: "This version is not a draft any more" };
      if (version.errorCount > 0) return { ok: false, reason: "The draft still has errors; correct the layout or the file first" };
      const [{ pending }] = await tx
        .select({ pending: count() })
        .from(oceanPortTable)
        .where(and(eq(oceanPortTable.companyId, companyId), eq(oceanPortTable.versionId, versionId), eq(oceanPortTable.status, "pending")));
      if (pending > 0) return { ok: false, reason: `${pending} port names are not matched to a place yet: pick each one, or leave it out, first` };
      const from = version.validFrom;
      if (!from) return { ok: false, reason: "The draft has no start of validity" };

      const active = await tx
        .select()
        .from(tariffVersionTable)
        .where(and(live(companyId), eq(tariffVersionTable.tariffId, version.tariffId), eq(tariffVersionTable.status, "active"), ne(tariffVersionTable.id, versionId)));
      const now = new Date();
      const versionById = (id: string) => and(eq(tariffVersionTable.companyId, companyId), eq(tariffVersionTable.id, id));
      for (const other of active) {
        const overlaps = (other.validTo === null || other.validTo >= from) && (version.validTo === null || other.validFrom === null || other.validFrom <= version.validTo);
        if (!overlaps) continue;
        if (other.validFrom !== null && other.validFrom < from && version.validTo !== null && (other.validTo === null || other.validTo > version.validTo)) {
          return { ok: false, reason: `This version ends on ${version.validTo}, inside version ${other.versionNo}; approving it would leave the days after it without prices. Give it the same end date or none.` };
        }
        if (other.validFrom !== null && other.validFrom < from) {
          await tx.update(tariffVersionTable).set({ validTo: dayBefore(from), updatedAt: now }).where(versionById(other.id));
        } else {
          await tx.update(tariffVersionTable).set({ status: "superseded", supersededAt: now, updatedAt: now }).where(versionById(other.id));
        }
      }
      const [approved] = await tx
        .update(tariffVersionTable)
        .set({ status: "active", activatedAt: now, activatedBy: by, updatedAt: now })
        .where(versionById(versionId))
        .returning();
      await tx
        .update(tariffTable)
        .set({ layout: version.layout, updatedAt: now })
        .where(and(eq(tariffTable.companyId, companyId), eq(tariffTable.id, version.tariffId)));
      return { ok: true, version: approved! };
    });
  }

  /** Throws a draft away: the version is soft-deleted, its rows (read from the kept file) removed. False when it is no draft. */
  async discard(companyId: string, versionId: string): Promise<boolean> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [version] = await tx
        .update(tariffVersionTable)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(tariffVersionTable.id, versionId), live(companyId), eq(tariffVersionTable.status, "draft")))
        .returning({ id: tariffVersionTable.id });
      if (!version) return false;
      await deleteRows(tx, companyId, versionId);
      return true;
    });
  }

  /** A version's rows in sheet order, a page of them, with how many match. */
  async rates(companyId: string, versionId: string, filter: RateFilter): Promise<RowPage<RailRateRecord>> {
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
          live(companyId),
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
  async collectionRates(companyId: string, versionId: string): Promise<CollectionRateRecord[]> {
    return db
      .select()
      .from(collectionRateTable)
      .where(and(eq(collectionRateTable.companyId, companyId), eq(collectionRateTable.versionId, versionId)))
      .orderBy(asc(collectionRateTable.matrix), asc(collectionRateTable.weightToKg), asc(collectionRateTable.rowNo));
  }

  /** The region of a postcode in a version's list: its first row, as the tariff's own calculator takes it. */
  async regionOf(companyId: string, versionId: string, postcode: string): Promise<CollectionRegionRecord | null> {
    const [row] = await db
      .select()
      .from(collectionRegionTable)
      .where(and(eq(collectionRegionTable.companyId, companyId), eq(collectionRegionTable.versionId, versionId), eq(collectionRegionTable.postcode, postcode)))
      .orderBy(asc(collectionRegionTable.rowNo))
      .limit(1);
    return row ?? null;
  }

  /** The km between two regions of a version, whichever way round the list has them; null when it has neither. */
  async distanceBetween(companyId: string, versionId: string, a: string, b: string): Promise<number | null> {
    const rows = await db
      .select({ fromRegion: collectionDistanceTable.fromRegion, km: collectionDistanceTable.km })
      .from(collectionDistanceTable)
      .where(
        and(
          eq(collectionDistanceTable.companyId, companyId),
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
  async areaOf(companyId: string, versionId: string, postcode: string): Promise<AreaZone | null> {
    const [row] = await db
      .select({ zone: collectionAreaTable.zone, country: collectionAreaTable.country })
      .from(collectionAreaTable)
      .where(
        and(
          eq(collectionAreaTable.companyId, companyId),
          eq(collectionAreaTable.versionId, versionId),
          lte(collectionAreaTable.postcodeFrom, postcode),
          gte(collectionAreaTable.postcodeTo, postcode),
        ),
      )
      .orderBy(sql`(${collectionAreaTable.postcodeTo}::int - ${collectionAreaTable.postcodeFrom}::int)`, asc(collectionAreaTable.rowNo))
      .limit(1);
    return row ?? null;
  }

  async collectionCounts(companyId: string, versionId: string): Promise<CollectionCounts> {
    const countOf = async (table: typeof collectionRateTable | typeof collectionRegionTable | typeof collectionDistanceTable | typeof collectionAreaTable) => {
      const [{ n }] = await db
        .select({ n: count() })
        .from(table)
        .where(and(eq(table.companyId, companyId), eq(table.versionId, versionId)));
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

  // ── Ocean ──

  /** An ocean version's port names and what they mean: those still to match first, then by side and name. */
  async oceanPorts(companyId: string, versionId: string): Promise<OceanPortRecord[]> {
    return db
      .select()
      .from(oceanPortTable)
      .where(and(eq(oceanPortTable.companyId, companyId), eq(oceanPortTable.versionId, versionId)))
      .orderBy(sql`${oceanPortTable.status} <> 'pending'`, asc(oceanPortTable.side), asc(oceanPortTable.name));
  }

  /** How many of an ocean version's port names are still to match. */
  async pendingOceanPorts(companyId: string, versionId: string): Promise<number> {
    const [{ n }] = await db
      .select({ n: count() })
      .from(oceanPortTable)
      .where(and(eq(oceanPortTable.companyId, companyId), eq(oceanPortTable.versionId, versionId), eq(oceanPortTable.status, "pending")));
    return n;
  }

  /**
   * Sets what a port name of the company's draft means: a place a user picked, or none (left out).
   * The version is locked as a live draft first, so a pick cannot land on a version approved or
   * discarded meanwhile; the refusal says which of the two went wrong.
   */
  async setOceanPort(companyId: string, versionId: string, side: "pol" | "pod", name: string, code: string | null): Promise<SetOceanPortResult> {
    return db.transaction(async (tx): Promise<SetOceanPortResult> => {
      const [draft] = await tx
        .select({ id: tariffVersionTable.id })
        .from(tariffVersionTable)
        .where(and(eq(tariffVersionTable.id, versionId), live(companyId), eq(tariffVersionTable.status, "draft")))
        .for("share");
      if (!draft) return { ok: false, reason: "not_draft" };
      const [port] = await tx
        .update(oceanPortTable)
        .set({ code, status: code ? "manual" : "skipped" })
        .where(and(eq(oceanPortTable.companyId, companyId), eq(oceanPortTable.versionId, versionId), eq(oceanPortTable.side, side), eq(oceanPortTable.name, name)))
        .returning();
      return port ? { ok: true, port } : { ok: false, reason: "no_such_name" };
    });
  }

  /** The port names users picked or left out on the tariff's versions, newest first: the next upload takes them over. */
  async oceanPicks(companyId: string, tariffId: string): Promise<OceanPick[]> {
    return db
      .select({ side: oceanPortTable.side, name: oceanPortTable.name, code: oceanPortTable.code, status: oceanPortTable.status })
      .from(oceanPortTable)
      .innerJoin(tariffVersionTable, eq(tariffVersionTable.id, oceanPortTable.versionId))
      .where(
        and(
          eq(oceanPortTable.companyId, companyId),
          live(companyId),
          eq(tariffVersionTable.tariffId, tariffId),
          inArray(oceanPortTable.status, ["manual", "skipped"]),
        ),
      )
      .orderBy(desc(tariffVersionTable.versionNo));
  }

  /** Replaces a draft's findings and their counts (a port picked changes what is left to pick). */
  async replaceFindings(companyId: string, versionId: string, findings: TariffFinding[], totals: { errors: number; warnings: number }): Promise<void> {
    await db
      .update(tariffVersionTable)
      .set({ findings, errorCount: totals.errors, warningCount: totals.warnings, updatedAt: new Date() })
      .where(and(eq(tariffVersionTable.id, versionId), live(companyId), eq(tariffVersionTable.status, "draft")));
  }

  /** A page of an ocean version's rates in table and sheet order, searched by port names and transshipment port. */
  async oceanRates(companyId: string, versionId: string, filter: OceanRateFilter): Promise<RowPage<OceanRateWithPorts>> {
    const clauses = [eq(oceanRateTable.companyId, companyId), eq(oceanRateTable.versionId, versionId)];
    if (filter.table !== undefined) clauses.push(eq(oceanRateTable.tableNo, filter.table));
    const match = filter.search ? containsAllWords([oceanRateTable.polName, oceanRateTable.podName, oceanRateTable.via, sql`coalesce(${podPort.code}, '')`], filter.search) : undefined;
    if (match) clauses.push(match);
    const where = and(...clauses);
    const [rows, [{ total }]] = await Promise.all([
      oceanRatesWithPorts().where(where).orderBy(asc(oceanRateTable.tableNo), asc(oceanRateTable.rowNo), asc(oceanRateTable.polName)).offset(filter.offset).limit(filter.limit),
      db
        .select({ total: count() })
        .from(oceanRateTable)
        .leftJoin(podPort, portOfRate(podPort, "pod", oceanRateTable.podName))
        .where(where),
    ]);
    return { rows, total };
  }

  /** The ocean versions that price on the day, of tariffs for the direction, with their tariffs. */
  async oceanCandidates(companyId: string, direction: RailDirection, date: string): Promise<CollectionCandidate[]> {
    return db
      .select({ version: tariffVersionTable, tariff: tariffTable })
      .from(tariffVersionTable)
      .innerJoin(tariffTable, eq(tariffTable.id, tariffVersionTable.tariffId))
      .where(
        and(
          eq(tariffTable.companyId, companyId),
          isNull(tariffTable.deletedAt),
          eq(tariffTable.mode, "ocean"),
          sql`${direction} = ANY(${tariffTable.directions})`,
          live(companyId),
          eq(tariffVersionTable.status, "active"),
          lte(tariffVersionTable.validFrom, date),
          or(isNull(tariffVersionTable.validTo), gte(tariffVersionTable.validTo, date)),
        ),
      )
      .orderBy(asc(tariffTable.name));
  }

  /** The rates of the company's versions to a port of discharge, from one port of loading or (null) any. */
  async oceanRoute(companyId: string, versionIds: string[], podCode: string, polCode: string | null): Promise<OceanRateWithPorts[]> {
    if (!versionIds.length) return [];
    return oceanRatesWithPorts()
      .where(
        and(
          eq(oceanRateTable.companyId, companyId),
          inArray(oceanRateTable.versionId, versionIds),
          eq(podPort.code, podCode),
          polCode ? eq(polPort.code, polCode) : sql`${polPort.code} IS NOT NULL`,
        ),
      )
      .orderBy(asc(oceanRateTable.versionId), asc(oceanRateTable.tableNo), asc(oceanRateTable.rowNo))
      .limit(2000);
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
