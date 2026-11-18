import { describe, expect, it } from "vitest";
import { addDays } from "../../../lib/businessDate";
import type { ShipmentDeadline } from "../interfaces/interfaces";
import { cutoffsOf, opsDay, timelineFactsOf, type OpsDay, type TimelineEvent, type TimelineFacts } from "../lib/managersCockpit";
import { PLAIN_DATE_FIELDS, candidateRange, closingToCheck, dueOf, needsAttentionOf, urgentIds, type CandidateRange, type DueJob } from "../lib/needsAttention";

// The Shipments list's Needs Attention on the cockpit's deadline rules (D9): the windows in working
// days, the cut-offs as Shipments → Managers judges them (missed ones kept, D7), and the plain
// dates while they are ahead.
//
// November 2026, the days these tests stand on:
//   Mon 16 · Tue 17 (a public holiday) · Wed 18 · Thu 19 · Fri 20 · Sat 21 · Sun 22 · Mon 23 · Tue 24 · Wed 25 · Thu 26
/** A moment of a November day on Prague's clock (CET, an hour ahead of UTC). */
const at = (day: string, time = "11:00") => new Date(`${day}T${time}:00+01:00`);
// Wednesday 18 Nov 2026, 11:00 in Prague: URGENT up to Thu 19, ATTENTION Fri 20 and Mon 23.
const WED = opsDay(at("2026-11-18"));
// Friday 20 Nov: URGENT up to Mon 23, ATTENTION Tue 24 and Wed 25.
const FRI = opsDay(at("2026-11-20"));

let seq = 0;
// A job nothing is due on: a test hands over the dates and statuses that switch a rule on.
const job = (over: Partial<DueJob> = {}): DueJob => {
  seq += 1;
  return {
    id: `id-${seq}`,
    jobNumber: `CZFCL${String(seq).padStart(8, "0")}`,
    customerId: null,
    customer: "ACME s.r.o.",
    tradeDirection: "Export",
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
  };
};
const event = (kind: string, occurredOn = "2026-11-17"): TimelineEvent => ({ kind, occurredOn, effect: "", resolvedAt: null });
/** "field date" of each deadline, with "missed" and the time where there is one. */
const said = (deadlines: ShipmentDeadline[]) => deadlines.map((d) => [d.field, d.date, d.missed ? "missed" : "", d.time].filter(Boolean).join(" "));
/** What is due on a job whose cargo is not in. */
const due = (over: Partial<DueJob>, day: OpsDay = WED, cargoIsIn: boolean | null = false) => {
  const { urgent, attention } = dueOf(job(over), day, cargoIsIn);
  return { urgent: said(urgent), attention: said(attention) };
};
const NOTHING = { urgent: [], attention: [] };

