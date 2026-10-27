import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";
import { customers, quotes } from "~encore/clients";
import { businessDay, isRealYmd } from "../../../lib/businessDate";
import type { PaginatedResponse } from "../../../lib/db/interface";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import type { FollowupTaskItem } from "../interfaces/interfaces";
import { followupTaskRepository, type FollowupTaskFilter, type FollowupTaskPage } from "../repositories/followupTask.repository";
import type { FollowupTaskRecord, NewFollowupTaskRecord } from "../schemas/followupTask.schema";
import { isTaskType, toTaskItem } from "../utils/followupTask.utils";
import { companyUsers } from "../../../lib/companyUsers";

/** What a request says about a task. A field that is left out takes its default in a new task and stays as it is in a change. */
export interface FollowupTaskFields {
  /** Call, Email or Visit. */
  type?: string;
  note?: string;
  /** YYYY-MM-DD; null = no due day. */
  dueDate?: string | null;
  /** A user of the company; null = nobody. */
  assigneeUserId?: string | null;
  customerId?: string | null;
  /** The customer's name. With a customerId the server stores the name the Customer Database has. */
  customerLabel?: string;
  contact?: string;
  /** The reference of a sales quote; null = none. */
  quoteNumber?: string | null;
}

/** A list of tasks as the API takes it: whose, in which state, and which part. */
export interface FollowupTaskListRequest {
  /** "me", "none" (assigned to nobody), the id of a user, or "all" - which is also what leaving it out means. */
  assignee?: string;
  /** open when left out. */
  state?: "open" | "done" | "all";
  limit?: number;
  offset?: number;
  /** The id of the last task already loaded (the nil id to begin with): the next rows in the order of their ids. The offset then does not apply. */
  afterId?: string;
}

// The columns a request can write.
type TaskValues = Partial<
  Pick<NewFollowupTaskRecord, "type" | "note" | "dueDate" | "assigneeUserId" | "customerId" | "customerLabel" | "contact" | "quoteNumber" | "doneAt" | "doneBy">
>;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const notFound = () => APIError.notFound("Task not found");

// The e-mails of the company's users by id. Users that cannot be read must not fail a list: the
// failure is logged and nobody is named.
async function userEmails(): Promise<Map<string, string>> {
  try {
    return new Map((await companyUsers()).map((u) => [u.id, u.email]));
  } catch (err) {
    log.warn(err, "users could not be loaded");
    return new Map();
  }
}

// The filter a request asks for. "me" is whoever asks.
function filterOf(actor: Actor, request: FollowupTaskListRequest): FollowupTaskFilter {
  const assignee = request.assignee || "all";
  let assigneeUserId: string | null | undefined;
  if (assignee === "me") assigneeUserId = actor.userID;
  else if (assignee === "none") assigneeUserId = null;
  else if (assignee !== "all") {
    // Postgres would answer a text that is no id with an error of its own.
    if (!isUuid(assignee)) throw APIError.invalidArgument('assignee must be "me", "all", "none" or the id of a user');
    assigneeUserId = assignee;
  }
  const state = request.state ?? "open";
  return { assigneeUserId, done: state === "all" ? undefined : state === "done" };
}

