import { describe, expect, it } from "vitest";
import { clearWhy, coverClearedLine, coverSetLine, leaverCover, overNotKnown, planOpenCovers, setDecision, standingCovers, type CoverAbsence, type OpenCover } from "../lib/absenceCover";

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
const open = (over: Partial<OpenCover> = {}): OpenCover => ({
  id: "r-1",
  absenceId: "a-1",
  shipmentId: "s-1",
  absentUserId: "u-jan",
  absentEmail: "jan@firma.cz",
  absentName: "Jan Novák",
  fromDate: "2026-11-16",
  toDate: "2026-11-20",
  coverEmail: "eva@firma.cz",
  setAt: new Date("2026-11-16T07:00:00Z"),
  ...over,
});

describe("the covers to set", () => {
  it("are of the absences in force today that name a cover who is not the absent user", () => {
    const ok = absence();
    expect(standingCovers([ok, absence({ id: "a-2", inForce: false }), absence({ id: "a-3", coverEmail: null }), absence({ id: "a-4", coverEmail: " JAN@firma.cz" })])).toEqual([ok]);
  });

  it("are set on a job with no row for the absence, or one whose write did not go through - never again once set", () => {
    expect(setDecision(null, "eva@firma.cz")).toBe("set");
    expect(setDecision({ coverEmail: "eva@firma.cz", setAt: null }, "Eva@Firma.cz")).toBe("set");
    // Set once and empty again: somebody cleared it by hand, and that stands.
    expect(setDecision({ coverEmail: "eva@firma.cz", setAt: new Date() }, "eva@firma.cz")).toBe("already_set_once");
    // A row of the cover named before is cleared first; the next run sets the new one.
    expect(setDecision({ coverEmail: "petr@firma.cz", setAt: new Date() }, "eva@firma.cz")).toBe("other_cover_open");
  });
});

describe("the covers set", () => {
  it("stay while their absence is in force with the same cover", () => {
    expect(planOpenCovers([open()], [absence()])).toEqual([{ row: open(), action: "keep" }]);
    expect(planOpenCovers([open({ coverEmail: "EVA@firma.cz" })], [absence()])[0]!.action).toBe("keep");
  });

  it("are cleared when the absence is over - it ended, was shortened to before today, or deleted - or their user left", () => {
    expect(planOpenCovers([open()], [absence({ inForce: false })])).toEqual([{ row: open(), action: "clear", why: "over" }]);
    expect(planOpenCovers([open()], [])).toEqual([{ row: open(), action: "clear", why: "over" }]);
  });

  it("are cleared when the absence names another cover, or none, or a cover who left", () => {
    for (const coverEmail of ["petr@firma.cz", null]) {
      expect(planOpenCovers([open()], [absence({ coverEmail })])).toEqual([{ row: open(), action: "clear", why: "changed" }]);
    }
  });

  it("are cleared as changed - not as over - when the user started another absence with another cover, or none (m26)", () => {
    for (const coverEmail of ["petr@firma.cz", null]) {
      const next = absence({ id: "a-2", fromDate: "2026-11-21", toDate: "2026-11-27", coverEmail });
      expect(planOpenCovers([open()], [absence({ inForce: false }), next])).toEqual([{ row: open(), action: "clear", why: "changed" }]);
    }
    // Somebody else away is not the user away.
    expect(planOpenCovers([open()], [absence({ id: "a-3", userId: "u-petr", userEmail: "petr@firma.cz", coverEmail: "jan@firma.cz" })])[0]).toMatchObject({ why: "over" });
  });

  it("say the user left when their absence is over and they are no user of the company any more", () => {
    expect(clearWhy("over", "u-jan", new Set(["u-eva"]))).toBe("left");
    expect(clearWhy("over", "u-jan", new Set(["u-jan"]))).toBe("over");
    // The users not known: just over - nothing is claimed that was not read.
    expect(clearWhy("over", "u-jan", null)).toBe("over");
    // Another cover named while away is that, whoever is a user.
    expect(clearWhy("changed", "u-jan", new Set())).toBe("changed");
  });

  it("go over to the user's next absence when it names the same cover: the job keeps it", () => {
    const next = absence({ id: "a-2", fromDate: "2026-11-21", toDate: "2026-11-27" });
    expect(planOpenCovers([open()], [absence({ inForce: false }), next])).toEqual([{ row: open(), action: "move", to: next }]);
    // Somebody else's absence with the same cover is not theirs.
    expect(planOpenCovers([open()], [absence({ inForce: false }), absence({ id: "a-3", userId: "u-petr", userEmail: "petr@firma.cz" })])[0]!.action).toBe("clear");
  });
});

describe("the cover of a user who left the company (P12)", () => {
  it("stays while the job still names them in Handled By, and comes off once it names somebody else", () => {
    expect(leaverCover(open(), { personInCharge: " Jan@Firma.cz — Jan Novák" }, true)).toBe("stays");
    expect(leaverCover(open(), { personInCharge: "petr@firma.cz" }, true)).toBe("clear");
    expect(leaverCover(open(), { personInCharge: "" }, true)).toBe("clear");
  });

  it("is done with on a job no longer active: nobody hands it over, and its cover is left as it is", () => {
    expect(leaverCover(open(), { personInCharge: "jan@firma.cz" }, false)).toBe("done");
  });

  it("is not told apart from a deleted absence while the users can't be read: the next run tells", () => {
    expect(overNotKnown("over", open(), [], null)).toBe(true);
    // The absence is still told (it ended): just over.
    expect(overNotKnown("over", open(), [absence({ inForce: false })], null)).toBe(false);
    // The users read: clearWhy tells.
    expect(overNotKnown("over", open(), [], new Set(["u-eva"]))).toBe(false);
    expect(overNotKnown("changed", open(), [], null)).toBe(false);
  });
});

describe("the job's history lines", () => {
  it("say whom, while whom is away, and when", () => {
    expect(coverSetLine("eva@firma.cz", { name: "Jan Novák", email: "jan@firma.cz" }, "2026-11-23", "2026-11-27")).toBe("Holiday Cover eva@firma.cz while Jan Novák is away 23.11.–27.11.");
    expect(coverSetLine("eva@firma.cz", { name: " ", email: "jan@firma.cz" }, "2026-11-23", "2026-11-23")).toBe("Holiday Cover eva@firma.cz while jan@firma.cz is away 23.11.–23.11.");
    // Neutral: an absence over says nothing of the user being back - they may be on another one (m26).
    expect(coverClearedLine("eva@firma.cz", { name: "Jan Novák", email: "jan@firma.cz" }, "over")).toBe("Holiday Cover eva@firma.cz cleared: absence over");
    expect(coverClearedLine("eva@firma.cz", { name: "Jan Novák", email: "jan@firma.cz" }, "left")).toBe("Holiday Cover eva@firma.cz cleared: Jan Novák left the company and no longer handles the job");
    expect(coverClearedLine("eva@firma.cz", { name: "", email: "jan@firma.cz" }, "left")).toBe("Holiday Cover eva@firma.cz cleared: jan@firma.cz left the company and no longer handles the job");
    expect(coverClearedLine("eva@firma.cz", { name: "Jan Novák", email: "jan@firma.cz" }, "changed")).toBe("Holiday Cover eva@firma.cz cleared: the cover while Jan Novák is away changed");
  });
});
