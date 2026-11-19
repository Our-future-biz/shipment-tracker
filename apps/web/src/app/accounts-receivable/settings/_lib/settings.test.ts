import { describe, expect, it } from "vitest";
import { formOf, isChanged, settingsInput, settingsProblem, skippedText, type SettingsForm } from "./settings";

const form = (over: Partial<SettingsForm> = {}): SettingsForm => ({ autoReminders: false, reminder1Days: "7", reminder2Days: "21", replyTo: "", ...over });

describe("settingsProblem", () => {
  it("takes reminder 2 after reminder 1, both within a year, and a reply-to e-mail or none", () => {
    expect(settingsProblem(form())).toBe("");
    expect(settingsProblem(form({ replyTo: " finance@cto.cz " }))).toBe("");
    expect(settingsProblem(form({ reminder1Days: "0" }))).toBe("Reminder 1 is sent 1 to 365 days after the due day");
    expect(settingsProblem(form({ reminder1Days: "7.5" }))).toBe("Reminder 1 is sent 1 to 365 days after the due day");
    expect(settingsProblem(form({ reminder1Days: "" }))).toBe("Reminder 1 is sent 1 to 365 days after the due day");
    expect(settingsProblem(form({ reminder2Days: "7" }))).toBe("Reminder 2 is sent after reminder 1, at most 365 days after the due day");
    expect(settingsProblem(form({ reminder2Days: "366" }))).toBe("Reminder 2 is sent after reminder 1, at most 365 days after the due day");
    expect(settingsProblem(form({ replyTo: "finance" }))).toBe("The reply-to address must be an e-mail (or left empty)");
  });
});

describe("the form", () => {
  it("sends numbers and a trimmed reply-to", () => {
    expect(settingsInput(form({ autoReminders: true, reminder1Days: " 10 ", replyTo: " a@b.cz " }))).toEqual({ autoReminders: true, reminder1Days: 10, reminder2Days: 21, replyTo: "a@b.cz" });
  });
  it("knows when it differs from what is saved", () => {
    const saved = formOf({ autoReminders: false, reminder1Days: 7, reminder2Days: 21, replyTo: "" });
    expect(isChanged(form(), saved)).toBe(false);
    expect(isChanged(form({ autoReminders: true }), saved)).toBe(true);
    expect(isChanged(form({ reminder2Days: "30" }), saved)).toBe(true);
    expect(isChanged(form({ replyTo: "  " }), saved)).toBe(false);
  });
});

describe("skippedText (m5)", () => {
  it("says the last day the run skipped the reminders, and since when no bank statement was read", () => {
    expect(skippedText({ on: "2026-11-18", since: "2026-11-13" })).toBe("Skipped on 18.11.2026: no bank statement read since 13.11.2026");
    expect(skippedText({ on: "2026-11-18", since: null })).toBe("Skipped on 18.11.2026: no bank statement read since the previous working day");
    expect(skippedText(null)).toBeNull();
    expect(skippedText(undefined)).toBeNull();
  });
});