// The part of the list a request asks for.
function pageOf(request: FollowupTaskListRequest): FollowupTaskPage {
  if (request.afterId && !isUuid(request.afterId)) throw APIError.invalidArgument("afterId must be the id of a task");
  const afterId = request.afterId || undefined;
  return {
    limit: Math.min(Math.max(Math.trunc(request.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT),
    // Rows after an id are not counted from anywhere.
    offset: afterId ? 0 : Math.max(Math.trunc(request.offset ?? 0), 0),
    afterId,
  };
}

// The fields of a request that are checked by themselves, as the columns take them. Whatever
// reaches SQL as a day or an id is checked here first: Postgres would answer a text that is
// neither with an error of its own.
function plainValues(fields: FollowupTaskFields): TaskValues {
  const values: TaskValues = {};
  if (fields.type !== undefined) {
    if (!isTaskType(fields.type)) throw APIError.invalidArgument("type must be Call, Email or Visit");
    values.type = fields.type;
  }
  if (fields.note !== undefined) values.note = fields.note.trim();
  if (fields.dueDate !== undefined) {
    // Postgres has no year 0.
    if (fields.dueDate !== null && (!isRealYmd(fields.dueDate) || fields.dueDate < "0001-01-01")) {
      throw APIError.invalidArgument("dueDate must be a real date (YYYY-MM-DD)");
    }
    values.dueDate = fields.dueDate;
  }
  if (fields.customerId !== undefined) {
    if (fields.customerId !== null && !isUuid(fields.customerId)) throw APIError.invalidArgument("customerId must be the id of a customer");
    values.customerId = fields.customerId;
  }
  if (fields.customerLabel !== undefined) values.customerLabel = fields.customerLabel.trim();
  if (fields.contact !== undefined) values.contact = fields.contact.trim();
  return values;
}

// The manual follow-up tasks of Sales: one row per task, so every change writes the one task it
// is about. Everybody in the company sees and may change all of them, as it was with the shared
// list the tasks used to be.
class FollowupTaskService {
  // The companies whose old task list this process has seen copied into rows.
  private readonly imported = new Set<string>();

  // What every read and write of tasks starts with: the list the company's tasks used to be is
  // copied into rows, once (importLegacy). Only this code makes the copy, and this code no
  // longer accepts a write of that list (preference.service) - so the list is frozen before it
  // is copied, and nothing written to it during a roll-out is left behind. Remembered only after
  // it succeeded: a copy that failed is tried again by the next request.
  private async ensureLegacyImported(companyId: string): Promise<void> {
    if (this.imported.has(companyId)) return;
    const tasks = await followupTaskRepository.importLegacy(companyId);
    if (tasks) log.info("the old list of follow-up tasks was copied into rows", { companyId, tasks });
    this.imported.add(companyId);
  }

  // The e-mails of the company's users, for the assignee a task is handed out with: a person is
  // shown by e-mail. `assignee`, when a request names one, has to be among them - and then the
  // users are read for real: an assignee can only be chosen from users that were. Otherwise
  // users that cannot be read leave the assignee unnamed rather than fail the request.
  private async emailsWith(assignee: string | null | undefined): Promise<Map<string, string>> {
    if (assignee === null || assignee === undefined) return userEmails();
    const users = await companyUsers();
    if (!users.some((u) => u.id === assignee)) throw APIError.invalidArgument("the assignee is not a user of this company");
    return new Map(users.map((u) => [u.id, u.email]));
  }

  // The reference of the sales quote a task is linked to, as that quote is stored. Quotes live
  // in another database, so the quotes service is asked.
  private async quoteReference(quoteNumber: string): Promise<string> {
    try {
      const { quote } = await quotes.salesQuoteGet({ quoteNumber });
      return quote.quoteNumber;
    } catch (err) {
      if (err instanceof APIError && err.code === ErrCode.NotFound) throw APIError.invalidArgument(`quote ${quoteNumber} not found`);
      throw err;
    }
  }

  // The name of a customer record as the Customer Database has it now. A task linked to it stores
  // that, not the name the screen sending the request loaded, which may be older: "everything must
  // be linked" (owner, 26 Oct 2026). Null when the customer is deleted (or not of the company) or
  // the Customer Database cannot be read - logged; the task is written all the same.
  private async customerName(customerId: string): Promise<string | null> {
    try {
      const { customers: found } = await customers._internalCustomerRefs({ customerIds: [customerId] });
      return found.find((c) => c.id === customerId.toLowerCase())?.companyName ?? null;
    } catch (err) {
      log.warn(err, "the Customer Database could not be read for a task's customer");
      return null;
    }
  }

  // A live task of the company. An id that is no id names nothing, like one that is unknown.
  private async stored(companyId: string, id: string): Promise<FollowupTaskRecord> {
    const task = isUuid(id) ? await followupTaskRepository.getByIdForCompany(id, companyId) : null;
    if (!task) throw notFound();
    return task;
  }

  // The tasks of the company: one page - the open ones by due day, the done ones by when they
  // were done - or, with afterId, the next rows by id for a caller that loads everything. The
  // total is the real number of matches.
  async list(actor: Actor, request: FollowupTaskListRequest): Promise<PaginatedResponse<FollowupTaskItem>> {
    await this.ensureLegacyImported(actor.companyID);
    const page = pageOf(request);
    const { rows, total } = await followupTaskRepository.list(actor.companyID, filterOf(actor, request), page);
    const emails = await userEmails();
    const today = businessDay(new Date());
    return {
      pagination: { total, offset: page.offset, limit: page.limit },
      data: rows.map((row) => toTaskItem(row, emails, today)),
    };
  }

  // A new task. Whoever creates it without naming an assignee takes it; null assigns it to nobody.
  async create(actor: Actor, fields: FollowupTaskFields & { type: string }): Promise<FollowupTaskItem> {
    await this.ensureLegacyImported(actor.companyID);
    const values = plainValues(fields);
    if (values.customerId) {
      // Without the Customer Database the name sent stays.
      const name = await this.customerName(values.customerId);
      if (name !== null) values.customerLabel = name;
    }
    const emails = await this.emailsWith(fields.assigneeUserId);
    const asked = fields.quoteNumber?.trim() || null;
    const quoteNumber = asked && (await this.quoteReference(asked));
    const task = await followupTaskRepository.createForCompany(actor.companyID, {
      ...values,
      assigneeUserId: fields.assigneeUserId === undefined ? actor.userID : fields.assigneeUserId,
      quoteNumber,
      createdBy: actor.userID,
    });
    return toTaskItem(task, emails, businessDay(new Date()));
  }

  // A change of one task: the fields that were sent, and `done`, which ticks the task off - with
  // who did it and when - or opens it again. An assignee and a quote are looked up only when the
  // request names another one than the task has: a task keeps a colleague who has left since,
  // or a quote that was deleted since, through a change of something else.
  async update(id: string, actor: Actor, changes: FollowupTaskFields & { done?: boolean }): Promise<FollowupTaskItem> {
    await this.ensureLegacyImported(actor.companyID);
    const stored = await this.stored(actor.companyID, id);
    // The link to a customer and the name it goes by are one value. Written one without the
    // other - by two people changing the customer of the same task, each from the task as their
    // screen last read it - they would leave a link to one company under the name of another.
    if ((changes.customerId === undefined) !== (changes.customerLabel === undefined)) {
      throw APIError.invalidArgument("customerId and customerLabel are changed together");
    }
    const values = plainValues(changes);
    if (values.customerId) {
      const name = await this.customerName(values.customerId);
      if (name !== null) values.customerLabel = name;
      // The same customer as stored: the stored name is the one the Customer Database's events
      // keep current, so an older copy sent back does not replace it.
      else if (values.customerId.toLowerCase() === stored.customerId?.toLowerCase()) values.customerLabel = stored.customerLabel;
    }

    const reassigned = changes.assigneeUserId !== undefined && changes.assigneeUserId !== stored.assigneeUserId;
    const emails = await this.emailsWith(reassigned ? changes.assigneeUserId : null);
    if (reassigned) values.assigneeUserId = changes.assigneeUserId;

    if (changes.quoteNumber !== undefined) {
      const asked = changes.quoteNumber?.trim() || null;
      if (asked !== stored.quoteNumber) values.quoteNumber = asked && (await this.quoteReference(asked));
    }

    // Ticking a task that is done already keeps the first stamp: the Done list is sorted by it.
    if (changes.done !== undefined && changes.done !== (stored.doneAt !== null)) {
      values.doneAt = changes.done ? new Date() : null;
      values.doneBy = changes.done ? actor.userID : null;
    }

    const today = businessDay(new Date());
    if (!Object.keys(values).length) return toTaskItem(stored, emails, today);
    const task = await followupTaskRepository.updateForCompany(id, actor.companyID, values);
    // Deleted in this very moment.
    if (!task) throw notFound();
    return toTaskItem(task, emails, today);
  }

  // Deletes a task: it is gone from the lists, its row is kept.
  async softDelete(id: string, actor: Actor): Promise<void> {
    await this.ensureLegacyImported(actor.companyID);
    const deleted = isUuid(id) ? await followupTaskRepository.softDeleteForCompany(id, actor.companyID) : null;
    if (!deleted) throw notFound();
  }
}

export const followupTaskService = new FollowupTaskService();
