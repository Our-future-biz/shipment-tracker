import { describe, expect, it } from "vitest";
import { COCKPIT_LIST_LIMIT } from "../lib/cockpitThresholds";
import {
  buildOpsCockpit,
  customsUrgency,
  cutoffSignals,
  cutoffsOf,
  flagSignals,
  handledByFilter,
  handledBySignals,
  inDirection,
  inMode,
  isHandledBy,
  isUnbilledArrival,
  type OpsCockpitInput,
  type OpsCockpitJob,
} from "../lib/managersCockpit";
import type { AttentionFacts } from "../lib/trackingAttention";
import { freightKindOf } from "../lib/trackingEvents";

// Wednesday 18 Nov 2026, 11:00 in Prague.
const NOW = new Date("2026-11-18T10:00:00Z");
const TODAY = "2026-11-18";

let seq = 0;
const job = (over: Partial<OpsCockpitJob> = {}): OpsCockpitJob => {
  seq += 1;
  return {
    id: `id-${seq}`,
    jobNumber: `CZFCL${String(seq).padStart(8, "0")}`,
    customer: "ACME s.r.o.",
    tradeDirection: "Import",
    freightMode: "Sea Freight",
    department: "Operation Department",
    status: "Booked [IMP]",
    estimatedDeparture: null,
    actualDeparture: null,
    estimatedArrival: null,
    actualArrival: null,
    etaWarehouse: null,
    warehouseReceivedDate: null,
    plannedDeliveryDate: null,
    actualDeliveryDate: null,
    personInCharge: "jan@firma.cz",
    holidayCover: "",
    closingDate: null,
    vgmClosing: null,
    vgm: "Pending (Red)",
    siClosing: null,
    shippingInstructions: "",
    ams: "",
    amsDeadline: null,
    isf: "",
    isfDeadline: null,
    customsPriority: "Standard",
    customsStatus: "",
    customsDeadline: "",
    bookingConfirmation: "Received",
    claim: "No",
    ...over,
  };
};
const USERS = new Set(["jan@firma.cz", "eva@firma.cz"]);
const cockpit = (jobs: OpsCockpitJob[], over: Partial<OpsCockpitInput> = {}) =>
  buildOpsCockpit({ jobs, facts: new Map(), movedIds: new Set(), userEmails: USERS, capped: false, mode: "all", direction: "all", handledBy: null, now: NOW, ...over });
const due = (over: Partial<OpsCockpitJob>, today = TODAY) => cutoffsOf(job(over), today).map((c) => `${c.key} ${c.days}`);
const tagsOf = (over: Partial<OpsCockpitJob>) => cutoffSignals(cutoffsOf(job(over), TODAY)).map((s) => `${s.urgent ? "URGENT" : "attention"} ${s.rank} ${s.text}`);

describe("the filters", () => {
  it("counts a job by how it travels, as freightKindOf reads it - a job with no Freight Mode is a sea job", () => {
    const jobs = [
      job({ freightMode: "Sea Freight" }),
      job({ freightMode: "" }),
      job({ freightMode: " air freight" }),
      job({ freightMode: "Rail Freight" }),
      job({ freightMode: "Road Freight" }),
      job({ freightMode: "Sea Freight", tradeDirection: "Domestic" }),
      job({ freightMode: "Air Freight", department: "Road Department" }),
    ];
    for (const mode of ["sea", "air", "rail", "road"] as const) {
      expect(jobs.filter((j) => inMode(j, mode))).toEqual(jobs.filter((j) => freightKindOf(j) === mode));
    }
    expect(jobs.map((j) => (["sea", "air", "rail", "road"] as const).find((m) => inMode(j, m)))).toEqual(["sea", "sea", "air", "rail", "road", "road", "road"]);
    expect(jobs.every((j) => inMode(j, "all"))).toBe(true);
  });

  it("counts a job by its Trade Direction, however it was written", () => {
    expect(inDirection(job({ tradeDirection: " IMPORT " }), "import")).toBe(true);
    expect(inDirection(job({ tradeDirection: "Export" }), "import")).toBe(false);
    expect(inDirection(job({ tradeDirection: "Domestic" }), "domestic")).toBe(true);
    expect(inDirection(job({ tradeDirection: "" }), "all")).toBe(true);
    expect(inDirection(job({ tradeDirection: "" }), "export")).toBe(false);
  });

  it("compares Handled By by e-mail, trimmed and in any case; \"nobody\" is the jobs with nobody", () => {
    expect(handledByFilter(undefined)).toBeNull();
    expect(handledByFilter("  ")).toBeNull();
    expect(handledByFilter(" Jan@Firma.cz ")).toBe("jan@firma.cz");
    expect(handledByFilter("Nobody")).toBe("nobody");
    expect(isHandledBy(job({ personInCharge: " JAN@firma.cz " }), "jan@firma.cz")).toBe(true);
    // An old value carries a name after the e-mail.
    expect(isHandledBy(job({ personInCharge: "jan@firma.cz — Jan Novák" }), "jan@firma.cz")).toBe(true);
    expect(isHandledBy(job({ personInCharge: "eva@firma.cz" }), "jan@firma.cz")).toBe(false);
    expect(isHandledBy(job({ personInCharge: "  " }), "nobody")).toBe(true);
    expect(isHandledBy(job({ personInCharge: "jan@firma.cz" }), "nobody")).toBe(false);
    expect(isHandledBy(job({ personInCharge: "" }), null)).toBe(true);
  });
});

