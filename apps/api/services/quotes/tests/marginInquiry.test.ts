import { describe, expect, it } from "vitest";
import { answerProblem, askProblem, isEscalated, isToldAbout, officeMinutesBetween } from "../lib/marginInquiry";

// Prague is UTC+1 in November: 09:00 UTC is 10:00 there.
const at = (iso: string) => new Date(iso);

describe("officeMinutesBetween", () => {
  it("counts 08:00-17:00 Prague on working days only", () => {
    // Tuesday 3 Nov 2026, 10:00 → 12:30.
    expect(officeMinutesBetween(at("2026-11-03T09:00:00Z"), at("2026-11-03T11:30:00Z"))).toBe(150);
    // 16:00 Tuesday → 09:00 Wednesday: one hour each day.
    expect(officeMinutesBetween(at("2026-11-03T15:00:00Z"), at("2026-11-04T08:00:00Z"))).toBe(120);
    // Friday 16:00 → Monday 09:00: the weekend does not count.
    expect(officeMinutesBetween(at("2026-11-06T15:00:00Z"), at("2026-11-09T08:00:00Z"))).toBe(120);
    // Evening to morning: nothing.
    expect(officeMinutesBetween(at("2026-11-03T18:00:00Z"), at("2026-11-04T06:00:00Z"))).toBe(0);
    expect(officeMinutesBetween(at("2026-11-03T12:00:00Z"), at("2026-11-03T10:00:00Z"))).toBe(0);
  });

  it("skips Czech public holidays", () => {
    // 17 Nov 2026 is a holiday (Tuesday): Monday 16:00 → Wednesday 09:00 is two hours.
    expect(officeMinutesBetween(at("2026-11-16T15:00:00Z"), at("2026-11-18T08:00:00Z"))).toBe(120);
  });
});

describe("who is told", () => {
  const asked = { requestedAt: at("2026-11-03T09:00:00Z"), needsBy: null, notifyUserId: "boss" };
  const boss = { id: "boss", role: "manager" };
  const admin = { id: "admin", role: "admin" };
  const other = { id: "other", role: "manager" };

  it("tells the owner's manager first, and the admins after 4 office hours", () => {
    const soon = at("2026-11-03T12:00:00Z");
    expect(isEscalated(asked, soon)).toBe(false);
    expect(isToldAbout(asked, boss, soon)).toBe(true);
    expect(isToldAbout(asked, admin, soon)).toBe(false);
    const late = at("2026-11-03T13:00:00Z");
    expect(isEscalated(asked, late)).toBe(true);
    expect(isToldAbout(asked, admin, late)).toBe(true);
    // Another manager is not told; any manager may still answer from the list.
    expect(isToldAbout(asked, other, late)).toBe(false);
  });

  it("tells the admins at once when no manager is set, or when the customer's moment is 2 hours away", () => {
    const now = at("2026-11-03T09:30:00Z");
    expect(isEscalated({ ...asked, notifyUserId: null }, now)).toBe(true);
    expect(isEscalated({ ...asked, needsBy: at("2026-11-03T11:30:00Z") }, now)).toBe(true);
    expect(isEscalated({ ...asked, needsBy: at("2026-11-03T15:00:00Z") }, now)).toBe(false);
  });
});

describe("askProblem", () => {
  const now = at("2026-11-03T09:00:00Z");
  it("takes a known reason, and own words for Other", () => {
    expect(askProblem({ reason: "Competitor price", note: "" }, now)).toBeNull();
    expect(askProblem({ reason: "Cheap", note: "" }, now)).toMatch(/Pick a reason/);
    expect(askProblem({ reason: "Other", note: "ok" }, now)).toBe("Say why, in a few words");
    expect(askProblem({ reason: "Other", note: "new lane" }, now)).toBeNull();
  });

  it("refuses a 'needs it by' that has passed or is no date", () => {
    expect(askProblem({ reason: "Retention", note: "", needsBy: "2026-11-02T10:00:00Z" }, now)).toBe('"Needs it by" has already passed');
    expect(askProblem({ reason: "Retention", note: "", needsBy: "tomorrow" }, now)).toBe('"Needs it by" must be a date and time');
    expect(askProblem({ reason: "Retention", note: "", needsBy: "2026-11-04T10:00:00Z" }, now)).toBeNull();
  });
});

describe("answerProblem", () => {
  it("needs a margin and a reason for a counter, and a reason for a rejection", () => {
    expect(answerProblem({ decision: "approve" })).toBeNull();
    expect(answerProblem({ decision: "counter", counterMarginCzk: 900, comment: "" })).toBe("Say why, so the rep knows what to aim for");
    expect(answerProblem({ decision: "counter", counterMarginCzk: null, comment: "aim for 900" })).toBe("Give the lowest margin in CZK you accept");
    expect(answerProblem({ decision: "counter", counterMarginCzk: 900, comment: "aim for 900" })).toBeNull();
    expect(answerProblem({ decision: "reject", comment: "no" })).toBe("Say why the margin is rejected");
  });
});