describe("the two windows, in working days", () => {
  it("URGENT is today and the next working day, ATTENTION the two working days after - and nothing beyond", () => {
    expect(due({ estimatedDeparture: "2026-11-18" })).toEqual({ urgent: ["estimatedDeparture 2026-11-18"], attention: [] });
    expect(due({ estimatedDeparture: "2026-11-19" })).toEqual({ urgent: ["estimatedDeparture 2026-11-19"], attention: [] });
    expect(due({ estimatedDeparture: "2026-11-20" })).toEqual({ urgent: [], attention: ["estimatedDeparture 2026-11-20"] });
    // Monday is the second working day after Thursday: on a Wednesday it is four calendar days off.
    expect(due({ estimatedDeparture: "2026-11-23" })).toEqual({ urgent: [], attention: ["estimatedDeparture 2026-11-23"] });
    expect(due({ estimatedDeparture: "2026-11-24" })).toEqual(NOTHING);
  });

  it("on a Friday, Monday is URGENT - with the weekend in between - and Tuesday and Wednesday are ATTENTION", () => {
    for (const day of ["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"]) expect(due({ plannedDeliveryDate: day }, FRI)).toEqual({ urgent: [`plannedDeliveryDate ${day}`], attention: [] });
    for (const day of ["2026-11-24", "2026-11-25"]) expect(due({ plannedDeliveryDate: day }, FRI)).toEqual({ urgent: [], attention: [`plannedDeliveryDate ${day}`] });
    expect(due({ plannedDeliveryDate: "2026-11-26" }, FRI)).toEqual(NOTHING);
    // Monday is three calendar days off: the list says how far, the card says how urgent.
    expect(dueOf(job({ plannedDeliveryDate: "2026-11-23" }), FRI, false).urgent[0]).toEqual({ field: "plannedDeliveryDate", date: "2026-11-23", daysLeft: 3, missed: false, time: "" });
  });

  it("skips a public holiday: on Monday 16 Nov the next working day is Wednesday 18", () => {
    const MON = opsDay(at("2026-11-16"));
    expect(due({ estimatedArrival: "2026-11-17" }, MON).urgent).toEqual(["estimatedArrival 2026-11-17"]);
    expect(due({ estimatedArrival: "2026-11-18" }, MON).urgent).toEqual(["estimatedArrival 2026-11-18"]);
    expect(due({ estimatedArrival: "2026-11-19" }, MON).attention).toEqual(["estimatedArrival 2026-11-19"]);
    expect(due({ estimatedArrival: "2026-11-20" }, MON).attention).toEqual(["estimatedArrival 2026-11-20"]);
    expect(due({ estimatedArrival: "2026-11-23" }, MON)).toEqual(NOTHING);
  });

  it("skips a day off the company uploaded, as the cockpit does with the same holidays", () => {
    const dayOff = opsDay(at("2026-11-18"), ["2026-11-19"]);
    expect(dayOff).toMatchObject({ urgentUntil: "2026-11-20", attentionUntil: "2026-11-24" });
    expect(due({ estimatedDeparture: "2026-11-20" }, dayOff).urgent).toEqual(["estimatedDeparture 2026-11-20"]);
    expect(due({ estimatedDeparture: "2026-11-24" }, dayOff).attention).toEqual(["estimatedDeparture 2026-11-24"]);
  });
});

describe("the plain dates", () => {
  it("lists each of them while it is ahead - the pick-up date among them", () => {
    expect(PLAIN_DATE_FIELDS).toEqual(["cargoReadinessDate", "pickupDate", "estimatedDeparture", "estimatedArrival", "etaWarehouse", "plannedDeliveryDate"]);
    for (const field of PLAIN_DATE_FIELDS) {
      expect(due({ [field]: "2026-11-19" })).toEqual({ urgent: [`${field} 2026-11-19`], attention: [] });
      expect(due({ [field]: "2026-11-23" })).toEqual({ urgent: [], attention: [`${field} 2026-11-23`] });
    }
    expect(due({ pickupDate: "2026-11-18" }).urgent).toEqual(["pickupDate 2026-11-18"]);
  });

  it("does not keep one that passed: yesterday's is gone, whatever happened to the job", () => {
    for (const field of PLAIN_DATE_FIELDS) expect(due({ [field]: "2026-11-17" })).toEqual(NOTHING);
    expect(due({ pickupDate: "2026-11-01", estimatedDeparture: "2026-11-10", plannedDeliveryDate: "2026-11-16" })).toEqual(NOTHING);
  });

  it("counts for every Trade Direction, a Domestic job too, and asks nothing about the mode", () => {
    for (const tradeDirection of ["Import", "Export", "Domestic", " DOMESTIC ", "Cross Trade", ""]) {
      expect(due({ tradeDirection, pickupDate: "2026-11-19", plannedDeliveryDate: "2026-11-20" })).toEqual({ urgent: ["pickupDate 2026-11-19"], attention: ["plannedDeliveryDate 2026-11-20"] });
    }
    // A Domestic job's cut-off, should it have one, is judged as any other.
    expect(due({ tradeDirection: "Domestic", closingDate: "2026-11-17" }).urgent).toEqual(["closingDate 2026-11-17 missed"]);
  });

  it("keeps a departure or arrival date in its window after the vessel left or arrived: the list shows what the day holds", () => {
    expect(due({ estimatedDeparture: "2026-11-18", actualDeparture: "2026-11-18", estimatedArrival: "2026-11-19" }).urgent).toEqual(["estimatedDeparture 2026-11-18", "estimatedArrival 2026-11-19"]);
  });
});

