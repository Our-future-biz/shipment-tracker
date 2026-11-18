import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ usersList: vi.fn() }));
const notes = vi.hoisted(() => ({ lateByShipmentIds: vi.fn() }));
const comments = vi.hoisted(() => ({ unreadMentionsByShipmentIds: vi.fn() }));
const history = vi.hoisted(() => ({ lastTouchedSince: vi.fn(), latestByShipmentIds: vi.fn() }));
const releaseRequests = vi.hoisted(() => ({ waitingByShipmentIds: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ auth }));
vi.mock("../../repositories/shipmentNote.repository", () => ({ shipmentNoteRepository: notes }));
vi.mock("../../repositories/shipmentComment.repository", () => ({ shipmentCommentRepository: comments }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: history }));
vi.mock("../../repositories/shipmentReleaseRequest.repository", () => ({ shipmentReleaseRequestRepository: releaseRequests }));

import { TEAM_PARTS, type TeamJob } from "../../lib/managersCockpitTeam";
import { readLimiter } from "../../lib/readLimiter";
import { cockpitUsers, teamFacts, type CockpitUser } from "../../services/managersCockpitTeam.service";

// The reads of Shipments → Managers' step 3 signals and Team facts, against stand-ins for the
// repositories: what each is asked, that a part which fails takes only itself with it, and what
// is not asked at all. The rules themselves are tests/managersCockpitTeam.test.ts.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
// A moment of a November day on Prague's clock (CET, an hour ahead of UTC).
const at = (day: string, time = "11:00") => new Date(`${day}T${time}:00+01:00`);
// Wednesday 18 Nov 2026, 11:00 in Prague; Tuesday the 17th is a public holiday.
const NOW = at("2026-11-18");
const USERS: CockpitUser[] = [
  { id: "u-jan", email: "jan@firma.cz", reportsToUserId: "u-boss" },
  { id: "u-eva", email: "eva@firma.cz", reportsToUserId: null },
  { id: "u-petr", email: "petr@firma.cz", reportsToUserId: null },
  { id: "u-boss", email: "boss@firma.cz", reportsToUserId: null },
];
const CTX = { companyId: COMPANY, now: NOW, today: "2026-11-18", holidays: [] as string[], users: USERS };

const job = (n: number, over: Partial<TeamJob> = {}): TeamJob => ({
  id: `id-${n}`,
  tradeDirection: "Import",
  freightMode: "Sea Freight",
  department: "Operation Department",
  personInCharge: "jan@firma.cz",
  holidayCover: "",
  createdAt: at("2026-10-01"),
  updatedAt: at("2026-10-01"),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  notes.lateByShipmentIds.mockResolvedValue([]);
  comments.unreadMentionsByShipmentIds.mockResolvedValue([]);
  history.lastTouchedSince.mockResolvedValue(new Map());
  history.latestByShipmentIds.mockResolvedValue([]);
  releaseRequests.waitingByShipmentIds.mockResolvedValue([]);
});

describe("the company's users, as the cockpit reads them", () => {
  const user = (over = {}) => ({ id: "u-jan", companyId: COMPANY, email: " Jan@Firma.cz ", displayName: "Jan Novák", role: "user", departmentId: null, branchId: null, reportsToUserId: "u-boss", ...over });

  it("are read in one call: who they are by e-mail, trimmed and lower case, and whom each reports to", async () => {
    auth.usersList.mockResolvedValue({ users: [user(), user({ id: "u-boss", email: "boss@firma.cz", role: "manager", reportsToUserId: null })] });
    expect(await cockpitUsers()).toEqual([
      { id: "u-jan", email: "jan@firma.cz", reportsToUserId: "u-boss" },
      { id: "u-boss", email: "boss@firma.cz", reportsToUserId: null },
    ]);
    expect(auth.usersList).toHaveBeenCalledTimes(1);
  });

  it("are not known when they could not be read - and when the answer is empty: a company always has the user asking", async () => {
    auth.usersList.mockRejectedValue(new Error("auth is down"));
    expect(await cockpitUsers()).toBeNull();
    auth.usersList.mockResolvedValue({ users: [] });
    expect(await cockpitUsers()).toBeNull();
  });
});

