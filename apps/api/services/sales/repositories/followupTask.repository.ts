import { and, asc, count, desc, eq, gt, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { TenantRepository, type AnyDb } from "../../../lib/db/repository";
import { db } from "../db/db";
import { followupTaskTable, type FollowupTaskRecord } from "../schemas/followupTask.schema";

/** Which tasks of the company a list holds. Every part narrows it; none of them = all of them. */
export interface FollowupTaskFilter {
  /** The user the tasks are assigned to; null = the tasks assigned to nobody. */
  assigneeUserId?: string | null;
  /** Only the done tasks (true), or only the open ones (false). */
  done?: boolean;
}

/**
 * Which part of a list. With `afterId` the rows are those with a greater id, in the order of
 * their ids, and the offset does not apply: the way to load everything. A task created or deleted
 * meanwhile can then neither make a page skip a row nor repeat one.
 */
export interface FollowupTaskPage {
  limit: number;
  offset: number;
  afterId?: string;
}

// The order of a page. Open tasks first: the one due soonest on top, those without a due day
// after the dated ones. Then the done tasks, the one done last on top. Tasks that are equal in
// that - the ones copied from the old list were all created, and done, at one moment - follow in
// the order they were created, the copied ones in the order of the old list; the id settles the
// rest, so pages do not overlap.
const IN_ORDER = [
  sql`${followupTaskTable.doneAt} is not null`,
  desc(followupTaskTable.doneAt),
  sql`${followupTaskTable.dueDate} asc nulls last`,
  asc(followupTaskTable.createdAt),
  asc(followupTaskTable.legacyIndex),
  asc(followupTaskTable.id),
];

class FollowupTaskRepository extends TenantRepository<typeof followupTaskTable> {
  constructor() {
    super(db, followupTaskTable, "followup_task");
  }

  /**
   * Copies the tasks the company kept as one list in sales_preference into rows, and returns how
   * many it copied: 0 when there is no list, and 0 for a company that already has copied tasks -
   * the copy is made once (sales_import_followup_tasks, migration 0003). The advisory lock keeps
   * two requests that arrive together from copying side by side; the unique index on a task's
   * position in the old list would keep the second from copying a task again anyway.
   */
  async importLegacy(companyId: string): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`followup-import:${companyId}`}))`);
      const result = await tx.execute<{ imported: number }>(sql`select sales_import_followup_tasks(${companyId}::uuid) as imported`);
      return result.rows[0]?.imported ?? 0;
    });
  }

  /**
   * A part of the company's live tasks that match a filter, and how many match in all. The count
   * is of the filter alone - not of what is left after `afterId` - so it stays the same while a
   * caller walks through the list.
   */
  async list(companyId: string, filter: FollowupTaskFilter, page: FollowupTaskPage): Promise<{ rows: FollowupTaskRecord[]; total: number }> {
    const where = and(
      eq(followupTaskTable.companyId, companyId),
      isNull(followupTaskTable.deletedAt),
      filter.assigneeUserId === undefined
        ? undefined
        : filter.assigneeUserId === null
          ? isNull(followupTaskTable.assigneeUserId)
          : eq(followupTaskTable.assigneeUserId, filter.assigneeUserId),
      filter.done === undefined ? undefined : filter.done ? isNotNull(followupTaskTable.doneAt) : isNull(followupTaskTable.doneAt),
    );
    const rows = page.afterId
      ? this.db
          .select()
          .from(followupTaskTable)
          .where(and(where, gt(followupTaskTable.id, page.afterId)))
          .orderBy(asc(followupTaskTable.id))
          .limit(page.limit)
      : this.db
          .select()
          .from(followupTaskTable)
          .where(where)
          .orderBy(...IN_ORDER)
          .limit(page.limit)
          .offset(page.offset);
    const [found, [{ value: total }]] = await Promise.all([rows, this.db.select({ value: count() }).from(followupTaskTable).where(where)]);
    return { rows: found, total: Number(total) };
  }

  /**
   * A customer change event: the company's live tasks linked to the customer take the name
   * `currentName` reads, in one transaction. Changes of one customer take turns and each reads the
   * name only once it has its turn (the lock lasts until the transaction ends), so one that read an
   * older name never commits after one that read the newer: a late or repeated event leaves the
   * current name. null (or blank) leaves the tasks as they are. Returns how many changed.
   */
  async followCustomer(companyId: string, customerId: string, currentName: () => Promise<string | null>): Promise<number> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`sales-customer:${companyId}:${customerId}`}))`);
      const name = await currentName();
      return name ? this.relabelCustomer(companyId, customerId, name, tx) : 0;
    });
  }

  /**
   * The customer was renamed: the company's live tasks linked to it take its current name, in one
   * statement. updated_at stays - a rename is no change of the task. A blank name changes nothing
   * (a copy is never blanked out). Returns how many changed.
   */
  async relabelCustomer(companyId: string, customerId: string, name: string, writer: Pick<AnyDb, "update"> = this.db): Promise<number> {
    const label = name.trim();
    if (!label) return 0;
    const rows = await writer
      .update(followupTaskTable)
      .set({ customerLabel: label })
      .where(
        and(
          eq(followupTaskTable.companyId, companyId),
          eq(followupTaskTable.customerId, customerId),
          isNull(followupTaskTable.deletedAt),
          ne(followupTaskTable.customerLabel, label),
        ),
      )
      .returning({ id: followupTaskTable.id });
    return rows.length;
  }

  /** The customers the company's live tasks are linked to, by the name each task has, with how many tasks. */
  async customerLinks(companyId: string): Promise<{ customerId: string; customerLabel: string; count: number }[]> {
    const rows = await this.db
      .select({ customerId: followupTaskTable.customerId, customerLabel: followupTaskTable.customerLabel, count: count() })
      .from(followupTaskTable)
      .where(and(eq(followupTaskTable.companyId, companyId), isNull(followupTaskTable.deletedAt), isNotNull(followupTaskTable.customerId)))
      .groupBy(followupTaskTable.customerId, followupTaskTable.customerLabel);
    return rows.flatMap((r) => (r.customerId ? [{ customerId: r.customerId, customerLabel: r.customerLabel, count: Number(r.count) }] : []));
  }
}

export const followupTaskRepository = new FollowupTaskRepository();
