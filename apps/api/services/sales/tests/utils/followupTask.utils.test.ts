import { describe, expect, it } from "vitest";
import type { FollowupTaskRecord } from "../../schemas/followupTask.schema";
import { isOverdue, toTaskItem } from "../../utils/followupTask.utils";

const TODAY = "2026-10-12";
const DONE = new Date("2026-10-11T09:00:00.000Z");

const row = (over: Partial<FollowupTaskRecord> = {}): FollowupTaskRecord => ({
  id: "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11",
  companyId: "86f202b1-7449-441b-9c5b-5bf4d89f8d88",
  createdAt: new Date("2026-10-01T08:00:00.123Z"),
  updatedAt: new Date("2026-10-02T09:30:00.456Z"),
  deletedAt: null,
  type: "Call",
  note: "",
  dueDate: null,
  assigneeUserId: null,
  customerId: null,
  customerLabel: "",
  contact: "",
  quoteNumber: null,
  doneAt: null,
  doneBy: null,
  createdBy: null,
  legacyIndex: null,
  ...over,
});

const names = new Map([["user-1", "Martin Koubek"]]);

describe("isOverdue", () => {
  it("is true from the day after the due day - nobody has to set it", () => {
    expect(isOverdue("2026-10-11", null, TODAY)).toBe(true);
    expect(isOverdue("2025-12-31", null, TODAY)).toBe(true);
  });

  it("is not true on the due day itself, nor before it", () => {
    expect(isOverdue("2026-10-12", null, TODAY)).toBe(false);
    expect(isOverdue("2026-10-13", null, TODAY)).toBe(false);
    expect(isOverdue("2027-01-01", null, TODAY)).toBe(false);
  });

  it("is never true for a task without a due day", () => {
    expect(isOverdue(null, null, TODAY)).toBe(false);
  });

  it("is never true for a task that is done, however long ago it was due", () => {
    expect(isOverdue("2026-10-11", DONE, TODAY)).toBe(false);
    expect(isOverdue("2020-01-01", DONE, TODAY)).toBe(false);
  });
});

describe("toTaskItem", () => {
  it("carries the whole item of an open task that is linked to a customer and a quote", () => {
    const task = row({
      type: "Visit",
      note: "Bring the new rates",
      dueDate: "2026-10-20",
      assigneeUserId: "user-1",
      customerId: "946e01e8-a4ed-4aa7-932b-2c5d5e991c30",
      customerLabel: "ITTEC, s.r.o.",
      contact: "Jan Novák",
      quoteNumber: "QCZ20261010001",
      createdBy: "user-1",
    });
    expect(toTaskItem(task, names, TODAY)).toEqual({
      id: "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11",
      type: "Visit",
      note: "Bring the new rates",
      dueDate: "2026-10-20",
      assigneeUserId: "user-1",
      assigneeName: "Martin Koubek",
      customerId: "946e01e8-a4ed-4aa7-932b-2c5d5e991c30",
      customerLabel: "ITTEC, s.r.o.",
      contact: "Jan Novák",
      quoteNumber: "QCZ20261010001",
      done: false,
      doneAt: null,
      overdue: false,
      legacyIndex: null,
      createdAt: "2026-10-01T08:00:00.123Z",
      updatedAt: "2026-10-02T09:30:00.456Z",
    });
  });

  it("says a task is done, and when, from its stamp", () => {
    expect(toTaskItem(row({ doneAt: DONE, doneBy: "user-1", dueDate: "2026-10-01" }), names, TODAY)).toMatchObject({
      done: true,
      doneAt: "2026-10-11T09:00:00.000Z",
      overdue: false,
    });
  });

  it("works out overdue on the day the task is read", () => {
    const task = row({ dueDate: "2026-10-12" });
    expect(toTaskItem(task, names, "2026-10-12").overdue).toBe(false);
    expect(toTaskItem(task, names, "2026-10-13").overdue).toBe(true);
  });

  it("names nobody for a task without an assignee, or with one that cannot be resolved", () => {
    expect(toTaskItem(row(), names, TODAY)).toMatchObject({ assigneeUserId: null, assigneeName: "" });
    expect(toTaskItem(row({ assigneeUserId: "user-gone" }), names, TODAY)).toMatchObject({ assigneeUserId: "user-gone", assigneeName: "" });
    expect(toTaskItem(row({ assigneeUserId: "user-1" }), new Map(), TODAY).assigneeName).toBe("");
  });

  it("keeps the position a copied task had in the old list", () => {
    expect(toTaskItem(row({ legacyIndex: 0 }), names, TODAY).legacyIndex).toBe(0);
    expect(toTaskItem(row({ legacyIndex: 14 }), names, TODAY).legacyIndex).toBe(14);
  });
});
