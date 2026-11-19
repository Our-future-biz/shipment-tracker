import { beforeEach, describe, expect, it, vi } from "vitest";

const clients = vi.hoisted(() => ({ auth: { _internalAbsencesInForce: vi.fn(), usersList: vi.fn() }, shipments: { _internalAbsenceCover: vi.fn() } }));
const covers = vi.hoisted(() => ({
  companiesWithOpen: vi.fn(),
  openOfCompany: vi.fn(),
  jobsToCover: vi.fn(),
  openOf: vi.fn(),
  ensureOpen: vi.fn(),
  markSet: vi.fn(),
  close: vi.fn(),
  moveTo: vi.fn(),
}));
const shipmentRepo = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const shipmentService = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), info: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => clients);
vi.mock("../../../../lib/outbox/serviceIdentity", () => ({ serviceActor: vi.fn(async (companyId: string) => ({ userID: `svc-${companyId}`, companyID: companyId, role: "user" })) }));
vi.mock("../../repositories/shipmentAbsenceCover.repository", () => ({ shipmentAbsenceCoverRepository: covers }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipmentRepo }));
vi.mock("../../services/shipment.service", () => ({ shipmentService }));

import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { ABSENCE_COVER_FIELD, type CoverAbsence } from "../../lib/absenceCover";
import { CANCELLED_STATUS } from "../../lib/fieldDefaults";
import { absenceCoverService, CHANGED_MEANWHILE, keptCovers, runAbsenceCovers } from "../../services/absenceCover.service";

const COMPANY = "c-1";
const SVC = { companyID: COMPANY, userID: "svc-c-1" };
const NOW = new Date("2026-11-18T10:00:00Z");
const absence = (over: Partial<CoverAbsence> = {}): CoverAbsence => ({
  id: "a-1",
  userId: "u-jan",
  userEmail: "jan@firma.cz",
  userName: "Jan Novák",
  fromDate: "2026-11-16",
  toDate: "2026-11-20",
  inForce: true,
  coverEmail: "eva@firma.cz",
  ...over,
});
const row = (over = {}) => ({
  id: "r-1",
  companyId: COMPANY,
  absenceId: "a-1",
  shipmentId: "s-1",
  absentUserId: "u-jan",
  absentEmail: "jan@firma.cz",
  absentName: "Jan Novák",
  fromDate: "2026-11-16",
  toDate: "2026-11-20",
  coverEmail: "eva@firma.cz",
  createdAt: NOW,
  setAt: NOW as Date | null,
  clearedAt: null,
  outcome: null,
  ...over,
});
const job = (over = {}) => ({ id: "s-1", personInCharge: "jan@firma.cz", holidayCover: "", status: "Booked", invoicingStatus: "", ...over });
// The job's write turn: what the update is handed to do alongside runs in it, with this stand-in for its transaction.
const TX = { fake: "tx" };
const inTurn = async (...args: unknown[]) => {
  await (args[7] as { alongside?: (tx: unknown) => Promise<void> } | undefined)?.alongside?.(TX);
  return {};
};

beforeEach(() => {
  vi.clearAllMocks();
  // A leaver's cover kept in one case is not skipped as "read lately" in the next (the same row ids recur here).
  keptCovers.clear();
  covers.openOfCompany.mockResolvedValue([]);
  covers.jobsToCover.mockResolvedValue([]);
  covers.openOf.mockResolvedValue(null);
  covers.ensureOpen.mockImplementation(async (values: Record<string, unknown>) => row({ ...values, id: "r-new", setAt: null }));
  covers.close.mockResolvedValue(true);
  covers.markSet.mockResolvedValue(true);
  shipmentService.update.mockImplementation(inTurn);
  // Jan is a user of the company still.
  clients.auth.usersList.mockResolvedValue({ users: [{ id: "u-jan", email: "jan@firma.cz", displayName: "Jan Novák" }] });
});

