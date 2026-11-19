import { describe, expect, it } from "vitest";
import {
  CUTOFF_KEYS,
  closingDatesDismissed,
  dismissable,
  dismissedLine,
  isCutoffKey,
  jobsWithMissedCutoff,
  jobsWithMissedCutoffOrLateCargo,
  takenBackLine,
  withoutDismissed,
} from "../lib/cutoffDismissals";
import { cutoffsOf, opsDay, type CutoffDue, type CutoffJob } from "../lib/managersCockpit";
import { dueOf, needsAttentionOf, type DueJob } from "../lib/needsAttention";

// A missed cut-off a manager dismissed: the one rule both pages drop it by. Wednesday 18 Nov 2026,
// 11:00 in Prague - URGENT is up to Thu 19, ATTENTION Fri 20 and Mon 23.
const NOW = new Date("2026-11-18T10:00:00Z");
const day = opsDay(NOW);

const job = (over: Partial<DueJob> = {}): DueJob => ({
  id: "j1",
  jobNumber: "CZFCL00000001",
  customerId: null,
  customer: "ACME s.r.o.",
  tradeDirection: "Export",
  freightMode: "Sea Freight",
  department: "Operation Department",
  status: "Booked [EXP]",
  cargoReadinessDate: null,
  pickupDate: null,
  estimatedDeparture: null,
  actualDeparture: null,
  estimatedArrival: null,
  actualArrival: null,
  actualDeliveryDate: null,
  etaWarehouse: null,
  warehouseReceivedDate: null,
  plannedDeliveryDate: null,
  closingDate: null,
  closingTime: "",
  vgmClosing: null,
  vgmClosingTime: "",
  vgm: "",
  siClosing: null,
  siClosingTime: "",
  shippingInstructions: "",
  ams: "",
  amsDeadline: null,
  amsDeadlineTime: "",
  isf: "",
  isfDeadline: null,
  isfDeadlineTime: "",
  ...over,
});
const due = (key: CutoffDue["key"], date: string, state: CutoffDue["state"]): CutoffDue => ({ key, date, time: "", days: 0, state });

describe("withoutDismissed", () => {
  const cutoffs = [due("closingDate", "2026-11-16", "missed"), due("vgmClosing", "2026-11-17", "missed"), due("siClosing", "2026-11-19", "urgent")];

  it("drops a missed cut-off dismissed for the date it has, and keeps the others", () => {
    expect(withoutDismissed(cutoffs, [{ cutoff: "closingDate", date: "2026-11-16" }]).map((c) => c.key)).toEqual(["vgmClosing", "siClosing"]);
    expect(withoutDismissed(cutoffs, [{ cutoff: "closingDate", date: "2026-11-16" }, { cutoff: "vgmClosing", date: "2026-11-17" }]).map((c) => c.key)).toEqual(["siClosing"]);
  });

  it("keeps a cut-off whose date changed since: a new date is a new cut-off", () => {
    expect(withoutDismissed(cutoffs, [{ cutoff: "closingDate", date: "2026-11-15" }])).toEqual(cutoffs);
  });

  it("drops only the miss: a cut-off due again on the dismissed date still shows", () => {
    const again = [due("siClosing", "2026-11-18", "urgent"), due("vgmClosing", "2026-11-20", "attention")];
    expect(withoutDismissed(again, [{ cutoff: "siClosing", date: "2026-11-18" }, { cutoff: "vgmClosing", date: "2026-11-20" }])).toEqual(again);
  });

  it("is told apart by cut-off: another cut-off's dismissal of the same day changes nothing", () => {
    expect(withoutDismissed([due("vgmClosing", "2026-11-16", "missed")], [{ cutoff: "siClosing", date: "2026-11-16" }])).toHaveLength(1);
  });

  it("treats nothing as dismissed when there are none, or they are not known", () => {
    for (const none of [[], undefined, null]) expect(withoutDismissed(cutoffs, none)).toEqual(cutoffs);
  });

  it("works on the shared rule's own answer", () => {
    const j: CutoffJob = job({ closingDate: "2026-11-16", closingTime: "14:00", siClosing: "2026-11-18", siClosingTime: "10:00", vgmClosing: "2026-11-19" });
    const all = cutoffsOf(j, day, false);
    expect(all.map((c) => `${c.key} ${c.state}`)).toEqual(["vgmClosing urgent", "siClosing missed", "closingDate missed"]);
    expect(withoutDismissed(all, [{ cutoff: "siClosing", date: "2026-11-18" }]).map((c) => c.key)).toEqual(["vgmClosing", "closingDate"]);
  });
});

describe("jobsWithMissedCutoff", () => {
  it("names the jobs with a missed or overdue cut-off - a missed Closing whatever the timeline will say - and no other", () => {
    const jobs = [
      job({ id: "missed-closing", closingDate: "2026-11-16" }),
      job({ id: "overdue-vgm", vgmClosing: "2026-11-17", vgm: "Pending" }),
      job({ id: "timed", siClosing: "2026-11-18", siClosingTime: "10:00" }),
      job({ id: "due", siClosing: "2026-11-18", siClosingTime: "16:00" }),
      job({ id: "ahead", closingDate: "2026-11-23" }),
      job({ id: "left", closingDate: "2026-11-16", actualDeparture: "2026-11-17" }),
      job({ id: "confirmed", vgmClosing: "2026-11-17", vgm: "Confirmed (Green)" }),
      job({ id: "plain", estimatedDeparture: "2026-11-18" }),
    ];
    expect(jobsWithMissedCutoff(jobs, day)).toEqual(["missed-closing", "overdue-vgm", "timed"]);
    expect(jobsWithMissedCutoff([], day)).toEqual([]);
  });
});

