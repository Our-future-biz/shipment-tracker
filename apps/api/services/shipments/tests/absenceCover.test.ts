import { describe, expect, it } from "vitest";
import { coverClearedLine, coverSetLine, planOpenCovers, setDecision, standingCovers, type CoverAbsence, type OpenCover } from "../lib/absenceCover";

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

  it("are cleared when the user is back - the absence ended, was shortened to before today, or deleted - or their user left", () => {
    expect(planOpenCovers([open()], [absence({ inForce: false })])).toEqual([{ row: open(), action: "clear", why: "back" }]);
    expect(planOpenCovers([open()], [])).toEqual([{ row: open(), action: "clear", why: "back" }]);
  });

  it("are cleared when the absence names another cover, or none, or a cover who left", () => {
    for (const coverEmail of ["petr@firma.cz", null]) {
      expect(planOpenCovers([open()], [absence({ coverEmail })])).toEqual([{ row: open(), action: "clear", why: "changed" }]);
    }
  });

  it("go over to the user's next absence when it names the same cover: the job keeps it", () => {
    const next = absence({ id: "a-2", fromDate: "2026-11-21", toDate: "2026-11-27" });
    expect(planOpenCovers([open()], [absence({ inForce: false }), next])).toEqual([{ row: open(), action: "move", to: next }]);
    // Somebody else's absence with the same cover is not theirs.
    expect(planOpenCovers([open()], [absence({ inForce: false }), absence({ id: "a-3", userId: "u-petr", userEmail: "petr@firma.cz" })])[0]!.action).toBe("clear");
  });
});

describe("the job's history lines", () => {
  it("say whom, while whom is away, and when", () => {
    expect(coverSetLine("eva@firma.cz", { name: "Jan Novák", email: "jan@firma.cz" }, "2026-11-23", "2026-11-27")).toBe("Holiday Cover eva@firma.cz while Jan Novák is away 23.11.–27.11.");
    expect(coverSetLine("eva@firma.cz", { name: " ", email: "jan@firma.cz" }, "2026-11-23", "2026-11-23")).toBe("Holiday Cover eva@firma.cz while jan@firma.cz is away 23.11.–23.11.");
    expect(coverClearedLine("eva@firma.cz", { name: "Jan Novák", email: "jan@firma.cz" }, "back")).toBe("Holiday Cover eva@firma.cz cleared: Jan Novák is back");
    expect(coverClearedLine("eva@firma.cz", { name: "Jan Novák", email: "jan@firma.cz" }, "changed")).toBe("Holiday Cover eva@firma.cz cleared: the cover while Jan Novák is away changed");
  });
});
