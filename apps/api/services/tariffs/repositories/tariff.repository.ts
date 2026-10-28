import { and, asc, count, desc, eq, inArray, isNull, max, ne } from "drizzle-orm";
import { containsAllWords } from "../../../lib/db/textSearch";
import { db } from "../db/db";
import type { RailDirection, RailRateRow, SupplierTariffMode, TariffPortCode } from "../interfaces/interfaces";
import {
  railRateTable,
  tariffTable,
  tariffVersionTable,
  type NewTariffVersionRecord,
  type RailRateRecord,
  type TariffRecord,
  type TariffVersionRecord,
} from "../schemas/tariff.schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What a draft is saved with besides its rows; the tariff, number and company are set here. */
export type DraftFields = Omit<NewTariffVersionRecord, "id" | "companyId" | "tariffId" | "versionNo" | "status">;

/** What the user sets on a tariff: its name, the ports it is for, import and/or export. */
export interface TariffFields {
  name: string;
  ports: TariffPortCode[];
  directions: RailDirection[];
}

/** The tariff a new draft belongs to: an existing one, or a new one of the supplier. */
export type DraftTariff = { tariffId: string } | ({ supplierCustomerId: string; mode: SupplierTariffMode } & TariffFields);

export type ApproveResult = { ok: true; version: TariffVersionRecord } | { ok: false; reason: string };

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

  async update(companyId: string, id: string, fields: TariffFields): Promise<TariffRecord | null> {
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
  async createDraft(companyId: string, tariff: DraftTariff, fields: DraftFields, rows: RailRateRow[]): Promise<TariffVersionRecord> {
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
      await insertRates(tx, companyId, version!.id, rows);
      return version!;
    });
  }

  /** Replaces a draft's layout, findings and rows (its layout was corrected); null when it is no draft. */
  async replaceDraft(companyId: string, versionId: string, fields: Partial<DraftFields>, rows: RailRateRow[]): Promise<TariffVersionRecord | null> {
    return db.transaction(async (tx) => {
      const [version] = await tx
        .update(tariffVersionTable)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(tariffVersionTable.id, versionId), live(companyId), eq(tariffVersionTable.status, "draft")))
        .returning();
      if (!version) return null;
      await tx.delete(railRateTable).where(eq(railRateTable.versionId, versionId));
      await insertRates(tx, companyId, versionId, rows);
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
      await tx.delete(railRateTable).where(eq(railRateTable.versionId, versionId));
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