describe("setting the cover of an absence in force", () => {
  it("sets it on each of the absent user's active jobs with no Holiday Cover, as the service identity, through the job's own update, with a line saying why", async () => {
    covers.jobsToCover.mockResolvedValue([
      { id: "s-1", jobNumber: "CZFCL00000001" },
      { id: "s-2", jobNumber: "CZFCL00000002" },
    ]);
    const done = await absenceCoverService.applyForCompany(SVC, [absence()], NOW);
    expect(done).toEqual({ set: 2, cleared: 0, left: 0, moved: 0, failed: 0 });
    expect(covers.jobsToCover).toHaveBeenCalledWith(COMPANY, "jan@firma.cz", { id: "a-1", coverEmail: "eva@firma.cz" }, 200);
    // The row first, then the job's write; marked set once it went through.
    expect(covers.ensureOpen).toHaveBeenCalledWith(expect.objectContaining({ companyId: COMPANY, absenceId: "a-1", shipmentId: "s-1", absentUserId: "u-jan", coverEmail: "eva@firma.cz", fromDate: "2026-11-16", toDate: "2026-11-20" }));
    expect(covers.ensureOpen.mock.invocationCallOrder[0]!).toBeLessThan(shipmentService.update.mock.invocationCallOrder[0]!);
    const [id, company, data, userId, role, origin, stillHolds, extras] = shipmentService.update.mock.calls[0]!;
    expect([id, company, data, userId, role, origin]).toEqual(["s-1", COMPANY, { holidayCover: "eva@firma.cz" }, "svc-c-1", undefined, undefined]);
    expect(extras).toEqual({ history: [{ field: ABSENCE_COVER_FIELD, oldValue: null, newValue: "Holiday Cover eva@firma.cz while Jan Novák is away 16.11.–20.11." }], alongside: expect.any(Function) });
    // Marked set in the job's own write turn, with the cover.
    expect(covers.markSet).toHaveBeenCalledWith(TX, COMPANY, "r-new", NOW);
    // The write turn refuses a job that changed meanwhile: a cover set, another Handled By, cancelled.
    expect(() => stillHolds(job())).not.toThrow();
    expect(() => stillHolds(job({ holidayCover: "petr@firma.cz" }))).toThrow(CHANGED_MEANWHILE);
    expect(() => stillHolds(job({ personInCharge: "petr@firma.cz" }))).toThrow(CHANGED_MEANWHILE);
    expect(() => stillHolds(job({ status: CANCELLED_STATUS }))).toThrow(CHANGED_MEANWHILE);
  });

  it("does not set a cover again that somebody cleared by hand, nor one of absences without a cover or not in force", async () => {
    covers.jobsToCover.mockResolvedValue([{ id: "s-1", jobNumber: "CZFCL00000001" }]);
    covers.openOf.mockResolvedValue(row());
    expect((await absenceCoverService.applyForCompany(SVC, [absence(), absence({ id: "a-2", userId: "u-petr", userEmail: "petr@firma.cz", coverEmail: null }), absence({ id: "a-3", inForce: false })], NOW)).set).toBe(0);
    expect(covers.jobsToCover).toHaveBeenCalledTimes(1);
    expect(shipmentService.update).not.toHaveBeenCalled();
  });

  it("leaves a job that changed meanwhile as it is, and counts a write that failed to be tried again", async () => {
    covers.jobsToCover.mockResolvedValue([
      { id: "s-1", jobNumber: "CZFCL00000001" },
      { id: "s-2", jobNumber: "CZFCL00000002" },
    ]);
    shipmentService.update.mockRejectedValueOnce(APIError.aborted(CHANGED_MEANWHILE)).mockRejectedValueOnce(APIError.unavailable("auth is down"));
    expect(await absenceCoverService.applyForCompany(SVC, [absence()], NOW)).toEqual({ set: 0, cleared: 0, left: 0, moved: 0, failed: 1 });
    expect(covers.markSet).not.toHaveBeenCalled();
  });

  it("marks the row set inside the job's write turn, so a failure once the write is in still leaves the row saying the cover is set", async () => {
    covers.jobsToCover.mockResolvedValue([{ id: "s-1", jobNumber: "CZFCL00000001" }]);
    // The write turn commits (the cover and the mark), then a read the update makes afterwards fails.
    shipmentService.update.mockImplementationOnce(async (...args: unknown[]) => {
      await inTurn(...args);
      throw APIError.unavailable("the shipment could not be read back");
    });
    expect((await absenceCoverService.applyForCompany(SVC, [absence()], NOW)).failed).toBe(1);
    // Once, in the turn: nothing marks it after the update.
    expect(covers.markSet.mock.calls).toEqual([[TX, COMPANY, "r-new", NOW]]);
  });

  it("refuses the write when the row was closed meanwhile (its absence over, by a run at the same moment): no cover that nothing would clear", async () => {
    covers.jobsToCover.mockResolvedValue([{ id: "s-1", jobNumber: "CZFCL00000001" }]);
    covers.markSet.mockResolvedValue(false);
    expect(await absenceCoverService.applyForCompany(SVC, [absence()], NOW)).toEqual({ set: 0, cleared: 0, left: 0, moved: 0, failed: 0 });
    expect(covers.markSet).toHaveBeenCalledWith(TX, COMPANY, "r-new", NOW);
  });
});

