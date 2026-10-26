import type { FollowupTaskItem } from "../interfaces/interfaces";
import type { FollowupTaskRecord } from "../schemas/followupTask.schema";

/** What a follow-up task can be. */
/** What kind of contact a follow-up task is. Spelled out: Encore's parser takes no indexed access type. */
export type TaskType = "Call" | "Email" | "Visit";

export const TASK_TYPES: readonly TaskType[] = ["Call", "Email", "Visit"];

export function isTaskType(value: string): value is TaskType {
  return (TASK_TYPES as readonly string[]).includes(value);
}

/**
 * Whether a task is overdue on the business day `today` (YYYY-MM-DD): it has a due day, that day
 * has passed, and the task is not done. A task due today is not overdue yet. Nothing stores this
 * - it follows from the due day - so a task turns overdue by itself and nobody can set it wrong.
 */
export function isOverdue(dueDate: string | null, doneAt: Date | null, today: string): boolean {
  return doneAt === null && dueDate !== null && dueDate < today;
}

/**
 * THE ONE MAPPER from a stored task to what the API hands out. `userEmails` are the e-mails of
 * the company's users by id - a person is shown by e-mail; `today` is the business day the task
 * is read on.
 */
export function toTaskItem(row: FollowupTaskRecord, userEmails: Map<string, string>, today: string): FollowupTaskItem {
  return {
    id: row.id,
    type: row.type,
    note: row.note,
    dueDate: row.dueDate,
    assigneeUserId: row.assigneeUserId,
    assigneeName: (row.assigneeUserId && userEmails.get(row.assigneeUserId)) || "",
    customerId: row.customerId,
    customerLabel: row.customerLabel,
    contact: row.contact,
    quoteNumber: row.quoteNumber,
    done: row.doneAt !== null,
    doneAt: row.doneAt?.toISOString() ?? null,
    overdue: isOverdue(row.dueDate, row.doneAt, today),
    legacyIndex: row.legacyIndex,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
