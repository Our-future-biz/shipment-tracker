import { beforeEach, describe, expect, it, vi } from "vitest";

// The Encore runtime isn't loaded under vitest; the repositories are stand-ins.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
const users = vi.hoisted(() => ({ getByIdInCompany: vi.fn(), listByCompany: vi.fn() }));
vi.mock("../repositories/user.repository", () => ({ userRepository: users }));
const absences = vi.hoisted(() => ({
  listForCompany: vi.fn(),
  getLive: vi.fn(),
  lockedForUser: vi.fn(async (_c: string, _u: string, work: (tx: unknown) => Promise<unknown>) => work("tx")),
  spansOfUser: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
  inForce: vi.fn(),
}));
vi.mock("../repositories/userAbsence.repository", () => ({ userAbsenceRepository: absences }));

import { ABSENCE_NOT_FOUND, ABSENT_NOT_USER, COVER_IS_ABSENT, COVER_NOT_USER, NOT_YOUR_ABSENCE } from "../lib/absenceRules";
import { absenceService } from "../services/absence.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const JAN = "11111111-1111-4111-8111-111111111111";
const EVA = "22222222-2222-4222-8222-222222222222";
const BOSS = "33333333-3333-4333-8333-333333333333";
const ABSENCE = "44444444-4444-4444-8444-444444444444";
const PEOPLE = [
  { id: JAN, email: "jan@firma.cz", displayName: "Jan Novák" },
  { id: EVA, email: "eva@firma.cz", displayName: "" },
  { id: BOSS, email: "boss@firma.cz", displayName: "Boss" },
];
const jan = { userID: JAN, companyID: COMPANY, role: "user" };
const boss = { userID: BOSS, companyID: COMPANY, role: "manager" };
const row = (over = {}) => ({
  id: ABSENCE,
  companyId: COMPANY,
  userId: JAN,
  fromDate: "2026-11-23",
  toDate: "2026-11-27",
  coverUserId: EVA,
  note: "",
  createdBy: JAN,
  updatedBy: JAN,
  createdAt: new Date("2026-11-18T10:00:00Z"),
  updatedAt: new Date("2026-11-18T10:00:00Z"),
  deletedAt: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  users.getByIdInCompany.mockImplementation(async (id: string) => PEOPLE.find((p) => p.id === id) ?? null);
  users.listByCompany.mockResolvedValue(PEOPLE);
  absences.spansOfUser.mockResolvedValue([]);
  absences.create.mockImplementation(async (_tx: unknown, values: Record<string, unknown>) => row(values));
  absences.update.mockImplementation(async (_tx: unknown, _id: string, _c: string, patch: Record<string, unknown>) => row(patch));
  absences.getLive.mockResolvedValue(row());
  absences.softDelete.mockResolvedValue(true);
});

describe("recording an absence", () => {
  it("records the caller's own, with who covers, under the lock of their absences", async () => {
    const item = await absenceService.create(jan, { fromDate: "2026-11-23", toDate: "2026-11-27", coverUserId: EVA, note: " Holiday " });
    expect(absences.lockedForUser).toHaveBeenCalledWith(COMPANY, JAN, expect.any(Function));
    expect(absences.create).toHaveBeenCalledWith("tx", { companyId: COMPANY, userId: JAN, fromDate: "2026-11-23", toDate: "2026-11-27", coverUserId: EVA, note: "Holiday", createdBy: JAN, updatedBy: JAN });
    expect(item).toMatchObject({ userName: "Jan Novák", userEmail: "jan@firma.cz", coverName: "eva@firma.cz", coverEmail: "eva@firma.cz", mayChange: true });
  });

  it("refuses somebody else's to a user, and lets a manager record anybody's", async () => {
    await expect(absenceService.create(jan, { userId: EVA, fromDate: "2026-11-23", toDate: "2026-11-27" })).rejects.toThrow(NOT_YOUR_ABSENCE);
    await expect(absenceService.create(boss, { userId: EVA, fromDate: "2026-11-23", toDate: "2026-11-27" })).resolves.toMatchObject({ userId: EVA });
  });

  it("refuses a person or a cover who is no active user, the absent user as their own cover, and bad days", async () => {
    await expect(absenceService.create(boss, { userId: "55555555-5555-4555-8555-555555555555", fromDate: "2026-11-23", toDate: "2026-11-27" })).rejects.toThrow(ABSENT_NOT_USER);
    await expect(absenceService.create(jan, { fromDate: "2026-11-23", toDate: "2026-11-27", coverUserId: JAN })).rejects.toThrow(COVER_IS_ABSENT);
    await expect(absenceService.create(jan, { fromDate: "2026-11-23", toDate: "2026-11-27", coverUserId: "55555555-5555-4555-8555-555555555555" })).rejects.toThrow(COVER_NOT_USER);
    await expect(absenceService.create(jan, { fromDate: "2026-11-23", toDate: "2026-11-27", coverUserId: "not-an-id" })).rejects.toThrow(COVER_NOT_USER);
    await expect(absenceService.create(jan, { fromDate: "2026-11-27", toDate: "2026-11-23" })).rejects.toThrow("An absence cannot end before it starts");
    expect(absences.create).not.toHaveBeenCalled();
  });

  it("refuses one that shares a day with another absence of the same user", async () => {
    absences.spansOfUser.mockResolvedValue([{ id: "other", fromDate: "2026-11-26", toDate: "2026-11-30" }]);
    await expect(absenceService.create(jan, { fromDate: "2026-11-23", toDate: "2026-11-27" })).rejects.toThrow("Jan Novák is already away 26.11.2026–30.11.2026: change that absence instead");
    expect(absences.create).not.toHaveBeenCalled();
  });
});