// The rules below are the list's DEADLINE_DEFS (repositories/shipment.repository), written from
// its comment:
//   VGM / SI   by their closing date, unless Confirmed (VGM also: Not Applicable);
//   AMS / ISF  when Pending, by their deadline; without one, 4 days before departure;
//   they stay due after their date has passed until someone confirms them or the shipment departs;
//   a plain date (the closing date) counts while it is still ahead.
describe("the cut-offs, as the list's deadlines read them", () => {
  it("has none without dates", () => {
    expect(due({})).toEqual([]);
  });

  it("VGM: by its closing date, unless Confirmed or Not Applicable - a status is decorated free text", () => {
    expect(due({ vgmClosing: "2026-11-19", vgm: "Pending (Red)" })).toEqual(["vgmClosing 1"]);
    expect(due({ vgmClosing: "2026-11-19", vgm: "" })).toEqual(["vgmClosing 1"]);
    expect(due({ vgmClosing: "2026-11-19", vgm: "Confirmed (Green)" })).toEqual([]);
    expect(due({ vgmClosing: "2026-11-19", vgm: "CONFIRMED" })).toEqual([]);
    expect(due({ vgmClosing: "2026-11-19", vgm: "Not Applicable" })).toEqual([]);
    expect(due({ vgmClosing: null, vgm: "Pending (Red)" })).toEqual([]);
  });

  it("SI: by its closing date, unless Confirmed - Not Applicable does not close it", () => {
    expect(due({ siClosing: "2026-11-18", shippingInstructions: "Pending" })).toEqual(["siClosing 0"]);
    expect(due({ siClosing: "2026-11-18", shippingInstructions: "Not Applicable" })).toEqual(["siClosing 0"]);
    expect(due({ siClosing: "2026-11-18", shippingInstructions: "Confirmed (Green)" })).toEqual([]);
  });

  it("AMS and ISF: only when Pending, by their deadline; without one, 4 days before the ETD", () => {
    for (const [status, deadline, key] of [["ams", "amsDeadline", "amsDeadline"], ["isf", "isfDeadline", "isfDeadline"]] as const) {
      expect(due({ [status]: "Pending (Red)", [deadline]: "2026-11-20" })).toEqual([`${key} 2`]);
      expect(due({ [status]: "pending", [deadline]: null, estimatedDeparture: "2026-11-23" })).toEqual([`${key} 1`]);
      // Its own deadline wins over the 4 days before the ETD.
      expect(due({ [status]: "Pending", [deadline]: "2026-11-21", estimatedDeparture: "2026-11-23" })).toEqual([`${key} 3`]);
      expect(due({ [status]: "Pending", [deadline]: null, estimatedDeparture: null })).toEqual([]);
      expect(due({ [status]: "", [deadline]: "2026-11-20" })).toEqual([]);
      expect(due({ [status]: "Filed", [deadline]: "2026-11-20" })).toEqual([]);
      expect(due({ [status]: "Not Applicable", [deadline]: "2026-11-20" })).toEqual([]);
    }
  });

  it("a filing stays due after its date has passed until the vessel sails: no ETD, or an ETD of today or later", () => {
    const overdue = { vgmClosing: "2026-11-16", siClosing: "2026-11-17", shippingInstructions: "Pending", ams: "Pending", amsDeadline: "2026-11-15", isf: "Pending", isfDeadline: "2026-11-10" };
    const all = ["vgmClosing -2", "siClosing -1", "amsDeadline -3", "isfDeadline -8"];
    expect(due({ ...overdue, estimatedDeparture: null })).toEqual(all);
    expect(due({ ...overdue, estimatedDeparture: "2026-11-18" })).toEqual(all);
    expect(due({ ...overdue, estimatedDeparture: "2026-11-25" })).toEqual(all);
    // Sailed yesterday: nothing can be filed any more.
    expect(due({ ...overdue, estimatedDeparture: "2026-11-17" })).toEqual([]);
    // Confirmed since: gone, sailed or not.
    expect(due({ ...overdue, vgm: "Confirmed (Green)", shippingInstructions: "Confirmed", ams: "Filed", isf: "Filed" })).toEqual([]);
  });

  it("an AMS without a deadline is overdue by the 4 days before an ETD still ahead, and gone once that ETD passed", () => {
    expect(due({ ams: "Pending", estimatedDeparture: "2026-11-20" })).toEqual(["amsDeadline -2"]);
    expect(due({ ams: "Pending", estimatedDeparture: "2026-11-17" })).toEqual([]);
  });

  it("a filing still ahead counts even on a job whose ETD has passed", () => {
    expect(due({ vgmClosing: "2026-11-19", estimatedDeparture: "2026-11-10" })).toEqual(["vgmClosing 1"]);
  });

  it("Closing: the cargo closing date as it is, only while it is still ahead", () => {
    expect(due({ closingDate: "2026-11-18" })).toEqual(["closingDate 0"]);
    expect(due({ closingDate: "2026-11-19" })).toEqual(["closingDate 1"]);
    expect(due({ closingDate: "2026-11-17" })).toEqual([]);
    expect(due({ closingDate: "2026-11-17", estimatedDeparture: null })).toEqual([]);
  });

  it("is judged on the day it is handed, across a month's end", () => {
    expect(due({ vgmClosing: "2026-12-01" }, "2026-11-30")).toEqual(["vgmClosing 1"]);
    expect(due({ closingDate: "2026-11-30" }, "2026-12-01")).toEqual([]);
  });
});

