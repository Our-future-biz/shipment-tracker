import { describe, expect, it } from "vitest";
import {
  actionReasonOk,
  canHandOverAll,
  cutoffName,
  handOverAllLabel,
  handOverAllNote,
  dismissalTitle,
  handOverChanging,
  handOverPreview,
  handOverProblem,
  handOverRequest,
  handOverResultText,
  handOverTarget,
  handledByJobsHref,
  handledByWarning,
  nextWorkingDay,
  nudgeProblem,
  nudgeToldText,
  type HandOverChoice,
  type HandOverJob,
} from "./managerActions";

const job = (over: Partial<HandOverJob> = {}): HandOverJob => ({ id: "s1", jobNumber: "CZ001", handledBy: "jan@firma.cz", holidayCover: "", ...over });
const choice = (over: Partial<HandOverChoice> = {}): HandOverChoice => ({ handledBy: "", cover: "leave", holidayCover: "", ...over });

describe("actionReasonOk", () => {
  it("asks for at least three characters, spaces not counted", () => {
    expect(actionReasonOk("ill")).toBe(true);
    expect(actionReasonOk("  ok  ")).toBe(false);
    expect(actionReasonOk("")).toBe(false);
  });
});

describe("handOverTarget", () => {
  it("leaves a field that was not chosen alone, and clears the cover only when asked", () => {
    expect(handOverTarget(choice())).toEqual({ handledBy: null, holidayCover: null });
    expect(handOverTarget(choice({ handledBy: " Eva@Firma.cz " }))).toEqual({ handledBy: "eva@firma.cz", holidayCover: null });
    expect(handOverTarget(choice({ cover: "clear", holidayCover: "eva@firma.cz" }))).toEqual({ handledBy: null, holidayCover: "" });
    expect(handOverTarget(choice({ cover: "set", holidayCover: "eva@firma.cz" }))).toEqual({ handledBy: null, holidayCover: "eva@firma.cz" });
    // "Set to" with nobody picked changes nothing (and is named as a problem).
    expect(handOverTarget(choice({ cover: "set" }))).toEqual({ handledBy: null, holidayCover: null });
  });
});

describe("handOverProblem", () => {
  it("wants a job, at most 200 of them, and at least one of the two fields", () => {
    expect(handOverProblem(choice({ handledBy: "eva@firma.cz" }), 0)).toBe("No job is chosen");
    expect(handOverProblem(choice({ handledBy: "eva@firma.cz" }), 201)).toBe("At most 200 jobs go in one hand-over (201 are chosen): choose fewer");
    expect(handOverProblem(choice(), 3)).toBe("Choose a new Handled By, a Holiday Cover, or both");
    expect(handOverProblem(choice({ cover: "set" }), 3)).toBe("Pick who covers, or leave the Holiday Cover as it is");
    expect(handOverProblem(choice({ handledBy: "eva@firma.cz" }), 200)).toBeNull();
    expect(handOverProblem(choice({ cover: "clear" }), 1)).toBeNull();
  });
});

describe("handOverPreview", () => {
  it("names what changes on each job, and nothing on one that is already so", () => {
    const rows = handOverPreview(
      [job(), job({ id: "s2", jobNumber: "CZ002", handledBy: "EVA@firma.cz — Eva Malá", holidayCover: "petr@firma.cz" })],
      { handledBy: "eva@firma.cz", holidayCover: "" },
    );
    expect(rows[0]).toMatchObject({ handledBy: { from: "jan@firma.cz", to: "eva@firma.cz" }, holidayCover: null });
    // An old value with a name after it is that person: not rewritten. The cover is cleared.
    expect(rows[1]).toMatchObject({ handledBy: null, holidayCover: { from: "petr@firma.cz", to: "" } });
    expect(handOverChanging(rows)).toBe(2);
    expect(handOverChanging(handOverPreview([job()], { handledBy: "jan@firma.cz", holidayCover: null }))).toBe(0);
  });
});

describe("handOverRequest", () => {
  it("leaves out a field that stays as it is, and sends \"\" to clear the cover", () => {
    expect(handOverRequest([job(), job({ id: "s2" })], { handledBy: "eva@firma.cz", holidayCover: null }, "  on holiday  ")).toEqual({
      shipmentIds: ["s1", "s2"],
      handledBy: "eva@firma.cz",
      reason: "on holiday",
    });
    expect(handOverRequest([job()], { handledBy: null, holidayCover: "" }, "back")).toEqual({ shipmentIds: ["s1"], holidayCover: "", reason: "back" });
  });
});

describe("handOverResultText", () => {
  it("says how many changed and how many were left", () => {
    expect(handOverResultText({ changed: 3, skipped: [] })).toBe("3 jobs handed over");
    expect(handOverResultText({ changed: 1, skipped: [{}] })).toBe("1 job handed over, 1 left as it was");
    expect(handOverResultText({ changed: 0, skipped: [{}, {}] })).toBe("No job was changed, 2 left as they were");
  });
});

describe("nextWorkingDay", () => {
  it("is tomorrow, or Monday after a Friday and over a weekend", () => {
    expect(nextWorkingDay("2026-11-18")).toBe("2026-11-19"); // Wed → Thu
    expect(nextWorkingDay("2026-11-20")).toBe("2026-11-23"); // Fri → Mon
    expect(nextWorkingDay("2026-11-21")).toBe("2026-11-23"); // Sat → Mon
    expect(nextWorkingDay("2026-12-31")).toBe("2027-01-01"); // holidays are not looked up
  });
});