describe("changing and deleting an absence", () => {
  it("changes the days and the cover, checked as for a new one, leaving itself out of the overlap", async () => {
    absences.spansOfUser.mockResolvedValue([{ id: ABSENCE, fromDate: "2026-11-23", toDate: "2026-11-27" }]);
    await absenceService.update(jan, ABSENCE, { toDate: "2026-11-25", coverUserId: null });
    expect(absences.update).toHaveBeenCalledWith("tx", ABSENCE, COMPANY, { updatedBy: JAN, fromDate: "2026-11-23", toDate: "2026-11-25", coverUserId: null });
    await expect(absenceService.update(jan, ABSENCE, { coverUserId: JAN })).rejects.toThrow(COVER_IS_ABSENT);
  });

  it("refuses a user somebody else's, and an absence that is not there", async () => {
    absences.getLive.mockResolvedValue(row({ userId: EVA }));
    await expect(absenceService.update(jan, ABSENCE, { toDate: "2026-11-25" })).rejects.toThrow(NOT_YOUR_ABSENCE);
    await expect(absenceService.remove(jan, ABSENCE)).rejects.toThrow(NOT_YOUR_ABSENCE);
    await expect(absenceService.remove(boss, ABSENCE)).resolves.toBeUndefined();
    expect(absences.softDelete).toHaveBeenCalledWith(ABSENCE, COMPANY, BOSS);
    absences.getLive.mockResolvedValue(null);
    await expect(absenceService.remove(boss, ABSENCE)).rejects.toThrow(ABSENCE_NOT_FOUND);
    await expect(absenceService.update(boss, "not-an-id", {})).rejects.toThrow(ABSENCE_NOT_FOUND);
  });
});

describe("the list", () => {
  it("is every live absence of the company ending on the day asked or later, but those of somebody who left", async () => {
    absences.listForCompany.mockResolvedValue([row(), row({ id: "gone", userId: "55555555-5555-4555-8555-555555555555" })]);
    const list = await absenceService.list(jan, { since: "2026-11-18" });
    expect(absences.listForCompany).toHaveBeenCalledWith(COMPANY, "2026-11-18", 1000, undefined);
    expect(list.map((a) => a.id)).toEqual([ABSENCE]);
    await expect(absenceService.list(jan, { since: "18.11.2026" })).rejects.toThrow("since must be a day");
  });
});

describe("the note", () => {
  it("is the absent person's and the managers' to read - it may say why - and empty for any other colleague", async () => {
    absences.listForCompany.mockResolvedValue([row({ note: "Doctor" })]);
    const eva = { userID: EVA, companyID: COMPANY, role: "user" };
    expect((await absenceService.list(jan))[0]).toMatchObject({ note: "Doctor", mayChange: true });
    expect((await absenceService.list(boss))[0]).toMatchObject({ note: "Doctor", mayChange: true });
    for (const role of ["admin", "superadmin"]) expect((await absenceService.list({ ...eva, role }))[0]!.note).toBe("Doctor");
    expect((await absenceService.list(eva))[0]).toMatchObject({ note: "", mayChange: false, userName: "Jan Novák", fromDate: "2026-11-23" });
  });
});

describe("the cover job's read", () => {
  it("says which absences cover the day and which ended lately, and names a cover only while they are a user", async () => {
    absences.inForce.mockResolvedValue([
      { id: "a-1", companyId: COMPANY, userId: JAN, userEmail: "jan@firma.cz", userName: "Jan", fromDate: "2026-11-16", toDate: "2026-11-20", coverUserId: EVA, coverEmail: "eva@firma.cz", coverName: "" },
      { id: "a-2", companyId: COMPANY, userId: EVA, userEmail: "eva@firma.cz", userName: "", fromDate: "2026-11-09", toDate: "2026-11-13", coverUserId: "left", coverEmail: null, coverName: null },
    ]);
    const out = await absenceService.inForce("2026-11-18");
    expect(absences.inForce).toHaveBeenCalledWith("2026-11-18", "2026-11-04");
    expect(out.map((a) => [a.id, a.inForce, a.coverUserId])).toEqual([
      ["a-1", true, EVA],
      ["a-2", false, null],
    ]);
  });
});