describe("clearing a cover set", () => {
  it("clears it once the absence is over, only where the job still holds it, and closes the row", async () => {
    covers.openOfCompany.mockResolvedValue([row(), row({ id: "r-2", shipmentId: "s-2" }), row({ id: "r-3", shipmentId: "s-3" })]);
    shipmentRepo.getByIdForCompany.mockImplementation(async (id: string) => (id === "s-1" ? job({ holidayCover: "Eva@Firma.cz" }) : id === "s-2" ? job({ id, holidayCover: "petr@firma.cz" }) : null));
    const done = await absenceCoverService.applyForCompany(SVC, [absence({ inForce: false })], NOW);
    expect(done).toEqual({ set: 0, cleared: 1, left: 2, moved: 0, failed: 0 });
    expect(shipmentService.update).toHaveBeenCalledTimes(1);
    const [id, , data, userId, role, , stillHolds, extras] = shipmentService.update.mock.calls[0]!;
    expect([id, data, userId, role]).toEqual(["s-1", { holidayCover: "" }, "svc-c-1", undefined]);
    // Neutral: the absence is over - not "Jan is back", who may be away again (m26).
    expect(extras).toEqual({ history: [{ field: ABSENCE_COVER_FIELD, oldValue: null, newValue: "Holiday Cover eva@firma.cz cleared: absence over" }] });
    expect(() => stillHolds(job({ holidayCover: "eva@firma.cz" }))).not.toThrow();
    expect(() => stillHolds(job({ holidayCover: "" }))).toThrow(CHANGED_MEANWHILE);
    expect(covers.close.mock.calls).toEqual([
      [COMPANY, "r-1", "cleared", NOW],
      [COMPANY, "r-2", "changed", NOW],
      [COMPANY, "r-3", "gone", NOW],
    ]);
  });

  it("keeps the cover of a user who left the company while the job still names them in Handled By (P12)", async () => {
    covers.openOfCompany.mockResolvedValue([row()]);
    shipmentRepo.getByIdForCompany.mockResolvedValue(job({ holidayCover: "eva@firma.cz", personInCharge: "Jan@firma.cz — Jan Novák" }));
    clients.auth.usersList.mockResolvedValue({ users: [{ id: "u-eva", email: "eva@firma.cz", displayName: "Eva" }] });
    const done = await absenceCoverService.applyForCompany(SVC, [], NOW);
    expect(done).toMatchObject({ cleared: 0, left: 0, failed: 0 });
    expect(shipmentService.update).not.toHaveBeenCalled();
    expect(covers.close).not.toHaveBeenCalled();
  });

  it("clears a leaver's cover once the job is handed over, saying so - and closes the row of a job no longer active, its cover kept (P12)", async () => {
    covers.openOfCompany.mockResolvedValue([row(), row({ id: "r-2", shipmentId: "s-2" })]);
    shipmentRepo.getByIdForCompany.mockImplementation(async (id: string) =>
      id === "s-1" ? job({ holidayCover: "eva@firma.cz", personInCharge: "petr@firma.cz" }) : job({ id: "s-2", holidayCover: "eva@firma.cz", status: CANCELLED_STATUS }),
    );
    clients.auth.usersList.mockResolvedValue({ users: [{ id: "u-eva", email: "eva@firma.cz", displayName: "Eva" }] });
    const done = await absenceCoverService.applyForCompany(SVC, [], NOW);
    expect(done).toMatchObject({ cleared: 1, left: 1 });
    expect(shipmentService.update.mock.calls.map((c) => [c[0], c[7]])).toEqual([
      ["s-1", { history: [{ field: ABSENCE_COVER_FIELD, oldValue: null, newValue: "Holiday Cover eva@firma.cz cleared: Jan Novák left the company and no longer handles the job" }] }],
    ]);
    expect(covers.close.mock.calls).toEqual([
      [COMPANY, "r-1", "cleared", NOW],
      [COMPANY, "r-2", "gone", NOW],
    ]);
  });

  it("leaves a cover whose absence auth no longer tells to the next run when the users can't be read - it may be a leaver's; an absence that ended is just over", async () => {
    covers.openOfCompany.mockResolvedValue([row()]);
    shipmentRepo.getByIdForCompany.mockResolvedValue(job({ holidayCover: "eva@firma.cz" }));
    clients.auth.usersList.mockRejectedValue(new Error("auth is down"));
    await absenceCoverService.applyForCompany(SVC, [], NOW);
    expect(shipmentService.update).not.toHaveBeenCalled();
    expect(covers.close).not.toHaveBeenCalled();
    await absenceCoverService.applyForCompany(SVC, [absence({ inForce: false })], NOW);
    expect(shipmentService.update.mock.calls[0]![7]).toEqual({ history: [{ field: ABSENCE_COVER_FIELD, oldValue: null, newValue: "Holiday Cover eva@firma.cz cleared: absence over" }] });
  });

  it("does not ask who is a user when no cover is to be cleared for an absence over", async () => {
    covers.openOfCompany.mockResolvedValue([row()]);
    await absenceCoverService.applyForCompany(SVC, [absence()], NOW);
    expect(clients.auth.usersList).not.toHaveBeenCalled();
  });

  it("keeps the cover of an absence still in force, and hands a row to the user's next absence naming the same cover", async () => {
    covers.openOfCompany.mockResolvedValue([row(), row({ id: "r-2", absenceId: "a-0", shipmentId: "s-2" })]);
    const done = await absenceCoverService.applyForCompany(SVC, [absence(), absence({ id: "a-0", inForce: false, fromDate: "2026-11-09", toDate: "2026-11-15" })], NOW);
    expect(done.moved).toBe(1);
    expect(covers.moveTo).toHaveBeenCalledWith(COMPANY, "r-2", expect.objectContaining({ id: "a-1" }));
    expect(shipmentService.update).not.toHaveBeenCalled();
    expect(covers.close).not.toHaveBeenCalled();
  });

  it("clears a cover the absence no longer names before it sets the new one", async () => {
    covers.openOfCompany.mockResolvedValue([row()]);
    shipmentRepo.getByIdForCompany.mockResolvedValue(job({ holidayCover: "eva@firma.cz" }));
    covers.jobsToCover.mockResolvedValue([{ id: "s-1", jobNumber: "CZFCL00000001" }]);
    const done = await absenceCoverService.applyForCompany(SVC, [absence({ coverEmail: "petr@firma.cz" })], NOW);
    expect(done).toMatchObject({ cleared: 1, set: 1 });
    expect(shipmentService.update.mock.calls.map((c) => [c[2], c[7].history[0].newValue])).toEqual([
      [{ holidayCover: "" }, "Holiday Cover eva@firma.cz cleared: the cover while Jan Novák is away changed"],
      [{ holidayCover: "petr@firma.cz" }, "Holiday Cover petr@firma.cz while Jan Novák is away 16.11.–20.11."],
    ]);
  });

  it("closes a row whose write never went through without touching the job: the same e-mail there now is somebody's own", async () => {
    covers.openOfCompany.mockResolvedValue([row({ setAt: null })]);
    shipmentRepo.getByIdForCompany.mockResolvedValue(job({ holidayCover: "eva@firma.cz" }));
    expect(await absenceCoverService.applyForCompany(SVC, [], NOW)).toEqual({ set: 0, cleared: 0, left: 1, moved: 0, failed: 0 });
    expect(shipmentService.update).not.toHaveBeenCalled();
    expect(covers.close).toHaveBeenCalledWith(COMPANY, "r-1", "changed", NOW);
  });

  it("closes a row the next absence cannot take over - it has a row on the job of its own - instead of trying every run", async () => {
    covers.openOfCompany.mockResolvedValue([row({ absenceId: "a-0" })]);
    covers.moveTo.mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { code: "23505" }));
    const done = await absenceCoverService.applyForCompany(SVC, [absence(), absence({ id: "a-0", inForce: false })], NOW);
    expect(done).toMatchObject({ moved: 0, left: 1 });
    expect(covers.close).toHaveBeenCalledWith(COMPANY, "r-1", "changed", NOW);
    expect(shipmentService.update).not.toHaveBeenCalled();
    // Any other failure leaves the row to the next run.
    covers.close.mockClear();
    covers.moveTo.mockRejectedValueOnce(new Error("connection lost"));
    expect((await absenceCoverService.applyForCompany(SVC, [absence(), absence({ id: "a-0", inForce: false })], NOW)).left).toBe(0);
    expect(covers.close).not.toHaveBeenCalled();
  });

  it("leaves the row open when the job's write failed, to be tried again", async () => {
    covers.openOfCompany.mockResolvedValue([row()]);
    shipmentRepo.getByIdForCompany.mockResolvedValue(job({ holidayCover: "eva@firma.cz" }));
    shipmentService.update.mockRejectedValue(APIError.unavailable("auth is down"));
    expect((await absenceCoverService.applyForCompany(SVC, [], NOW)).failed).toBe(1);
    expect(covers.close).not.toHaveBeenCalled();
  });
});