describe("the cut-offs, as Shipments → Managers judges them", () => {
  it("keeps a missed Closing in URGENT with its day and time, however long ago, while the job has not left and its ETD has not passed", () => {
    expect(dueOf(job({ closingDate: "2026-11-17", closingTime: "14:00" }), WED, false).urgent).toEqual([{ field: "closingDate", date: "2026-11-17", daysLeft: -1, missed: true, time: "14:00" }]);
    expect(due({ closingDate: "2026-11-02", estimatedDeparture: "2026-11-25" }).urgent).toEqual(["closingDate 2026-11-02 missed"]);
    // A job with no ETD keeps it 7 days after the Closing's own date, not for ever.
    expect(due({ closingDate: "2026-11-11" }).urgent).toEqual(["closingDate 2026-11-11 missed"]);
    expect(due({ closingDate: "2026-11-10" })).toEqual(NOTHING);
  });

  it("a Closing with a time is missed once that time has passed today; before it, it is due", () => {
    const closing = { closingDate: "2026-11-18", closingTime: "14:00" };
    expect(due(closing, opsDay(at("2026-11-18", "13:59"))).urgent).toEqual(["closingDate 2026-11-18 14:00"]);
    expect(due(closing, opsDay(at("2026-11-18", "14:01"))).urgent).toEqual(["closingDate 2026-11-18 missed 14:00"]);
    // With the date only, the whole day is its.
    expect(due({ closingDate: "2026-11-18" }, opsDay(at("2026-11-18", "23:30"))).urgent).toEqual(["closingDate 2026-11-18"]);
  });

  it("clears a Closing - missed or due - once the cargo is in or the job has left; when nobody can tell, only a missed one is withheld", () => {
    const missed = { closingDate: "2026-11-17", closingTime: "14:00" };
    expect(due(missed, WED, true)).toEqual(NOTHING);
    expect(due({ closingDate: "2026-11-19" }, WED, true)).toEqual(NOTHING);
    // The timeline could not be read: that the cargo missed its Closing cannot be told - one still ahead is said by its date.
    expect(due(missed, WED, null)).toEqual(NOTHING);
    expect(due({ closingDate: "2026-11-19" }, WED, null)).toEqual({ urgent: ["closingDate 2026-11-19"], attention: [] });
    expect(due({ closingDate: "2026-11-20" }, WED, null)).toEqual({ urgent: [], attention: ["closingDate 2026-11-20"] });
    // Left is an ATD, an ATA or an actual delivery: an import that arrived carries no cut-off though its ATD was never typed.
    expect(due({ ...missed, actualDeparture: "2026-11-18" })).toEqual(NOTHING);
    expect(due({ ...missed, vgmClosing: "2026-11-19", actualArrival: "2026-11-17" })).toEqual(NOTHING);
    expect(due({ ...missed, vgmClosing: "2026-11-19", actualDeliveryDate: "2026-11-17" })).toEqual(NOTHING);
    // The day after the ETD the miss is history: "ETD passed, no ATD" speaks instead.
    expect(due({ ...missed, estimatedDeparture: "2026-11-18" }).urgent).toEqual(["closingDate 2026-11-17 missed 14:00", "estimatedDeparture 2026-11-18"]);
    expect(due({ ...missed, estimatedDeparture: "2026-11-17" })).toEqual(NOTHING);
  });

  it("keeps an overdue VGM, SI, AMS and ISF in URGENT until it is confirmed, the job has left or its ETD has passed", () => {
    const filings = { vgmClosing: "2026-11-16", vgm: "Pending", siClosing: "2026-11-17", shippingInstructions: "", ams: "Pending", amsDeadline: "2026-11-13", isf: "Pending (Red)", isfDeadline: null, estimatedDeparture: "2026-11-19" };
    expect(due(filings).urgent).toEqual(["amsDeadline 2026-11-13 missed", "isfDeadline 2026-11-15 missed", "vgmClosing 2026-11-16 missed", "siClosing 2026-11-17 missed", "estimatedDeparture 2026-11-19"]);
    expect(due({ ...filings, vgm: "Confirmed (Green)", shippingInstructions: "Confirmed", ams: "Filed", isf: "Not Applicable" }).urgent).toEqual(["estimatedDeparture 2026-11-19"]);
    expect(due({ ...filings, actualDeparture: "2026-11-18" }).urgent).toEqual(["estimatedDeparture 2026-11-19"]);
    expect(due({ ...filings, actualArrival: "2026-11-18" }).urgent).toEqual(["estimatedDeparture 2026-11-19"]);
    expect(due({ ...filings, estimatedDeparture: "2026-11-18" }).urgent).toHaveLength(5);
    // The ETD was yesterday: all four are history, and "ETD passed, no ATD" speaks instead.
    expect(due({ ...filings, estimatedDeparture: "2026-11-17" })).toEqual(NOTHING);
  });

  it("a filing with a time is overdue once that time has passed today, and shows its time - as the Closing does", () => {
    const at10 = { vgmClosing: "2026-11-18", vgmClosingTime: "10:00", siClosing: "2026-11-18", siClosingTime: "10:00", ams: "Pending", amsDeadline: "2026-11-18", amsDeadlineTime: "10:00", isf: "Pending", isfDeadline: "2026-11-18", isfDeadlineTime: "10:00" };
    expect(due(at10, opsDay(at("2026-11-18", "09:59"))).urgent).toEqual(["vgmClosing 2026-11-18 10:00", "siClosing 2026-11-18 10:00", "amsDeadline 2026-11-18 10:00", "isfDeadline 2026-11-18 10:00"]);
    expect(due(at10, opsDay(at("2026-11-18", "10:01"))).urgent).toEqual(["vgmClosing 2026-11-18 missed 10:00", "siClosing 2026-11-18 missed 10:00", "amsDeadline 2026-11-18 missed 10:00", "isfDeadline 2026-11-18 missed 10:00"]);
    expect(dueOf(job({ vgmClosing: "2026-11-18", vgmClosingTime: "10:00" }), WED, false).urgent).toEqual([{ field: "vgmClosing", date: "2026-11-18", daysLeft: 0, missed: true, time: "10:00" }]);
    // Another day's time is only shown; with the date only, the whole day is its.
    expect(due({ siClosing: "2026-11-20", siClosingTime: "16:00" })).toEqual({ urgent: [], attention: ["siClosing 2026-11-20 16:00"] });
    expect(due({ vgmClosing: "2026-11-18" }, opsDay(at("2026-11-18", "23:30"))).urgent).toEqual(["vgmClosing 2026-11-18"]);
    // AMS and ISF with no deadline typed are due 4 days before the ETD: a day, with no time.
    expect(due({ ams: "Pending", amsDeadlineTime: "08:00", estimatedDeparture: "2026-11-22" }, opsDay(at("2026-11-18", "23:30"))).urgent).toEqual(["amsDeadline 2026-11-18"]);
  });

  it("puts a cut-off of the two working days after in ATTENTION, and names none beyond", () => {
    expect(due({ vgmClosing: "2026-11-20", siClosing: "2026-11-23", closingDate: "2026-11-24" })).toEqual({ urgent: [], attention: ["vgmClosing 2026-11-20", "siClosing 2026-11-23"] });
  });

  it("is the cockpit's cutoffsOf, cut-off for cut-off: the same ones, in the same window", () => {
    const jobs = [
      job({ closingDate: "2026-11-17", closingTime: "09:00", vgmClosing: "2026-11-19", vgmClosingTime: "12:00", siClosing: "2026-11-20", ams: "Pending", estimatedDeparture: "2026-11-24" }),
      job({ closingDate: "2026-11-18", closingTime: "10:30", vgmClosing: "2026-11-12", vgm: "Not Applicable", isf: "pending", isfDeadline: "2026-11-23", isfDeadlineTime: "17:00" }),
      job({ vgmClosing: "2026-11-18", vgmClosingTime: "10:00", siClosing: "2026-11-18", siClosingTime: "12:00", ams: "Pending", amsDeadline: "2026-11-18", amsDeadlineTime: "08:15", estimatedDeparture: "2026-11-21" }),
      job({ closingDate: "2026-11-23", siClosing: "2026-11-10", estimatedDeparture: "2026-11-09" }),
      job({ closingDate: "2026-11-19", actualDeparture: "2026-11-17", vgmClosing: "2026-11-18" }),
    ];
    for (const day of [WED, FRI, opsDay(at("2026-11-16")), opsDay(at("2026-11-18"), ["2026-11-19"])]) {
      for (const j of jobs) {
        for (const cargoIsIn of [false, true, null]) {
          const mine = dueOf(j, day, cargoIsIn);
          const cutoffs = [...mine.urgent.map((d) => ({ ...d, window: "urgent" })), ...mine.attention.map((d) => ({ ...d, window: "attention" }))].filter((d) => !(PLAIN_DATE_FIELDS as readonly string[]).includes(d.field));
          const cockpit = cutoffsOf(j, day, cargoIsIn);
          expect(cutoffs.map((d) => `${d.field} ${d.date} ${d.time} ${d.missed ? "missed" : d.window}`).sort()).toEqual(cockpit.map((c) => `${c.key} ${c.date} ${c.time} ${c.state}`).sort());
        }
      }
    }
  });
});

