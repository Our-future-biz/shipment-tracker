import { describe, expect, it } from "vitest";
import {
  CLAIM_LIMIT_MODES,
  GENERAL_PRACTICE_NOTE,
  confirmedText,
  daysText,
  draftOfSettings,
  isGeneralPractice,
  limitsChanged,
  limitsProblem,
  monthsText,
  saveMeaning,
  saveRequest,
  savedText,
  type ClaimTimeLimitsSettings,
} from "./claimTimeLimits";

const GENERAL = {
  sea: { noticeDays: 3, suitMonths: 12 },
  air: { noticeDays: 14, suitMonths: 24 },
  rail: { noticeDays: 7, suitMonths: 12 },
  road: { noticeDays: 7, suitMonths: 12 },
};

const settings = (over: Partial<ClaimTimeLimitsSettings> = {}): ClaimTimeLimitsSettings => ({
  enabled: false,
  limits: GENERAL,
  generalPractice: GENERAL,
  saved: false,
  confirmedBy: "",
  confirmedAt: null,
  updatedBy: "",
  updatedAt: null,
  ...over,
});

describe("claim time limits: the note and the modes", () => {
  it("says the numbers are general practice, to be confirmed before switching them on", () => {
    expect(GENERAL_PRACTICE_NOTE).toBe(
      "These are general practice (sea 3 days, road and rail 7, air 14 to notify the carrier; suit within 1 year, air 2 years). Confirm them with your insurer and your forwarding conditions before switching them on.",
    );
    expect(CLAIM_LIMIT_MODES.map((m) => m.key)).toEqual(["sea", "air", "rail", "road"]);
  });

  it("words days and suit periods", () => {
    expect(daysText(1)).toBe("1 day");
    expect(daysText(14)).toBe("14 days");
    expect(monthsText(12)).toBe("1 year");
    expect(monthsText(24)).toBe("2 years");
    expect(monthsText(18)).toBe("18 months");
    expect(monthsText(1)).toBe("1 month");
  });
});

describe("claim time limits: the form", () => {
  it("is filled with what is kept, as a copy", () => {
    const kept = settings();
    const draft = draftOfSettings(kept);
    expect(draft).toEqual({ enabled: false, limits: GENERAL });
    draft.limits.sea.noticeDays = 5;
    expect(kept.limits.sea.noticeDays).toBe(3);
  });

  it("wants whole numbers in range, in the server's words", () => {
    const draft = draftOfSettings(settings());
    expect(limitsProblem(draft)).toBeNull();
    expect(limitsProblem({ ...draft, limits: { ...draft.limits, air: { noticeDays: null, suitMonths: 24 } } })).toBe("The notice days (air) must be a whole number from 1 to 365");
    expect(limitsProblem({ ...draft, limits: { ...draft.limits, sea: { noticeDays: 366, suitMonths: 12 } } })).toBe("The notice days (sea) must be a whole number from 1 to 365");
    expect(limitsProblem({ ...draft, limits: { ...draft.limits, road: { noticeDays: 7, suitMonths: 0 } } })).toBe("The suit months (road) must be a whole number from 1 to 120");
    expect(limitsProblem({ ...draft, limits: { ...draft.limits, rail: { noticeDays: 7, suitMonths: 1.5 } } })).toBe("The suit months (rail) must be a whole number from 1 to 120");
  });

  it("sends all four modes with the switch, on or off", () => {
    const draft = { ...draftOfSettings(settings()), enabled: true };
    expect(saveRequest(draft)).toEqual({ enabled: true, ...GENERAL });
    expect(saveRequest({ ...draft, enabled: false })).toEqual({ enabled: false, ...GENERAL });
  });

  it("sees a change of the switch or of any number", () => {
    const kept = settings();
    const draft = draftOfSettings(kept);
    expect(limitsChanged(draft, kept)).toBe(false);
    expect(limitsChanged({ ...draft, enabled: true }, kept)).toBe(true);
    expect(limitsChanged({ ...draft, limits: { ...draft.limits, road: { noticeDays: 8, suitMonths: 12 } } }, kept)).toBe(true);
  });

  it("tells a mode left at the general practice from one changed", () => {
    const draft = draftOfSettings(settings());
    expect(isGeneralPractice(draft, GENERAL, "sea")).toBe(true);
    expect(isGeneralPractice({ ...draft, limits: { ...draft.limits, sea: { noticeDays: 5, suitMonths: 12 } } }, GENERAL, "sea")).toBe(false);
  });
});

describe("claim time limits: who confirmed and saved them", () => {
  it("says who confirmed them only while they are on", () => {
    expect(confirmedText(settings({ enabled: true, confirmedBy: "jana@cto.cz", confirmedAt: "2026-11-19T13:05:00Z" }))).toBe("Confirmed by jana@cto.cz on 19.11.2026 14:05");
    expect(confirmedText(settings({ enabled: true, confirmedBy: "jana@cto.cz", confirmedAt: null }))).toBe("Confirmed by jana@cto.cz");
    expect(confirmedText(settings({ enabled: false, confirmedBy: "jana@cto.cz", confirmedAt: "2026-11-19T13:05:00Z" }))).toBe("");
  });

  it("says who saved them last, or that the general practice is shown", () => {
    expect(savedText(settings())).toBe("Never saved: the numbers shown are the general practice.");
    expect(savedText(settings({ saved: true, updatedBy: "petr@cto.cz", updatedAt: "2026-07-01T08:00:00Z" }))).toBe("Last saved by petr@cto.cz on 01.07.2026 10:00");
  });

  it("says beside Save what saving means", () => {
    const draft = draftOfSettings(settings());
    expect(saveMeaning({ ...draft, enabled: true }, { enabled: false })).toBe("Saving with the switch On confirms these numbers in your name.");
    expect(saveMeaning(draft, { enabled: true })).toContain("clears the confirmation");
    expect(saveMeaning(draft, { enabled: false })).toContain("nothing is said of deadlines");
  });
});