describe("the reads of the people around the jobs", () => {
  it("asks each table once, for the jobs handed in, and judges them together", async () => {
    const jobs = [job(1, { holidayCover: "eva@firma.cz" }), job(2), job(3, { createdAt: at("2026-11-16"), updatedAt: at("2026-11-16") })];
    notes.lateByShipmentIds.mockResolvedValue([{ shipmentId: "id-1", text: "Call the carrier", dueDate: "2026-11-16" }]);
    comments.unreadMentionsByShipmentIds.mockResolvedValue([{ shipmentId: "id-1", userId: "u-eva", createdAt: at("2026-11-13", "09:00") }]);
    history.lastTouchedSince.mockResolvedValue(new Map([["id-1", at("2026-11-16")]]));
    history.latestByShipmentIds.mockResolvedValue([{ shipmentId: "id-1", field: "holidayCover", changedAt: at("2026-11-09") }]);
    releaseRequests.waitingByShipmentIds.mockResolvedValue([{ shipmentId: "id-2", what: "house_bol", requestedAt: at("2026-11-13", "15:00") }]);

    const facts = await teamFacts(jobs, CTX);

    expect(notes.lateByShipmentIds).toHaveBeenCalledTimes(1);
    expect(notes.lateByShipmentIds).toHaveBeenCalledWith(["id-1", "id-2", "id-3"], COMPANY, "2026-11-18");
    // Only the users behind the jobs' Handled By and Holiday Cover are asked about: Jan and Eva, not Petr or the boss.
    expect(comments.unreadMentionsByShipmentIds).toHaveBeenCalledTimes(1);
    expect(comments.unreadMentionsByShipmentIds).toHaveBeenCalledWith(["id-1", "id-2", "id-3"], COMPANY, ["u-jan", "u-eva"]);
    // The last touches: of the jobs old enough to be untouched (not the one of Monday), from the first
    // minute of the first day a touch still counts on - Wednesday the 11th, five working days back.
    expect(history.lastTouchedSince).toHaveBeenCalledTimes(1);
    expect(history.lastTouchedSince).toHaveBeenCalledWith(COMPANY, ["id-1", "id-2"], at("2026-11-11", "00:00"));
    // Since when a cover stands: the newest change of Holiday Cover, on the jobs that have one.
    expect(history.latestByShipmentIds).toHaveBeenCalledTimes(1);
    expect(history.latestByShipmentIds).toHaveBeenCalledWith(COMPANY, [{ fields: ["holidayCover"], shipmentIds: ["id-1"] }]);
    expect(releaseRequests.waitingByShipmentIds).toHaveBeenCalledTimes(1);
    expect(releaseRequests.waitingByShipmentIds).toHaveBeenCalledWith(["id-1", "id-2", "id-3"], COMPANY);

    expect(facts.byJob.get("id-1")).toMatchObject({
      signals: [expect.objectContaining({ kind: "todo", text: 'To-do 2 days late: "Call the carrier"' }), expect.objectContaining({ kind: "mention", urgent: true, text: "@mention unread since 13.11. 09:00 (eva@firma.cz)" })],
      notTouched: null,
      todosLate: 1,
      mentionsUnread: new Map([["eva@firma.cz", 1]]),
      coverSince: "2026-11-09",
    });
    expect(facts.byJob.get("id-2")).toMatchObject({
      signals: [expect.objectContaining({ kind: "request", urgent: true, text: "Release request waiting for approval since 13.11. 15:00" })],
      notTouched: expect.objectContaining({ text: "Not touched since 01.10." }),
    });
    expect(facts.byJob.has("id-3")).toBe(false);
    expect(facts.known).toEqual({ todos: true, mentions: true, touched: true, coverSince: true });
    expect(facts.notKnown).toEqual([]);
  });

  it("reaches back by the company's own days off too", async () => {
    await teamFacts([job(1)], { ...CTX, holidays: ["2026-11-16"] });
    expect(history.lastTouchedSince).toHaveBeenCalledWith(COMPANY, ["id-1"], at("2026-11-10", "00:00"));
  });

  it("names a part that could not be read and still answers the others: no signal and no figure of it, which is not a zero", async () => {
    const jobs = [job(1, { holidayCover: "eva@firma.cz" })];
    notes.lateByShipmentIds.mockResolvedValue([{ shipmentId: "id-1", text: "Call the carrier", dueDate: "2026-11-16" }]);
    comments.unreadMentionsByShipmentIds.mockRejectedValue(new Error("the chat could not be read"));
    history.lastTouchedSince.mockRejectedValue(new Error("the touches could not be read"));
    const facts = await teamFacts(jobs, CTX);
    expect(facts.byJob.get("id-1")).toMatchObject({ signals: [expect.objectContaining({ kind: "todo" })], notTouched: null, todosLate: 1 });
    expect(facts.known).toEqual({ todos: true, mentions: false, touched: false, coverSince: true });
    expect(facts.notKnown).toEqual([TEAM_PARTS.mentions, TEAM_PARTS.touched]);

    notes.lateByShipmentIds.mockRejectedValue(new Error("the to-dos could not be read"));
    history.latestByShipmentIds.mockRejectedValue(new Error("the history could not be read"));
    releaseRequests.waitingByShipmentIds.mockRejectedValue(new Error("the requests could not be read"));
    const none = await teamFacts(jobs, CTX);
    expect(none.byJob.size).toBe(0);
    expect(none.known).toEqual({ todos: false, mentions: false, touched: false, coverSince: false });
    expect(none.notKnown).toEqual([TEAM_PARTS.todos, TEAM_PARTS.mentions, TEAM_PARTS.touched, TEAM_PARTS.coverSince, TEAM_PARTS.releaseRequests]);
    expect(TEAM_PARTS.releaseRequests).toBe("release requests");
  });

  it("does not ask about @mentions without the users - whom a line tagged cannot be said - and names them as not known", async () => {
    const facts = await teamFacts([job(1)], { ...CTX, users: null });
    expect(comments.unreadMentionsByShipmentIds).not.toHaveBeenCalled();
    expect(facts.known.mentions).toBe(false);
    expect(facts.notKnown).toEqual([TEAM_PARTS.mentions]);
    // The rest needs no users.
    expect(notes.lateByShipmentIds).toHaveBeenCalled();
    expect(history.lastTouchedSince).toHaveBeenCalled();
  });

  it("asks about nobody's @mentions when nobody who answers for a job is a user: that is known, and is none", async () => {
    const facts = await teamFacts([job(1, { personInCharge: "left@firma.cz" }), job(2, { personInCharge: "" })], CTX);
    expect(comments.unreadMentionsByShipmentIds).toHaveBeenCalledWith(["id-1", "id-2"], COMPANY, []);
    expect(facts.known.mentions).toBe(true);
  });

  it("sends each statement through the limiter of the answer it is read for - and all at once when handed none", async () => {
    let running = 0;
    let peak = 0;
    const slow = (answer: unknown) => async () => {
      peak = Math.max(peak, ++running);
      await new Promise((done) => setTimeout(done, 1));
      running -= 1;
      return answer;
    };
    notes.lateByShipmentIds.mockImplementation(slow([]));
    comments.unreadMentionsByShipmentIds.mockImplementation(slow([]));
    history.lastTouchedSince.mockImplementation(slow(new Map()));
    history.latestByShipmentIds.mockImplementation(slow([]));
    releaseRequests.waitingByShipmentIds.mockImplementation(slow([]));
    const jobs = [job(1, { holidayCover: "eva@firma.cz" })];
    expect((await teamFacts(jobs, { ...CTX, run: readLimiter(2) })).notKnown).toEqual([]);
    expect(peak).toBe(2);
    peak = 0;
    await teamFacts(jobs, CTX);
    expect(peak).toBe(5);
  });

  it("hands the repositories an empty list where there is nothing to ask about: they then send no statement", async () => {
    // Two jobs of this week with no cover: no job is old enough to be untouched, none has a cover.
    await teamFacts([job(1, { createdAt: at("2026-11-16") }), job(2, { createdAt: at("2026-11-18", "09:00") })], CTX);
    expect(history.lastTouchedSince).toHaveBeenCalledWith(COMPANY, [], at("2026-11-11", "00:00"));
    expect(history.latestByShipmentIds).toHaveBeenCalledWith(COMPANY, [{ fields: ["holidayCover"], shipmentIds: [] }]);
    const facts = await teamFacts([], CTX);
    expect(notes.lateByShipmentIds).toHaveBeenLastCalledWith([], COMPANY, "2026-11-18");
    expect(facts).toEqual({ byJob: new Map(), known: { todos: true, mentions: true, touched: true, coverSince: true }, notKnown: [] });
  });
});