describe("the cut-off signals", () => {
  it("a filing due today or tomorrow, or overdue, is URGENT", () => {
    expect(tagsOf({ vgmClosing: "2026-11-18" })).toEqual(["URGENT 4 VGM closing today"]);
    expect(tagsOf({ vgmClosing: "2026-11-19" })).toEqual(["URGENT 4 VGM closing tomorrow"]);
    expect(tagsOf({ vgmClosing: "2026-11-16" })).toEqual(["URGENT 4 VGM overdue 2 days"]);
    expect(tagsOf({ siClosing: "2026-11-17", shippingInstructions: "Pending" })).toEqual(["URGENT 4 SI overdue 1 day"]);
    expect(tagsOf({ ams: "Pending", amsDeadline: "2026-11-19" })).toEqual(["URGENT 4 AMS deadline tomorrow"]);
    expect(tagsOf({ isf: "Pending", isfDeadline: "2026-11-18" })).toEqual(["URGENT 4 ISF deadline today"]);
    expect(tagsOf({ isf: "Pending", estimatedDeparture: "2026-11-19" })).toEqual(["URGENT 4 ISF overdue 3 days"]);
  });

  it("the closing date today or tomorrow is URGENT, after the filings", () => {
    expect(tagsOf({ closingDate: "2026-11-18" })).toEqual(["URGENT 5 Closing today"]);
    expect(tagsOf({ closingDate: "2026-11-19" })).toEqual(["URGENT 5 Closing tomorrow"]);
  });

  it("a cut-off 2 or 3 days out is ATTENTION, further out nothing yet", () => {
    expect(tagsOf({ siClosing: "2026-11-20" })).toEqual(["attention 20 SI closing in 2 days"]);
    expect(tagsOf({ vgmClosing: "2026-11-21" })).toEqual(["attention 20 VGM closing in 3 days"]);
    expect(tagsOf({ ams: "Pending", amsDeadline: "2026-11-20" })).toEqual(["attention 20 AMS deadline in 2 days"]);
    expect(tagsOf({ isf: "Pending", estimatedDeparture: "2026-11-25" })).toEqual(["attention 20 ISF deadline in 3 days"]);
    expect(tagsOf({ closingDate: "2026-11-21" })).toEqual(["attention 20 Closing in 3 days"]);
    expect(tagsOf({ closingDate: "2026-11-22", vgmClosing: "2026-11-22", siClosing: "2026-12-01" })).toEqual([]);
  });

  it("every cut-off of a job is a signal of its own, worked on in the job's details", () => {
    const signals = cutoffSignals(cutoffsOf(job({ closingDate: "2026-11-19", vgmClosing: "2026-11-18", siClosing: "2026-11-20" }), TODAY));
    expect(signals.map((s) => s.text)).toEqual(["VGM closing today", "SI closing in 2 days", "Closing tomorrow"]);
    expect(signals.every((s) => s.area === "details")).toBe(true);
  });
});

// The Customs page's urgent filter (CUSTOMS_PREDICATES.urgent): an Urgent shipment whose deadline
// (a Prague wall time, "YYYY-MM-DD HH:mm") falls within the next 24 hours or has passed, and that
// customs has not released yet. A malformed deadline is skipped.
describe("customs urgent", () => {
  const urgentJob = (customsDeadline: string, over: Partial<OpsCockpitJob> = {}) => job({ customsPriority: "Urgent", customsStatus: "Documents Pending", customsDeadline, ...over });

  it("is an Urgent job whose deadline is within the next 24 hours of Prague's clock, or passed", () => {
    expect(customsUrgency(urgentJob("2026-11-19 10:59"), NOW)).toEqual({ day: "2026-11-19", time: "10:59", passed: false });
    // 24 hours from 11:00 in Prague, to the minute: not yet.
    expect(customsUrgency(urgentJob("2026-11-19 11:00"), NOW)).toBeNull();
    expect(customsUrgency(urgentJob("2026-11-25 08:00"), NOW)).toBeNull();
    expect(customsUrgency(urgentJob("2026-11-18 11:30"), NOW)).toEqual({ day: "2026-11-18", time: "11:30", passed: false });
    expect(customsUrgency(urgentJob("2026-11-18 10:59"), NOW)).toEqual({ day: "2026-11-18", time: "10:59", passed: true });
    expect(customsUrgency(urgentJob("2026-10-01 09:00"), NOW)).toEqual({ day: "2026-10-01", time: "09:00", passed: true });
  });

  it("reads the deadline on Prague's clock in summer too, whatever zone the server is in", () => {
    // 10:00 UTC is 12:00 in Prague in July.
    const summer = new Date("2026-07-01T10:00:00Z");
    expect(customsUrgency(urgentJob("2026-07-02 11:59"), summer)).toMatchObject({ passed: false });
    expect(customsUrgency(urgentJob("2026-07-02 12:00"), summer)).toBeNull();
    expect(customsUrgency(urgentJob("2026-07-01 11:59"), summer)).toMatchObject({ passed: true });
    // 23:30 UTC on the 17th is already the 18th in Prague.
    expect(customsUrgency(urgentJob("2026-11-18 00:15"), new Date("2026-11-17T23:30:00Z"))).toMatchObject({ passed: true });
  });

  it("is not a Standard job, nor one customs has released", () => {
    expect(customsUrgency(urgentJob("2026-11-18 08:00", { customsPriority: "Standard" }), NOW)).toBeNull();
    expect(customsUrgency(urgentJob("2026-11-18 08:00", { customsStatus: "Customs Cleared/Released" }), NOW)).toBeNull();
    expect(customsUrgency(urgentJob("2026-11-18 08:00", { customsStatus: "" }), NOW)).not.toBeNull();
  });

  it("skips a deadline that is no date and time", () => {
    for (const deadline of ["", "2026-11-18", "18.11.2026 08:00", "2026-11-18T08:00", "2026-13-45 08:00", "soon"]) {
      expect(customsUrgency(urgentJob(deadline), NOW)).toBeNull();
    }
    // The right shape, but no real day or time: JavaScript would roll each over into a day that has passed.
    for (const deadline of ["2026-02-30 08:00", "2026-11-31 09:00", "2026-11-18 24:00", "2026-11-18 08:60", "2026-11-17 25:00"]) {
      expect(customsUrgency(urgentJob(deadline), NOW)).toBeNull();
    }
    // The last minute of a real day still counts.
    expect(customsUrgency(urgentJob("2026-11-17 23:59"), NOW)).toEqual({ day: "2026-11-17", time: "23:59", passed: true });
  });
});