describe("nudgeProblem", () => {
  const nudge = { text: "Send the SI", dueDate: "2026-11-19", handledBy: "jan@firma.cz" };
  it("wants somebody in Handled By, a text and a day from today on", () => {
    expect(nudgeProblem(nudge, "2026-11-18")).toBeNull();
    expect(nudgeProblem({ ...nudge, dueDate: "2026-11-18" }, "2026-11-18")).toBeNull();
    expect(nudgeProblem({ ...nudge, handledBy: " " }, "2026-11-18")).toBe("Name somebody in Handled By first");
    expect(nudgeProblem({ ...nudge, text: "  " }, "2026-11-18")).toBe("Say what has to be done");
    expect(nudgeProblem({ ...nudge, text: "x".repeat(301) }, "2026-11-18")).toBe("At most 300 characters");
    expect(nudgeProblem({ ...nudge, dueDate: "" }, "2026-11-18")).toBe("Say by when it has to be done");
    expect(nudgeProblem({ ...nudge, dueDate: "2026-11-17" }, "2026-11-18")).toBe("The due date has passed: choose today or a later day");
  });
});

describe("nudgeToldText", () => {
  it("names who was told", () => {
    expect(nudgeToldText(["jan@firma.cz", "eva@firma.cz"])).toBe("Told under the bell: jan@firma.cz, eva@firma.cz");
    expect(nudgeToldText(["jan@firma.cz"])).toBe("Told under the bell: jan@firma.cz");
  });
});

describe("cut-off names", () => {
  it("names the five cut-offs and leaves an unknown key as it is", () => {
    expect(cutoffName("closingDate")).toBe("Closing");
    expect(cutoffName("isfDeadline")).toBe("ISF");
    expect(cutoffName("other")).toBe("other");
    expect(dismissalTitle({ cutoff: "vgmClosing", cutoffDate: "2026-11-16" })).toBe("VGM 16.11.2026");
  });
});

describe("handledByWarning", () => {
  it("says how many active jobs the person handles, and that those stay URGENT - the covers in a sentence of their own", () => {
    expect(handledByWarning({ handledBy: 12, covers: 3 })).toBe(
      "12 active jobs name this person in Handled By: they stay URGENT on Shipments → Managers until handed over. " +
        '3 active jobs have this person as Holiday Cover: they will show "Holiday Cover is not a user" on Shipments → Managers until changed',
    );
    expect(handledByWarning({ handledBy: 1, covers: 0 })).toBe("1 active job names this person in Handled By: it stays URGENT on Shipments → Managers until handed over");
    expect(handledByWarning({ handledBy: 0, covers: 1 })).toBe('1 active job has this person as Holiday Cover: it will show "Holiday Cover is not a user" on Shipments → Managers until changed');
  });
  it("says plainly what happens to the jobs of a person who only covers - not URGENT, a signal of its own until the cover is changed (S16)", () => {
    const warning = handledByWarning({ handledBy: 0, covers: 2 });
    expect(warning).toBe('2 active jobs have this person as Holiday Cover: they will show "Holiday Cover is not a user" on Shipments → Managers until changed');
    expect(warning).not.toContain("URGENT");
    expect(warning).not.toContain("Handled By:");
  });
  it("says nothing when no job names them", () => {
    expect(handledByWarning({ handledBy: 0, covers: 0 })).toBeNull();
  });
  it("links to the jobs the person handles on Shipments → Managers - and nowhere when they handle none: that list would be empty", () => {
    expect(handledByJobsHref(" Jan+ops@Firma.cz ", { handledBy: 2 })).toBe("/shipments/managers?handledBy=jan%2Bops%40firma.cz");
    expect(handledByJobsHref("jan@firma.cz", { handledBy: 0 })).toBeNull();
  });
});

describe("handing over all of a person's jobs (X9)", () => {
  it("is offered on a person's Team row with an active job - never on the jobs nobody handles", () => {
    expect(canHandOverAll({ nobody: false, active: 3 })).toBe(true);
    expect(canHandOverAll({ nobody: true, active: 5 })).toBe(false);
    expect(canHandOverAll({ nobody: false, active: 0 })).toBe(false);
  });
  it("is labelled with how many active jobs there are", () => {
    expect(handOverAllLabel(12)).toBe("Hand over all 12 active jobs…");
    expect(handOverAllLabel(1)).toBe("Hand over the 1 active job…");
  });
  it("says whether every job is listed, or 200 of more - and that the quiet ones are among them", () => {
    const jobs = (n: number) => Array.from({ length: n }, (_, i) => i);
    expect(handOverAllNote({ jobs: jobs(3), total: 3 }, "jan@firma.cz", "")).toBe("All 3 active jobs with jan@firma.cz in Handled By, quiet ones too - not only those with a signal on the cards.");
    expect(handOverAllNote({ jobs: jobs(200), total: 240 }, "jan@firma.cz", "Sea · Import")).toBe(
      "200 of 240 active jobs with jan@firma.cz in Handled By (Sea · Import): at most 200 go in one hand-over. Hand over the rest the same way once these are done.",
    );
    expect(handOverAllNote({ jobs: jobs(1), total: 1 }, "jan@firma.cz", "")).toBe("All 1 active job with jan@firma.cz in Handled By, quiet ones too - not only those with a signal on the cards.");
  });
});
