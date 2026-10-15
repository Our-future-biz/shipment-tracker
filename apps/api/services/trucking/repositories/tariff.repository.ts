import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, max, or } from "drizzle-orm";
import { db } from "../db/db";
import {
  truckingTariffTable,
  truckingTariffVersionTable,
  type NewTruckingTariffRecord,
  type TruckingTariffRecord,
  type TruckingTariffVersionRecord,
} from "../schemas/truckingTariff.schema";
import type { TariffSide, TariffScope, ValidationFinding } from "../interfaces/interfaces";
import { TenantRepository } from "../../../lib/db/repository";
import { isExclusionViolation, isUniqueViolation } from "../../../lib/db/errors";
import { activationPlan } from "../lib/tariffRules";
import { appendEvent, type TruckingEventInput } from "./event.repository";

const t = truckingTariffTable;
const v = truckingTariffVersionTable;

/** A version without its input and findings: what lists show. */
export type VersionSummaryRecord = Omit<TruckingTariffVersionRecord, "input" | "findings" | "parseFindings">;

const summaryColumns = {
  id: v.id,
  createdAt: v.createdAt,
  updatedAt: v.updatedAt,
  deletedAt: v.deletedAt,
  companyId: v.companyId,
  tariffId: v.tariffId,
  versionNo: v.versionNo,
  validFrom: v.validFrom,
  validTo: v.validTo,
  serviceLevels: v.serviceLevels,
  zoneCount: v.zoneCount,
  warningCount: v.warningCount,
  errorCount: v.errorCount,
  createdByUserId: v.createdByUserId,
  createdBy: v.createdBy,
  activatedAt: v.activatedAt,
  activatedBy: v.activatedBy,
  supersededAt: v.supersededAt,
  sourceFileName: v.sourceFileName,
  sourceSha256: v.sourceSha256,
  sourceKey: v.sourceKey,
};

/** Versions that bind: activated, not superseded, not discarded. */
const binding = and(isNull(v.deletedAt), isNotNull(v.activatedAt), isNull(v.supersededAt));

/** What a new version stores; an imported one also its id (chosen before the file is stored), file and parse problems. */
export type NewVersionValues = Pick<
  TruckingTariffVersionRecord,
  "validFrom" | "validTo" | "input" | "findings" | "serviceLevels" | "zoneCount" | "warningCount" | "errorCount" | "createdByUserId" | "createdBy"
> &
  Partial<Pick<TruckingTariffVersionRecord, "id" | "parseFindings" | "sourceFileName" | "sourceSha256" | "sourceKey">>;

export type ActivateResult =
  | { ok: true; version: TruckingTariffVersionRecord }
  | { ok: false; reason: "not_found" | "not_draft" | "overlap" };

class TariffRepository extends TenantRepository<typeof truckingTariffTable> {
  constructor() {
    super(db, truckingTariffTable, "trucking_tariff");
  }

  async list(companyId: string, filter: { side?: TariffSide; ownerCustomerId?: string; scope?: TariffScope }): Promise<TruckingTariffRecord[]> {
    const clauses = [eq(t.companyId, companyId), isNull(t.deletedAt)];
    if (filter.side) clauses.push(eq(t.side, filter.side));
    if (filter.ownerCustomerId) clauses.push(eq(t.ownerCustomerId, filter.ownerCustomerId));
    if (filter.scope) clauses.push(eq(t.scope, filter.scope));
    return db.select().from(t).where(and(...clauses)).orderBy(asc(t.side), asc(t.scope), asc(t.name));
  }

  async find(companyId: string, id: string): Promise<TruckingTariffRecord | null> {
    const [row] = await db.select().from(t).where(and(eq(t.companyId, companyId), eq(t.id, id), isNull(t.deletedAt)));
    return row ?? null;
  }

