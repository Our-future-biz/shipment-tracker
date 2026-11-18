import { describe, expect, it } from "vitest";
import { HAND_OVER_FIELD, HAND_OVER_MAX_IDS_SENT, HAND_OVER_MAX_JOBS, handOverChange, handOverLine } from "../lib/handOver";

const job = { personInCharge: "jan@firma.cz", holidayCover: "" };

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
