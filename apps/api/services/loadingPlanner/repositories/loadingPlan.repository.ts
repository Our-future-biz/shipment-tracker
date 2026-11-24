import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
import { plainSalesReferenceSql } from "../../../lib/db/salesReferenceSql";
import { plainSalesReference } from "../../../lib/salesReference";
import { db } from "../db/db";
import type { PlanLinkKind, PlanResult } from "../interfaces/interfaces";
import { loadingPlanTable as t, type LoadingPlanRecord, type NewLoadingPlanRecord } from "../schemas/loadingPlan.schema";

/** As many plans as the list shows at once. */
export const LIST_LIMIT = 500;

// The colli and the weight of a plan's cargo, added up in the database from its lines: the list
// then reads a row's head and two numbers, not every plan's whole cargo.
const colliSum = sql<number>`(SELECT coalesce(sum((l ->> 'colli')::numeric), 0) FROM jsonb_array_elements(${t.lines}) AS l)`.mapWith(Number);
const weightSum = sql<number>`(SELECT coalesce(sum((l ->> 'colli')::numeric * (l ->> 'weightKg')::numeric), 0) FROM jsonb_array_elements(${t.lines}) AS l)`.mapWith(Number);

const listColumns = {
  id: t.id,
  name: t.name,
  linkKind: t.linkKind,
  linkId: t.linkId,
  linkRef: t.linkRef,
  colli: colliSum,
  weightKg: weightSum,
  result: t.result,
  createdBy: t.createdBy,
  updatedBy: t.updatedBy,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
};

/** A plan as the list reads it. */
export interface LoadingPlanListRow {
  id: string;
  name: string;
  linkKind: PlanLinkKind | null;
  linkId: string | null;
  linkRef: string;
  colli: number;
  weightKg: number;
  result: PlanResult | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** What a save writes of a plan. */
export type PlanWrite = Pick<NewLoadingPlanRecord, "name" | "linkKind" | "linkId" | "linkRef" | "lines" | "nominated" | "result" | "updatedBy">;

// A save's time is always later than the one before it, whatever the two clocks say: it is the
// plan's version (updateIfUnchanged).
const laterThanStored = sql`greatest(now(), ${t.updatedAt} + interval '1 millisecond')`;

class LoadingPlanRepository extends TenantRepository<typeof t> {
  constructor() {
    super(db, t, "loading_plan");
  }

  /**
   * The company's plans, last saved first; with a link, only the plans of that shipment or quote.
   * At most `limit` of them; `capped` says there are more.
   */
  async listLatest(companyId: string, link?: { kind: PlanLinkKind; id: string }, limit = LIST_LIMIT): Promise<{ rows: LoadingPlanListRow[]; capped: boolean }> {
    const rows = await this.db
      .select(listColumns)
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt), link ? and(eq(t.linkKind, link.kind), eq(t.linkId, link.id)) : undefined))
      .orderBy(desc(t.updatedAt))
      .limit(limit + 1);
    return { rows: rows.slice(0, limit), capped: rows.length > limit };
  }

  /**
   * Saves a plan again, but only while it is still the version the editor started from: nobody
   * saved it after `basedOn` (the `updatedAt` the editor was given, which has milliseconds; the
   * stored time is compared to the millisecond). One statement, so two saves at the same moment
   * cannot both pass. Null when the plan is gone or was saved meanwhile.
   */
  async updateIfUnchanged(id: string, companyId: string, basedOn: Date, data: PlanWrite): Promise<LoadingPlanRecord | null> {
    const [row] = await this.db
      .update(t)
      .set({ ...data, updatedAt: laterThanStored })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), isNull(t.deletedAt), sql`date_trunc('milliseconds', ${t.updatedAt}) <= ${basedOn.toISOString()}::timestamptz`))
      .returning();
    return row ?? null;
  }

  /**
   * Writes what the plan's linked job is called now, while the plan is still linked to it. Not a
   * save: the plan's version (updatedAt) and who saved it last stay, so nobody editing the plan is
   * told it was changed.
   */
  async setLinkRef(id: string, companyId: string, link: { kind: PlanLinkKind; id: string }, linkRef: string): Promise<void> {
    await this.db
      .update(t)
      .set({ linkRef })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.linkKind, link.kind), eq(t.linkId, link.id), ne(t.linkRef, linkRef)));
  }

  /**
   * A quote was renamed: the company's plans linked to a quote under `from` - found without the
   * letters of its Freight Mode, whatever spelling the copy holds - name it `now`. Only what still
   * differs is written, so an event delivered twice changes nothing the second time. Not a save
   * (see setLinkRef).
   */
  async followQuoteRename(companyId: string, from: string, now: string): Promise<void> {
    await this.db
      .update(t)
      .set({ linkRef: now })
      .where(and(eq(t.companyId, companyId), eq(t.linkKind, "quote"), sql`${plainSalesReferenceSql(t.linkRef)} = ${plainSalesReference(from)}`, ne(t.linkRef, now)));
  }

  /**
   * A quote was revised: the company's live plans linked to it are linked to its revision. This
   * changes what a plan is linked to, so it counts as a save by the user who revised the quote -
   * someone editing such a plan is told to reload it instead of linking it back to the old quote.
   * Returns how many plans moved; none the second time.
   */
  async moveQuote(companyId: string, fromQuoteId: string, to: { id: string; reference: string }, updatedBy: string): Promise<number> {
    const moved = await this.db
      .update(t)
      .set({ linkId: to.id, linkRef: to.reference, updatedAt: laterThanStored, ...(updatedBy ? { updatedBy } : {}) })
      .where(and(eq(t.companyId, companyId), eq(t.linkKind, "quote"), eq(t.linkId, fromQuoteId), isNull(t.deletedAt)))
      .returning({ id: t.id });
    return moved.length;
  }
}

export const loadingPlanRepository = new LoadingPlanRepository();