describe("jobsWithMissedCutoffOrLateCargo", () => {
  it("adds the jobs whose cargo is ready only after their Closing - also once the ETD passed and the Closing no longer counts", () => {
    const jobs = [
      job({ id: "missed-closing", closingDate: "2026-11-16", estimatedDeparture: "2026-11-20" }),
      // ETD 16.11.: a sea job's missed Closing counts up to the day before "ETD passed" (17.11.), no more on 18.11.
      job({ id: "late-cargo", closingDate: "2026-11-16", cargoReadinessDate: "2026-11-17", estimatedDeparture: "2026-11-16" }),
      job({ id: "in-time", closingDate: "2026-11-16", cargoReadinessDate: "2026-11-15", estimatedDeparture: "2026-11-16" }),
      job({ id: "left", closingDate: "2026-11-16", cargoReadinessDate: "2026-11-17", actualDeparture: "2026-11-17" }),
    ];
    expect(jobsWithMissedCutoff(jobs, day)).toEqual(["missed-closing"]);
    expect(jobsWithMissedCutoffOrLateCargo(jobs, day)).toEqual(["missed-closing", "late-cargo"]);
    expect(jobsWithMissedCutoffOrLateCargo([], day)).toEqual([]);
  });
});

describe("closingDatesDismissed", () => {
  it("is the dates of the job's dismissed Closing, none of its other cut-offs", () => {
    expect(closingDatesDismissed([{ cutoff: "closingDate", date: "2026-11-16" }, { cutoff: "vgmClosing", date: "2026-11-16" }, { cutoff: "closingDate", date: "2026-11-09" }])).toEqual(["2026-11-16", "2026-11-09"]);
    expect(closingDatesDismissed(undefined)).toEqual([]);
    expect(closingDatesDismissed(null)).toEqual([]);
  });
});

describe("dismissable", () => {
  const cutoffs = [due("closingDate", "2026-11-16", "missed"), due("siClosing", "2026-11-19", "urgent")];

  it("is a cut-off the shared rule calls missed right now, with the date it has", () => {
    expect(dismissable(cutoffs, "closingDate")).toEqual({ date: "2026-11-16" });
  });

  it("is not one that is only due, nor one the job does not have", () => {
    expect(dismissable(cutoffs, "siClosing")).toEqual({ refusal: "SI is not missed or overdue on this job right now: only a missed cut-off can be dismissed" });
    expect(dismissable(cutoffs, "amsDeadline")).toEqual({ refusal: "AMS is not missed or overdue on this job right now: only a missed cut-off can be dismissed" });
    expect(dismissable([], "closingDate")).toMatchObject({ refusal: expect.stringContaining("Closing is not missed") });
  });
});

describe("the keys and the history lines", () => {
  it("knows the five cut-offs of the shared rule and nothing else", () => {
    expect(CUTOFF_KEYS).toEqual(["closingDate", "vgmClosing", "siClosing", "amsDeadline", "isfDeadline"]);
    for (const key of CUTOFF_KEYS) expect(isCutoffKey(key)).toBe(true);
    for (const other of ["", "closing", "estimatedDeparture", "CLOSINGDATE"]) expect(isCutoffKey(other)).toBe(false);
  });

  it("writes the cut-off's name, its date and the reason; taking back says so", () => {
    expect(dismissedLine("closingDate", "2026-11-16", "went on the next vessel")).toBe("Closing 16.11.2026: went on the next vessel");
    expect(dismissedLine("vgmClosing", "2026-11-17", "carrier took it late")).toBe("VGM 17.11.2026: carrier took it late");
    expect(takenBackLine("isfDeadline", "2026-11-02")).toBe("taken back: ISF 02.11.2026");
  });
});

describe("Needs Attention with dismissals (lib/needsAttention)", () => {
  it("leaves a dismissed missed cut-off out of a job's dates, and the job off the card when nothing else is due", () => {
    const j = job({ closingDate: "2026-11-16", estimatedDeparture: "2026-11-19" });
    expect(dueOf(j, day, false).urgent.map((d) => d.field)).toEqual(["closingDate", "estimatedDeparture"]);
    expect(dueOf(j, day, false, [{ cutoff: "closingDate", date: "2026-11-16" }]).urgent.map((d) => d.field)).toEqual(["estimatedDeparture"]);

    const only = job({ id: "j2", siClosing: "2026-11-17" });
    const lists = needsAttentionOf([j, only], new Map(), day, new Map([["j2", [{ cutoff: "siClosing" as const, date: "2026-11-17" }]]]));
    expect(lists.within24h.map((i) => i.id)).toEqual(["j1"]);
    // Without the map nothing is dismissed.
    expect(needsAttentionOf([j, only], new Map(), day).within24h.map((i) => i.id)).toEqual(["j1", "j2"]);
  });
});