describe("the cron's run", () => {
  it("runs every company with an absence or a cover still to clear, each as its service identity, and goes on past one that fails", async () => {
    clients.auth._internalAbsencesInForce.mockResolvedValue({ absences: [{ ...absence(), companyId: "c-1", coverUserId: "u-eva", coverName: "Eva" }] });
    covers.companiesWithOpen.mockResolvedValue(["c-2", "c-1"]);
    clients.shipments._internalAbsenceCover.mockResolvedValueOnce({ set: 2, cleared: 0, left: 0, moved: 0, failed: 0 }).mockRejectedValueOnce(new Error("boom"));
    const run = await runAbsenceCovers(NOW);
    expect(clients.auth._internalAbsencesInForce).toHaveBeenCalledWith({ day: "2026-11-18" });
    expect(clients.shipments._internalAbsenceCover.mock.calls).toEqual([
      [{ absences: [{ ...absence(), companyId: "c-1" }] }, { authData: { userID: "svc-c-1", companyID: "c-1", role: "user" } }],
      [{ absences: [] }, { authData: { userID: "svc-c-2", companyID: "c-2", role: "user" } }],
    ]);
    expect(run).toEqual({ companies: 2, companiesFailed: 1, set: 2, cleared: 0, left: 0, moved: 0, failed: 0 });
  });

  it("does nothing when auth does not answer: no cover is cleared on a guess", async () => {
    clients.auth._internalAbsencesInForce.mockRejectedValue(new Error("auth is down"));
    await expect(runAbsenceCovers(NOW)).rejects.toThrow("auth is down");
    expect(clients.shipments._internalAbsenceCover).not.toHaveBeenCalled();
  });
});