describe("the two lists", () => {
  const facts = (...kinds: string[]): TimelineFacts => timelineFactsOf(kinds.map((kind) => event(kind)));

  it("lists a job with dates in both windows in both, each time with that window's dates, soonest first", () => {
    const both = job({ jobNumber: "CZFCL00000900", customerId: "c-1", customer: "Beta a.s.", status: "Booked [EXP]", estimatedDeparture: "2026-11-23", closingDate: "2026-11-19", closingTime: "16:00", vgmClosing: "2026-11-16", vgm: "Pending", siClosing: "2026-11-20" });
    const lists = needsAttentionOf([both], new Map(), WED);
    expect(lists.within24h).toEqual([
      {
        id: both.id,
        jobNumber: "CZFCL00000900",
        customerId: "c-1",
        customer: "Beta a.s.",
        tradeDirection: "Export",
        status: "Booked [EXP]",
        deadlines: [
          { field: "vgmClosing", date: "2026-11-16", daysLeft: -2, missed: true, time: "" },
          { field: "closingDate", date: "2026-11-19", daysLeft: 1, missed: false, time: "16:00" },
        ],
      },
    ]);
    expect(lists.within48h.map((i) => [i.id, said(i.deadlines)])).toEqual([[both.id, ["siClosing 2026-11-20", "estimatedDeparture 2026-11-23"]]]);
  });

  it("orders each list by the most pressing date, then the reference, and leaves out a job with nothing due", () => {
    const tomorrow = job({ jobNumber: "CZFCL00000902", estimatedArrival: "2026-11-19" });
    const today = job({ jobNumber: "CZFCL00000903", pickupDate: "2026-11-18" });
    const overdue = job({ jobNumber: "CZFCL00000904", siClosing: "2026-11-13" });
    const todayToo = job({ jobNumber: "CZFCL00000901", cargoReadinessDate: "2026-11-18" });
    const quiet = job({ estimatedArrival: "2026-12-24" });
    const lists = needsAttentionOf([tomorrow, today, overdue, todayToo, quiet], new Map(), WED);
    expect(lists.within24h.map((i) => i.jobNumber)).toEqual(["CZFCL00000904", "CZFCL00000901", "CZFCL00000903", "CZFCL00000902"]);
    expect(lists.within48h).toEqual([]);
    expect(urgentIds(lists)).toEqual([overdue.id, todayToo.id, today.id, tomorrow.id]);
  });

  it("drops a Closing the timeline shows was made - picked up, loaded or gate-in - or the warehouse received", () => {
    const closing = { closingDate: "2026-11-17", closingTime: "14:00" };
    const open = job(closing);
    const pickedUp = job(closing);
    const loaded = job(closing);
    const gateIn = job(closing);
    const received = job({ ...closing, warehouseReceivedDate: "2026-11-16" });
    const haulierOnly = job(closing);
    const timeline = new Map([
      [pickedUp.id, facts("picked_up")],
      [loaded.id, facts("loaded")],
      [gateIn.id, facts("gate_in")],
      [haulierOnly.id, facts("haulier_confirmed")],
    ]);
    // A job with no entry has a timeline that is known and empty: its Closing is open.
    expect(urgentIds(needsAttentionOf([open, pickedUp, loaded, gateIn, received, haulierOnly], timeline, WED))).toEqual([open.id, haulierOnly.id]);
  });

  it("withholds a missed Closing when the tracking events could not be read - a Closing still ahead, the filings and the dates still show", () => {
    const closingOnly = job({ closingDate: "2026-11-17" });
    const withFiling = job({ closingDate: "2026-11-17", vgmClosing: "2026-11-19", pickupDate: "2026-11-18" });
    const closingAhead = job({ closingDate: "2026-11-19", closingTime: "16:00" });
    const lists = needsAttentionOf([closingOnly, withFiling, closingAhead], null, WED);
    expect(lists.within24h.map((i) => [i.id, said(i.deadlines)])).toEqual([
      [withFiling.id, ["pickupDate 2026-11-18", "vgmClosing 2026-11-19"]],
      [closingAhead.id, ["closingDate 2026-11-19 16:00"]],
    ]);
  });

  it("asks for the timelines only of the jobs whose Closing hangs on them", () => {
    const missed = job({ closingDate: "2026-11-12" });
    // With no ETD a missed Closing is history 7 days after its own date: no timeline is asked for it.
    const missedLongAgo = job({ closingDate: "2026-11-10" });
    const dueSoon = job({ closingDate: "2026-11-23" });
    const later = job({ closingDate: "2026-11-24" });
    const received = job({ closingDate: "2026-11-19", warehouseReceivedDate: "2026-11-17" });
    const departed = job({ closingDate: "2026-11-19", actualDeparture: "2026-11-18" });
    const arrived = job({ closingDate: "2026-11-19", actualArrival: "2026-11-18" });
    const etdPassed = job({ closingDate: "2026-11-16", estimatedDeparture: "2026-11-17" });
    const noClosing = job({ vgmClosing: "2026-11-18", estimatedDeparture: "2026-11-19" });
    expect(closingToCheck([missed, missedLongAgo, dueSoon, later, received, departed, arrived, etdPassed, noClosing], WED)).toEqual([missed.id, dueSoon.id]);
  });
});

