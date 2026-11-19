import { describe, expect, it } from "vitest";
import {
  EMPTY_DRAFT,
  absenceDays,
  absenceProblem,
  awaySummary,
  comingAbsences,
  coverHint,
  coverText,
  createRequest,
  czDay,
  draftOf,
  isAwayOn,
  updateRequest,
  userIdOf,
  type UserAbsence,
} from "./absences";

const users = [
  { id: "u-jana", email: "jana@cto.cz" },
  { id: "u-petr", email: "Petr@CTO.cz" },
];

let seq = 0;
const absence = (over: Partial<UserAbsence> = {}): UserAbsence => ({
  id: `a-${++seq}`,
  userId: "u-jana",
  userName: "Jana",
  userEmail: "jana@cto.cz",
  fromDate: "2026-11-24",
  toDate: "2026-11-28",
  coverUserId: null,
  coverName: null,
  coverEmail: null,
  note: "",
  createdBy: "",
  updatedBy: "",
  createdAt: "",
  updatedAt: "",
  mayChange: true,
  ...over,
});

describe("absences: the days in words", () => {
  it("writes a day the Czech way and an absence as its first and last day", () => {
    expect(czDay("2026-11-24")).toBe("24.11.2026");
    expect(czDay("")).toBe("");
    expect(czDay(null)).toBe("");
    expect(absenceDays({ fromDate: "2026-11-24", toDate: "2026-11-28" })).toBe("24.11.2026–28.11.2026");
    expect(absenceDays({ fromDate: "2026-11-24", toDate: "2026-11-24" })).toBe("24.11.2026");
  });

  it("names the cover by name, else e-mail, else says there is none", () => {
    expect(coverText({ coverName: "Petr", coverEmail: "petr@cto.cz" })).toBe("Petr");
    expect(coverText({ coverName: " ", coverEmail: "petr@cto.cz" })).toBe("petr@cto.cz");
    expect(coverText({ coverName: null, coverEmail: null })).toBe("no cover");
  });
});

describe("absences: which are in force and which to come", () => {
  it("takes both ends in", () => {
    const a = absence();
    expect(isAwayOn(a, "2026-11-23")).toBe(false);
    expect(isAwayOn(a, "2026-11-24")).toBe(true);
    expect(isAwayOn(a, "2026-11-28")).toBe(true);
    expect(isAwayOn(a, "2026-11-29")).toBe(false);
  });

  it("lists the absences not over yet, the earliest first", () => {
    const past = absence({ fromDate: "2026-11-01", toDate: "2026-11-05" });
    const later = absence({ fromDate: "2026-12-20", toDate: "2026-12-31" });
    const now = absence({ fromDate: "2026-11-18", toDate: "2026-11-20" });
    expect(comingAbsences([later, past, now], "2026-11-19")).toEqual([now, later]);
  });

  it("says of a user the absence they are on today, else the next, else nothing", () => {
    const now = absence({ fromDate: "2026-11-18", toDate: "2026-11-20", coverUserId: "u-petr", coverName: "Petr", coverEmail: "petr@cto.cz" });
    const next = absence({ fromDate: "2026-12-20", toDate: "2026-12-31" });
    const other = absence({ userId: "u-petr", fromDate: "2026-11-19", toDate: "2026-11-19" });
    expect(awaySummary([next, now, other], "U-JANA", "2026-11-19")).toMatchObject({ now: true, text: "Away until 20.11.2026", cover: "cover: Petr", absence: now });
    expect(awaySummary([next, now], "u-jana", "2026-11-21")).toMatchObject({ now: false, text: "Away 20.12.2026–31.12.2026", cover: "no cover", absence: next });
    expect(awaySummary([now], "u-jana", "2026-11-21")).toBeNull();
    expect(awaySummary([], "u-jana", "2026-11-21")).toBeNull();
  });
});

