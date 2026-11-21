import { describe, expect, it } from "vitest";
import { HAND_OVER_FIELD, HAND_OVER_MAX_IDS_SENT, HAND_OVER_MAX_JOBS, asShown, handOverChange, handOverLine, listTarget, stillAsDecided } from "../lib/handOver";

const job = { personInCharge: "jan@firma.cz", holidayCover: "" };

describe("listTarget (n25: the jobs a chosen hand-over would change)", () => {
  it("reads the choice as a hand-over reads it: Handled By left out or empty leaves it, a cover \"\" clears it", () => {
    expect(listTarget({ handledBy: " Eva@Firma.cz " })).toEqual({ handledBy: "eva@firma.cz", holidayCover: null });
    expect(listTarget({ handledBy: "", holidayCover: "" })).toEqual({ handledBy: null, holidayCover: "" });
    expect(listTarget({ holidayCover: "Petr@firma.cz — Petr" })).toEqual({ handledBy: null, holidayCover: "petr@firma.cz" });
  });

  it("is nothing when nothing is chosen: every job is listed", () => {
    expect(listTarget(undefined)).toBeNull();
    expect(listTarget({})).toBeNull();
    expect(listTarget({ handledBy: " " })).toBeNull();
  });
});

describe("handOverChange", () => {
  it("gives the job its new Handled By, its new Holiday Cover, or both", () => {
    expect(handOverChange(job, { handledBy: "eva@firma.cz", holidayCover: null })).toEqual({ personInCharge: "eva@firma.cz" });
    expect(handOverChange(job, { handledBy: null, holidayCover: "eva@firma.cz" })).toEqual({ holidayCover: "eva@firma.cz" });
    expect(handOverChange(job, { handledBy: "eva@firma.cz", holidayCover: "petr@firma.cz" })).toEqual({ personInCharge: "eva@firma.cz", holidayCover: "petr@firma.cz" });
  });

  it("clears a Holiday Cover with \"\", and leaves a field that is not named", () => {
    expect(handOverChange({ personInCharge: "jan@firma.cz", holidayCover: "eva@firma.cz" }, { handledBy: null, holidayCover: "" })).toEqual({ holidayCover: "" });
    expect(handOverChange({ personInCharge: "jan@firma.cz", holidayCover: "eva@firma.cz" }, { handledBy: "petr@firma.cz", holidayCover: null })).toEqual({ personInCharge: "petr@firma.cz" });
  });

  it("is nothing when the job is already so - by e-mail, in any case, with an old value's name after it", () => {
    expect(handOverChange(job, { handledBy: "jan@firma.cz", holidayCover: null })).toBeNull();
    expect(handOverChange(job, { handledBy: null, holidayCover: "" })).toBeNull();
    expect(handOverChange({ personInCharge: " Jan@Firma.cz — Jan Novák", holidayCover: "" }, { handledBy: "jan@firma.cz", holidayCover: "" })).toBeNull();
  });

  it("changes only what differs when two fields are named", () => {
    expect(handOverChange({ personInCharge: "eva@firma.cz", holidayCover: "" }, { handledBy: "eva@firma.cz", holidayCover: "petr@firma.cz" })).toEqual({ holidayCover: "petr@firma.cz" });
  });
});

describe("stillAsDecided", () => {
  it("holds while each field the change writes is as it was read - a field the change leaves alone may have moved", () => {
    const read = { personInCharge: "jan@firma.cz", holidayCover: "" };
    expect(stillAsDecided({ personInCharge: " jan@firma.cz ", holidayCover: "" }, read, { personInCharge: "eva@firma.cz" })).toBe(true);
    expect(stillAsDecided({ personInCharge: "jan@firma.cz", holidayCover: "petr@firma.cz" }, read, { personInCharge: "eva@firma.cz" })).toBe(true);
  });

  it("does not hold once somebody changed it meanwhile: handed over already, or to somebody else", () => {
    const read = { personInCharge: "jan@firma.cz", holidayCover: "" };
    expect(stillAsDecided({ personInCharge: "eva@firma.cz", holidayCover: "" }, read, { personInCharge: "eva@firma.cz" })).toBe(false);
    expect(stillAsDecided({ personInCharge: "petr@firma.cz", holidayCover: "" }, read, { personInCharge: "eva@firma.cz" })).toBe(false);
    expect(stillAsDecided({ personInCharge: "jan@firma.cz", holidayCover: "petr@firma.cz" }, read, { holidayCover: "eva@firma.cz" })).toBe(false);
  });
});

describe("asShown (mock test S20-123: the people the dialog's preview showed)", () => {
  const shown = { handledBy: "jan@firma.cz", holidayCover: "" };

  it("holds while each field the hand-over writes is as the preview showed it, by e-mail - a field it leaves alone may have moved", () => {
    expect(asShown({ personInCharge: "Jan@Firma.cz — Jan Novák", holidayCover: "" }, shown, { handledBy: "eva@firma.cz", holidayCover: null })).toBe(true);
    expect(asShown({ personInCharge: "jan@firma.cz", holidayCover: "petr@firma.cz" }, shown, { handledBy: "eva@firma.cz", holidayCover: null })).toBe(true);
    expect(asShown({ personInCharge: "petr@firma.cz", holidayCover: "" }, shown, { handledBy: null, holidayCover: "eva@firma.cz" })).toBe(true);
  });

  it("does not hold once a field it writes was changed after the preview: by hand, or by another hand-over", () => {
    expect(asShown({ personInCharge: "petr@firma.cz", holidayCover: "" }, shown, { handledBy: "eva@firma.cz", holidayCover: null })).toBe(false);
    expect(asShown({ personInCharge: "jan@firma.cz", holidayCover: "petr@firma.cz" }, shown, { handledBy: null, holidayCover: "" })).toBe(false);
  });

  it("is not checked when the page sent nothing (an older page)", () => {
    expect(asShown({ personInCharge: "petr@firma.cz", holidayCover: "x@firma.cz" }, undefined, { handledBy: "eva@firma.cz", holidayCover: "" })).toBe(true);
  });
});

describe("handOverLine", () => {
  it("reads <from> → <to>: <reason> for Handled By", () => {
    expect(handOverLine(job, { personInCharge: "eva@firma.cz" }, "Jan is ill")).toBe("jan@firma.cz → eva@firma.cz: Jan is ill");
    expect(handOverLine({ personInCharge: "", holidayCover: "" }, { personInCharge: "eva@firma.cz" }, "nobody had it")).toBe("nobody → eva@firma.cz: nobody had it");
  });

  it("names a Holiday Cover that changes, after Handled By when both do", () => {
    expect(handOverLine(job, { holidayCover: "eva@firma.cz" }, "holiday")).toBe("Holiday Cover nobody → eva@firma.cz: holiday");
    expect(handOverLine({ personInCharge: "jan@firma.cz", holidayCover: "eva@firma.cz" }, { holidayCover: "" }, "back from holiday")).toBe("Holiday Cover eva@firma.cz → nobody: back from holiday");
    expect(handOverLine(job, { personInCharge: "eva@firma.cz", holidayCover: "petr@firma.cz" }, "Jan left")).toBe("jan@firma.cz → eva@firma.cz; Holiday Cover nobody → petr@firma.cz: Jan left");
  });

  it("is kept under the field Shipments → Managers' audit line reads, for at most 200 jobs at once", () => {
    expect(HAND_OVER_FIELD).toBe("handOver");
    expect(HAND_OVER_MAX_JOBS).toBe(200);
    expect(HAND_OVER_MAX_IDS_SENT).toBe(1000);
  });
});
