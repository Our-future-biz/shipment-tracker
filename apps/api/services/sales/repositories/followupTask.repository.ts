import { and, asc, count, desc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { TenantRepository } from "../../../lib/db/repository";
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
    super(db as never, followupTaskTable, "followup_task");
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
}

export const followupTaskRepository = new FollowupTaskRepository();