describe("absences: the form", () => {
  it("finds the cover's id by e-mail, without regard to case", () => {
    expect(userIdOf("petr@cto.cz", users)).toBe("u-petr");
    expect(userIdOf(" JANA@cto.cz ", users)).toBe("u-jana");
    expect(userIdOf("", users)).toBeNull();
    expect(userIdOf("nobody@cto.cz", users)).toBeNull();
  });

  it("asks for both days, in order, at most a year and a day long", () => {
    const ok = { ...EMPTY_DRAFT, fromDate: "2026-11-24", toDate: "2026-11-28" };
    expect(absenceProblem(ok, "u-jana", users)).toBeNull();
    expect(absenceProblem({ ...ok, fromDate: "" }, "u-jana", users)).toBe("Pick the first day away");
    expect(absenceProblem({ ...ok, toDate: "" }, "u-jana", users)).toBe("Pick the last day away");
    expect(absenceProblem({ ...ok, toDate: "2026-11-23" }, "u-jana", users)).toBe("An absence cannot end before it starts");
    // One day is an absence too.
    expect(absenceProblem({ ...ok, toDate: "2026-11-24" }, "u-jana", users)).toBeNull();
    expect(absenceProblem({ ...ok, toDate: "2027-11-25" }, "u-jana", users)).toBe("An absence can be at most 366 days long");
    expect(absenceProblem({ ...ok, toDate: "2027-11-24" }, "u-jana", users)).toBeNull();
  });

  it("wants the cover to be another user of the company, and the note not too long", () => {
    const ok = { ...EMPTY_DRAFT, fromDate: "2026-11-24", toDate: "2026-11-28" };
    expect(absenceProblem({ ...ok, coverEmail: "petr@cto.cz" }, "u-jana", users)).toBeNull();
    expect(absenceProblem({ ...ok, coverEmail: "jana@cto.cz" }, "u-jana", users)).toBe("The cover cannot be the person who is away");
    expect(absenceProblem({ ...ok, coverEmail: "gone@cto.cz" }, "u-jana", users)).toBe("The cover must be an active user of the company");
    expect(absenceProblem({ ...ok, note: "x".repeat(501) }, "u-jana", users)).toBe("The note is too long (at most 500 characters)");
    expect(absenceProblem({ ...ok, note: "x".repeat(500) }, "u-jana", users)).toBeNull();
  });

  it("leaves the user out of one's own absence, and names them for somebody else's", () => {
    const draft = { fromDate: "2026-11-24", toDate: "2026-11-28", coverEmail: "petr@cto.cz", note: " Holiday " };
    expect(createRequest(draft, "u-jana", true, users)).toEqual({ fromDate: "2026-11-24", toDate: "2026-11-28", coverUserId: "u-petr", note: "Holiday" });
    expect(createRequest({ ...draft, coverEmail: "" }, "u-jana", false, users)).toEqual({ userId: "u-jana", fromDate: "2026-11-24", toDate: "2026-11-28", note: "Holiday" });
  });

  it("clears a cover taken away with an explicit null", () => {
    const draft = { fromDate: "2026-11-24", toDate: "2026-11-28", coverEmail: "", note: "" };
    expect(updateRequest(draft, users)).toEqual({ fromDate: "2026-11-24", toDate: "2026-11-28", coverUserId: null, note: "" });
    expect(updateRequest({ ...draft, coverEmail: "petr@cto.cz" }, users).coverUserId).toBe("u-petr");
  });

  it("fills the form from an absence", () => {
    const a = absence({ coverEmail: "petr@cto.cz", note: "Spa" });
    expect(draftOf(a)).toEqual({ fromDate: "2026-11-24", toDate: "2026-11-28", coverEmail: "petr@cto.cz", note: "Spa" });
    expect(draftOf(absence()).coverEmail).toBe("");
  });

  it("says beside the cover picker what the cover does, to the user or of them", () => {
    expect(coverHint(true, "")).toBe(
      "While you are away, each active job you handle with no Holiday Cover gets this cover as its Holiday Cover (within 15 minutes), and loses it when you are back.",
    );
    expect(coverHint(false, "Jana")).toContain("While Jana is away, each active job they handle");
    expect(coverHint(false, " ")).toContain("While this user is away");
  });
});
