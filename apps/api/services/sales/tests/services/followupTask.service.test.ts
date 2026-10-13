import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real - with its checks and the mapper - against a stand-in for the
// repository, for the users of the auth service and for the quotes service.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn() } }));
vi.mock("~encore/clients", () => ({ auth: { usersList: vi.fn() }, quotes: { salesQuoteGet: vi.fn() } }));
vi.mock("../../repositories/followupTask.repository", () => ({
  followupTaskRepository: {
    importLegacy: vi.fn(),
    list: vi.fn(),
    getByIdForCompany: vi.fn(),
    createForCompany: vi.fn(),
    updateForCompany: vi.fn(),
    softDeleteForCompany: vi.fn(),
  },
}));

import log from "encore.dev/log";
import { auth, quotes } from "~encore/clients";
import type { Actor } from "../../../../lib/rbac";
import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { followupTaskRepository } from "../../repositories/followupTask.repository";
import type { FollowupTaskRecord } from "../../schemas/followupTask.schema";
import { followupTaskService } from "../../services/followupTask.service";

const repository = vi.mocked(followupTaskRepository);
const usersList = vi.mocked(auth.usersList);
const salesQuoteGet = vi.mocked(quotes.salesQuoteGet);

// 12 October 2026, noon in Prague.
const NOW = new Date("2026-10-12T10:00:00.000Z");
const ID = "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11";
const CUSTOMER = "946e01e8-a4ed-4aa7-932b-2c5d5e991c30";
const REF = "QCZ20261010001";

const U_MARTIN = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";
const U_JANA = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a03";
const U_NOBODY = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6aff";
const user = (id: string, displayName: string, email: string) => ({ id, companyId: "", email, displayName, role: "user", departmentId: null, branchId: null });
const USERS = [user(U_MARTIN, "Martin Koubek", "martin@forwarder.cz"), user(U_JANA, "", "jana@forwarder.cz")];

// A company of its own for every test: what the service remembers about the import of one must
// not decide what happens in the next.
let martin: Actor;

const task = (over: Partial<FollowupTaskRecord> = {}): FollowupTaskRecord => ({
  id: ID,
  companyId: martin.companyID,
  createdAt: new Date("2026-10-01T08:00:00.000Z"),
  updatedAt: new Date("2026-10-01T08:00:00.000Z"),
  deletedAt: null,
  type: "Call",
  note: "Ask about the tender",
  dueDate: "2026-10-20",
  assigneeUserId: U_MARTIN,
  customerId: null,
  customerLabel: "ACME s.r.o.",
  contact: "",
  quoteNumber: null,
  doneAt: null,
  doneBy: null,
  createdBy: U_MARTIN,
  legacyIndex: null,
  ...over,
});

/** What was handed to the repository to be stored as new tasks, in order. */
const handedOver = () => repository.createForCompany.mock.calls.map(([, data]) => data as Partial<FollowupTaskRecord>);