// The Invoicing page's "unbilled-arrivals" (INVOICING_PREDICATES): the date a job is taxed by has
// passed - the delivery of a Domestic or Road Department job, an export's ATD, otherwise the ATA -
// and operations haven't released it yet (its status does not start with "bill").
describe("arrived, not released for billing - the list's rule", () => {
  it("goes by the ATA, an export by its ATD, a Domestic or Road Department job by its delivery", () => {
    expect(isUnbilledArrival(job({ actualArrival: "2026-11-17" }))).toBe(true);
    expect(isUnbilledArrival(job({ actualDeparture: "2026-11-17" }))).toBe(false);
    expect(isUnbilledArrival(job({ tradeDirection: "EXPORT", actualDeparture: "2026-11-17" }))).toBe(true);
    expect(isUnbilledArrival(job({ tradeDirection: "Export", actualArrival: "2026-11-17" }))).toBe(false);
    expect(isUnbilledArrival(job({ tradeDirection: "Domestic", actualDeliveryDate: "2026-11-17" }))).toBe(true);
    expect(isUnbilledArrival(job({ tradeDirection: "Domestic", actualArrival: "2026-11-17", actualDeparture: "2026-11-16" }))).toBe(false);
    expect(isUnbilledArrival(job({ department: "road department", actualDeliveryDate: "2026-11-17" }))).toBe(true);
    expect(isUnbilledArrival(job({ tradeDirection: "Export", department: "Road Department", actualDeparture: "2026-11-17" }))).toBe(false);
    expect(isUnbilledArrival(job())).toBe(false);
  });

  it("is over once the status starts with \"bill\", in any case", () => {
    for (const status of ["Billing [IMP]", "Billed", "BILLING [EXP]"]) expect(isUnbilledArrival(job({ actualArrival: "2026-11-17", status }))).toBe(false);
    expect(isUnbilledArrival(job({ actualArrival: "2026-11-17", status: "Not billed yet" }))).toBe(true);
    expect(isUnbilledArrival(job({ actualArrival: "2026-11-17", status: "" }))).toBe(true);
  });
});

describe("the Handled By signals", () => {
  it("nobody in Handled By is URGENT, first of all", () => {
    expect(handledBySignals({ personInCharge: "  " }, USERS)).toEqual([{ rank: 10, text: "Nobody in Handled By", urgent: true, area: "details" }]);
    expect(handledBySignals({ personInCharge: "" }, null)).toMatchObject([{ text: "Nobody in Handled By" }]);
  });

  it("somebody who is not a user of the company is URGENT, named by the e-mail", () => {
    expect(handledBySignals({ personInCharge: " Left@Firma.cz — Old Name" }, USERS)).toEqual([{ rank: 11, text: "Handled By is not a user: left@firma.cz", urgent: true, area: "details" }]);
    expect(handledBySignals({ personInCharge: "JAN@firma.cz" }, USERS)).toEqual([]);
  });

  it("says nothing of who is a user when the users are not known", () => {
    expect(handledBySignals({ personInCharge: "left@firma.cz" }, null)).toEqual([]);
  });
});

describe("Needs Attention's flags as signals", () => {
  it("keeps each flag's words, severity and desk; the urgent ones rank 6 to 9, the rest from 21", () => {
    const flag = (kind: string, severity: "urgent" | "attention", area: "tracking" | "finance", detail = "d") => ({ kind, severity, area, label: kind, detail }) as Parameters<typeof flagSignals>[0][number];
    const signals = flagSignals([
      flag("to_confirm", "urgent", "tracking"),
      flag("eta_passed", "urgent", "tracking"),
      flag("etd_passed", "urgent", "tracking"),
      flag("free_time", "urgent", "tracking"),
      flag("tax_date", "urgent", "finance"),
      flag("not_told", "attention", "tracking"),
      flag("no_onward", "attention", "tracking"),
      flag("no_event", "attention", "tracking"),
      flag("free_time", "attention", "tracking"),
      flag("tax_date", "attention", "finance"),
      flag("not_released", "attention", "finance"),
      flag("delivered_not_billed", "attention", "finance", ""),
    ]);
    expect(signals.map((s) => `${s.urgent ? "URGENT" : "attention"} ${s.rank} ${s.area} ${s.text}`)).toEqual([
      "URGENT 6 tracking to_confirm · d",
      "URGENT 7 tracking eta_passed · d",
      "URGENT 7 tracking etd_passed · d",
      "URGENT 8 tracking free_time · d",
      "URGENT 9 finance tax_date · d",
      "attention 21 tracking not_told · d",
      "attention 22 tracking no_onward · d",
      "attention 23 tracking no_event · d",
      "attention 24 tracking free_time · d",
      "attention 25 finance tax_date · d",
      "attention 26 finance not_released · d",
      // No detail, no dot.
      "attention 27 finance delivered_not_billed",
    ]);
  });
});

