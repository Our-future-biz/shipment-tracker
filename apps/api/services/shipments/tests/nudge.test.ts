import { describe, expect, it, vi } from "vitest";

// lib/personPick, which finds the users to tag, refuses with the API's errors.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { NUDGE_FIELD, NUDGE_NOBODY, NUDGE_NOBODY_TO_TELL, nudgeNotice } from "../lib/nudge";

const jan = { id: "u-jan", email: "jan@firma.cz", displayName: "Jan Novák" };
const eva = { id: "u-eva", email: "eva@firma.cz", displayName: "" };
const boss = { id: "u-boss", email: "boss@firma.cz", displayName: "Petra Šéfová" };
const users = [jan, eva, boss];
const nudge = { text: "Send the SI today", dueDate: "2026-11-19", from: "Petra Šéfová" };

describe("nudgeNotice", () => {
  it("writes the to-do into the chat and tags the job's Handled By and Holiday Cover, as the chat writes a tag", () => {
    const notice = nudgeNotice({ personInCharge: "jan@firma.cz", holidayCover: "EVA@firma.cz" }, users, nudge, boss.id);
    expect(notice.message).toBe("To-do from Petra Šéfová: Send the SI today — due 19.11.2026\n@Jan Novák @eva@firma.cz");
    expect(notice.tagged).toEqual([jan, eva]);
    expect(notice.history).toBe("To-do for jan@firma.cz, eva@firma.cz: Send the SI today — due 19.11.2026");
  });

  it("tags a person once who is both, and reads an old value with a name after the e-mail", () => {
    const notice = nudgeNotice({ personInCharge: "jan@firma.cz — Jan Novák", holidayCover: "jan@firma.cz" }, users, nudge, boss.id);
    expect(notice.tagged).toEqual([jan]);
    expect(notice.history).toBe("To-do for jan@firma.cz: Send the SI today — due 19.11.2026");
  });

  it("does not tag the manager nudging: nobody is told what they just did themselves", () => {
    const notice = nudgeNotice({ personInCharge: "boss@firma.cz", holidayCover: "jan@firma.cz" }, users, nudge, boss.id);
    expect(notice.tagged).toEqual([jan]);
  });

  it("tags nobody who is no user of the company, and then writes no tag line (the service refuses such a nudge)", () => {
    const notice = nudgeNotice({ personInCharge: "left@firma.cz", holidayCover: "" }, users, nudge, boss.id);
    expect(notice.tagged).toEqual([]);
    expect(notice.message).toBe("To-do from Petra Šéfová: Send the SI today — due 19.11.2026");
    expect(notice.history).toBe("To-do for left@firma.cz: Send the SI today — due 19.11.2026");
  });

  it("names a manager whose name is not known", () => {
    expect(nudgeNotice({ personInCharge: "jan@firma.cz", holidayCover: "" }, users, { ...nudge, from: "" }, boss.id).message).toContain("To-do from a manager: ");
  });

  it("has the words of its refusals and its history field", () => {
    expect(NUDGE_NOBODY).toBe("Name somebody in Handled By first");
    expect(NUDGE_NOBODY_TO_TELL).toBe("Nobody on this job can be told: hand it over first");
    expect(NUDGE_FIELD).toBe("nudge");
  });
});