describe("the read's bounds", () => {
  it("spans today to the end of the ATTENTION window, and a week back for a passed cut-off of a job with no ETD", () => {
    expect(candidateRange(WED)).toEqual({ from: "2026-11-18", until: "2026-11-23", passedSince: "2026-11-11" });
    expect(candidateRange(FRI)).toEqual({ from: "2026-11-20", until: "2026-11-25", passedSince: "2026-11-13" });
  });

  // repositories/shipment.repository needsAttentionCandidates, restated: the statement itself is
  // read in tests/repositories/shipment.repository.test.ts and run in tests/db/needsAttention.db.test.ts.
  const read = (j: DueJob, r: CandidateRange) => {
    const within = (d: string | null) => !!d && d >= r.from && d <= r.until;
    const etd = j.estimatedDeparture;
    const typedCutoffs = [j.closingDate, j.vgmClosing, j.siClosing, j.amsDeadline, j.isfDeadline];
    const cutoffDates = [...typedCutoffs, etd && addDays(etd, -4)];
    const notLeft = !j.actualDeparture && !j.actualArrival && !j.actualDeliveryDate;
    const passedBeforeEtd = !!etd && etd >= r.from && cutoffDates.some((d) => !!d && d < r.from);
    const passedLately = !etd && typedCutoffs.some((d) => !!d && d >= r.passedSince && d < r.from);
    return PLAIN_DATE_FIELDS.some((f) => within(j[f])) || (notLeft && (cutoffDates.some(within) || passedBeforeEtd || passedLately));
  };

  it("finds every job the rules list: whatever the dates, times and statuses, a listed job is one the read's conditions keep", () => {
    const days = [null, "2026-11-02", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-14", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-22", "2026-11-23", "2026-11-25", "2026-11-27", "2026-12-20"];
    const left: Partial<DueJob>[] = [{}, { actualDeparture: "2026-11-17" }, { actualArrival: "2026-11-17" }, { actualDeliveryDate: "2026-11-17" }];
    let listed = 0;
    // 11:00 and late in the evening: a cut-off with a time today is due at one and overdue at the other.
    for (const day of [WED, FRI, opsDay(at("2026-11-18", "23:30"))]) {
      const range = candidateRange(day);
      for (const etd of days) {
        for (const gone of left) {
          for (const date of days) {
            const base = { estimatedDeparture: etd, ...gone };
            const jobs = [
              ...PLAIN_DATE_FIELDS.filter((f) => f !== "estimatedDeparture").map((f) => job({ ...base, [f]: date })),
              job({ ...base, closingDate: date, closingTime: "09:00" }),
              job({ ...base, vgmClosing: date, vgmClosingTime: "12:00", vgm: "Pending" }),
              job({ ...base, siClosing: date, siClosingTime: "09:00" }),
              job({ ...base, ams: "Pending", amsDeadline: date, amsDeadlineTime: "09:00" }),
              job({ ...base, isf: "Pending", isfDeadline: date }),
            ];
            for (const j of jobs) {
              const { urgent, attention } = dueOf(j, day, false);
              if (urgent.length + attention.length === 0) continue;
              listed += 1;
              expect(read(j, range), JSON.stringify(j)).toBe(true);
            }
          }
        }
      }
    }
    expect(listed).toBeGreaterThan(1000);
  });

  it("leaves out what the rules can no longer list: an old cut-off with no ETD, one whose ETD has passed, a job that has left", () => {
    const range = candidateRange(WED);
    const overdue = { vgmClosing: "2026-11-16", vgm: "Pending" };
    // Kept: the ETD is today or later, or there is none and the cut-off passed within the week.
    expect(read(job({ ...overdue, estimatedDeparture: "2026-11-18" }), range)).toBe(true);
    expect(read(job({ ...overdue, estimatedDeparture: "2026-12-20" }), range)).toBe(true);
    expect(read(job(overdue), range)).toBe(true);
    expect(read(job({ closingDate: "2026-11-11" }), range)).toBe(true);
    // AMS and ISF with no deadline typed: 4 days before an ETD still ahead.
    expect(read(job({ ams: "Pending", estimatedDeparture: "2026-11-20" }), range)).toBe(true);
    // Left out.
    expect(read(job({ closingDate: "2026-11-10" }), range)).toBe(false);
    expect(read(job({ vgmClosing: "2026-03-01", vgm: "Pending" }), range)).toBe(false);
    expect(read(job({ ...overdue, estimatedDeparture: "2026-11-17" }), range)).toBe(false);
    expect(read(job({ ...overdue, estimatedDeparture: "2026-12-20", actualArrival: "2026-11-17" }), range)).toBe(false);
    expect(read(job({ vgmClosing: "2026-11-19", vgm: "Pending", actualDeliveryDate: "2026-11-17" }), range)).toBe(false);
    // A plain date ahead is read whatever else is true of the job.
    expect(read(job({ ...overdue, estimatedDeparture: "2026-11-17", actualDeparture: "2026-11-17", estimatedArrival: "2026-11-19" }), range)).toBe(true);
  });
});