describe("the cockpit", () => {
  it("is empty for no jobs, and says when and for which day it was worked out", () => {
    expect(cockpit([])).toEqual({
      asOf: "2026-11-18T10:00:00.000Z",
      today: TODAY,
      mode: "all",
      direction: "all",
      handledBy: null,
      tiles: { active: 0, cutoffsDue: 0, noHandledBy: 0, handledByNotUser: 0, bookingPending: 0, etdEtaMoved: 0, freeTime: 0, customsUrgent: 0, notReleased: 0, openClaims: 0 },
      urgent: { total: 0, rows: [] },
      attention: { total: 0, rows: [] },
      people: [],
      capped: false,
    });
  });

  it("judges by the Prague day of `now`, not the server's", () => {
    // 23:30 UTC on the 17th: the 18th in Prague, so a closing date of the 19th is tomorrow.
    const c = cockpit([job({ closingDate: "2026-11-19" })], { now: new Date("2026-11-17T23:30:00Z") });
    expect(c.today).toBe("2026-11-18");
    expect(c.urgent.rows[0]!.tags).toEqual([{ text: "Closing tomorrow", urgent: true }]);
  });

  it("lists a job with nothing to look at on no card, and still counts it", () => {
    const c = cockpit([job()]);
    expect(c.tiles.active).toBe(1);
    expect(c.urgent.total + c.attention.total).toBe(0);
  });

  it("shows a job once, with all its tags: the urgent first by rank, then the rest - and opens it where the first is worked on", () => {
    const j = job({
      jobNumber: "CZFCL00000900",
      customer: "Beta a.s.",
      tradeDirection: "Export",
      status: "Booked [EXP]",
      personInCharge: " left@firma.cz ",
      holidayCover: " eva@firma.cz ",
      customsPriority: "Urgent",
      customsStatus: "Documents Pending",
      customsDeadline: "2026-11-18 15:00",
      vgmClosing: "2026-11-17",
      siClosing: "2026-11-20",
      shippingInstructions: "Pending",
      closingDate: "2026-11-19",
      // An export two days past its ETD with no ATD.
      estimatedDeparture: "2026-11-16",
    });
    // Sailed (by its ETD) the day before yesterday: the overdue VGM no longer counts.
    const c = cockpit([j]);
    expect(c.attention).toEqual({ total: 0, rows: [] });
    expect(c.urgent).toEqual({
      total: 1,
      rows: [
        {
          id: j.id,
          jobNumber: "CZFCL00000900",
          customer: "Beta a.s.",
          mode: "sea",
          tradeDirection: "Export",
          status: "Booked [EXP]",
          handledBy: "left@firma.cz",
          holidayCover: "eva@firma.cz",
          area: "customs",
          tags: [
            { text: "Customs urgent · deadline 18.11. 15:00", urgent: true },
            { text: "Closing tomorrow", urgent: true },
            { text: "ETD passed, no ATD · ETD 16.11.2026, 2 days ago", urgent: true },
            { text: "Handled By is not a user: left@firma.cz", urgent: true },
            { text: "SI closing in 2 days", urgent: false },
          ],
        },
      ],
    });
  });

  it("opens a row on the tab of its first tag: customs, tracking, finance or the details", () => {
    const customs = job({ customsPriority: "Urgent", customsDeadline: "2026-11-17 09:00", closingDate: "2026-11-18" });
    const tracking = job({ estimatedArrival: "2026-11-10", closingDate: "2026-11-21" });
    const finance = job({ actualArrival: "2026-11-09", warehouseReceivedDate: "2026-11-09" });
    const details = job({ closingDate: "2026-11-21", actualArrival: "2026-11-09", warehouseReceivedDate: "2026-11-09" });
    const c = cockpit([customs, tracking, finance, details]);
    const row = (j: OpsCockpitJob) => [...c.urgent.rows, ...c.attention.rows].find((r) => r.id === j.id)!;
    expect(row(customs)).toMatchObject({ area: "customs", tags: [{ text: "Customs urgent · deadline 17.11. 09:00 passed", urgent: true }, { text: "Closing today", urgent: true }] });
    expect(row(tracking)).toMatchObject({ area: "tracking", tags: [{ text: "ETA passed, no ATA · ETA 10.11.2026, 8 days ago", urgent: true }, { text: "Closing in 3 days", urgent: false }] });
    expect(row(finance)).toMatchObject({ area: "finance", tags: [{ text: "Not released for billing · ATA 09.11.2026", urgent: false }] });
    expect(row(details)).toMatchObject({ area: "details", tags: [{ text: "Closing in 3 days", urgent: false }, { text: "Not released for billing · ATA 09.11.2026", urgent: false }] });
  });

  it("puts a job on URGENT when any tag is urgent, else on ATTENTION; each card the most pressing first, then by job number", () => {
    const jobs = [
      job({ jobNumber: "CZFCL00000005", closingDate: "2026-11-19" }), // urgent 5
      job({ jobNumber: "CZFCL00000004", vgmClosing: "2026-11-18" }), // urgent 4
      job({ jobNumber: "CZFCL00000003", vgmClosing: "2026-11-19" }), // urgent 4
      job({ jobNumber: "CZFCL00000002", personInCharge: "" }), // urgent 10: only nobody to handle it, after the clocks
      job({ jobNumber: "CZFCL00000009", siClosing: "2026-11-20" }), // attention 20
      job({ jobNumber: "CZFCL00000008", closingDate: "2026-11-21" }), // attention 20
      job({ jobNumber: "CZFCL00000007", actualArrival: "2026-11-09", warehouseReceivedDate: "2026-11-09" }), // attention 26
      // An attention tag of a low rank never lifts a job within URGENT.
      job({ jobNumber: "CZFCL00000001", closingDate: "2026-11-19", siClosing: "2026-11-20" }), // urgent 5
    ];
    const c = cockpit(jobs);
    expect(c.urgent.rows.map((r) => r.jobNumber)).toEqual(["CZFCL00000003", "CZFCL00000004", "CZFCL00000001", "CZFCL00000005", "CZFCL00000002"]);
    expect(c.attention.rows.map((r) => r.jobNumber)).toEqual(["CZFCL00000008", "CZFCL00000009", "CZFCL00000007"]);
    expect(c.urgent.total).toBe(5);
    expect(c.attention.total).toBe(3);
  });

  it("cuts a card's list at its limit and still counts every row", () => {
    const jobs = Array.from({ length: COCKPIT_LIST_LIMIT + 5 }, (_, i) => job({ jobNumber: `CZFCL${String(i).padStart(8, "0")}`, closingDate: "2026-11-18" }));
    const c = cockpit(jobs);
    expect(c.urgent.total).toBe(COCKPIT_LIST_LIMIT + 5);
    expect(c.urgent.rows).toHaveLength(COCKPIT_LIST_LIMIT);
    expect(c.urgent.rows[0]!.jobNumber).toBe("CZFCL00000000");
    expect(c.tiles).toMatchObject({ active: COCKPIT_LIST_LIMIT + 5, cutoffsDue: COCKPIT_LIST_LIMIT + 5 });
  });

  it("shows each row's mode, and none for a job without a Freight Mode", () => {
    const c = cockpit([
      job({ jobNumber: "A1", personInCharge: "", freightMode: "Air Freight" }),
      job({ jobNumber: "A2", personInCharge: "", freightMode: "Rail Freight" }),
      job({ jobNumber: "A3", personInCharge: "", freightMode: "" }),
      job({ jobNumber: "A4", personInCharge: "", freightMode: "", tradeDirection: "Domestic" }),
      job({ jobNumber: "A5", personInCharge: "", freightMode: "Sea Freight" }),
    ]);
    expect(c.urgent.rows.map((r) => r.mode)).toEqual(["air", "rail", "", "road", "sea"]);
    expect(c.urgent.rows.every((r) => r.handledBy === "")).toBe(true);
  });

  it("uses what Needs Attention knows about a job: a date to confirm, free time", () => {
    const j = job();
    const quiet = job();
    const facts = new Map<string, AttentionFacts>([
      [
        j.id,
        {
          proposed: [{ kind: "arrived", source: "carrier", effectValue: "2026-11-17", occurredOn: "2026-11-17" }],
          lastEventDay: null,
          arrivedAtHub: false,
          lastNotice: null,
          clocks: [{ containerNumber: "AAAU1", clock: { state: "ending", startDay: null, lastFreeDay: "2026-11-19", daysLeft: 1, chargeableDays: 0, stopDay: null } }],
        },
      ],
    ]);
    const c = cockpit([j, quiet], { facts });
    expect(c.urgent.rows).toHaveLength(1);
    expect(c.urgent.rows[0]).toMatchObject({ id: j.id, area: "tracking" });
    expect(c.urgent.rows[0]!.tags[0]).toMatchObject({ urgent: true });
    expect(c.urgent.rows[0]!.tags[0]!.text).toMatch(/^Date to confirm · .*17\.11\.2026/);
    expect(c.urgent.rows[0]!.tags[1]).toEqual({ text: "Free time ends · AAAU1 in 1 d", urgent: false });
    expect(c.tiles.freeTime).toBe(1);
  });

  describe("the tiles", () => {
    const over = (containerNumber: string) => ({
      proposed: [],
      lastEventDay: null,
      arrivedAtHub: false,
      lastNotice: null,
      clocks: [{ containerNumber, clock: { state: "chargeable" as const, startDay: null, lastFreeDay: "2026-11-10", daysLeft: -8, chargeableDays: 8, stopDay: null } }],
    });

    it("count the jobs each one names, from the same rows as the cards", () => {
      const jobs = {
        quiet: job(),
        closing: job({ closingDate: "2026-11-19" }),
        vgmOverdue: job({ vgmClosing: "2026-11-10" }),
        closingAhead: job({ closingDate: "2026-11-20" }),
        nobody: job({ personInCharge: "" }),
        notUser: job({ personInCharge: "left@firma.cz" }),
        booking: job({ bookingConfirmation: "Pending" }),
        bookingOdd: job({ bookingConfirmation: "PENDING (carrier)" }),
        moved: job(),
        freeTime: job(),
        customs: job({ customsPriority: "Urgent", customsDeadline: "2026-11-18 08:00" }),
        notReleased: job({ actualArrival: "2026-11-09", warehouseReceivedDate: "2026-11-09" }),
        delivered: job({ actualArrival: "2026-11-17", actualDeliveryDate: "2026-11-17" }),
        claim: job({ claim: "Yes" }),
      };
      const c = cockpit(Object.values(jobs), { movedIds: new Set([jobs.moved.id, "not-read"]), facts: new Map([[jobs.freeTime.id, over("AAAU1")]]) });
      expect(c.tiles).toEqual({
        active: 14,
        cutoffsDue: 2,
        noHandledBy: 1,
        handledByNotUser: 1,
        bookingPending: 2,
        etdEtaMoved: 1,
        freeTime: 1,
        customsUrgent: 1,
        notReleased: 2,
        openClaims: 1,
      });
      // Booking pending, a moved date and a claim are counted, not listed: they are no signal of step 1.
      expect(c.urgent.total).toBe(6);
      expect(c.attention.total).toBe(3);
    });

    // The notReleased tile opens the list's "arrived, not released for billing", so it counts by
    // that rule; the cards keep Needs Attention's flags, which wait some working days. Where the two part:
    describe("not released, where the tile and the cards part", () => {
      const tagsIn = (c: ReturnType<typeof cockpit>) => [...c.urgent.rows, ...c.attention.rows].flatMap((r) => r.tags.map((t) => t.text));

      it("counts a sea import from its ATA on, though the card names it only 3 working days later", () => {
        // Friday the 13th; Monday and Wednesday are the 2 working days since (Tuesday the 17th is a holiday).
        const c = cockpit([job({ actualArrival: "2026-11-13" })]);
        expect(c.tiles.notReleased).toBe(1);
        expect(tagsIn(c)).toEqual([]);
      });

      it("counts a Domestic or Road Department job delivered and not in Billing, which the cards leave to Trucking", () => {
        const c = cockpit([
          job({ tradeDirection: "Domestic", freightMode: "Road Freight", actualDeliveryDate: "2026-11-16" }),
          job({ department: "Road Department", actualDeliveryDate: "2026-11-16" }),
          job({ tradeDirection: "Domestic", actualDeliveryDate: "2026-11-16", status: "Billing [DOM]" }),
          job({ tradeDirection: "Domestic" }),
        ]);
        expect(c.tiles.notReleased).toBe(2);
        expect(tagsIn(c)).toEqual([]);
      });

      it("does not count an import delivered with no ATA, though its card says Delivered, not billed", () => {
        const c = cockpit([job({ actualDeliveryDate: "2026-11-16" })]);
        expect(c.tiles.notReleased).toBe(0);
        expect(tagsIn(c)).toEqual(["Delivered, not billed · Delivered 16.11.2026"]);
      });

      it("counts and names a job alike once both rules hold", () => {
        const c = cockpit([job({ actualArrival: "2026-11-09", warehouseReceivedDate: "2026-11-09" }), job({ actualArrival: "2026-11-09", warehouseReceivedDate: "2026-11-09", status: "Billing [IMP]" })]);
        expect(c.tiles.notReleased).toBe(1);
        expect(tagsIn(c)).toEqual(["Not released for billing · ATA 09.11.2026"]);
      });
    });

    it("count a job once, however many of its cut-offs are due", () => {
      const c = cockpit([job({ closingDate: "2026-11-18", vgmClosing: "2026-11-18", siClosing: "2026-11-19", ams: "Pending", amsDeadline: "2026-11-10" })]);
      expect(c.tiles.cutoffsDue).toBe(1);
      expect(c.urgent.rows[0]!.tags.map((t) => t.text)).toEqual(["VGM closing today", "SI closing tomorrow", "AMS overdue 8 days", "Closing today"]);
    });

    it("obey the mode, the direction and the Handled By filter, as the cards do", () => {
      const jobs = [
        job({ jobNumber: "S1", closingDate: "2026-11-18" }),
        job({ jobNumber: "S2", closingDate: "2026-11-18", personInCharge: "eva@firma.cz" }),
        job({ jobNumber: "S3", closingDate: "2026-11-18", tradeDirection: "Export" }),
        job({ jobNumber: "A1", closingDate: "2026-11-18", freightMode: "Air Freight" }),
        job({ jobNumber: "N1", closingDate: "2026-11-18", personInCharge: "" }),
      ];
      const shown = (over: Partial<OpsCockpitInput>) => {
        const c = cockpit(jobs, over);
        expect(c.tiles.active).toBe(c.urgent.total);
        expect(c.tiles.cutoffsDue).toBe(c.urgent.total);
        return c.urgent.rows.map((r) => r.jobNumber);
      };
      expect(shown({})).toEqual(["A1", "N1", "S1", "S2", "S3"]);
      expect(shown({ mode: "sea" })).toEqual(["N1", "S1", "S2", "S3"]);
      expect(shown({ mode: "air" })).toEqual(["A1"]);
      expect(shown({ mode: "rail" })).toEqual([]);
      expect(shown({ direction: "export" })).toEqual(["S3"]);
      expect(shown({ direction: "import", mode: "sea" })).toEqual(["N1", "S1", "S2"]);
      expect(shown({ handledBy: "EVA@firma.cz " })).toEqual(["S2"]);
      expect(shown({ handledBy: "nobody" })).toEqual(["N1"]);
      expect(shown({ handledBy: "jan@firma.cz", mode: "air" })).toEqual(["A1"]);
      expect(shown({ handledBy: "stranger@firma.cz" })).toEqual([]);
    });

    it("echo the filters as they were read", () => {
      expect(cockpit([], { mode: "rail", direction: "domestic", handledBy: " Eva@Firma.cz " })).toMatchObject({ mode: "rail", direction: "domestic", handledBy: "eva@firma.cz" });
      expect(cockpit([], { handledBy: "Nobody" }).handledBy).toBe("nobody");
      expect(cockpit([], { handledBy: "  " }).handledBy).toBeNull();
    });
  });

  describe("the people", () => {
    const jobs = () => [
      job({ personInCharge: "jan@firma.cz", closingDate: "2026-11-18" }), // urgent
      job({ personInCharge: "JAN@firma.cz ", closingDate: "2026-11-20", holidayCover: "eva@firma.cz" }), // attention
      job({ personInCharge: "jan@firma.cz — Jan Novák", holidayCover: "Eva@firma.cz" }), // quiet
      job({ personInCharge: "eva@firma.cz", holidayCover: "jan@firma.cz", freightMode: "Air Freight" }), // quiet
      job({ personInCharge: "left@firma.cz", tradeDirection: "Export" }), // urgent: not a user
      job({ personInCharge: "", holidayCover: "eva@firma.cz" }), // urgent: nobody
      job({ personInCharge: " " }), // urgent: nobody
    ];

    it("are everyone named in Handled By, by e-mail, the most active first - nobody among them, after anyone as active", () => {
      expect(cockpit(jobs()).people).toEqual([
        { handledBy: "jan@firma.cz", isUser: true, active: 3, urgent: 1, attention: 1, covers: 1 },
        { handledBy: "", isUser: false, active: 2, urgent: 2, attention: 0, covers: 0 },
        { handledBy: "eva@firma.cz", isUser: true, active: 1, urgent: 0, attention: 0, covers: 3 },
        { handledBy: "left@firma.cz", isUser: false, active: 1, urgent: 1, attention: 0, covers: 0 },
      ]);
    });

    it("keep a legacy Handled By typed as \"nobody\" as the person it names - the filter's word still means the jobs with nobody", () => {
      const legacy = [job({ personInCharge: "Nobody" }), job({ personInCharge: "" })];
      const c = cockpit(legacy, { handledBy: "nobody" });
      expect(c.people).toEqual([
        { handledBy: "nobody", isUser: false, active: 1, urgent: 1, attention: 0, covers: 0 },
        { handledBy: "", isUser: false, active: 1, urgent: 1, attention: 0, covers: 0 },
      ]);
      expect(c.tiles).toMatchObject({ active: 1, noHandledBy: 1 });
      expect(c.urgent.rows.map((r) => r.handledBy)).toEqual([""]);
    });

    it("leave nobody out when every job has somebody", () => {
      expect(cockpit([job()]).people).toEqual([{ handledBy: "jan@firma.cz", isUser: true, active: 1, urgent: 0, attention: 0, covers: 0 }]);
    });

    it("are not narrowed by the Handled By filter - it is picked from them - while the tiles and cards are", () => {
      const all = cockpit(jobs());
      const one = cockpit(jobs(), { handledBy: "eva@firma.cz" });
      expect(one.people).toEqual(all.people);
      expect(one.tiles.active).toBe(1);
      expect(one.urgent.total + one.attention.total).toBe(0);
      expect(cockpit(jobs(), { handledBy: "nobody" }).people).toEqual(all.people);
    });

    it("obey the mode and the direction, their covers too", () => {
      expect(cockpit(jobs(), { mode: "air" }).people).toEqual([{ handledBy: "eva@firma.cz", isUser: true, active: 1, urgent: 0, attention: 0, covers: 0 }]);
      expect(cockpit(jobs(), { direction: "export" }).people).toEqual([{ handledBy: "left@firma.cz", isUser: false, active: 1, urgent: 1, attention: 0, covers: 0 }]);
      expect(cockpit(jobs(), { mode: "sea", direction: "import" }).people.map((p) => `${p.handledBy} ${p.active} covers ${p.covers}`)).toEqual(["jan@firma.cz 3 covers 0", " 2 covers 0"]);
    });
  });

  describe("when the users could not be read", () => {
    const jobs = () => [job({ personInCharge: "left@firma.cz" }), job({ personInCharge: "" }), job({ personInCharge: "jan@firma.cz" })];

    it("says not known - never 0, never that nobody is a user", () => {
      const c = cockpit(jobs(), { userEmails: null });
      expect(c.tiles.handledByNotUser).toBeNull();
      expect(c.people.map((p) => p.isUser)).toEqual([null, null, null]);
      // Nobody in Handled By is known without the users.
      expect(c.tiles.noHandledBy).toBe(1);
      expect(c.urgent.rows.map((r) => r.tags.map((t) => t.text))).toEqual([["Nobody in Handled By"]]);
    });

    it("counts them once they are known", () => {
      const c = cockpit(jobs());
      expect(c.tiles.handledByNotUser).toBe(1);
      expect(c.urgent.rows.flatMap((r) => r.tags.map((t) => t.text))).toEqual(["Nobody in Handled By", "Handled By is not a user: left@firma.cz"]);
    });
  });

  it("says when the company has more active jobs than were read", () => {
    expect(cockpit([job()], { capped: true }).capped).toBe(true);
    expect(cockpit([job()]).capped).toBe(false);
  });
});