const invalid = (message: string) => ({ code: "invalid_argument", message });
const NOT_FOUND = { code: "not_found", message: "Task not found" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  martin = { userID: U_MARTIN, companyID: randomUUID(), role: "user" };
  usersList.mockResolvedValue({ users: USERS });
  salesQuoteGet.mockResolvedValue({ quote: { quoteNumber: REF } } as Awaited<ReturnType<typeof quotes.salesQuoteGet>>);
  repository.importLegacy.mockResolvedValue(0);
  repository.list.mockResolvedValue({ rows: [], total: 0 });
  // What is written is what comes back.
  repository.createForCompany.mockImplementation(async (companyId, data) => ({ ...task(), ...data, companyId }) as FollowupTaskRecord);
  repository.updateForCompany.mockImplementation(async (id, companyId, data) => {
    const stored = await followupTaskRepository.getByIdForCompany(id, companyId);
    return stored && ({ ...stored, ...data } as FollowupTaskRecord);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the copy of the old task list", () => {
  it("is made before the first read of a company's tasks, and once", async () => {
    const order: string[] = [];
    repository.importLegacy.mockImplementation(async () => (order.push("import"), 3));
    repository.list.mockImplementation(async () => (order.push("list"), { rows: [], total: 0 }));
    await followupTaskService.list(martin, {});
    await followupTaskService.list(martin, {});
    expect(order).toEqual(["import", "list", "list"]);
    expect(repository.importLegacy).toHaveBeenCalledWith(martin.companyID);
    expect(log.info).toHaveBeenCalledWith(expect.any(String), { companyId: martin.companyID, tasks: 3 });
  });

  it("is made before the first write as well, whichever comes first: create, change or delete", async () => {
    for (const write of [
      () => followupTaskService.create(martin, { type: "Call" }),
      () => followupTaskService.update(ID, martin, { note: "x" }),
      () => followupTaskService.softDelete(ID, martin),
    ]) {
      martin = { ...martin, companyID: randomUUID() };
      repository.importLegacy.mockClear();
      repository.getByIdForCompany.mockResolvedValue(task());
      repository.softDeleteForCompany.mockResolvedValue(task());
      await write();
      expect(repository.importLegacy).toHaveBeenCalledTimes(1);
      expect(repository.importLegacy).toHaveBeenCalledWith(martin.companyID);
    }
  });

  it("is made for each company on its own", async () => {
    const other: Actor = { ...martin, companyID: randomUUID() };
    await followupTaskService.list(martin, {});
    await followupTaskService.list(other, {});
    await followupTaskService.list(martin, {});
    expect(repository.importLegacy.mock.calls).toEqual([[martin.companyID], [other.companyID]]);
  });

  it("is made even when the request is then refused: the old list is frozen from the first request on", async () => {
    await expect(followupTaskService.list(martin, { assignee: "everybody" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.importLegacy).toHaveBeenCalledTimes(1);
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("is not remembered as done when it failed: the request fails and the next one tries again", async () => {
    repository.importLegacy.mockRejectedValueOnce(new Error("the database is unreachable"));
    await expect(followupTaskService.list(martin, {})).rejects.toThrow("the database is unreachable");
    expect(repository.list).not.toHaveBeenCalled();
    await followupTaskService.list(martin, {});
    expect(repository.importLegacy).toHaveBeenCalledTimes(2);
    expect(repository.list).toHaveBeenCalledTimes(1);
  });

  it("says nothing in the log when there was nothing to copy", async () => {
    await followupTaskService.list(martin, {});
    expect(log.info).not.toHaveBeenCalled();
  });
});

describe("list", () => {
  it("lists everybody's open tasks, 50 at a time, when nothing else is asked", async () => {
    await followupTaskService.list(martin, {});
    expect(repository.list).toHaveBeenCalledWith(martin.companyID, { assigneeUserId: undefined, done: false }, { limit: 50, offset: 0, afterId: undefined });
  });

  it("hands out the tasks with the assignee's name, today's overdue flag and the real total", async () => {
    repository.list.mockResolvedValue({
      rows: [task({ dueDate: "2026-10-11" }), task({ id: randomUUID(), assigneeUserId: U_JANA, dueDate: "2026-10-12" }), task({ id: randomUUID(), assigneeUserId: null, dueDate: null })],
      total: 63,
    });
    const result = await followupTaskService.list(martin, { limit: 3, offset: 6 });
    expect(result.pagination).toEqual({ total: 63, offset: 6, limit: 3 });
    expect(result.data.map((t) => [t.assigneeName, t.overdue])).toEqual([
      // Due yesterday: overdue without anyone having set it.
      ["Martin Koubek", true],
      // Due today; a user without a display name goes by the e-mail.
      ["jana@forwarder.cz", false],
      ["", false],
    ]);
    // One read of the users for the whole page.
    expect(usersList).toHaveBeenCalledTimes(1);
  });

  it("counts the day by Prague: half past midnight there is already the next day", async () => {
    repository.list.mockResolvedValue({ rows: [task({ dueDate: "2026-10-12" })], total: 1 });
    vi.setSystemTime(new Date("2026-10-12T21:59:00.000Z"));
    expect((await followupTaskService.list(martin, {})).data[0]!.overdue).toBe(false);
    vi.setSystemTime(new Date("2026-10-12T22:30:00.000Z"));
    expect((await followupTaskService.list(martin, {})).data[0]!.overdue).toBe(true);
  });

  it("still lists when the users cannot be read: the tasks come without names", async () => {
    usersList.mockRejectedValue(new Error("auth is unreachable"));
    repository.list.mockResolvedValue({ rows: [task()], total: 1 });
    const result = await followupTaskService.list(martin, {});
    expect(result.data[0]).toMatchObject({ assigneeUserId: U_MARTIN, assigneeName: "" });
  });

  it('narrows by assignee: "me" is whoever asks, "none" nobody, an id that user, "all" and nothing everybody', async () => {
    const asked = async (assignee?: string) => {
      repository.list.mockClear();
      await followupTaskService.list(martin, { assignee });
      return repository.list.mock.calls[0]![1].assigneeUserId;
    };
    expect(await asked("me")).toBe(U_MARTIN);
    expect(await asked("none")).toBeNull();
    expect(await asked(U_JANA)).toBe(U_JANA);
    expect(await asked("all")).toBeUndefined();
    expect(await asked("")).toBeUndefined();
    expect(await asked(undefined)).toBeUndefined();
  });

  it("refuses an assignee that is none of these before anything is read", async () => {
    await expect(followupTaskService.list(martin, { assignee: "Martin" })).rejects.toMatchObject(
      invalid('assignee must be "me", "all", "none" or the id of a user'),
    );
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("narrows by state: open, done, or both", async () => {
    const asked = async (state?: "open" | "done" | "all") => {
      repository.list.mockClear();
      await followupTaskService.list(martin, { state });
      return repository.list.mock.calls[0]![1].done;
    };
    expect(await asked("open")).toBe(false);
    expect(await asked("done")).toBe(true);
    expect(await asked("all")).toBeUndefined();
    expect(await asked(undefined)).toBe(false);
  });

  it("keeps the page within its bounds and reports the limit it used", async () => {
    const paged = async (limit?: number, offset?: number) => (await followupTaskService.list(martin, { limit, offset })).pagination;
    expect(await paged(1000, 5)).toMatchObject({ limit: 200, offset: 5 });
    expect(await paged(0, -3)).toMatchObject({ limit: 1, offset: 0 });
    expect(await paged(2.9, 1.9)).toMatchObject({ limit: 2, offset: 1 });
    expect(await paged(undefined, undefined)).toMatchObject({ limit: 50, offset: 0 });
  });

  it("with afterId asks for the rows after that id and ignores the offset: the way to load everything", async () => {
    const nil = "00000000-0000-0000-0000-000000000000";
    const result = await followupTaskService.list(martin, { afterId: nil, limit: 200, offset: 40 });
    expect(repository.list).toHaveBeenCalledWith(martin.companyID, expect.anything(), { limit: 200, offset: 0, afterId: nil });
    expect(result.pagination).toMatchObject({ limit: 200, offset: 0 });
  });

  it("refuses an afterId that is no id before anything is read", async () => {
    await expect(followupTaskService.list(martin, { afterId: "last" })).rejects.toMatchObject(invalid("afterId must be the id of a task"));
    expect(repository.list).not.toHaveBeenCalled();
  });
});

describe("create", () => {
  it("creates a task of whoever creates it, with what was sent and nothing else", async () => {
    const created = await followupTaskService.create(martin, { type: "Email" });
    expect(repository.createForCompany).toHaveBeenCalledWith(martin.companyID, {
      type: "Email",
      assigneeUserId: U_MARTIN,
      quoteNumber: null,
      createdBy: U_MARTIN,
    });
    expect(created).toMatchObject({ type: "Email", assigneeUserId: U_MARTIN, assigneeName: "Martin Koubek", done: false });
    expect(salesQuoteGet).not.toHaveBeenCalled();
  });

  it("stores every field of a full request, texts trimmed", async () => {
    await followupTaskService.create(martin, {
      type: "Visit",
      note: "  Bring the new rates \n",
      dueDate: "2026-10-20",
      assigneeUserId: U_JANA,
      customerId: CUSTOMER,
      customerLabel: " ITTEC, s.r.o. ",
      contact: " Jan Novák ",
      quoteNumber: ` ${REF} `,
    });
    expect(repository.createForCompany).toHaveBeenCalledWith(martin.companyID, {
      type: "Visit",
      note: "Bring the new rates",
      dueDate: "2026-10-20",
      assigneeUserId: U_JANA,
      customerId: CUSTOMER,
      customerLabel: "ITTEC, s.r.o.",
      contact: "Jan Novák",
      quoteNumber: REF,
      createdBy: U_MARTIN,
    });
    expect(salesQuoteGet).toHaveBeenCalledWith({ quoteNumber: REF });
  });

  it("assigns the task to nobody when the request says so", async () => {
    const created = await followupTaskService.create(martin, { type: "Call", assigneeUserId: null });
    expect(handedOver()[0]).toMatchObject({ assigneeUserId: null });
    expect(created).toMatchObject({ assigneeUserId: null, assigneeName: "" });
  });

  it("refuses a type it does not know", async () => {
    await expect(followupTaskService.create(martin, { type: "Fax" })).rejects.toMatchObject(invalid("type must be Call, Email or Visit"));
    await expect(followupTaskService.create(martin, { type: "call" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.createForCompany).not.toHaveBeenCalled();
  });

  it("refuses a due date that is not a real day", async () => {
    for (const dueDate of ["31.12.", "Friday", "2026-02-31", "2026-13-01", "2026-10-20T10:00:00Z", "0000-01-01", ""]) {
      await expect(followupTaskService.create(martin, { type: "Call", dueDate }), dueDate).rejects.toMatchObject(
        invalid("dueDate must be a real date (YYYY-MM-DD)"),
      );
    }
    expect(repository.createForCompany).not.toHaveBeenCalled();
    // null is "no due day", and a leap day is a day.
    await followupTaskService.create(martin, { type: "Call", dueDate: null });
    await followupTaskService.create(martin, { type: "Call", dueDate: "2028-02-29" });
    expect(handedOver().map((data) => data.dueDate)).toEqual([null, "2028-02-29"]);
  });

  it("refuses an assignee from nowhere", async () => {
    // Also a text that is no id at all: it never reaches the uuid column.
    for (const assigneeUserId of [U_NOBODY, "Jana", ""]) {
      await expect(followupTaskService.create(martin, { type: "Call", assigneeUserId }), assigneeUserId).rejects.toMatchObject(
        invalid("the assignee is not a user of this company"),
      );
    }
    expect(repository.createForCompany).not.toHaveBeenCalled();
  });

  it("does not assign anybody while the users cannot be read - but a task that names nobody is still created", async () => {
    usersList.mockRejectedValue(new Error("auth is unreachable"));
    await expect(followupTaskService.create(martin, { type: "Call", assigneeUserId: U_JANA })).rejects.toThrow("auth is unreachable");
    expect(repository.createForCompany).not.toHaveBeenCalled();
    await expect(followupTaskService.create(martin, { type: "Call" })).resolves.toMatchObject({ assigneeUserId: U_MARTIN, assigneeName: "" });
  });

  it("refuses a customer id that is no id", async () => {
    await expect(followupTaskService.create(martin, { type: "Call", customerId: "ITTEC" })).rejects.toMatchObject(invalid("customerId must be the id of a customer"));
    expect(repository.createForCompany).not.toHaveBeenCalled();
    await followupTaskService.create(martin, { type: "Call", customerId: null, customerLabel: "Typed Co" });
    expect(handedOver()[0]).toMatchObject({ customerId: null, customerLabel: "Typed Co" });
  });

  it("refuses a quote the quotes service does not know, and passes on anything else that goes wrong there", async () => {
    salesQuoteGet.mockRejectedValueOnce(APIError.notFound("Quote not found"));
    await expect(followupTaskService.create(martin, { type: "Call", quoteNumber: "QCZ20260101999" })).rejects.toMatchObject(invalid("quote QCZ20260101999 not found"));
    salesQuoteGet.mockRejectedValueOnce(new Error("quotes is unreachable"));
    await expect(followupTaskService.create(martin, { type: "Call", quoteNumber: REF })).rejects.toThrow("quotes is unreachable");
    expect(repository.createForCompany).not.toHaveBeenCalled();
  });

  it("takes a blank quote reference for none", async () => {
    await followupTaskService.create(martin, { type: "Call", quoteNumber: "   " });
    await followupTaskService.create(martin, { type: "Call", quoteNumber: null });
    expect(handedOver().map((data) => data.quoteNumber)).toEqual([null, null]);
    expect(salesQuoteGet).not.toHaveBeenCalled();
  });
});

describe("update", () => {
  beforeEach(() => {
    repository.getByIdForCompany.mockResolvedValue(task());
  });

  it("writes the fields that were sent to the one task, under the caller's company", async () => {
    const changed = await followupTaskService.update(ID, martin, { note: " Call again on Friday ", dueDate: "2026-10-23" });
    expect(repository.getByIdForCompany).toHaveBeenCalledWith(ID, martin.companyID);
    expect(repository.updateForCompany).toHaveBeenCalledTimes(1);
    expect(repository.updateForCompany).toHaveBeenCalledWith(ID, martin.companyID, { note: "Call again on Friday", dueDate: "2026-10-23" });
    expect(changed).toMatchObject({ id: ID, note: "Call again on Friday", dueDate: "2026-10-23", assigneeName: "Martin Koubek" });
  });

  it("answers not found for a task that does not exist, is deleted or belongs to another company - and for an id that is no id", async () => {
    repository.getByIdForCompany.mockResolvedValue(null);
    await expect(followupTaskService.update(ID, martin, { note: "x" })).rejects.toMatchObject(NOT_FOUND);
    repository.getByIdForCompany.mockClear();
    await expect(followupTaskService.update("task-7", martin, { note: "x" })).rejects.toMatchObject(NOT_FOUND);
    // Never reaches SQL, where it would be an error of Postgres.
    expect(repository.getByIdForCompany).not.toHaveBeenCalled();
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("answers not found when the task is deleted in the very moment of the change", async () => {
    repository.getByIdForCompany.mockResolvedValueOnce(task()).mockResolvedValue(null);
    await expect(followupTaskService.update(ID, martin, { note: "x" })).rejects.toMatchObject(NOT_FOUND);
  });

  it("ticks a task off: who did it and when", async () => {
    const jana: Actor = { ...martin, userID: U_JANA };
    const changed = await followupTaskService.update(ID, jana, { done: true });
    expect(repository.updateForCompany).toHaveBeenCalledWith(ID, martin.companyID, { doneAt: NOW, doneBy: U_JANA });
    expect(changed).toMatchObject({ done: true, doneAt: NOW.toISOString(), overdue: false });
  });

  it("keeps the first stamp of a task that is ticked again", async () => {
    const done = task({ doneAt: new Date("2026-10-05T09:00:00.000Z"), doneBy: U_JANA });
    repository.getByIdForCompany.mockResolvedValue(done);
    await expect(followupTaskService.update(ID, martin, { done: true })).resolves.toMatchObject({ done: true, doneAt: "2026-10-05T09:00:00.000Z" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    // With another field the field is written, the stamp is not.
    await followupTaskService.update(ID, martin, { done: true, note: "done by phone" });
    expect(repository.updateForCompany).toHaveBeenCalledWith(ID, martin.companyID, { note: "done by phone" });
  });

  it("opens a done task again: the stamp is cleared", async () => {
    repository.getByIdForCompany.mockResolvedValue(task({ doneAt: new Date("2026-10-05T09:00:00.000Z"), doneBy: U_JANA, dueDate: "2026-10-01" }));
    const changed = await followupTaskService.update(ID, martin, { done: false });
    expect(repository.updateForCompany).toHaveBeenCalledWith(ID, martin.companyID, { doneAt: null, doneBy: null });
    // Due on the 1st and open again: overdue at once.
    expect(changed).toMatchObject({ done: false, doneAt: null, overdue: true });
  });

  it("writes nothing for a change that changes nothing, and hands out the task as stored", async () => {
    await expect(followupTaskService.update(ID, martin, {})).resolves.toMatchObject({ id: ID, note: "Ask about the tender" });
    await expect(followupTaskService.update(ID, martin, { done: false })).resolves.toMatchObject({ done: false });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("hands the task to another user of the company, or to nobody", async () => {
    await expect(followupTaskService.update(ID, martin, { assigneeUserId: U_JANA })).resolves.toMatchObject({ assigneeUserId: U_JANA, assigneeName: "jana@forwarder.cz" });
    expect(repository.updateForCompany).toHaveBeenLastCalledWith(ID, martin.companyID, { assigneeUserId: U_JANA });
    await expect(followupTaskService.update(ID, martin, { assigneeUserId: null })).resolves.toMatchObject({ assigneeUserId: null, assigneeName: "" });
    expect(repository.updateForCompany).toHaveBeenLastCalledWith(ID, martin.companyID, { assigneeUserId: null });
  });

  it("refuses an assignee from nowhere and writes nothing", async () => {
    await expect(followupTaskService.update(ID, martin, { assigneeUserId: U_NOBODY, note: "x" })).rejects.toMatchObject(
      invalid("the assignee is not a user of this company"),
    );
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("keeps an assignee who is no longer a user through a change of something else", async () => {
    repository.getByIdForCompany.mockResolvedValue(task({ assigneeUserId: U_NOBODY }));
    // The edit dialog sends the whole task back.
    const changed = await followupTaskService.update(ID, martin, { assigneeUserId: U_NOBODY, note: "still to do" });
    expect(repository.updateForCompany).toHaveBeenCalledWith(ID, martin.companyID, { note: "still to do" });
    expect(changed).toMatchObject({ assigneeUserId: U_NOBODY, assigneeName: "" });
  });

  it("looks a quote up only when the request names another one than the task has", async () => {
    repository.getByIdForCompany.mockResolvedValue(task({ quoteNumber: REF }));
    // The same quote - deleted since, for all the service knows: not asked about, not written.
    salesQuoteGet.mockRejectedValue(APIError.notFound("Quote not found"));
    await followupTaskService.update(ID, martin, { quoteNumber: REF, note: "x" });
    expect(salesQuoteGet).not.toHaveBeenCalled();
    expect(repository.updateForCompany).toHaveBeenLastCalledWith(ID, martin.companyID, { note: "x" });
    // Another one is checked.
    await expect(followupTaskService.update(ID, martin, { quoteNumber: `${REF}-2` })).rejects.toMatchObject(invalid(`quote ${REF}-2 not found`));
    salesQuoteGet.mockResolvedValue({ quote: { quoteNumber: `${REF}-2` } } as Awaited<ReturnType<typeof quotes.salesQuoteGet>>);
    await followupTaskService.update(ID, martin, { quoteNumber: `${REF}-2` });
    expect(repository.updateForCompany).toHaveBeenLastCalledWith(ID, martin.companyID, { quoteNumber: `${REF}-2` });
    // None takes the link off, without asking anybody.
    salesQuoteGet.mockClear();
    await followupTaskService.update(ID, martin, { quoteNumber: null });
    expect(repository.updateForCompany).toHaveBeenLastCalledWith(ID, martin.companyID, { quoteNumber: null });
    expect(salesQuoteGet).not.toHaveBeenCalled();
  });

  it("checks a change like a new task: type, due date, customer id", async () => {
    await expect(followupTaskService.update(ID, martin, { type: "Fax" })).rejects.toMatchObject(invalid("type must be Call, Email or Visit"));
    await expect(followupTaskService.update(ID, martin, { dueDate: "31.12." })).rejects.toMatchObject(invalid("dueDate must be a real date (YYYY-MM-DD)"));
    await expect(followupTaskService.update(ID, martin, { customerId: "x", customerLabel: "ITTEC, s.r.o." })).rejects.toMatchObject(
      invalid("customerId must be the id of a customer"),
    );
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    await followupTaskService.update(ID, martin, { type: "Visit", dueDate: null, customerId: CUSTOMER, customerLabel: " ITTEC, s.r.o. ", contact: "" });
    expect(repository.updateForCompany).toHaveBeenCalledWith(ID, martin.companyID, {
      type: "Visit",
      dueDate: null,
      customerId: CUSTOMER,
      customerLabel: "ITTEC, s.r.o.",
      contact: "",
    });
  });

  it("changes the link to a customer and its name only together: one without the other is refused and writes nothing", async () => {
    // Linked by a colleague since the screen that sends the change read the task.
    repository.getByIdForCompany.mockResolvedValue(task({ customerId: CUSTOMER, customerLabel: "ITTEC, s.r.o." }));
    const together = invalid("customerId and customerLabel are changed together");
    // A name alone would stay above the link to another company; a blank one would leave a link without a name.
    await expect(followupTaskService.update(ID, martin, { customerLabel: "Rako s.r.o." })).rejects.toMatchObject(together);
    await expect(followupTaskService.update(ID, martin, { customerLabel: "", note: "x" })).rejects.toMatchObject(together);
    // A link alone would stand under the name that was there.
    await expect(followupTaskService.update(ID, martin, { customerId: CUSTOMER })).rejects.toMatchObject(together);
    await expect(followupTaskService.update(ID, martin, { customerId: null })).rejects.toMatchObject(together);
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    // Together they replace what is stored as one value: here a typed name, linked to nothing.
    await expect(followupTaskService.update(ID, martin, { customerId: null, customerLabel: " Rako s.r.o. " })).resolves.toMatchObject({
      customerId: null,
      customerLabel: "Rako s.r.o.",
    });
    expect(repository.updateForCompany).toHaveBeenLastCalledWith(ID, martin.companyID, { customerId: null, customerLabel: "Rako s.r.o." });
    // A change of something else names neither and leaves both as they are.
    await followupTaskService.update(ID, martin, { note: "x" });
    expect(repository.updateForCompany).toHaveBeenLastCalledWith(ID, martin.companyID, { note: "x" });
  });
});

describe("softDelete", () => {
  it("deletes the one task of the caller's company", async () => {
    repository.softDeleteForCompany.mockResolvedValue(task());
    await followupTaskService.softDelete(ID, martin);
    expect(repository.softDeleteForCompany).toHaveBeenCalledWith(ID, martin.companyID);
  });

  it("answers not found for a task that is not there - deleted already, another company's - and for an id that is no id", async () => {
    repository.softDeleteForCompany.mockResolvedValue(null);
    await expect(followupTaskService.softDelete(ID, martin)).rejects.toMatchObject(NOT_FOUND);
    repository.softDeleteForCompany.mockClear();
    await expect(followupTaskService.softDelete("7", martin)).rejects.toMatchObject(NOT_FOUND);
    expect(repository.softDeleteForCompany).not.toHaveBeenCalled();
  });
});