  /** Null when a live tariff of the same side, scope and owner exists. */
  async createTariff(companyId: string, values: Omit<NewTruckingTariffRecord, "companyId">, event: TruckingEventInput): Promise<TruckingTariffRecord | null> {
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx.insert(t).values({ ...values, companyId }).returning();
        await appendEvent(tx, companyId, { ...event, payload: { ...event.payload, tariffId: row.id } });
        return row;
      });
    } catch (e) {
      if (isUniqueViolation(e)) return null;
      throw e;
    }
  }

  async updateTariff(
    companyId: string,
    id: string,
    values: Partial<Pick<TruckingTariffRecord, "name" | "zoneBy" | "discountPercent">>,
    event: TruckingEventInput,
  ): Promise<TruckingTariffRecord | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(t)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(t.companyId, companyId), eq(t.id, id), isNull(t.deletedAt)))
        .returning();
      if (!row) return null;
      await appendEvent(tx, companyId, event);
      return row;
    });
  }

  /** Live versions of the tariffs, newest first, without input and findings. */
  async versionSummaries(companyId: string, tariffIds: string[]): Promise<VersionSummaryRecord[]> {
    if (!tariffIds.length) return [];
    return db
      .select(summaryColumns)
      .from(v)
      .where(and(eq(v.companyId, companyId), inArray(v.tariffId, tariffIds), isNull(v.deletedAt)))
      .orderBy(desc(v.versionNo));
  }

  async findVersion(companyId: string, id: string): Promise<TruckingTariffVersionRecord | null> {
    const [row] = await db.select().from(v).where(and(eq(v.companyId, companyId), eq(v.id, id), isNull(v.deletedAt)));
    return row ?? null;
  }

  /** The versions of the tariffs that bind on `day` (at most one per tariff), with their input. */
  async bindingOn(companyId: string, tariffIds: string[], day: string): Promise<TruckingTariffVersionRecord[]> {
    if (!tariffIds.length) return [];
    return db
      .select()
      .from(v)
      .where(and(eq(v.companyId, companyId), inArray(v.tariffId, tariffIds), binding, lte(v.validFrom, day), or(isNull(v.validTo), gte(v.validTo, day))));
  }

  // A new draft numbered after the tariff's last version. The tariff row is locked so two drafts
  // created at once get different numbers (the unique index is the backstop).
  async createVersion(companyId: string, tariffId: string, values: NewVersionValues, event: TruckingEventInput): Promise<TruckingTariffVersionRecord | null> {
    return db.transaction(async (tx) => {
      const [tariff] = await tx
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.companyId, companyId), eq(t.id, tariffId), isNull(t.deletedAt)))
        .for("update");
      if (!tariff) return null;
      const [last] = await tx.select({ n: max(v.versionNo) }).from(v).where(eq(v.tariffId, tariffId));
      const [row] = await tx
        .insert(v)
        .values({ ...values, companyId, tariffId, versionNo: (last?.n ?? 0) + 1 })
        .returning();
      await appendEvent(tx, companyId, { ...event, payload: { ...event.payload, tariffId, versionId: row.id } });
      return row;
    });
  }

  // Activates a draft from `validFrom`, in one transaction with the tariff row locked: the binding
  // versions are closed or superseded (lib/tariffRules.ts activationPlan) and the draft gets its
  // validity. The EXCLUDE constraint refuses any overlap
  // that would slip through ("overlap").
  async activate(
    companyId: string,
    versionId: string,
    values: { validFrom: string; validTo: string | null; findings: ValidationFinding[]; warningCount: number; errorCount: number; activatedBy: string },
    event: TruckingEventInput,
  ): Promise<ActivateResult> {
    try {
      return await db.transaction(async (tx): Promise<ActivateResult> => {
        const [found] = await tx.select({ tariffId: v.tariffId }).from(v).where(and(eq(v.companyId, companyId), eq(v.id, versionId), isNull(v.deletedAt)));
        if (!found) return { ok: false, reason: "not_found" };
        await tx.select({ id: t.id }).from(t).where(eq(t.id, found.tariffId)).for("update");
        const [draft] = await tx.select().from(v).where(and(eq(v.id, versionId), isNull(v.deletedAt))).for("update");
        if (!draft) return { ok: false, reason: "not_found" };
        if (draft.activatedAt) return { ok: false, reason: "not_draft" };
        const now = new Date();
        const others = await tx
          .select({ id: v.id, validFrom: v.validFrom, validTo: v.validTo })
          .from(v)
          .where(and(eq(v.tariffId, draft.tariffId), binding))
          .for("update");
        const plan = activationPlan(others, values.validFrom);
        for (const c of plan.close) await tx.update(v).set({ validTo: c.validTo, updatedAt: now }).where(eq(v.id, c.id));
        if (plan.supersede.length) await tx.update(v).set({ supersededAt: now, updatedAt: now }).where(inArray(v.id, plan.supersede));
        const [row] = await tx
          .update(v)
          .set({
            validFrom: values.validFrom,
            validTo: values.validTo,
            findings: values.findings,
            warningCount: values.warningCount,
            errorCount: values.errorCount,
            activatedAt: now,
            activatedBy: values.activatedBy,
            updatedAt: now,
          })
          .where(eq(v.id, versionId))
          .returning();
        await appendEvent(tx, companyId, { ...event, payload: { ...event.payload, tariffId: draft.tariffId, versionId } });
        return { ok: true, version: row };
      });
    } catch (e) {
      if (isExclusionViolation(e)) return { ok: false, reason: "overlap" };
      throw e;
    }
  }

  /** Soft-deletes a draft; null when it is not a live draft (anymore). */
  async discard(companyId: string, versionId: string, event: TruckingEventInput): Promise<TruckingTariffVersionRecord | null> {
    return db.transaction(async (tx) => {
      const now = new Date();
      const [row] = await tx
        .update(v)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(v.companyId, companyId), eq(v.id, versionId), isNull(v.deletedAt), isNull(v.activatedAt)))
        .returning();
      if (!row) return null;
      await appendEvent(tx, companyId, { ...event, payload: { ...event.payload, tariffId: row.tariffId, versionId } });
      return row;
    });
  }
}

export const tariffRepository = new TariffRepository();
