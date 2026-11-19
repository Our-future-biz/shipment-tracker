import { describe, expect, it } from "vitest";
import { COCKPIT_LIST_LIMIT } from "../lib/cockpitThresholds";
import { withoutDismissed } from "../lib/cutoffDismissals";
import {
  COCKPIT_EVENT_KINDS,
  EXTRA_RANK_SCALE,
  OPS_RANK,
  SIGNAL_KINDS,
  arrivalNoticeSignals,
  attentionRulesFor,
  bolSignals,
  bookingSignals,
  boxSignals,
  boxesWanted,
  buildOpsCockpit,
  cargoIn,
  cargoReadySignals,
  creditSignals,
  customsSignals,
  customsUrgency,
  cutoffSignals,
  cutoffsOf,
  deliverySignals,
  flagSignals,
  handledByFilter,
  handledBySignals,
  inDirection,
  inMode,
  isHandledBy,
  isUnbilledArrival,
  mawbSignals,
  opsDay,
  roadSignals,
  isOfReports,
  isReportOrNoUser,
  rolledSignals,
  timelineFactsOf,
  warehouseSignals,
  type CockpitBox,
  type OpsCockpitInput,
  type OpsCockpitJob,
  type OpsSignal,
  type TimelineEvent,
  type TimelineFacts,
} from "../lib/managersCockpit";
import { handoverFactsOf } from "../lib/managersCockpitHandover";
import type { TeamFacts, TeamJobFacts } from "../lib/managersCockpitTeam";
import { attentionFlags, type AttentionFacts } from "../lib/trackingAttention";
import { freightKindOf } from "../lib/trackingEvents";

// November 2026, the days these tests stand on:
//   Mon 16 · Tue 17 (a public holiday) · Wed 18 · Thu 19 · Fri 20 · Sat 21 · Sun 22 · Mon 23 · Tue 24 · Wed 25
// Wednesday 18 Nov 2026, 11:00 in Prague.
const NOW = new Date("2026-11-18T10:00:00Z");
const TODAY = "2026-11-18";
/** A moment of a November day on Prague's clock (CET, an hour ahead of UTC). */
const at = (day: string, time = "11:00") => new Date(`${day}T${time}:00+01:00`);
const WED = opsDay(NOW);
const FRI = opsDay(at("2026-11-20"));

let seq = 0;
// A job nothing asks about: every rule is switched on by the columns a test hands over.
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
    warehouseReleasedDate: null,
    originalsReceivedDate: null,
    telexReleaseReceivedDate: null,
    deliveryOrderDate: null,
    plannedDeliveryDate: null,
    actualDeliveryDate: null,
    personInCharge: "jan@firma.cz",
    holidayCover: "",
    closingDate: null,
    closingTime: "",
    vgmClosing: null,
    vgmClosingTime: "",
    vgm: "Pending (Red)",
    siClosing: null,
    siClosingTime: "",
    shippingInstructions: "",
    ams: "",
    amsDeadline: null,
    amsDeadlineTime: "",
    isf: "",
    isfDeadline: null,
    isfDeadlineTime: "",
    customsPriority: "Standard",
    customsStatus: "",
    customsDeadline: "",
    bookingConfirmation: "Received",
    claim: "No",
    cargoReadinessDate: null,
    pickupDate: null,
    masterBolNumber: "",
    masterBolType: "",
    houseBolType: "",
    houseBolRelease: "",
    bolDraft: "Approved",
    plateNumber: "",
    creditCheck: "Green",
    dangerous: "No",
    loadType: "Consolidation",
    masterJobId: null,
    customsProcedure: "",
    customsOffice: "",
    mrn: "",
    arrivalNoticeSent: true,
    createdAt: new Date("2026-11-01T08:00:00Z"),
    updatedAt: new Date("2026-11-01T08:00:00Z"),
    ...over,
  };
};
const USERS = new Set(["jan@firma.cz", "eva@firma.cz"]);
/** The people around the jobs, read and silent: no signal of theirs, and every figure of the people line a 0. Their rules are tests/managersCockpitTeam.test.ts. */
const QUIET_TEAM: TeamFacts = { byJob: new Map(), known: { todos: true, mentions: true, touched: true, coverSince: true }, notKnown: [] };
const teamOf = (byJob: Record<string, Partial<TeamJobFacts>>, known: Partial<TeamFacts["known"]> = {}): TeamFacts => ({
  byJob: new Map(Object.entries(byJob).map(([id, facts]) => [id, { signals: [], notTouched: null, todosLate: 0, mentionsUnread: new Map(), coverSince: null, ...facts }])),
  known: { ...QUIET_TEAM.known, ...known },
  notKnown: [],
});
const cockpit = (jobs: OpsCockpitJob[], over: Partial<OpsCockpitInput> = {}) =>
  buildOpsCockpit({
    jobs,
    facts: new Map(),
    timeline: new Map(),
    boxes: new Map(),
    movedIds: new Set(),
    userEmails: USERS,
    holidays: [],
    holidaysKnown: true,
    extraByJob: new Map(),
    masterJobRows: [],
    team: QUIET_TEAM,
    // No manager dismissed anything.
    cutoffsKept: (_jobId, cutoffs) => cutoffs,
    closingsDismissed: () => [],
    audit: null,
    notKnown: [],
    capped: false,
    mode: "all",
    direction: "all",
    handledBy: null,
    reports: "all",
    reportEmails: null,
    now: NOW,
    ...over,
  });
const AIR = { sea: 0, air: 1, rail: 0, road: 0 };
/** A person of the people line with nothing on them but their jobs, all by sea. */
const person = (handledBy: string, counts: { isUser?: boolean | null; active?: number; urgent?: number; attention?: number; covers?: number } = {}, over: Partial<ReturnType<typeof cockpit>["people"][number]> = {}) => ({
  handledBy,
  isUser: true,
  active: 1,
  urgent: 0,
  attention: 0,
  covers: 0,
  byMode: { sea: counts.active ?? 1, air: 0, rail: 0, road: 0 },
  todosLate: 0,
  mentionsUnread: 0,
  notTouched: 0,
  coversSince: null,
  highLoad: false,
  awayUntil: null,
  ...counts,
  ...over,
});
const timeline = (over: Partial<TimelineFacts> = {}): TimelineFacts => ({ pickedUp: false, loaded: false, gateIn: false, haulierConfirmed: false, podReceived: false, rolledOn: null, holdSince: null, ...over });
/** The job's cut-offs on a day, the cargo known not to be in. */
const due = (over: Partial<OpsCockpitJob>, day = WED, cargoIsIn: boolean | null = false) => cutoffsOf(job(over), day, cargoIsIn).map((c) => `${c.key} ${c.days} ${c.state}`);
const show = (signals: readonly OpsSignal[]) => signals.map((s) => `${s.urgent ? "URGENT" : "attention"} ${s.rank} ${s.kind} ${s.area} · ${s.text}`);
const texts = (signals: readonly OpsSignal[]) => signals.map((s) => s.text);
const tagsOf = (over: Partial<OpsCockpitJob>, day = WED) => cutoffSignals(cutoffsOf(job(over), day, false), day.today).map((s) => `${s.urgent ? "URGENT" : "attention"} ${s.rank} ${s.text}`);

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

// D6: the windows are working days. URGENT is today and the next working day, ATTENTION the two
// working days after - so what "soon" means moves with the weekend and the holidays.
describe("the day and its two windows", () => {
  it("reads the Prague day and time of day of `now`", () => {
    expect(WED).toMatchObject({ today: TODAY, minutes: 11 * 60 });
    // 23:30 UTC on the 17th is 00:30 on the 18th in Prague.
    expect(opsDay(new Date("2026-11-17T23:30:00Z"))).toMatchObject({ today: "2026-11-18", minutes: 30 });
    // In summer Prague is two hours ahead.
    expect(opsDay(new Date("2026-07-01T10:15:00Z"))).toMatchObject({ today: "2026-07-01", minutes: 12 * 60 + 15 });
  });

  it("URGENT ends on the next working day, ATTENTION two working days after that", () => {
    expect(WED).toMatchObject({ urgentUntil: "2026-11-19", attentionUntil: "2026-11-23" });
  });

  it("on a Friday the next working day is Monday: the weekend in between is urgent too", () => {
    expect(FRI).toMatchObject({ urgentUntil: "2026-11-23", attentionUntil: "2026-11-25" });
  });

  it("on a weekend it counts from the Monday", () => {
    expect(opsDay(at("2026-11-21"))).toMatchObject({ urgentUntil: "2026-11-23", attentionUntil: "2026-11-25" });
    expect(opsDay(at("2026-11-22"))).toMatchObject({ urgentUntil: "2026-11-23", attentionUntil: "2026-11-25" });
  });

  it("skips a public holiday: the Monday before the 17th of November looks to Wednesday", () => {
    expect(opsDay(at("2026-11-16"))).toMatchObject({ urgentUntil: "2026-11-18", attentionUntil: "2026-11-20" });
  });

  it("skips the company's own days off too", () => {
    expect(opsDay(NOW, ["2026-11-19"])).toMatchObject({ urgentUntil: "2026-11-20", attentionUntil: "2026-11-24", holidays: ["2026-11-19"] });
    expect(opsDay(NOW, ["2026-11-20", "2026-11-23"])).toMatchObject({ urgentUntil: "2026-11-19", attentionUntil: "2026-11-25" });
  });
});

// What is still open - the one rule, the Shipments list's Needs Attention reads it too (lib/needsAttention):
//   VGM / SI   by their closing date, unless Confirmed (VGM also: Not Applicable);
//   AMS / ISF  when Pending, by their deadline; without one, 4 days before departure.
describe("the cut-offs: which are open", () => {
  it("has none without dates", () => {
    expect(due({})).toEqual([]);
  });

  it("VGM: by its closing date, unless Confirmed or Not Applicable - a status is decorated free text", () => {
    expect(due({ vgmClosing: "2026-11-19", vgm: "Pending (Red)" })).toEqual(["vgmClosing 1 urgent"]);
    expect(due({ vgmClosing: "2026-11-19", vgm: "" })).toEqual(["vgmClosing 1 urgent"]);
    expect(due({ vgmClosing: "2026-11-19", vgm: "Confirmed (Green)" })).toEqual([]);
    expect(due({ vgmClosing: "2026-11-19", vgm: "CONFIRMED" })).toEqual([]);
    expect(due({ vgmClosing: "2026-11-19", vgm: "Not Applicable" })).toEqual([]);
    expect(due({ vgmClosing: null, vgm: "Pending (Red)" })).toEqual([]);
  });

  it("SI: by its closing date, unless Confirmed - Not Applicable does not close it", () => {
    expect(due({ siClosing: "2026-11-18", shippingInstructions: "Pending" })).toEqual(["siClosing 0 urgent"]);
    expect(due({ siClosing: "2026-11-18", shippingInstructions: "Not Applicable" })).toEqual(["siClosing 0 urgent"]);
    expect(due({ siClosing: "2026-11-18", shippingInstructions: "Confirmed (Green)" })).toEqual([]);
  });

  it("AMS and ISF: only when Pending, by their deadline; without one, 4 days before the ETD", () => {
    for (const [status, deadline, key] of [["ams", "amsDeadline", "amsDeadline"], ["isf", "isfDeadline", "isfDeadline"]] as const) {
      expect(due({ [status]: "Pending (Red)", [deadline]: "2026-11-20" })).toEqual([`${key} 2 attention`]);
      expect(due({ [status]: "pending", [deadline]: null, estimatedDeparture: "2026-11-23" })).toEqual([`${key} 1 urgent`]);
      // Its own deadline wins over the 4 days before the ETD.
      expect(due({ [status]: "Pending", [deadline]: "2026-11-21", estimatedDeparture: "2026-11-23" })).toEqual([`${key} 3 attention`]);
      expect(due({ [status]: "Pending", [deadline]: null, estimatedDeparture: null })).toEqual([]);
      expect(due({ [status]: "", [deadline]: "2026-11-20" })).toEqual([]);
      expect(due({ [status]: "Filed", [deadline]: "2026-11-20" })).toEqual([]);
      expect(due({ [status]: "Not Applicable", [deadline]: "2026-11-20" })).toEqual([]);
    }
  });
});

describe("the cut-offs: the two windows, in working days", () => {
  it("today and the next working day are URGENT, the two working days after ATTENTION, further out nothing yet", () => {
    // Wednesday: Thursday is the next working day; Friday and Monday the two after.
    expect(due({ vgmClosing: "2026-11-18" })).toEqual(["vgmClosing 0 urgent"]);
    expect(due({ vgmClosing: "2026-11-19" })).toEqual(["vgmClosing 1 urgent"]);
    expect(due({ vgmClosing: "2026-11-20" })).toEqual(["vgmClosing 2 attention"]);
    // The weekend in between belongs to the window it lies in.
    expect(due({ vgmClosing: "2026-11-21" })).toEqual(["vgmClosing 3 attention"]);
    expect(due({ vgmClosing: "2026-11-22" })).toEqual(["vgmClosing 4 attention"]);
    expect(due({ vgmClosing: "2026-11-23" })).toEqual(["vgmClosing 5 attention"]);
    expect(due({ vgmClosing: "2026-11-24" })).toEqual([]);
  });

  it("on a Friday, Monday's cut-off is URGENT and Wednesday's still ATTENTION", () => {
    expect(due({ closingDate: "2026-11-21" }, FRI)).toEqual(["closingDate 1 urgent"]);
    expect(due({ closingDate: "2026-11-23" }, FRI)).toEqual(["closingDate 3 urgent"]);
    expect(due({ closingDate: "2026-11-24" }, FRI)).toEqual(["closingDate 4 attention"]);
    expect(due({ closingDate: "2026-11-25" }, FRI)).toEqual(["closingDate 5 attention"]);
    expect(due({ closingDate: "2026-11-26" }, FRI)).toEqual([]);
  });

  it("a day off moves the windows on: before the holiday of the 17th, Wednesday is the next working day", () => {
    const monday = opsDay(at("2026-11-16"));
    expect(due({ siClosing: "2026-11-18" }, monday)).toEqual(["siClosing 2 urgent"]);
    expect(due({ siClosing: "2026-11-20" }, monday)).toEqual(["siClosing 4 attention"]);
    expect(due({ siClosing: "2026-11-21" }, monday)).toEqual([]);
    // The company's own day off does the same.
    expect(due({ siClosing: "2026-11-20" }, opsDay(NOW, ["2026-11-19"]))).toEqual(["siClosing 2 urgent"]);
  });

  it("every cut-off of a job counts by itself", () => {
    expect(due({ closingDate: "2026-11-19", vgmClosing: "2026-11-18", siClosing: "2026-11-20", shippingInstructions: "Pending" })).toEqual(["vgmClosing 0 urgent", "siClosing 2 attention", "closingDate 1 urgent"]);
  });

  it("is judged on the day it is handed, across a month's end", () => {
    const monday = opsDay(at("2026-11-30"));
    expect(due({ vgmClosing: "2026-12-01" }, monday)).toEqual(["vgmClosing 1 urgent"]);
    expect(due({ closingDate: "2026-11-30" }, opsDay(at("2026-12-01")))).toEqual(["closingDate -1 missed"]);
  });
});

// D7: a missed cut-off stays URGENT until the job has left or its ETD has passed - and a Closing
// until the cargo is in.
describe("the cut-offs: a missed one stays", () => {
  const overdue = { vgmClosing: "2026-11-16", siClosing: "2026-11-17", shippingInstructions: "Pending", ams: "Pending", amsDeadline: "2026-11-15", isf: "Pending", isfDeadline: "2026-11-10" };
  const all = ["vgmClosing -2 missed", "siClosing -1 missed", "amsDeadline -3 missed", "isfDeadline -8 missed"];

  it("a filing stays overdue while the job has not left and its ETD has not passed", () => {
    expect(due({ ...overdue, estimatedDeparture: "2026-11-25" })).toEqual(all);
    expect(due({ ...overdue, estimatedDeparture: "2026-11-18" })).toEqual(all);
  });

  it("the day after the ETD the miss is history: \"ETD passed, no ATD\" speaks instead", () => {
    expect(due({ ...overdue, estimatedDeparture: "2026-11-17" })).toEqual([]);
    expect(due({ ...overdue, estimatedDeparture: "2026-11-01" })).toEqual([]);
  });

  it("a job with no ETD keeps a missed cut-off 7 days after the cut-off's own date, not for ever", () => {
    // The ISF of the 10th is 8 days old: gone. The others are younger.
    expect(due({ ...overdue, estimatedDeparture: null })).toEqual(["vgmClosing -2 missed", "siClosing -1 missed", "amsDeadline -3 missed"]);
    expect(due({ vgmClosing: "2026-11-11" })).toEqual(["vgmClosing -7 missed"]);
    expect(due({ vgmClosing: "2026-11-10" })).toEqual([]);
  });

  it("is gone once the job has left - an ATD, an ATA or an actual delivery - or once somebody confirmed it", () => {
    const ahead = { ...overdue, estimatedDeparture: "2026-11-25", closingDate: "2026-11-19" };
    expect(due(ahead)).toHaveLength(5);
    expect(due({ ...ahead, actualDeparture: "2026-11-17" })).toEqual([]);
    // An import that arrived is gone though nobody typed its ATD.
    expect(due({ ...ahead, actualArrival: "2026-11-17" })).toEqual([]);
    expect(due({ ...ahead, actualDeliveryDate: "2026-11-17" })).toEqual([]);
    expect(due({ ...overdue, estimatedDeparture: "2026-11-25", vgm: "Confirmed (Green)", shippingInstructions: "Confirmed", ams: "Filed", isf: "Filed" })).toEqual([]);
  });

  it("an AMS without a deadline is overdue by the 4 days before its ETD, until that ETD has passed", () => {
    expect(due({ ams: "Pending", estimatedDeparture: "2026-11-20" })).toEqual(["amsDeadline -2 missed"]);
    expect(due({ ams: "Pending", estimatedDeparture: "2026-11-18" })).toEqual(["amsDeadline -4 missed"]);
    expect(due({ ams: "Pending", estimatedDeparture: "2026-11-17" })).toEqual([]);
  });

  it("a cut-off still ahead counts whatever the ETD says: only having left ends it", () => {
    expect(due({ vgmClosing: "2026-11-19", estimatedDeparture: "2026-11-01" })).toEqual(["vgmClosing 1 urgent"]);
    expect(due({ vgmClosing: "2026-11-19", closingDate: "2026-11-18", actualDeparture: "2026-11-17" })).toEqual([]);
  });

  it("a missed Closing stays - step 1 dropped it the next morning", () => {
    expect(due({ closingDate: "2026-11-17" })).toEqual(["closingDate -1 missed"]);
    expect(due({ closingDate: "2026-11-17", estimatedDeparture: "2026-11-20" })).toEqual(["closingDate -1 missed"]);
    // With an ETD still ahead it stays however old it is.
    expect(due({ closingDate: "2026-11-02", estimatedDeparture: "2026-11-18" })).toEqual(["closingDate -16 missed"]);
  });

  it("a missed Closing goes the day after the ETD, as a filing does - and with no ETD, 7 days after its own date", () => {
    expect(due({ closingDate: "2026-11-14", estimatedDeparture: "2026-11-17" })).toEqual([]);
    expect(due({ closingDate: "2026-11-11" })).toEqual(["closingDate -7 missed"]);
    // A job with no ETD and a Closing 8 days ago: nothing.
    expect(due({ closingDate: "2026-11-10" })).toEqual([]);
    expect(due({ closingDate: "2026-11-10", vgmClosing: "2026-11-10", siClosing: "2026-11-10" })).toEqual([]);
  });

  it("a missed Closing is cleared by the job having left", () => {
    expect(due({ closingDate: "2026-11-17", actualDeparture: "2026-11-18" })).toEqual([]);
    expect(due({ closingDate: "2026-11-17", actualArrival: "2026-11-18" })).toEqual([]);
  });

  it("a Closing - missed, due or ahead - is cleared once the cargo is in", () => {
    for (const closingDate of ["2026-11-17", "2026-11-18", "2026-11-20"]) {
      expect(due({ closingDate }, WED, false)).toHaveLength(1);
      expect(due({ closingDate }, WED, true)).toEqual([]);
    }
    // The filings are no cargo: they stay.
    expect(due({ closingDate: "2026-11-17", vgmClosing: "2026-11-17" }, WED, true)).toEqual(["vgmClosing -1 missed"]);
  });

  it("when nobody can tell whether the cargo is in (the timeline could not be read), a Closing still ahead shows by its date - only a missed one is withheld", () => {
    expect(due({ closingDate: "2026-11-18" }, WED, null)).toEqual(["closingDate 0 urgent"]);
    expect(due({ closingDate: "2026-11-19" }, WED, null)).toEqual(["closingDate 1 urgent"]);
    expect(due({ closingDate: "2026-11-23" }, WED, null)).toEqual(["closingDate 5 attention"]);
    expect(due({ closingDate: "2026-11-17", vgmClosing: "2026-11-17" }, WED, null)).toEqual(["vgmClosing -1 missed"]);
    // Today's Closing whose time has passed is a missed one too.
    expect(cutoffsOf(job({ closingDate: TODAY, closingTime: "09:30" }), WED, null)).toEqual([]);
    expect(cutoffsOf(job({ closingDate: TODAY, closingTime: "14:00" }), WED, null)).toMatchObject([{ state: "urgent", time: "14:00" }]);
  });

  describe("the cargo is in", () => {
    it("by a picked-up, loaded or gate-in fact on the timeline, or the day our warehouse received it", () => {
      expect(cargoIn(job(), timeline())).toBe(false);
      expect(cargoIn(job(), timeline({ pickedUp: true }))).toBe(true);
      expect(cargoIn(job(), timeline({ loaded: true }))).toBe(true);
      expect(cargoIn(job(), timeline({ gateIn: true }))).toBe(true);
      expect(cargoIn(job({ warehouseReceivedDate: "2026-11-16" }), timeline())).toBe(true);
      // A haulier's word or a POD is no cargo at the terminal.
      expect(cargoIn(job(), timeline({ haulierConfirmed: true, podReceived: true }))).toBe(false);
    });

    it("is not known without the timeline - unless the job's own column already says so", () => {
      expect(cargoIn(job(), null)).toBeNull();
      expect(cargoIn(job({ warehouseReceivedDate: "2026-11-16" }), null)).toBe(true);
    });
  });
});

describe("the cut-offs: a Closing with its time", () => {
  const closing = (closingTime: string, now: Date, closingDate = "2026-11-18") => cutoffsOf(job({ closingDate, closingTime }), opsDay(now), false).map((c) => `${c.state} ${c.time}`);

  it("is due until its time today, and missed once that has passed", () => {
    expect(closing("14:00", at(TODAY, "13:59"))).toEqual(["urgent 14:00"]);
    // At the cut-off minute itself the cargo is still on time.
    expect(closing("14:00", at(TODAY, "14:00"))).toEqual(["urgent 14:00"]);
    expect(closing("14:00", at(TODAY, "14:01"))).toEqual(["missed 14:00"]);
    expect(closing("09:30", NOW)).toEqual(["missed 09:30"]);
    expect(closing("9:30", NOW)).toEqual(["missed 09:30"]);
  });

  it("with no time, or one that is no time of day, the whole day counts", () => {
    expect(closing("", at(TODAY, "23:59"))).toEqual(["urgent "]);
    expect(closing("soon", at(TODAY, "23:59"))).toEqual(["urgent "]);
    expect(closing("25:00", at(TODAY, "23:59"))).toEqual(["urgent "]);
  });

  it("a time says nothing of another day: tomorrow's is ahead, yesterday's missed", () => {
    expect(closing("08:00", NOW, "2026-11-19")).toEqual(["urgent 08:00"]);
    expect(closing("23:00", NOW, "2026-11-17")).toEqual(["missed 23:00"]);
  });

  it("is read on Prague's clock, whatever zone the server is in", () => {
    // 12:30 UTC in July is 14:30 in Prague.
    const summer = new Date("2026-07-01T12:30:00Z");
    expect(closing("14:00", summer, "2026-07-01")).toEqual(["missed 14:00"]);
    expect(closing("15:00", summer, "2026-07-01")).toEqual(["urgent 15:00"]);
  });

  it("is the Closing's alone: a filing does not go by it", () => {
    expect(cutoffsOf(job({ vgmClosing: TODAY, closingTime: "08:00" }), WED, false)).toEqual([{ key: "vgmClosing", date: TODAY, time: "", days: 0, state: "urgent" }]);
  });
});

describe("the cut-offs: a filing with its time", () => {
  // The four filings, each due on `date` at `time`, on a job whose work on them is open.
  const filings = (date: string, time: string): Partial<OpsCockpitJob>[] => [
    { vgmClosing: date, vgmClosingTime: time },
    { siClosing: date, siClosingTime: time },
    { ams: "Pending", amsDeadline: date, amsDeadlineTime: time },
    { isf: "Pending", isfDeadline: date, isfDeadlineTime: time },
  ];
  const KEYS = ["vgmClosing", "siClosing", "amsDeadline", "isfDeadline"];
  const states = (over: Partial<OpsCockpitJob>, now: Date) => cutoffsOf(job(over), opsDay(now), false).map((c) => `${c.key} ${c.state} ${c.time}`);

  it("is due until its time today and overdue once that has passed - as the Closing is missed", () => {
    filings(TODAY, "14:00").forEach((filing, i) => {
      expect(states(filing, at(TODAY, "13:59"))).toEqual([`${KEYS[i]} urgent 14:00`]);
      // At the minute itself it is still on time.
      expect(states(filing, at(TODAY, "14:00"))).toEqual([`${KEYS[i]} urgent 14:00`]);
      expect(states(filing, at(TODAY, "14:01"))).toEqual([`${KEYS[i]} missed 14:00`]);
    });
    expect(states({ vgmClosing: TODAY, vgmClosingTime: "9:30" }, NOW)).toEqual(["vgmClosing missed 09:30"]);
  });

  it("with no time, or one that is no time of day, the whole day counts", () => {
    for (const time of ["", "soon", "25:00"]) {
      filings(TODAY, time).forEach((filing, i) => expect(states(filing, at(TODAY, "23:59"))).toEqual([`${KEYS[i]} urgent `]));
    }
  });

  it("a time says nothing of another day: tomorrow's is ahead, yesterday's overdue - and it is shown either way", () => {
    filings("2026-11-19", "08:00").forEach((filing, i) => expect(states(filing, NOW)).toEqual([`${KEYS[i]} urgent 08:00`]));
    filings("2026-11-17", "23:00").forEach((filing, i) => expect(states({ ...filing, estimatedDeparture: "2026-11-20" }, NOW)).toEqual([`${KEYS[i]} missed 23:00`]));
    filings("2026-11-20", "16:00").forEach((filing, i) => expect(states(filing, NOW)).toEqual([`${KEYS[i]} attention 16:00`]));
  });

  it("each cut-off goes by its own time, not a neighbour's", () => {
    const all = { closingDate: TODAY, closingTime: "18:00", vgmClosing: TODAY, vgmClosingTime: "10:00", siClosing: TODAY, siClosingTime: "12:00", ams: "Pending", amsDeadline: TODAY, amsDeadlineTime: "", isf: "Pending", isfDeadline: TODAY, isfDeadlineTime: "09:00" };
    // 11:00: the VGM and the ISF have passed, the SI and the Closing have not, the AMS has the whole day.
    expect(states(all, NOW)).toEqual(["vgmClosing missed 10:00", "siClosing urgent 12:00", "amsDeadline urgent ", "isfDeadline missed 09:00", "closingDate urgent 18:00"]);
  });

  it("AMS and ISF with no deadline typed are due 4 days before the ETD, a day with no time - whatever time stands in the empty deadline's field", () => {
    // ETD 22 Nov: due today, all day.
    const noDeadline = { ams: "Pending", amsDeadline: null, amsDeadlineTime: "08:00", isf: "Pending", isfDeadline: null, isfDeadlineTime: "08:00", estimatedDeparture: "2026-11-22" };
    expect(cutoffsOf(job(noDeadline), opsDay(at(TODAY, "23:59")), false)).toEqual([
      { key: "amsDeadline", date: TODAY, time: "", days: 0, state: "urgent" },
      { key: "isfDeadline", date: TODAY, time: "", days: 0, state: "urgent" },
    ]);
  });

  it("a filing whose work is done has none, whatever its time", () => {
    expect(states({ vgmClosing: TODAY, vgmClosingTime: "08:00", vgm: "Confirmed (Green)", siClosing: TODAY, siClosingTime: "08:00", shippingInstructions: "Confirmed", ams: "Filed", amsDeadline: TODAY, amsDeadlineTime: "08:00" }, NOW)).toEqual([]);
  });

  it("overdue today, it stays while the job has not left - as any overdue filing", () => {
    const overdue = { vgmClosing: TODAY, vgmClosingTime: "09:00" };
    expect(states({ ...overdue, estimatedDeparture: "2026-11-20" }, NOW)).toEqual(["vgmClosing missed 09:00"]);
    expect(states({ ...overdue, actualDeparture: TODAY }, NOW)).toEqual([]);
    // The ETD has passed: it is history, "ETD passed, no ATD" speaks instead.
    expect(states({ ...overdue, estimatedDeparture: "2026-11-17" }, NOW)).toEqual([]);
  });
});

describe("the cut-off signals", () => {
  it("a filing due today or by the next working day, or overdue, is URGENT - the overdue one first", () => {
    expect(tagsOf({ vgmClosing: "2026-11-18" })).toEqual(["URGENT 44 VGM closing today"]);
    expect(tagsOf({ vgmClosing: "2026-11-19" })).toEqual(["URGENT 44 VGM closing tomorrow"]);
    expect(tagsOf({ vgmClosing: "2026-11-16" })).toEqual(["URGENT 41 VGM overdue 2 days"]);
    expect(tagsOf({ siClosing: "2026-11-17", shippingInstructions: "Pending" })).toEqual(["URGENT 41 SI overdue 1 day"]);
    expect(tagsOf({ ams: "Pending", amsDeadline: "2026-11-19" })).toEqual(["URGENT 44 AMS deadline tomorrow"]);
    expect(tagsOf({ isf: "Pending", isfDeadline: "2026-11-18" })).toEqual(["URGENT 44 ISF deadline today"]);
    expect(tagsOf({ isf: "Pending", estimatedDeparture: "2026-11-19" })).toEqual(["URGENT 41 ISF overdue 3 days"]);
  });

  it("a filing shows its time when it has one; overdue since that time today, it says since when", () => {
    expect(tagsOf({ vgmClosing: "2026-11-18", vgmClosingTime: "14:00" })).toEqual(["URGENT 44 VGM closing today 14:00"]);
    expect(tagsOf({ siClosing: "2026-11-19", siClosingTime: "08:00" })).toEqual(["URGENT 44 SI closing tomorrow 08:00"]);
    expect(tagsOf({ ams: "Pending", amsDeadline: "2026-11-20", amsDeadlineTime: "12:00" })).toEqual(["attention 200 AMS deadline on Fri 20.11. 12:00"]);
    // 11:00 on the 18th: a filing due at 10:00 is overdue, and no day has passed yet.
    expect(tagsOf({ vgmClosing: "2026-11-18", vgmClosingTime: "10:00" })).toEqual(["URGENT 41 VGM overdue · today 10:00"]);
    expect(tagsOf({ isf: "Pending", isfDeadline: "2026-11-18", isfDeadlineTime: "09:15" })).toEqual(["URGENT 41 ISF overdue · today 09:15"]);
    // Overdue by days, the days say it.
    expect(tagsOf({ siClosing: "2026-11-16", siClosingTime: "10:00" })).toEqual(["URGENT 41 SI overdue 2 days"]);
  });

  it("the Closing today or by the next working day is URGENT, with its time when it has one", () => {
    expect(tagsOf({ closingDate: "2026-11-18" })).toEqual(["URGENT 50 Closing today"]);
    expect(tagsOf({ closingDate: "2026-11-18", closingTime: "14:00" })).toEqual(["URGENT 50 Closing today 14:00"]);
    expect(tagsOf({ closingDate: "2026-11-19", closingTime: "08:00" })).toEqual(["URGENT 50 Closing tomorrow 08:00"]);
  });

  it("a missed Closing is URGENT before everything else of the cut-offs, with the day and time it was", () => {
    expect(tagsOf({ closingDate: "2026-11-18", closingTime: "09:30" })).toEqual(["URGENT 40 Closing missed · today 09:30"]);
    expect(tagsOf({ closingDate: "2026-11-17" })).toEqual(["URGENT 40 Closing missed · 17.11."]);
    expect(tagsOf({ closingDate: "2026-11-13", closingTime: "16:00" })).toEqual(["URGENT 40 Closing missed · 13.11. 16:00"]);
  });

  it("beyond tomorrow a day is named: after a Friday the next working day is no \"tomorrow\"", () => {
    expect(tagsOf({ closingDate: "2026-11-21" }, FRI)).toEqual(["URGENT 50 Closing tomorrow"]);
    expect(tagsOf({ closingDate: "2026-11-23", closingTime: "12:00" }, FRI)).toEqual(["URGENT 50 Closing on Mon 23.11. 12:00"]);
    expect(tagsOf({ vgmClosing: "2026-11-22" }, FRI)).toEqual(["URGENT 44 VGM closing on Sun 22.11."]);
  });

  it("a cut-off in the two working days after is ATTENTION", () => {
    expect(tagsOf({ siClosing: "2026-11-20" })).toEqual(["attention 200 SI closing on Fri 20.11."]);
    expect(tagsOf({ vgmClosing: "2026-11-23" })).toEqual(["attention 200 VGM closing on Mon 23.11."]);
    expect(tagsOf({ ams: "Pending", amsDeadline: "2026-11-20" })).toEqual(["attention 200 AMS deadline on Fri 20.11."]);
    expect(tagsOf({ isf: "Pending", estimatedDeparture: "2026-11-25" })).toEqual(["attention 200 ISF deadline on Sat 21.11."]);
    expect(tagsOf({ closingDate: "2026-11-21", closingTime: "10:00" })).toEqual(["attention 200 Closing on Sat 21.11. 10:00"]);
    expect(tagsOf({ closingDate: "2026-11-24", vgmClosing: "2026-11-24", siClosing: "2026-12-01" })).toEqual([]);
  });

  it("every cut-off of a job is a signal of its own, of the kind \"cutoff\", worked on in the job's details", () => {
    const signals = cutoffSignals(cutoffsOf(job({ closingDate: "2026-11-19", vgmClosing: "2026-11-18", siClosing: "2026-11-20" }), WED, false), TODAY);
    expect(texts(signals)).toEqual(["VGM closing today", "SI closing on Fri 20.11.", "Closing tomorrow"]);
    expect(signals.every((s) => s.area === "details" && s.kind === "cutoff")).toBe(true);
  });
});

describe("what a job's timeline says", () => {
  const event = (kind: string, occurredOn: string, over: Partial<TimelineEvent> = {}): TimelineEvent => ({ kind, occurredOn, effect: "none", resolvedAt: null, ...over });

  it("is nothing for no events", () => {
    expect(timelineFactsOf([])).toEqual(timeline());
  });

  it("knows the facts that happened: picked up, loaded, gate in, haulier confirmed, POD received", () => {
    expect(timelineFactsOf([event("picked_up", "2026-11-10")])).toEqual(timeline({ pickedUp: true }));
    expect(timelineFactsOf([event("loaded", "2026-11-10", { effect: "applied" })])).toEqual(timeline({ loaded: true }));
    expect(timelineFactsOf([event("gate_in", "2026-11-10"), event("haulier_confirmed", "2026-11-10"), event("pod_received", "2026-11-12")])).toEqual(timeline({ gateIn: true, haulierConfirmed: true, podReceived: true }));
  });

  it("takes no proposal and nothing set aside for a fact", () => {
    expect(timelineFactsOf([event("picked_up", "2026-11-10", { effect: "proposed" }), event("loaded", "2026-11-10", { effect: "dismissed" }), event("hold", "2026-11-10", { effect: "dismissed" })])).toEqual(timeline());
  });

  it("a Rolled exception is open until somebody or a later event closed it; the latest open one is named", () => {
    expect(timelineFactsOf([event("rolled", "2026-11-12")]).rolledOn).toBe("2026-11-12");
    expect(timelineFactsOf([event("rolled", "2026-11-12", { resolvedAt: new Date("2026-11-14T09:00:00Z") })]).rolledOn).toBeNull();
    expect(timelineFactsOf([event("rolled", "2026-11-16"), event("rolled", "2026-11-12"), event("rolled", "2026-11-17", { resolvedAt: new Date() })]).rolledOn).toBe("2026-11-16");
  });

  it("a Customs hold is open while nobody and nothing closed it, from its first day", () => {
    expect(timelineFactsOf([event("hold", "2026-11-16"), event("hold", "2026-11-12")]).holdSince).toBe("2026-11-12");
    expect(timelineFactsOf([event("hold", "2026-11-12", { resolvedAt: new Date("2026-11-13T09:00:00Z") })]).holdSince).toBeNull();
    // A customs release closes the holds open then (it sets their resolvedAt); one held again since is open.
    expect(timelineFactsOf([event("hold", "2026-11-10", { resolvedAt: new Date("2026-11-12T09:00:00Z") }), event("hold", "2026-11-15")]).holdSince).toBe("2026-11-15");
  });

  it("goes by whether a hold was closed alone: a hold recorded after a release, but dated before it, is not hidden by that release", () => {
    // Released on the 14th; on the 16th somebody records a hold that began on the 13th. It is open.
    expect(timelineFactsOf([event("customs_released", "2026-11-14"), event("hold", "2026-11-13")]).holdSince).toBe("2026-11-13");
    expect(COCKPIT_EVENT_KINDS).not.toContain("customs_released");
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

describe("the customs signals (U9)", () => {
  const urgentJob = job({ customsPriority: "Urgent", customsStatus: "Documents Pending", customsDeadline: "2026-11-18 15:00" });

  it("an Urgent job's deadline, as step 1 said it", () => {
    expect(show(customsSignals(urgentJob, timeline(), NOW, TODAY))).toEqual(["URGENT 30 customs customs · Customs urgent · deadline 18.11. 15:00"]);
    expect(texts(customsSignals({ ...urgentJob, customsDeadline: "2026-11-17 09:00" }, null, NOW, TODAY))).toEqual(["Customs urgent · deadline 17.11. 09:00 passed"]);
  });

  it("an open Customs hold is URGENT from its first day, with its age", () => {
    expect(show(customsSignals(job(), timeline({ holdSince: TODAY }), NOW, TODAY))).toEqual(["URGENT 32 customs customs · Customs hold · since today"]);
    expect(texts(customsSignals(job(), timeline({ holdSince: "2026-11-17" }), NOW, TODAY))).toEqual(["Customs hold · 1 day, since 17.11."]);
    expect(texts(customsSignals(job(), timeline({ holdSince: "2026-11-09" }), NOW, TODAY))).toEqual(["Customs hold · 9 days, since 09.11."]);
  });

  it("a job can carry both; without the timeline a hold is not known and nothing is said of one", () => {
    expect(texts(customsSignals(urgentJob, timeline({ holdSince: "2026-11-16" }), NOW, TODAY))).toEqual(["Customs urgent · deadline 18.11. 15:00", "Customs hold · 2 days, since 16.11."]);
    expect(customsSignals(job(), null, NOW, TODAY)).toEqual([]);
    expect(customsSignals(job(), timeline(), NOW, TODAY)).toEqual([]);
  });
});

describe("Booking Confirmation still Pending (U4)", () => {
  const pending = (over: Partial<OpsCockpitJob>) => texts(bookingSignals(job({ tradeDirection: "Export", bookingConfirmation: "Pending", ...over }), TODAY));

  it("is URGENT with the cargo ready within 3 days or the ETD within 7", () => {
    expect(show(bookingSignals(job({ bookingConfirmation: "Pending", cargoReadinessDate: "2026-11-21" }), TODAY))).toEqual(["URGENT 52 booking details · Booking Confirmation Pending · cargo ready 21.11."]);
    expect(pending({ cargoReadinessDate: "2026-11-22" })).toEqual([]);
    expect(pending({ estimatedDeparture: "2026-11-25" })).toEqual(["Booking Confirmation Pending · ETD 25.11."]);
    expect(pending({ estimatedDeparture: "2026-11-26" })).toEqual([]);
    expect(pending({ cargoReadinessDate: "2026-11-18", estimatedDeparture: "2026-11-24" })).toEqual(["Booking Confirmation Pending · cargo ready 18.11. · ETD 24.11."]);
    expect(pending({})).toEqual([]);
  });

  it("by rail and road the same; by air only with the cargo ready within 1 day or the ETD within 2", () => {
    for (const freightMode of ["Rail Freight", "Road Freight"]) {
      expect(pending({ freightMode, cargoReadinessDate: "2026-11-21" })).toHaveLength(1);
      expect(pending({ freightMode, estimatedDeparture: "2026-11-25" })).toHaveLength(1);
      expect(pending({ freightMode, cargoReadinessDate: "2026-11-22", estimatedDeparture: "2026-11-26" })).toEqual([]);
    }
    const air = { freightMode: "Air Freight" };
    expect(pending({ ...air, cargoReadinessDate: "2026-11-19" })).toEqual(["Booking Confirmation Pending · cargo ready 19.11."]);
    expect(pending({ ...air, cargoReadinessDate: "2026-11-20" })).toEqual([]);
    expect(pending({ ...air, estimatedDeparture: "2026-11-20" })).toEqual(["Booking Confirmation Pending · ETD 20.11."]);
    expect(pending({ ...air, estimatedDeparture: "2026-11-21" })).toEqual([]);
  });

  it("a date that passed lately still counts; one longer ago than 7 days no more", () => {
    expect(pending({ cargoReadinessDate: "2026-11-11" })).toHaveLength(1);
    expect(pending({ cargoReadinessDate: "2026-11-10" })).toEqual([]);
    expect(pending({ estimatedDeparture: "2026-11-11" })).toHaveLength(1);
    expect(pending({ estimatedDeparture: "2026-11-10" })).toEqual([]);
  });

  it("is not on a Trucking job - Domestic or of the Road Department: it is born Pending and has no booking to confirm", () => {
    const soon = { cargoReadinessDate: "2026-11-19", estimatedDeparture: "2026-11-20" };
    expect(pending({ ...soon, tradeDirection: "Domestic", freightMode: "Road Freight" })).toEqual([]);
    expect(pending({ ...soon, tradeDirection: "Domestic", freightMode: "" })).toEqual([]);
    expect(pending({ ...soon, department: "Road Department" })).toEqual([]);
    // An international Road Freight job is booked with a carrier like any other.
    expect(pending({ ...soon, tradeDirection: "Import", freightMode: "Road Freight" })).toHaveLength(1);
  });

  it("is not for a booking that came, in whatever case the Pending is written, nor for a job that has left", () => {
    expect(pending({ bookingConfirmation: "Received", estimatedDeparture: "2026-11-20" })).toEqual([]);
    expect(pending({ bookingConfirmation: "PENDING (carrier)", estimatedDeparture: "2026-11-20" })).toHaveLength(1);
    expect(pending({ estimatedDeparture: "2026-11-17", actualDeparture: "2026-11-17" })).toEqual([]);
    expect(pending({ estimatedDeparture: "2026-11-17", actualArrival: "2026-11-18" })).toEqual([]);
    expect(pending({ estimatedDeparture: "2026-11-17", actualDeliveryDate: "2026-11-18" })).toEqual([]);
  });
});

describe("cargo ready after the Closing (U5)", () => {
  const late = (over: Partial<OpsCockpitJob>, cargoIsIn: boolean | null = false) => cargoReadySignals(job({ cargoReadinessDate: "2026-11-25", closingDate: "2026-11-24", ...over }), cargoIsIn, TODAY);

  it("is URGENT: it will miss the vessel or flight", () => {
    expect(show(late({}))).toEqual(["URGENT 53 cargo_ready details · Cargo ready 25.11., after Closing 24.11."]);
    expect(late({ cargoReadinessDate: "2026-11-24" })).toEqual([]);
    expect(late({ cargoReadinessDate: "2026-11-23" })).toEqual([]);
    expect(late({ cargoReadinessDate: null })).toEqual([]);
    expect(late({ closingDate: null })).toEqual([]);
  });

  it("is over once the job left or the cargo is in - and still said when the timeline could not be read: both dates are the job's own", () => {
    expect(late({ actualDeparture: "2026-11-18" })).toEqual([]);
    expect(late({}, true)).toEqual([]);
    expect(late({}, null)).toHaveLength(1);
  });

  it("is not said of a Closing longer ago than 7 days", () => {
    expect(late({ closingDate: "2026-11-11", cargoReadinessDate: "2026-11-12" })).toHaveLength(1);
    expect(late({ closingDate: "2026-11-10", cargoReadinessDate: "2026-11-12" })).toEqual([]);
  });

  it("is not said of a Closing a manager dismissed - only while the Closing keeps the date dismissed", () => {
    const missed = job({ cargoReadinessDate: "2026-11-17", closingDate: "2026-11-16" });
    expect(cargoReadySignals(missed, false, TODAY)).toHaveLength(1);
    expect(cargoReadySignals(missed, false, TODAY, ["2026-11-16"])).toEqual([]);
    // Moved to another day, it is a new Closing: the cargo is late for it again.
    expect(cargoReadySignals(job({ cargoReadinessDate: "2026-11-25", closingDate: "2026-11-24" }), false, TODAY, ["2026-11-16"])).toHaveLength(1);
  });
});

describe("an air export with no MAWB number (U15)", () => {
  const air = (over: Partial<OpsCockpitJob>) => mawbSignals(job({ tradeDirection: "Export", freightMode: "Air Freight", estimatedDeparture: "2026-11-19", ...over }), TODAY);

  it("is URGENT with the ETD within 1 day", () => {
    expect(show(air({}))).toEqual(["URGENT 54 air details · No MAWB number · ETD 19.11."]);
    expect(air({ estimatedDeparture: TODAY })).toHaveLength(1);
    expect(air({ estimatedDeparture: "2026-11-20" })).toEqual([]);
    expect(air({ estimatedDeparture: null })).toEqual([]);
  });

  it("is not said once the number is there or the flight left, nor of an import or a sea job", () => {
    expect(air({ masterBolNumber: " 172-12345675 " })).toEqual([]);
    expect(air({ actualDeparture: TODAY })).toEqual([]);
    // Left is an ATA or a delivery too, where the ATD was never typed.
    expect(air({ actualArrival: TODAY })).toEqual([]);
    expect(air({ actualDeliveryDate: TODAY })).toEqual([]);
    expect(air({ tradeDirection: "Import" })).toEqual([]);
    expect(air({ freightMode: "Sea Freight" })).toEqual([]);
  });
});

describe("the B/L signals", () => {
  describe("A2: the BoL draft not Approved 3 days before the SI closing", () => {
    const draft = (over: Partial<OpsCockpitJob>) => bolSignals(job({ tradeDirection: "Export", bolDraft: "Not Processed", siClosing: "2026-11-21", ...over }), WED);

    it("is ATTENTION from 3 days before, whatever else the draft's state is", () => {
      expect(show(draft({}))).toEqual(["attention 202 bl details · BoL draft not Approved · SI closing 21.11."]);
      expect(draft({ siClosing: "2026-11-22" })).toEqual([]);
      expect(draft({ bolDraft: "Waiting for approval" })).toHaveLength(1);
      expect(draft({ bolDraft: "" })).toHaveLength(1);
      expect(draft({ bolDraft: "Approved" })).toEqual([]);
      expect(draft({ bolDraft: " approved (Green)" })).toEqual([]);
      expect(draft({ siClosing: null })).toEqual([]);
    });

    it("is an export's: an import's draft is the agent's", () => {
      expect(draft({ tradeDirection: "Import" })).toEqual([]);
      expect(draft({ tradeDirection: "Domestic" })).toEqual([]);
      expect(draft({ tradeDirection: " EXPORT " })).toHaveLength(1);
    });

    it("stays after the SI closing while the job has not left and its ETD has not passed", () => {
      expect(draft({ siClosing: "2026-11-12", estimatedDeparture: "2026-11-20" })).toHaveLength(1);
      expect(draft({ siClosing: "2026-11-12", estimatedDeparture: "2026-11-18" })).toHaveLength(1);
      expect(draft({ siClosing: "2026-11-12", estimatedDeparture: "2026-11-17" })).toEqual([]);
      expect(draft({ siClosing: "2026-11-12", estimatedDeparture: "2026-11-20", actualDeparture: "2026-11-16" })).toEqual([]);
      expect(draft({ siClosing: "2026-11-12", estimatedDeparture: "2026-11-20", actualArrival: "2026-11-16" })).toEqual([]);
      expect(draft({ siClosing: "2026-11-12", estimatedDeparture: "2026-11-20", actualDeliveryDate: "2026-11-16" })).toEqual([]);
    });

    it("with no ETD it stays 7 days after the SI closing", () => {
      expect(draft({ siClosing: "2026-11-11" })).toHaveLength(1);
      expect(draft({ siClosing: "2026-11-10" })).toEqual([]);
    });

    it("before the SI closing it is said whatever the ETD says, while the job has not left", () => {
      expect(draft({ siClosing: "2026-11-20", estimatedDeparture: "2026-11-10" })).toHaveLength(1);
      expect(draft({ siClosing: "2026-11-20", actualArrival: "2026-11-17" })).toEqual([]);
    });
  });

  describe("A3: a sea export departed and the House BoL not released", () => {
    const departed = (actualDeparture: string, over: Partial<OpsCockpitJob> = {}, day = WED) => bolSignals(job({ tradeDirection: "Export", actualDeparture, ...over }), day);

    it("is ATTENTION 5 working days after the ATD - the weekend and the holiday of the 17th do not count", () => {
      // Tuesday the 10th: Wed, Thu, Fri, Mon and Wed the 18th are five.
      expect(show(departed("2026-11-10"))).toEqual(["attention 249 bl details · House BoL not released · ATD 10.11."]);
      expect(departed("2026-11-11")).toEqual([]);
      expect(departed("2026-11-11", {}, opsDay(at("2026-11-19")))).toHaveLength(1);
    });

    it("counts the company's own day off as no working day", () => {
      expect(departed("2026-11-10", {}, opsDay(NOW, ["2026-11-16"]))).toEqual([]);
      // A day off on a weekend takes nothing away.
      expect(departed("2026-11-10", {}, opsDay(NOW, ["2026-11-14"]))).toHaveLength(1);
    });

    it("is not said once released, nor of an import, an air or rail job, or a job on a Direct MBL", () => {
      expect(departed("2026-11-02", { houseBolRelease: "jan@firma.cz — 12. 11. 2026 10:00:00" })).toEqual([]);
      expect(departed("2026-11-02", { tradeDirection: "Import" })).toEqual([]);
      expect(departed("2026-11-02", { freightMode: "Air Freight" })).toEqual([]);
      expect(departed("2026-11-02", { freightMode: "Rail Freight" })).toEqual([]);
      expect(departed("2026-11-02", { houseBolType: "Direct MBL" })).toEqual([]);
      expect(departed("2026-11-02", { houseBolType: "OBL" })).toHaveLength(1);
    });
  });
});

describe("Credit Check not Green (A24)", () => {
  const credit = (over: Partial<OpsCockpitJob>) => creditSignals(job({ creditCheck: "Red", estimatedDeparture: "2026-11-21", ...over }), TODAY);

  it("is ATTENTION with the ETD within 3 days, naming what the check says", () => {
    expect(show(credit({}))).toEqual(["attention 204 credit details · Credit Check Red · ETD 21.11."]);
    expect(texts(credit({ creditCheck: "Yellow" }))).toEqual(["Credit Check Yellow · ETD 21.11."]);
    expect(texts(credit({ creditCheck: "" }))).toEqual(["Credit Check not set · ETD 21.11."]);
    expect(credit({ estimatedDeparture: "2026-11-22" })).toEqual([]);
    expect(credit({ estimatedDeparture: null })).toEqual([]);
  });

  it("is not said of a Green one, a job that has left, or an ETD longer ago than 7 days", () => {
    expect(credit({ creditCheck: " green " })).toEqual([]);
    expect(credit({ actualDeparture: TODAY })).toEqual([]);
    expect(credit({ estimatedDeparture: "2026-11-16", actualArrival: "2026-11-17" })).toEqual([]);
    expect(credit({ estimatedDeparture: "2026-11-16", actualDeliveryDate: "2026-11-17" })).toEqual([]);
    expect(credit({ estimatedDeparture: "2026-11-11" })).toHaveLength(1);
    expect(credit({ estimatedDeparture: "2026-11-10" })).toEqual([]);
  });
});

describe("an open Rolled exception (U6)", () => {
  it("is URGENT, with its day; nothing without one, or without the timeline", () => {
    expect(show(rolledSignals(timeline({ rolledOn: "2026-11-16" })))).toEqual(["URGENT 56 departure tracking · Rolled · 16.11."]);
    expect(rolledSignals(timeline())).toEqual([]);
    expect(rolledSignals(null)).toEqual([]);
  });
});

describe("an import arriving with no arrival notice sent (A4)", () => {
  const arriving = (over: Partial<OpsCockpitJob>) => arrivalNoticeSignals(job({ arrivalNoticeSent: false, estimatedArrival: "2026-11-23", ...over }), TODAY);

  it("is ATTENTION with the ETA within 5 days", () => {
    expect(show(arriving({}))).toEqual(["attention 206 arrival_notice tracking · No arrival notice sent · ETA 23.11."]);
    expect(arriving({ estimatedArrival: "2026-11-24" })).toEqual([]);
    expect(arriving({ estimatedArrival: null })).toEqual([]);
  });

  it("an ETA that passed with no ATA is still arriving, for 14 days", () => {
    expect(arriving({ estimatedArrival: "2026-11-04" })).toHaveLength(1);
    expect(arriving({ estimatedArrival: "2026-11-03" })).toEqual([]);
  });

  it("is silent when the job's status says an arrival notice was sent, in any case - a status set by hand is somebody's word too", () => {
    expect(arriving({ status: "Arrival Notice Sent - Waiting For Instructions [IMP]" })).toEqual([]);
    expect(arriving({ status: "ARRIVAL NOTICE SENT – waiting for instructions" })).toEqual([]);
    expect(arriving({ status: "Arrival Notice Pending [IMP]" })).toHaveLength(1);
    expect(arriving({ status: "" })).toHaveLength(1);
  });

  it("is not said once the notice went or the job arrived, nor of an export or a road job - by air and rail it is", () => {
    expect(arriving({ arrivalNoticeSent: true })).toEqual([]);
    expect(arriving({ actualArrival: TODAY })).toEqual([]);
    expect(arriving({ tradeDirection: "Export" })).toEqual([]);
    expect(arriving({ freightMode: "Road Freight" })).toEqual([]);
    expect(arriving({ tradeDirection: "Domestic" })).toEqual([]);
    expect(arriving({ freightMode: "Air Freight" })).toHaveLength(1);
    expect(arriving({ freightMode: "Rail Freight" })).toHaveLength(1);
  });
});

describe("a Full Load import arriving with a container not ready (A5)", () => {
  const fcl = (over: Partial<OpsCockpitJob> = {}) => job({ loadType: "Full Load", estimatedArrival: "2026-11-25", ...over });
  const box = (containerNumber: string, over: Partial<CockpitBox> = {}): CockpitBox => ({ containerNumber, freeTimeDays: null, lastFreeDay: null, ...over });

  it("looks at the boxes of a Full Load import by sea or rail arriving within 7 days", () => {
    expect(boxesWanted(fcl(), TODAY)).toBe(true);
    expect(boxesWanted(fcl({ loadType: " full load " }), TODAY)).toBe(true);
    expect(boxesWanted(fcl({ freightMode: "Rail Freight" }), TODAY)).toBe(true);
    expect(boxesWanted(fcl({ estimatedArrival: "2026-11-26" }), TODAY)).toBe(false);
    expect(boxesWanted(fcl({ estimatedArrival: "2026-11-04" }), TODAY)).toBe(true);
    expect(boxesWanted(fcl({ estimatedArrival: "2026-11-03" }), TODAY)).toBe(false);
    expect(boxesWanted(fcl({ actualArrival: TODAY }), TODAY)).toBe(false);
    expect(boxesWanted(fcl({ loadType: "Consolidation" }), TODAY)).toBe(false);
    expect(boxesWanted(fcl({ freightMode: "Air Freight" }), TODAY)).toBe(false);
    expect(boxesWanted(fcl({ tradeDirection: "Export" }), TODAY)).toBe(false);
  });

  it("a container with no free time typed is ATTENTION, named by its number", () => {
    expect(show(boxSignals(fcl(), [box("MSKU1234567")], TODAY))).toEqual(["attention 208 free_time tracking · No free time typed · MSKU1234567 · ETA 25.11."]);
    expect(texts(boxSignals(fcl(), [box("MSKU1234567"), box("MSKU7654321"), box("TCLU1111111", { freeTimeDays: 14 })], TODAY))).toEqual(["No free time typed · MSKU1234567 and 1 more · ETA 25.11."]);
    expect(texts(boxSignals(fcl(), [box(""), box(" ")], TODAY))).toEqual(["No free time typed · 2 containers · ETA 25.11."]);
  });

  it("free days typed, or the carrier's last free day, is enough", () => {
    expect(boxSignals(fcl(), [box("MSKU1234567", { freeTimeDays: 0 }), box("MSKU7654321", { lastFreeDay: "2026-12-01" })], TODAY)).toEqual([]);
  });

  it("after departure a container with no number - or no container at all - is ATTENTION", () => {
    const timed = { freeTimeDays: 7 };
    expect(show(boxSignals(fcl({ actualDeparture: "2026-11-10" }), [box("", timed)], TODAY))).toEqual(["attention 208 free_time details · No container number · departed 10.11."]);
    expect(texts(boxSignals(fcl({ actualDeparture: "2026-11-10" }), [], TODAY))).toEqual(["No container number · departed 10.11."]);
    expect(texts(boxSignals(fcl({ actualDeparture: "2026-11-10" }), [box("")], TODAY))).toEqual(["No free time typed · 1 container · ETA 25.11.", "No container number · departed 10.11."]);
    // Before departure the number is not expected yet.
    expect(boxSignals(fcl(), [box("", timed)], TODAY)).toEqual([]);
    expect(boxSignals(fcl(), [], TODAY)).toEqual([]);
  });

  it("says nothing when the containers could not be read, or of a job it does not look at", () => {
    expect(boxSignals(fcl({ actualDeparture: "2026-11-10" }), null, TODAY)).toEqual([]);
    expect(boxSignals(fcl({ loadType: "Consolidation" }), [box("MSKU1234567")], TODAY)).toEqual([]);
    expect(boxSignals(fcl({ estimatedArrival: "2026-11-26" }), [box("MSKU1234567")], TODAY)).toEqual([]);
  });
});

describe("the delivery signals", () => {
  const delivery = (over: Partial<OpsCockpitJob>, day = WED) => deliverySignals(job(over), day);

  it("U13: a planned delivery that passed with no actual delivery is URGENT from the next morning", () => {
    expect(show(delivery({ plannedDeliveryDate: "2026-11-17" }))).toEqual(["URGENT 58 delivery tracking · Planned delivery 17.11. passed, not delivered"]);
    expect(texts(delivery({ plannedDeliveryDate: "2026-10-01" }))).toEqual(["Planned delivery 01.10. passed, not delivered"]);
    // On its own day it is still to happen - a plate number is no question any more either.
    expect(delivery({ plannedDeliveryDate: TODAY })).toEqual([]);
    expect(delivery({ plannedDeliveryDate: "2026-11-17", actualDeliveryDate: "2026-11-17" })).toEqual([]);
    expect(delivery({})).toEqual([]);
  });

  it("A21: a delivery on the next working day with no plate number is ATTENTION", () => {
    expect(show(delivery({ plannedDeliveryDate: "2026-11-19" }))).toEqual(["attention 242 delivery details · Delivery tomorrow, no plate number"]);
    expect(delivery({ plannedDeliveryDate: "2026-11-19", plateNumber: " 1AB 2345 " })).toEqual([]);
    expect(delivery({ plannedDeliveryDate: "2026-11-20" })).toEqual([]);
    // On a Friday the next working day is Monday.
    expect(texts(delivery({ plannedDeliveryDate: "2026-11-23" }, FRI))).toEqual(["Delivery on Mon 23.11., no plate number"]);
    expect(texts(delivery({ plannedDeliveryDate: "2026-11-21" }, FRI))).toEqual(["Delivery tomorrow, no plate number"]);
    expect(delivery({ plannedDeliveryDate: "2026-11-24" }, FRI)).toEqual([]);
  });
});

describe("the signals of our warehouse", () => {
  const wh = (over: Partial<OpsCockpitJob>, day = WED) => warehouseSignals(job(over), day);

  it("U13: the ETA at our warehouse passed and nothing was received is URGENT", () => {
    expect(show(wh({ etaWarehouse: "2026-11-17" }))).toEqual(["URGENT 58 warehouse tracking · ETA warehouse 17.11. passed, not received"]);
    expect(wh({ etaWarehouse: TODAY })).toEqual([]);
    expect(wh({ etaWarehouse: "2026-11-17", actualDeliveryDate: "2026-11-17" })).toEqual([]);
    expect(wh({})).toEqual([]);
  });

  it("U13 is not said of an export that has left: its cargo is on the vessel, whatever the warehouse did not stamp", () => {
    const stale = { tradeDirection: "Export", etaWarehouse: "2026-11-05" };
    expect(wh(stale)).toHaveLength(1);
    expect(wh({ ...stale, actualDeparture: "2026-11-10" })).toEqual([]);
    expect(wh({ ...stale, actualArrival: "2026-11-17" })).toEqual([]);
    // An import that arrived is exactly the job whose cargo our warehouse still waits for.
    expect(wh({ tradeDirection: "Import", etaWarehouse: "2026-11-17", actualDeparture: "2026-10-20", actualArrival: "2026-11-15" })).toHaveLength(1);
  });

  it("A20: received, with no planned delivery and no release after 2 working days, is ATTENTION", () => {
    // Friday the 13th: Monday and Wednesday are two working days (Tuesday is a holiday).
    expect(show(wh({ etaWarehouse: "2026-11-12", warehouseReceivedDate: "2026-11-13" }))).toEqual(["attention 246 warehouse tracking · In our warehouse since 13.11., no planned delivery"]);
    expect(wh({ warehouseReceivedDate: "2026-11-16" })).toEqual([]);
    expect(wh({ warehouseReceivedDate: "2026-11-16" }, opsDay(at("2026-11-19")))).toHaveLength(1);
    expect(wh({ warehouseReceivedDate: "2026-11-13" }, opsDay(NOW, ["2026-11-16"]))).toEqual([]);
  });

  it("A20 is not said once a delivery is planned, the cargo was released or delivered - nor of an export, which waits there for its vessel", () => {
    const received = { warehouseReceivedDate: "2026-11-09" };
    expect(wh(received)).toHaveLength(1);
    expect(wh({ ...received, tradeDirection: "Domestic" })).toHaveLength(1);
    expect(wh({ ...received, plannedDeliveryDate: "2026-11-25" })).toEqual([]);
    expect(wh({ ...received, warehouseReleasedDate: "2026-11-12" })).toEqual([]);
    expect(wh({ ...received, actualDeliveryDate: "2026-11-12" })).toEqual([]);
    expect(wh({ ...received, tradeDirection: "Export" })).toEqual([]);
  });
});

describe("the road signals, from the job's timeline", () => {
  const trucking = (over: Partial<OpsCockpitJob> = {}) => job({ tradeDirection: "Domestic", freightMode: "Road Freight", ...over });
  const international = (over: Partial<OpsCockpitJob> = {}) => job({ tradeDirection: "Import", freightMode: "Road Freight", ...over });

  describe("U14: the pick-up", () => {
    it("today with no haulier confirmed is URGENT on a Trucking job - Trucking stamps the haulier nowhere else", () => {
      expect(show(roadSignals(trucking({ pickupDate: TODAY }), timeline(), WED))).toEqual(["URGENT 59 road tracking · Pick-up today, haulier not confirmed"]);
      expect(roadSignals(job({ department: "Road Department", pickupDate: TODAY }), timeline(), WED)).toHaveLength(1);
      expect(roadSignals(trucking({ pickupDate: TODAY }), timeline({ haulierConfirmed: true }), WED)).toEqual([]);
      expect(roadSignals(international({ pickupDate: TODAY }), timeline(), WED)).toEqual([]);
    });

    it("a pick-up day that passed with nothing picked up is URGENT on any road job", () => {
      expect(show(roadSignals(trucking({ pickupDate: "2026-11-17" }), timeline({ haulierConfirmed: true }), WED))).toEqual(["URGENT 59 road tracking · Pick-up 17.11. passed, not picked up"]);
      expect(texts(roadSignals(international({ pickupDate: "2026-11-13" }), timeline(), WED))).toEqual(["Pick-up 13.11. passed, not picked up"]);
      // One tag, not two: the haulier is no question once the day has passed.
      expect(roadSignals(trucking({ pickupDate: "2026-11-17" }), timeline(), WED)).toHaveLength(1);
    });

    it("is over once it was picked up or the job has left or was delivered", () => {
      expect(roadSignals(trucking({ pickupDate: "2026-11-17" }), timeline({ pickedUp: true }), WED)).toEqual([]);
      expect(roadSignals(international({ pickupDate: "2026-11-17", actualDeparture: "2026-11-17" }), timeline(), WED)).toEqual([]);
      expect(roadSignals(international({ pickupDate: "2026-11-17", actualArrival: "2026-11-18" }), timeline(), WED)).toEqual([]);
      expect(roadSignals(trucking({ pickupDate: "2026-11-17", actualDeliveryDate: "2026-11-18" }), timeline({ podReceived: true }), WED)).toEqual([]);
    });

    it("is no question of a job that travels another way", () => {
      expect(roadSignals(job({ pickupDate: "2026-11-17" }), timeline(), WED)).toEqual([]);
      expect(roadSignals(job({ freightMode: "Air Freight", pickupDate: TODAY }), timeline(), WED)).toEqual([]);
    });
  });

  describe("A21: tomorrow's pick-up with no haulier confirmed", () => {
    const tomorrow = (time: string, over: Partial<OpsCockpitJob> = {}, facts = timeline(), day = TODAY) => roadSignals(trucking({ pickupDate: "2026-11-19", ...over }), facts, opsDay(at(day, time)));

    it("is ATTENTION from 14:00: the morning is the dispatcher's", () => {
      expect(tomorrow("13:59")).toEqual([]);
      expect(show(tomorrow("14:00"))).toEqual(["attention 244 road tracking · Pick-up tomorrow, haulier not confirmed"]);
      expect(tomorrow("23:59")).toHaveLength(1);
    });

    it("is the next working day's: on a Friday afternoon, Monday's", () => {
      expect(texts(tomorrow("15:00", { pickupDate: "2026-11-23" }, timeline(), "2026-11-20"))).toEqual(["Pick-up on Mon 23.11., haulier not confirmed"]);
      expect(tomorrow("15:00", { pickupDate: "2026-11-24" }, timeline(), "2026-11-20")).toEqual([]);
      expect(tomorrow("15:00", { pickupDate: "2026-11-20" })).toEqual([]);
    });

    it("is not said once the haulier confirmed, nor of an international road job", () => {
      expect(tomorrow("15:00", {}, timeline({ haulierConfirmed: true }))).toEqual([]);
      expect(roadSignals(international({ pickupDate: "2026-11-19" }), timeline(), opsDay(at(TODAY, "15:00")))).toEqual([]);
    });
  });

  describe("A22: a Trucking job delivered and no POD", () => {
    const delivered = (actualDeliveryDate: string, facts = timeline(), day = WED) => roadSignals(trucking({ actualDeliveryDate }), facts, day);

    it("is ATTENTION after 2 working days and URGENT at 5: it holds Billing", () => {
      // Monday the 16th: only Wednesday since (Tuesday is a holiday).
      expect(delivered("2026-11-16")).toEqual([]);
      expect(show(delivered("2026-11-13"))).toEqual(["attention 248 road tracking · Delivered 13.11., no POD · 2 working days"]);
      expect(show(delivered("2026-11-11"))).toEqual(["attention 248 road tracking · Delivered 11.11., no POD · 4 working days"]);
      expect(show(delivered("2026-11-10"))).toEqual(["URGENT 59 road tracking · Delivered 10.11., no POD · 5 working days"]);
      // October has a holiday too (the 28th): 32 working days since the 1st, not 33.
      expect(show(delivered("2026-10-01"))).toEqual(["URGENT 59 road tracking · Delivered 01.10., no POD · 32 working days"]);
    });

    it("counts the company's own day off as no working day", () => {
      expect(delivered("2026-11-13", timeline(), opsDay(NOW, ["2026-11-16"]))).toEqual([]);
      expect(show(delivered("2026-11-10", timeline(), opsDay(NOW, ["2026-11-16"])))).toEqual(["attention 248 road tracking · Delivered 10.11., no POD · 4 working days"]);
    });

    it("is over with the POD", () => {
      expect(delivered("2026-11-10", timeline({ podReceived: true }))).toEqual([]);
    });

    it("is asked of a Trucking job only: Trucking alone writes the POD, so an international road job could never clear it", () => {
      expect(roadSignals(job({ department: "Road Department", actualDeliveryDate: "2026-11-10" }), timeline(), WED)).toHaveLength(1);
      expect(roadSignals(international({ actualDeliveryDate: "2026-11-10" }), timeline(), WED)).toEqual([]);
      expect(roadSignals(job({ tradeDirection: "Export", freightMode: "Road Freight", actualDeliveryDate: "2026-11-10" }), timeline(), WED)).toEqual([]);
      expect(roadSignals(job({ actualDeliveryDate: "2026-11-10" }), timeline(), WED)).toEqual([]);
    });
  });

  it("says nothing at all when the timeline could not be read", () => {
    expect(roadSignals(trucking({ pickupDate: "2026-11-17", actualDeliveryDate: null }), null, WED)).toEqual([]);
    expect(roadSignals(trucking({ actualDeliveryDate: "2026-11-01" }), null, WED)).toEqual([]);
  });
});

describe("the Handled By signals", () => {
  it("nobody in Handled By is URGENT, last of all", () => {
    expect(handledBySignals({ personInCharge: "  " }, USERS)).toEqual([{ rank: 100, text: "Nobody in Handled By", urgent: true, kind: "owner", area: "details" }]);
    expect(handledBySignals({ personInCharge: "" }, null)).toMatchObject([{ text: "Nobody in Handled By" }]);
  });

  it("somebody who is not a user of the company is URGENT, named by the e-mail - a family of its own (\"not_user\"), apart from nobody's \"owner\"", () => {
    expect(handledBySignals({ personInCharge: " Left@Firma.cz — Old Name" }, USERS)).toEqual([{ rank: 110, text: "Handled By is not a user: left@firma.cz", urgent: true, kind: "not_user", area: "details" }]);
    expect(handledBySignals({ personInCharge: "JAN@firma.cz" }, USERS)).toEqual([]);
  });

  it("says nothing of who is a user when the users are not known", () => {
    expect(handledBySignals({ personInCharge: "left@firma.cz" }, null)).toEqual([]);
  });
});

// D8: what "late" means depends on how the job travels. The rules are Needs Attention's own
// (lib/trackingAttention), handed the cockpit's thresholds; that list keeps its single numbers.
describe("Needs Attention's date rules on the cockpit's thresholds, per mode", () => {
  const SEA = "Sea Freight";
  const AIR = "Air Freight";
  const RAIL = "Rail Freight";
  const ROAD = "Road Freight";
  const NO_FACTS: AttentionFacts = { proposed: [], lastEventDay: null, arrivedAtHub: false, lastNotice: null };
  const kinds = (freightMode: string, over: Partial<OpsCockpitJob>, holidays: readonly string[] = [], facts: Partial<AttentionFacts> = {}) => {
    const j = job({ freightMode, ...over });
    return attentionFlags(j, { ...NO_FACTS, ...facts }, TODAY, attentionRulesFor(freightKindOf(j), holidays)).map((f) => f.kind);
  };

  it("hands over one number per mode, an import's ETD too, and the company's days off", () => {
    expect(attentionRulesFor("sea", ["2026-11-19"])).toEqual({ arrivalLateAfterDays: 2, departureLateAfterDays: 2, departureLateForImports: true, noOnwardAfterWorkingDays: 3, noEventAfterDays: 7, extraHolidays: ["2026-11-19"] });
    expect(attentionRulesFor("air", [])).toEqual({ arrivalLateAfterDays: 1, departureLateAfterDays: 1, departureLateForImports: true, noOnwardAfterWorkingDays: 1, noEventAfterDays: 1, extraHolidays: [] });
    expect(attentionRulesFor("rail", [])).toEqual({ arrivalLateAfterDays: 4, departureLateAfterDays: 2, departureLateForImports: true, noOnwardAfterWorkingDays: 2, noEventAfterDays: 4, extraHolidays: [] });
    expect(attentionRulesFor("road", [])).toEqual({ arrivalLateAfterDays: 1, departureLateAfterDays: 2, departureLateForImports: true, noOnwardAfterWorkingDays: 3, noEventAfterDays: 2, extraHolidays: [] });
  });

  it("U6: ETD passed with no ATD - sea and rail after 2 days, air after 1 - for an import too", () => {
    for (const tradeDirection of ["Import", "Export"]) {
      expect(kinds(SEA, { tradeDirection, estimatedDeparture: "2026-11-16" })).toEqual(["etd_passed"]);
      expect(kinds(SEA, { tradeDirection, estimatedDeparture: "2026-11-17" })).toEqual([]);
      expect(kinds(RAIL, { tradeDirection, estimatedDeparture: "2026-11-16" })).toEqual(["etd_passed"]);
      expect(kinds(RAIL, { tradeDirection, estimatedDeparture: "2026-11-17" })).toEqual([]);
      expect(kinds(AIR, { tradeDirection, estimatedDeparture: "2026-11-17" })).toEqual(["etd_passed"]);
      expect(kinds(AIR, { tradeDirection, estimatedDeparture: "2026-11-18" })).toEqual([]);
    }
    expect(kinds(SEA, { estimatedDeparture: "2026-11-10", actualDeparture: "2026-11-12", actualArrival: "2026-11-18" })).toEqual([]);
    // Needs Attention itself still asks an export only.
    expect(attentionFlags(job({ estimatedDeparture: "2026-11-10" }), NO_FACTS, TODAY)).toEqual([]);
  });

  it("U6: an import is asked for its ATD only while it has neither an ATA nor an actual delivery - once it arrived, its departure is history", () => {
    const late = { tradeDirection: "Import", estimatedDeparture: "2026-11-10" };
    expect(kinds(SEA, late)).toEqual(["etd_passed"]);
    expect(kinds(SEA, { ...late, actualArrival: "2026-11-17" })).not.toContain("etd_passed");
    expect(kinds(AIR, { ...late, actualArrival: "2026-11-18" })).toEqual([]);
    expect(kinds(SEA, { ...late, actualDeliveryDate: "2026-11-17" })).not.toContain("etd_passed");
    // An export is asked as it always was: its ATD is its tax date.
    expect(kinds(SEA, { tradeDirection: "Export", estimatedDeparture: "2026-11-10", actualArrival: "2026-11-17" })).toContain("etd_passed");
    expect(attentionFlags(job({ tradeDirection: "Export", estimatedDeparture: "2026-11-10", actualArrival: "2026-11-17" }), NO_FACTS, TODAY).map((f) => f.kind)).toContain("etd_passed");
  });

  it("U7: ETA passed with no ATA - sea after 2 days, air 1, rail 4, international road 1", () => {
    expect(kinds(SEA, { estimatedArrival: "2026-11-16" })).toEqual(["eta_passed"]);
    expect(kinds(SEA, { estimatedArrival: "2026-11-17" })).toEqual([]);
    expect(kinds(AIR, { estimatedArrival: "2026-11-17" })).toEqual(["eta_passed"]);
    expect(kinds(AIR, { estimatedArrival: "2026-11-18" })).toEqual([]);
    expect(kinds(RAIL, { estimatedArrival: "2026-11-14" })).toEqual(["eta_passed"]);
    expect(kinds(RAIL, { estimatedArrival: "2026-11-15" })).toEqual([]);
    expect(kinds(ROAD, { estimatedArrival: "2026-11-17" })).toEqual(["eta_passed"]);
    expect(kinds(ROAD, { estimatedArrival: "2026-11-18" })).toEqual([]);
    // A Trucking job has its stamps from Trucking: none of these rows.
    expect(kinds(ROAD, { tradeDirection: "Domestic", estimatedArrival: "2026-11-01", estimatedDeparture: "2026-11-01" })).toEqual([]);
  });

  it("A10: arrived, nothing since - sea after 3 working days, rail 2, air 1", () => {
    // Thursday the 12th: Friday, Monday and Wednesday the 18th are three (Tuesday is a holiday).
    expect(kinds(SEA, { actualArrival: "2026-11-12" })).toContain("no_onward");
    expect(kinds(SEA, { actualArrival: "2026-11-13" })).not.toContain("no_onward");
    expect(kinds(RAIL, { actualArrival: "2026-11-13" })).toContain("no_onward");
    expect(kinds(RAIL, { actualArrival: "2026-11-16" })).not.toContain("no_onward");
    expect(kinds(AIR, { actualArrival: "2026-11-16" })).toContain("no_onward");
    expect(kinds(AIR, { actualArrival: "2026-11-18" })).not.toContain("no_onward");
    expect(kinds(ROAD, { actualArrival: "2026-11-12" })).toContain("no_onward");
    expect(kinds(ROAD, { actualArrival: "2026-11-13" })).not.toContain("no_onward");
  });

  it("A10 counts the company's own day off as no working day", () => {
    expect(kinds(SEA, { actualArrival: "2026-11-12" }, ["2026-11-16"])).not.toContain("no_onward");
    expect(kinds(AIR, { actualArrival: "2026-11-16" }, ["2026-11-18"])).not.toContain("no_onward");
  });

  it("A11: no tracking after departure - sea after 7 days, rail 4, air 1 - counted from the last event", () => {
    expect(kinds(SEA, { actualDeparture: "2026-11-11" })).toEqual(["no_event"]);
    expect(kinds(SEA, { actualDeparture: "2026-11-12" })).toEqual([]);
    expect(kinds(RAIL, { actualDeparture: "2026-11-14" })).toEqual(["no_event"]);
    expect(kinds(RAIL, { actualDeparture: "2026-11-15" })).toEqual([]);
    expect(kinds(AIR, { actualDeparture: "2026-11-17" })).toEqual(["no_event"]);
    expect(kinds(AIR, { actualDeparture: "2026-11-18" })).toEqual([]);
    expect(kinds(ROAD, { actualDeparture: "2026-11-16" })).toEqual(["no_event"]);
    expect(kinds(ROAD, { actualDeparture: "2026-11-17" })).toEqual([]);
    expect(kinds(SEA, { actualDeparture: "2026-11-01" }, [], { lastEventDay: "2026-11-12" })).toEqual([]);
    expect(kinds(SEA, { actualDeparture: "2026-11-01" }, [], { lastEventDay: "2026-11-11" })).toEqual(["no_event"]);
  });
});

describe("Needs Attention's flags as signals", () => {
  it("keeps each flag's words, severity and desk, and gives it its family and its rank", () => {
    const flag = (kind: string, severity: "urgent" | "attention", area: "tracking" | "finance", detail = "d") => ({ kind, severity, area, label: kind, detail }) as Parameters<typeof flagSignals>[0][number];
    const signals = flagSignals([
      flag("to_confirm", "urgent", "tracking"),
      flag("etd_passed", "urgent", "tracking"),
      flag("eta_passed", "urgent", "tracking"),
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
    expect(show(signals)).toEqual([
      "URGENT 55 tracking tracking · to_confirm · d",
      "URGENT 56 departure tracking · etd_passed · d",
      "URGENT 57 arrival tracking · eta_passed · d",
      "URGENT 80 free_time tracking · free_time · d",
      "URGENT 90 billing finance · tax_date · d",
      "attention 210 customer_told tracking · not_told · d",
      "attention 220 tracking tracking · no_onward · d",
      "attention 230 tracking tracking · no_event · d",
      "attention 240 free_time tracking · free_time · d",
      "attention 250 billing finance · tax_date · d",
      "attention 260 billing finance · not_released · d",
      // No detail, no dot.
      "attention 270 billing finance · delivered_not_billed",
    ]);
  });
});

describe("the ranks", () => {
  it("put URGENT in the order: customs and holds, the cut-offs missed and due, booking and cargo, departure and arrival, delivery and road, the rest, and last the owner", () => {
    const r = OPS_RANK;
    const order = [r.customsUrgent, r.customsHold, r.closingMissed, r.filingOverdue, r.filingDue, r.closingDue, r.booking, r.cargoReady, r.mawbMissing, 55, r.rolled, 57, r.deliveryPassed, r.haulierToday, 80, 90, r.nobody, r.notUser];
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // The other tables' urgent signals are ranked 3 to 7 on step 1's scale: times ten they land from customs (30) to before free time (80).
    expect([3, 7].map((rank) => rank * EXTRA_RANK_SCALE)).toEqual([r.customsUrgent, 70]);
  });

  it("every family a signal of this file names is one of the stable keys", () => {
    const all = [
      ...handledBySignals({ personInCharge: "" }, null),
      ...handledBySignals({ personInCharge: "left@firma.cz" }, USERS),
      ...customsSignals(job({ customsPriority: "Urgent", customsDeadline: "2026-11-18 08:00" }), timeline({ holdSince: TODAY }), NOW, TODAY),
      ...cutoffSignals(cutoffsOf(job({ closingDate: TODAY }), WED, false), TODAY),
      ...bookingSignals(job({ bookingConfirmation: "Pending", estimatedDeparture: TODAY }), TODAY),
      ...cargoReadySignals(job({ cargoReadinessDate: "2026-11-25", closingDate: "2026-11-24" }), false, TODAY),
      ...mawbSignals(job({ tradeDirection: "Export", freightMode: "Air Freight", estimatedDeparture: TODAY }), TODAY),
      ...rolledSignals(timeline({ rolledOn: TODAY })),
      ...deliverySignals(job({ plannedDeliveryDate: "2026-11-17" }), WED),
      ...warehouseSignals(job({ etaWarehouse: "2026-11-17" }), WED),
      ...roadSignals(job({ tradeDirection: "Domestic", pickupDate: TODAY }), timeline(), WED),
      ...bolSignals(job({ tradeDirection: "Export", bolDraft: "", siClosing: TODAY }), WED),
      ...arrivalNoticeSignals(job({ arrivalNoticeSent: false, estimatedArrival: TODAY }), TODAY),
      ...boxSignals(job({ loadType: "Full Load", estimatedArrival: TODAY }), [{ containerNumber: "MSKU1234567", freeTimeDays: null, lastFreeDay: null }], TODAY),
      ...creditSignals(job({ creditCheck: "Red", estimatedDeparture: TODAY }), TODAY),
    ];
    expect(all.map((s) => s.kind)).toEqual(["owner", "not_user", "customs", "customs", "cutoff", "booking", "cargo_ready", "air", "departure", "delivery", "warehouse", "road", "bl", "arrival_notice", "free_time", "credit"]);
    expect(all.every((s) => (SIGNAL_KINDS as readonly string[]).includes(s.kind))).toBe(true);
    // Step 3 added the three families of the people around a job (lib/managersCockpitTeam).
    expect(new Set(SIGNAL_KINDS).size).toBe(31);
    expect(SIGNAL_KINDS).toEqual(expect.arrayContaining(["away", "claim"]));
    expect(SIGNAL_KINDS).toContain("not_user");
    expect(SIGNAL_KINDS).toEqual(expect.arrayContaining(["todo", "mention", "not_touched"]));
  });
});

describe("\"My reports\"", () => {
  const users = new Set(["jan@firma.cz", "eva@firma.cz", "boss@firma.cz"]);
  const mine = new Set(["jan@firma.cz"]);

  it("keeps a job handled by one of the caller's reports, by e-mail, whatever the case or the name after it - and with \"all\" every job", () => {
    expect(isOfReports({ personInCharge: " JAN@firma.cz — Jan Novák" }, "mine", mine, users)).toBe(true);
    expect(isOfReports({ personInCharge: "eva@firma.cz" }, "mine", mine, users)).toBe(false);
    // Nobody's job is nobody's report - not even when the set would hold "".
    expect(isOfReports({ personInCharge: "" }, "mine", new Set([""]), users)).toBe(false);
    for (const who of ["jan@firma.cz", "eva@firma.cz", "left@firma.cz", ""]) expect(isOfReports({ personInCharge: who }, "all", null, null)).toBe(true);
  });

  it("keeps the job of somebody who is no user of the company too: a report who was deactivated reports to nobody, and the job is every manager's to see", () => {
    expect(isOfReports({ personInCharge: "left@firma.cz" }, "mine", mine, users)).toBe(true);
    expect(isOfReports({ personInCharge: "Left@firma.cz — Somebody Gone" }, "mine", new Set(), users)).toBe(true);
    expect(isReportOrNoUser("left@firma.cz", "mine", mine, users)).toBe(true);
    // A user who reports to somebody else is nobody's stray.
    expect(isReportOrNoUser("eva@firma.cz", "mine", mine, users)).toBe(false);
    expect(isReportOrNoUser("", "mine", mine, users)).toBe(false);
    // Without the users nobody can be said to be none of them (the service refuses "mine" then).
    expect(isOfReports({ personInCharge: "left@firma.cz" }, "mine", mine, null)).toBe(false);
    expect(isOfReports({ personInCharge: "jan@firma.cz" }, "mine", null, null)).toBe(false);
  });
});

describe("the cockpit", () => {
  const NO_SIGNALS = Object.fromEntries(SIGNAL_KINDS.map((kind) => [kind, 0]));
  const tagsIn = (c: ReturnType<typeof cockpit>) => [...c.urgent.rows, ...c.attention.rows].flatMap((r) => r.tags.map((t) => t.text));

  it("is empty for no jobs, and says when and for which day it was worked out", () => {
    expect(cockpit([])).toEqual({
      asOf: "2026-11-18T10:00:00.000Z",
      today: TODAY,
      mode: "all",
      direction: "all",
      handledBy: null,
      reports: "all",
      tiles: { active: 0, cutoffsDue: 0, noHandledBy: 0, handledByNotUser: 0, bookingPending: 0, etdEtaMoved: 0, freeTime: 0, customsUrgent: 0, notReleased: 0, openClaims: 0, signals: NO_SIGNALS },
      urgent: { total: 0, rows: [] },
      attention: { total: 0, rows: [] },
      people: [],
      audit: null,
      // No facts of the warehouse and Trucking handed in: none of their figures (tests/managersCockpitHandover.test.ts).
      handover: { warehouseUpdatesWaiting: null, warehouseUpdatesFailed: null, truckingUpdatesWaiting: null, truckingUpdatesFailed: null },
      capped: false,
      holidaysKnown: true,
      notKnown: [],
    });
  });

  it("judges by the Prague day of `now`, not the server's", () => {
    // 23:30 UTC on the 17th: the 18th in Prague, so a closing date of the 19th is tomorrow.
    const c = cockpit([job({ closingDate: "2026-11-19" })], { now: new Date("2026-11-17T23:30:00Z") });
    expect(c.today).toBe("2026-11-18");
    expect(c.urgent.rows[0]!.tags).toEqual([{ text: "Closing tomorrow", urgent: true, kind: "cutoff" }]);
  });

  it("lists a job with nothing to look at on no card, and still counts it", () => {
    const c = cockpit([job()]);
    expect(c.tiles.active).toBe(1);
    expect(c.urgent.total + c.attention.total).toBe(0);
  });

  it("shows a job once, with all its tags and their kinds: the urgent first by rank, then the rest - and opens it where the first is worked on", () => {
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
      // An export two days past its ETD with no ATD: the overdue VGM is history, "ETD passed" speaks instead.
      estimatedDeparture: "2026-11-16",
    });
    const c = cockpit([j]);
    expect(c.attention).toEqual({ total: 0, rows: [] });
    expect(c.urgent).toEqual({
      total: 1,
      rows: [
        {
          kind: "job",
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
            { text: "Customs urgent · deadline 18.11. 15:00", urgent: true, kind: "customs" },
            { text: "Closing tomorrow", urgent: true, kind: "cutoff" },
            { text: "ETD passed, no ATD · ETD 16.11.2026, 2 days ago", urgent: true, kind: "departure" },
            { text: "Handled By is not a user: left@firma.cz", urgent: true, kind: "not_user" },
            { text: "SI closing on Fri 20.11.", urgent: false, kind: "cutoff" },
          ],
        },
      ],
    });
  });

  it("opens a row on the tab of its first tag: customs, tracking, finance or the details", () => {
    const released = { actualArrival: "2026-11-09", warehouseReceivedDate: "2026-11-09", warehouseReleasedDate: "2026-11-10" };
    const customs = job({ customsPriority: "Urgent", customsDeadline: "2026-11-17 09:00", closingDate: "2026-11-18" });
    const tracking = job({ estimatedArrival: "2026-11-10", closingDate: "2026-11-21" });
    const finance = job(released);
    const details = job({ closingDate: "2026-11-21", ...released });
    const c = cockpit([customs, tracking, finance, details]);
    const row = (j: OpsCockpitJob) => [...c.urgent.rows, ...c.attention.rows].find((r) => r.id === j.id)!;
    expect(row(customs)).toMatchObject({ area: "customs", tags: [{ text: "Customs urgent · deadline 17.11. 09:00 passed", urgent: true }, { text: "Closing today", urgent: true }] });
    expect(row(tracking)).toMatchObject({ area: "tracking", tags: [{ text: "ETA passed, no ATA · ETA 10.11.2026, 8 days ago", urgent: true }, { text: "Closing on Sat 21.11.", urgent: false }] });
    expect(row(finance)).toMatchObject({ area: "finance", tags: [{ text: "Not released for billing · ATA 09.11.2026", urgent: false }] });
    // A job received at our warehouse made its Closing: only the billing is left to say.
    expect(row(details)).toMatchObject({ area: "finance", tags: [{ text: "Not released for billing · ATA 09.11.2026", urgent: false }] });
    expect(cockpit([job({ closingDate: "2026-11-21", creditCheck: "Red", estimatedDeparture: "2026-11-21" })]).attention.rows[0]).toMatchObject({ area: "details", tags: [{ text: "Closing on Sat 21.11." }, { text: "Credit Check Red · ETD 21.11." }] });
  });

  it("puts a job on URGENT when any tag is urgent, else on ATTENTION; each card the most pressing first, then by job number", () => {
    const jobs = [
      job({ jobNumber: "CZFCL00000005", closingDate: "2026-11-19" }), // urgent 50
      job({ jobNumber: "CZFCL00000004", vgmClosing: "2026-11-18" }), // urgent 44
      job({ jobNumber: "CZFCL00000003", vgmClosing: "2026-11-19" }), // urgent 44
      job({ jobNumber: "CZFCL00000006", closingDate: "2026-11-17" }), // urgent 40: missed
      job({ jobNumber: "CZFCL00000002", personInCharge: "" }), // urgent 100: only nobody to handle it, after everything else
      job({ jobNumber: "CZFCL00000009", siClosing: "2026-11-20" }), // attention 200
      job({ jobNumber: "CZFCL00000008", closingDate: "2026-11-21" }), // attention 200
      job({ jobNumber: "CZFCL00000007", actualArrival: "2026-11-09", warehouseReceivedDate: "2026-11-09", warehouseReleasedDate: "2026-11-10" }), // attention 260
      // An attention tag of a low rank never lifts a job within URGENT.
      job({ jobNumber: "CZFCL00000001", closingDate: "2026-11-19", siClosing: "2026-11-20" }), // urgent 50
    ];
    const c = cockpit(jobs);
    expect(c.urgent.rows.map((r) => r.jobNumber)).toEqual(["CZFCL00000006", "CZFCL00000003", "CZFCL00000004", "CZFCL00000001", "CZFCL00000005", "CZFCL00000002"]);
    expect(c.attention.rows.map((r) => r.jobNumber)).toEqual(["CZFCL00000008", "CZFCL00000009", "CZFCL00000007"]);
    expect(c.urgent.total).toBe(6);
    expect(c.attention.total).toBe(3);
  });

  it("orders URGENT as agreed: customs, the cut-offs, booking and cargo, departure and arrival, delivery and road, the rest - and a job lacking only an owner last", () => {
    const facts = new Map<string, AttentionFacts>();
    const over = (j: OpsCockpitJob) => {
      facts.set(j.id, { proposed: [], lastEventDay: null, arrivedAtHub: false, lastNotice: null, clocks: [{ containerNumber: "AAAU1", clock: { state: "chargeable", startDay: null, lastFreeDay: "2026-11-10", daysLeft: -8, chargeableDays: 8, stopDay: null } }] });
      return j;
    };
    const jobs = [
      job({ jobNumber: "J-owner", personInCharge: "" }),
      over(job({ jobNumber: "I-free-time" })),
      job({ jobNumber: "H-delivery", plannedDeliveryDate: "2026-11-17" }),
      job({ jobNumber: "G-arrival", estimatedArrival: "2026-11-10" }),
      job({ jobNumber: "F-departure", estimatedDeparture: "2026-11-10" }),
      job({ jobNumber: "E-booking", bookingConfirmation: "Pending", estimatedDeparture: "2026-11-20" }),
      job({ jobNumber: "D-closing", closingDate: "2026-11-18" }),
      job({ jobNumber: "C-filing", vgmClosing: "2026-11-12" }),
      job({ jobNumber: "B-missed", closingDate: "2026-11-17" }),
      job({ jobNumber: "A-customs", customsPriority: "Urgent", customsDeadline: "2026-11-18 08:00" }),
    ];
    expect(cockpit(jobs, { facts }).urgent.rows.map((r) => r.jobNumber)).toEqual(["A-customs", "B-missed", "C-filing", "D-closing", "E-booking", "F-departure", "G-arrival", "H-delivery", "I-free-time", "J-owner"]);
  });

  it("cuts a card's list at its limit and still counts every row", () => {
    const jobs = Array.from({ length: COCKPIT_LIST_LIMIT + 5 }, (_, i) => job({ jobNumber: `CZFCL${String(i).padStart(8, "0")}`, closingDate: "2026-11-18" }));
    const c = cockpit(jobs);
    expect(c.urgent.total).toBe(COCKPIT_LIST_LIMIT + 5);
    expect(c.urgent.rows).toHaveLength(COCKPIT_LIST_LIMIT);
    expect(c.urgent.rows[0]!.jobNumber).toBe("CZFCL00000000");
    // The tiles count every row, the cut ones too.
    expect(c.tiles).toMatchObject({ active: COCKPIT_LIST_LIMIT + 5, cutoffsDue: COCKPIT_LIST_LIMIT + 5, signals: { cutoff: COCKPIT_LIST_LIMIT + 5 } });
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
    expect(c.urgent.rows.every((r) => r.handledBy === "" && r.kind === "job")).toBe(true);
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
    expect(c.urgent.rows[0]!.tags[0]).toMatchObject({ urgent: true, kind: "tracking" });
    expect(c.urgent.rows[0]!.tags[0]!.text).toMatch(/^Date to confirm · .*17\.11\.2026/);
    expect(c.urgent.rows[0]!.tags[1]).toEqual({ text: "Free time ends · AAAU1 in 1 d", urgent: false, kind: "free_time" });
    expect(c.tiles.freeTime).toBe(1);
  });

  it("judges each job by its own mode's thresholds: an ETA a day old is late for a flight, not yet for a vessel or a train", () => {
    const c = cockpit([
      job({ jobNumber: "AIR", freightMode: "Air Freight", estimatedArrival: "2026-11-17" }),
      job({ jobNumber: "SEA", freightMode: "Sea Freight", estimatedArrival: "2026-11-17" }),
      job({ jobNumber: "RAIL", freightMode: "Rail Freight", estimatedArrival: "2026-11-15" }),
      // An import's ETD counts too, which Needs Attention asks of an export only.
      job({ jobNumber: "IMP", estimatedDeparture: "2026-11-16" }),
    ]);
    expect(c.urgent.rows.map((r) => [r.jobNumber, r.tags.map((t) => t.kind)])).toEqual([
      ["IMP", ["departure"]],
      ["AIR", ["arrival"]],
    ]);
  });

  describe("a job that has left carries nothing of before its departure", () => {
    it("an air import that arrived with no ATD typed: no cut-off, no \"ETD passed\", no booking, credit or MAWB tag", () => {
      const arrived = job({
        freightMode: "Air Freight",
        closingDate: "2026-11-14",
        vgmClosing: "2026-11-14",
        vgm: "Pending (Red)",
        estimatedDeparture: "2026-11-16",
        actualArrival: "2026-11-17",
        bookingConfirmation: "Pending",
        creditCheck: "Red",
        bolDraft: "Not Processed",
        siClosing: "2026-11-15",
      });
      const kinds = (c: ReturnType<typeof cockpit>) => [...c.urgent.rows, ...c.attention.rows].flatMap((r) => r.tags.map((t) => t.kind));
      // What is left is what an arrived flight is asked: nothing of its departure.
      expect(tagsIn(cockpit([arrived]))).toEqual(["Arrived, nothing since · ATA 17.11.2026: no gate-in, hub arrival or delivery"]);
      expect(kinds(cockpit([arrived]))).toEqual(["tracking"]);
      expect(cockpit([arrived]).tiles).toMatchObject({ cutoffsDue: 0, bookingPending: 0, signals: { cutoff: 0, departure: 0, booking: 0, credit: 0, bl: 0, air: 0 } });
      // The same job before it arrived carries all of it.
      expect(kinds(cockpit([{ ...arrived, actualArrival: null }])).sort()).toEqual(["booking", "credit", "departure"]);
    });

    it("a job with no ETD and a Closing 8 days ago: nothing", () => {
      const c = cockpit([job({ tradeDirection: "Export", closingDate: "2026-11-10" })]);
      expect(c.urgent.total + c.attention.total).toBe(0);
      expect(tagsIn(cockpit([job({ tradeDirection: "Export", closingDate: "2026-11-11" })]))).toEqual(["Closing missed · 11.11."]);
    });

    it("a Trucking job born with Booking Confirmation Pending: no booking tag", () => {
      const c = cockpit([
        job({ tradeDirection: "Domestic", freightMode: "Road Freight", bookingConfirmation: "Pending", cargoReadinessDate: "2026-11-19", estimatedDeparture: "2026-11-19" }),
        job({ department: "Road Department", bookingConfirmation: "Pending", cargoReadinessDate: "2026-11-19" }),
      ]);
      expect(c.urgent.total + c.attention.total).toBe(0);
      expect(c.tiles).toMatchObject({ bookingPending: 0, signals: { booking: 0 } });
    });

    it("an export that departed with a stale ETA warehouse: nothing", () => {
      // Departed on Monday: too fresh for the billing and tracking rules, so only the warehouse's is asked here.
      const departed = job({ tradeDirection: "Export", etaWarehouse: "2026-11-05", estimatedDeparture: "2026-11-16", actualDeparture: "2026-11-16" });
      const c = cockpit([departed]);
      expect(c.urgent.total + c.attention.total).toBe(0);
      // Before it left, the warehouse was still waited for.
      expect(tagsIn(cockpit([{ ...departed, estimatedDeparture: "2026-11-20", actualDeparture: null }]))).toEqual(["ETA warehouse 05.11. passed, not received"]);
    });
  });

  describe("the timeline's facts", () => {
    const closing = () => job({ jobNumber: "EXP1", tradeDirection: "Export", closingDate: "2026-11-17" });

    it("keep a missed Closing until the cargo is in: a picked-up, loaded or gate-in fact clears it", () => {
      const j = closing();
      expect(tagsIn(cockpit([j]))).toEqual(["Closing missed · 17.11."]);
      for (const fact of [{ pickedUp: true }, { loaded: true }, { gateIn: true }]) expect(tagsIn(cockpit([j], { timeline: new Map([[j.id, timeline(fact)]]) }))).toEqual([]);
      expect(tagsIn(cockpit([j], { timeline: new Map([[j.id, timeline({ haulierConfirmed: true })]]) }))).toEqual(["Closing missed · 17.11."]);
      expect(tagsIn(cockpit([{ ...j, actualDeparture: "2026-11-18" }]))).toEqual([]);
    });

    it("give a job its hold and its rolled departure", () => {
      const j = job();
      const c = cockpit([j, job()], { timeline: new Map([[j.id, timeline({ holdSince: "2026-11-16", rolledOn: "2026-11-17" })]]) });
      expect(c.urgent.rows).toHaveLength(1);
      expect(c.urgent.rows[0]).toMatchObject({ id: j.id, area: "customs", tags: [{ text: "Customs hold · 2 days, since 16.11.", kind: "customs" }, { text: "Rolled · 17.11.", kind: "departure" }] });
      // A hold is no "Customs urgent": that tile keeps its meaning.
      expect(c.tiles).toMatchObject({ customsUrgent: 0, signals: { customs: 1, departure: 1 } });
    });

    it("that could not be read give no signal - the missed Closing, the hold, the truck - while the job's own columns still speak", () => {
      const jobs = [
        closing(),
        job({ jobNumber: "TRK1", tradeDirection: "Domestic", freightMode: "Road Freight", pickupDate: "2026-11-17" }),
        job({ jobNumber: "SEA1", vgmClosing: "2026-11-18", closingDate: "2026-11-18" }),
      ];
      expect(tagsIn(cockpit(jobs))).toEqual(["Closing missed · 17.11.", "VGM closing today", "Closing today", "Pick-up 17.11. passed, not picked up"]);
      const c = cockpit(jobs, { timeline: null, notKnown: ["tracking events"] });
      // A Closing still ahead is said by its date alone; that one was missed cannot be told.
      expect(tagsIn(c)).toEqual(["VGM closing today", "Closing today"]);
      expect(c.notKnown).toEqual(["tracking events"]);
    });
  });

  describe("the containers", () => {
    const fcl = () => job({ loadType: "Full Load", estimatedArrival: "2026-11-20" });

    it("of an arriving Full Load import are looked at; a job with none read has none", () => {
      const j = fcl();
      const c = cockpit([j], { boxes: new Map([[j.id, [{ containerNumber: "MSKU1234567", freeTimeDays: null, lastFreeDay: null }]]]) });
      expect(c.attention.rows[0]!.tags).toEqual([{ text: "No free time typed · MSKU1234567 · ETA 20.11.", urgent: false, kind: "free_time" }]);
      // The tile is Needs Attention's "free time ending or over"; the family counts this tag too.
      expect(c.tiles).toMatchObject({ freeTime: 0, signals: { free_time: 1 } });
      expect(tagsIn(cockpit([{ ...j, actualDeparture: "2026-11-12" }]))).toEqual(["No container number · departed 12.11."]);
    });

    it("that could not be read give no signal", () => {
      expect(tagsIn(cockpit([{ ...fcl(), actualDeparture: "2026-11-12" }], { boxes: null }))).toEqual([]);
    });
  });

  describe("the company's days off", () => {
    it("move the windows for every job", () => {
      const jobs = [job({ jobNumber: "FRI", closingDate: "2026-11-20" }), job({ jobNumber: "TUE", closingDate: "2026-11-24" })];
      const plain = cockpit(jobs);
      expect([plain.urgent.total, plain.attention.rows.map((r) => r.jobNumber)]).toEqual([0, ["FRI"]]);
      const dayOff = cockpit(jobs, { holidays: ["2026-11-19"] });
      expect([dayOff.urgent.rows.map((r) => r.jobNumber), dayOff.attention.rows.map((r) => r.jobNumber)]).toEqual([["FRI"], ["TUE"]]);
    });

    it("that could not be read are said so; the windows then skip the weekends and the public holidays only", () => {
      expect(cockpit([]).holidaysKnown).toBe(true);
      expect(cockpit([], { holidaysKnown: false }).holidaysKnown).toBe(false);
    });
  });

  describe("the signals of the other tables", () => {
    const extra = (rank: number, isUrgent: boolean, kind: string, text: string, area: OpsSignal["area"] = "customs"): OpsSignal => ({ rank, urgent: isUrgent, kind, text, area });

    it("join the job's own before it is ranked: one row, its tags in one order, counted by their families", () => {
      const j = job({ closingDate: "2026-11-19" });
      const quiet = job();
      const c = cockpit([j, quiet], {
        extraByJob: new Map([
          [j.id, [extra(3, true, "paperwork", "Waiting For Commercial Paperwork · arrived 17.11."), extra(28, false, "paperwork", "Waiting · arriving in 4 days")]],
          [quiet.id, [extra(40, false, "status_stuck", "Status unchanged since 10.11.", "details")]],
        ]),
      });
      expect(c.urgent.rows).toEqual([
        expect.objectContaining({
          id: j.id,
          area: "customs",
          tags: [
            { text: "Waiting For Commercial Paperwork · arrived 17.11.", urgent: true, kind: "paperwork" },
            { text: "Closing tomorrow", urgent: true, kind: "cutoff" },
            { text: "Waiting · arriving in 4 days", urgent: false, kind: "paperwork" },
          ],
        }),
      ]);
      expect(c.attention.rows).toEqual([expect.objectContaining({ id: quiet.id, kind: "job", area: "details", tags: [{ text: "Status unchanged since 10.11.", urgent: false, kind: "status_stuck" }] })]);
      expect(c.tiles.signals).toMatchObject({ paperwork: 1, cutoff: 1, status_stuck: 1 });
      expect(c.people).toEqual([person("jan@firma.cz", { active: 2, urgent: 1, attention: 1 })]);
    });

    it("are ranked on step 1's scale and fall in place: paperwork with customs, a request after the deliveries, before a job lacking only an owner", () => {
      const paperwork = job({ jobNumber: "P" });
      const request = job({ jobNumber: "R" });
      const jobs = [job({ jobNumber: "OWNER", personInCharge: "" }), request, job({ jobNumber: "DELIVERY", plannedDeliveryDate: "2026-11-17" }), job({ jobNumber: "CLOSING", closingDate: "2026-11-18" }), paperwork];
      const c = cockpit(jobs, { extraByJob: new Map([[paperwork.id, [extra(3, true, "paperwork", "p")]], [request.id, [extra(6, true, "request", "r")]]]) });
      expect(c.urgent.rows.map((r) => r.jobNumber)).toEqual(["P", "CLOSING", "DELIVERY", "R", "OWNER"]);
    });

    it("count a family the cockpit does not know by its own name too", () => {
      const j = job();
      expect(cockpit([j], { extraByJob: new Map([[j.id, [extra(30, false, "something_new", "x")]]]) }).tiles.signals).toMatchObject({ something_new: 1, cutoff: 0 });
    });

    it("are for the jobs shown only: a signal of a job the filters leave out is no row", () => {
      const j = job({ freightMode: "Air Freight" });
      const c = cockpit([j], { mode: "sea", extraByJob: new Map([[j.id, [extra(3, true, "paperwork", "p")]]]) });
      expect(c.urgent.total).toBe(0);
      expect(c.tiles.signals).toEqual(NO_SIGNALS);
    });

    it("that could not be read are named, each once", () => {
      expect(cockpit([], { notKnown: ["documents", "Master Jobs", "documents"] }).notKnown).toEqual(["documents", "Master Jobs"]);
    });
  });

  describe("a Master Job with no shipment linked", () => {
    const master = (over: Partial<OpsCockpitInput["masterJobRows"][number]> = {}): OpsCockpitInput["masterJobRows"][number] => ({
      id: "mj-1",
      number: "MCZ2026001",
      customer: "Gamma GmbH",
      signals: [{ rank: 36, urgent: false, kind: "master_job", area: "details", text: "No shipment linked · ETD in 6 days" }],
      freightMode: "Sea Freight",
      tradeDirection: "Export",
      handledBy: " Eva@firma.cz ",
      holidayCover: "",
      ...over,
    });

    it("is a row of its own kind, with its MCZ number and what it stores itself", () => {
      const c = cockpit([], { masterJobRows: [master()] });
      expect(c.attention).toEqual({
        total: 1,
        rows: [
          {
            kind: "masterJob",
            id: "mj-1",
            jobNumber: "MCZ2026001",
            customer: "Gamma GmbH",
            mode: "sea",
            tradeDirection: "Export",
            status: "",
            handledBy: "Eva@firma.cz",
            holidayCover: "",
            area: "details",
            tags: [{ text: "No shipment linked · ETD in 6 days", urgent: false, kind: "master_job" }],
          },
        ],
      });
      expect(cockpit([], { masterJobRows: [master({ freightMode: "" })] }).attention.rows[0]!.mode).toBe("");
    });

    it("is counted by its signal family, but is no active job and nobody's on the people line", () => {
      const c = cockpit([job()], { masterJobRows: [master()] });
      expect(c.tiles).toMatchObject({ active: 1, noHandledBy: 0, signals: { master_job: 1 } });
      expect(c.people).toEqual([person("jan@firma.cz")]);
      // With no Handled By of its own it is still not counted among the jobs nobody handles.
      expect(cockpit([], { masterJobRows: [master({ handledBy: "" })] }).tiles).toMatchObject({ active: 0, noHandledBy: 0 });
    });

    it("obeys the mode, direction and Handled By filters by its own Freight Mode, Trade Direction and Handled By", () => {
      const shown = (over: Partial<OpsCockpitInput>, m = master()) => cockpit([], { masterJobRows: [m], ...over }).attention.total;
      expect(shown({})).toBe(1);
      expect(shown({ mode: "sea" })).toBe(1);
      expect(shown({ mode: "air" })).toBe(0);
      expect(shown({ direction: "export" })).toBe(1);
      expect(shown({ direction: "import" })).toBe(0);
      expect(shown({ handledBy: "eva@firma.cz" })).toBe(1);
      expect(shown({ handledBy: "jan@firma.cz" })).toBe(0);
      expect(shown({ handledBy: "nobody" })).toBe(0);
      expect(shown({ handledBy: "nobody" }, master({ handledBy: "" }))).toBe(1);
      expect(shown({ mode: "sea", direction: "export", handledBy: "eva@firma.cz" })).toBe(1);
      // Without a Freight Mode it is a sea job to the filter, as a shipment is.
      expect(shown({ mode: "sea" }, master({ freightMode: "" }))).toBe(1);
      expect(shown({ mode: "air" }, master({ freightMode: " air freight" }))).toBe(1);
    });

    it("sorts among the jobs by its number, and an urgent one sits on URGENT", () => {
      const urgentOne = master({ id: "mj-2", number: "MCZ2026002", signals: [{ rank: 5, urgent: true, kind: "master_job", area: "details", text: "Closing tomorrow · no shipment linked" }] });
      const c = cockpit([job({ jobNumber: "CZFCL1", closingDate: "2026-11-19" }), job({ jobNumber: "ZZ1", closingDate: "2026-11-19" })], { masterJobRows: [urgentOne, master()] });
      expect(c.urgent.rows.map((r) => `${r.kind} ${r.jobNumber}`)).toEqual(["job CZFCL1", "masterJob MCZ2026002", "job ZZ1"]);
      expect(c.attention.rows.map((r) => r.jobNumber)).toEqual(["MCZ2026001"]);
    });

    it("with no signal is no row", () => {
      expect(cockpit([], { masterJobRows: [master({ signals: [] })] }).attention.total).toBe(0);
    });
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
      const released = { warehouseReceivedDate: "2026-11-09", warehouseReleasedDate: "2026-11-10" };
      const jobs = {
        quiet: job(),
        closing: job({ closingDate: "2026-11-19" }),
        closingMissed: job({ closingDate: "2026-11-16" }),
        vgmOverdue: job({ vgmClosing: "2026-11-12" }),
        closingAhead: job({ closingDate: "2026-11-20" }),
        nobody: job({ personInCharge: "" }),
        notUser: job({ personInCharge: "left@firma.cz" }),
        // Pending with nothing close is no risk yet: not counted, not listed.
        bookingFar: job({ bookingConfirmation: "Pending", estimatedDeparture: "2026-12-20" }),
        bookingSoon: job({ bookingConfirmation: "Pending", estimatedDeparture: "2026-11-24" }),
        bookingOdd: job({ bookingConfirmation: "PENDING (carrier)", cargoReadinessDate: "2026-11-19" }),
        moved: job(),
        freeTime: job(),
        customs: job({ customsPriority: "Urgent", customsDeadline: "2026-11-18 08:00" }),
        notReleased: job({ actualArrival: "2026-11-09", ...released }),
        delivered: job({ actualArrival: "2026-11-17", actualDeliveryDate: "2026-11-17" }),
        claim: job({ claim: "Yes" }),
      };
      const c = cockpit(Object.values(jobs), { movedIds: new Set([jobs.moved.id, "not-read"]), facts: new Map([[jobs.freeTime.id, over("AAAU1")]]) });
      expect(c.tiles).toEqual({
        active: 16,
        cutoffsDue: 3,
        noHandledBy: 1,
        handledByNotUser: 1,
        bookingPending: 2,
        etdEtaMoved: 1,
        freeTime: 1,
        customsUrgent: 1,
        notReleased: 2,
        openClaims: 1,
        signals: { ...NO_SIGNALS, cutoff: 4, owner: 1, not_user: 1, booking: 2, free_time: 1, customs: 1, billing: 2 },
      });
      // A moved date and a claim are counted, not listed: they are no signal.
      expect(c.urgent.total).toBe(9);
      expect(c.attention.total).toBe(3);
    });

    it("\"Cut-offs due\" counts the rows with an urgent cut-off tag - one still ahead is not due", () => {
      const c = cockpit([job({ closingDate: "2026-11-20" }), job({ siClosing: "2026-11-23" }), job({ vgmClosing: "2026-11-19" })]);
      expect(c.tiles).toMatchObject({ cutoffsDue: 1, signals: { cutoff: 3 } });
    });

    // The notReleased tile opens the list's "arrived, not released for billing", so it counts by
    // that rule; the cards keep Needs Attention's flags, which wait some working days. Where the two part:
    describe("not released, where the tile and the cards part", () => {
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
        // Delivered on Monday: one working day since, the POD is not asked for yet.
        expect(tagsIn(c)).toEqual([]);
      });

      it("does not count an import delivered with no ATA, though its card says Delivered, not billed", () => {
        const c = cockpit([job({ actualDeliveryDate: "2026-11-16" })]);
        expect(c.tiles.notReleased).toBe(0);
        expect(tagsIn(c)).toEqual(["Delivered, not billed · Delivered 16.11.2026"]);
      });

      it("counts and names a job alike once both rules hold", () => {
        const arrived = { actualArrival: "2026-11-09", warehouseReceivedDate: "2026-11-09", warehouseReleasedDate: "2026-11-10" };
        const c = cockpit([job(arrived), job({ ...arrived, status: "Billing [IMP]" })]);
        expect(c.tiles).toMatchObject({ notReleased: 1, signals: { billing: 1 } });
        expect(tagsIn(c)).toEqual(["Not released for billing · ATA 09.11.2026"]);
      });
    });

    it("count a job once, however many of its cut-offs are due", () => {
      const c = cockpit([job({ closingDate: "2026-11-18", vgmClosing: "2026-11-18", siClosing: "2026-11-19", ams: "Pending", amsDeadline: "2026-11-12" })]);
      expect(c.tiles).toMatchObject({ cutoffsDue: 1, signals: { cutoff: 1 } });
      expect(c.urgent.rows[0]!.tags.map((t) => t.text)).toEqual(["AMS overdue 6 days", "VGM closing today", "SI closing tomorrow", "Closing today"]);
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
        expect(c.tiles.signals.cutoff).toBe(c.urgent.total);
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
        // Three jobs among people with one each: a load that stands out.
        person("jan@firma.cz", { active: 3, urgent: 1, attention: 1, covers: 1 }, { highLoad: true }),
        person("", { isUser: false, active: 2, urgent: 2 }),
        person("eva@firma.cz", { covers: 3 }, { byMode: AIR }),
        person("left@firma.cz", { isUser: false, urgent: 1 }),
      ]);
    });

    it("keep a legacy Handled By typed as \"nobody\" as the person it names - the filter's word still means the jobs with nobody", () => {
      const legacy = [job({ personInCharge: "Nobody" }), job({ personInCharge: "" })];
      const c = cockpit(legacy, { handledBy: "nobody" });
      expect(c.people).toEqual([
        person("nobody", { isUser: false, urgent: 1 }),
        person("", { isUser: false, urgent: 1 }),
      ]);
      expect(c.tiles).toMatchObject({ active: 1, noHandledBy: 1 });
      expect(c.urgent.rows.map((r) => r.handledBy)).toEqual([""]);
    });

    it("leave nobody out when every job has somebody", () => {
      expect(cockpit([job()]).people).toEqual([person("jan@firma.cz")]);
    });

    it("are not narrowed by the Handled By filter - it is picked from them - while the tiles and cards are", () => {
      const all = cockpit(jobs());
      const one = cockpit(jobs(), { handledBy: "eva@firma.cz" });
      expect(one.people).toEqual(all.people);
      expect(one.tiles.active).toBe(1);
      expect(one.urgent.total + one.attention.total).toBe(0);
      expect(cockpit(jobs(), { handledBy: "nobody" }).people).toEqual(all.people);
    });

    it("obey the mode and the direction, their covers too - and somebody who only covers there is listed, with no job of their own", () => {
      expect(cockpit(jobs(), { mode: "air" }).people).toEqual([person("eva@firma.cz", {}, { byMode: AIR }), person("jan@firma.cz", { active: 0, covers: 1 })]);
      expect(cockpit(jobs(), { direction: "export" }).people).toEqual([person("left@firma.cz", { isUser: false, urgent: 1 })]);
      expect(cockpit(jobs(), { mode: "sea", direction: "import" }).people.map((p) => `${p.handledBy} ${p.active} covers ${p.covers}`)).toEqual(["jan@firma.cz 3 covers 0", " 2 covers 0", "eva@firma.cz 0 covers 3"]);
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

  // ─── Step 3 ─────────────────────────────────────────────────────

  describe("the people around a job (lib/managersCockpitTeam's facts)", () => {
    const TODO: OpsSignal = { rank: 410, urgent: false, kind: "todo", area: "details", text: 'To-do 2 days late: "Call the carrier"' };
    const TODO_URGENT: OpsSignal = { ...TODO, rank: 97, urgent: true, text: 'To-do 6 days late: "Call the carrier"' };
    const MENTION: OpsSignal = { rank: 420, urgent: false, kind: "mention", area: "details", text: "@mention unread since 17.11. 09:12 (jan@firma.cz)" };
    const MENTION_URGENT: OpsSignal = { ...MENTION, rank: 96, urgent: true };
    const NOT_TOUCHED: OpsSignal = { rank: 430, urgent: false, kind: "not_touched", area: "details", text: "Not touched since 10.11." };

    it("puts a late to-do and an unread @mention on the job's row, after every ATTENTION signal of the job itself and of the other tables", () => {
      const j = job({ closingDate: "2026-11-20" });
      const c = cockpit([j], {
        team: teamOf({ [j.id]: { signals: [MENTION, TODO] } }),
        extraByJob: new Map([[j.id, [{ rank: 40, urgent: false, kind: "status_stuck", area: "details", text: "Status unchanged 4 working days" }]]]),
      });
      expect(c.attention.rows[0]!.tags).toEqual([
        { text: "Closing on Fri 20.11.", urgent: false, kind: "cutoff" },
        { text: "Status unchanged 4 working days", urgent: false, kind: "status_stuck" },
        { text: TODO.text, urgent: false, kind: "todo" },
        { text: MENTION.text, urgent: false, kind: "mention" },
      ]);
      expect(c.tiles.signals).toMatchObject({ todo: 1, mention: 1, not_touched: 0 });
    });

    it("ranks their URGENT ones after every clock and state of the job, and before a job that only lacks somebody to handle it", () => {
      const flagged = job({ estimatedArrival: "2026-11-10" }); // ETA passed, no ATA
      const waiting = job();
      const late = job();
      const orphan = job({ personInCharge: "" });
      const c = cockpit([orphan, late, waiting, flagged], { team: teamOf({ [waiting.id]: { signals: [MENTION_URGENT] }, [late.id]: { signals: [TODO_URGENT] } }) });
      expect(c.urgent.rows.map((r) => r.id)).toEqual([flagged.id, waiting.id, late.id, orphan.id]);
    });

    it("says \"Not touched\" only of a job with nothing URGENT on it - it is kept for the quiet ones", () => {
      const quiet = job();
      const watched = job({ closingDate: "2026-11-20" }); // an ATTENTION tag: still quiet enough
      const pressed = job({ closingDate: "2026-11-18" }); // URGENT: being looked at for a reason
      const orphan = job({ personInCharge: "" });
      const mentioned = job();
      const c = cockpit([quiet, watched, pressed, orphan, mentioned], {
        team: teamOf({
          [quiet.id]: { notTouched: NOT_TOUCHED },
          [watched.id]: { notTouched: NOT_TOUCHED },
          [pressed.id]: { notTouched: NOT_TOUCHED },
          [orphan.id]: { notTouched: NOT_TOUCHED },
          // Its own URGENT signal withholds it too.
          [mentioned.id]: { signals: [MENTION_URGENT], notTouched: NOT_TOUCHED },
        }),
      });
      const tagsOf = (id: string) => [...c.urgent.rows, ...c.attention.rows].find((r) => r.id === id)!.tags.map((t) => t.text);
      expect(tagsOf(quiet.id)).toEqual(["Not touched since 10.11."]);
      expect(tagsOf(watched.id)).toEqual(["Closing on Fri 20.11.", "Not touched since 10.11."]);
      expect(tagsOf(pressed.id)).toEqual(["Closing today"]);
      expect(tagsOf(orphan.id)).toEqual(["Nobody in Handled By"]);
      expect(tagsOf(mentioned.id)).toEqual([MENTION.text]);
      expect(c.tiles.signals.not_touched).toBe(2);
      // On its own it opens the job where it is worked on.
      expect(c.attention.rows.find((r) => r.id === quiet.id)!.area).toBe("details");
    });
  });

  describe("a missed cut-off a manager dismissed", () => {
    it("gives no tag for what the service's rule drops, and leaves the job's other signals alone", () => {
      const j = job({ closingDate: "2026-11-16", vgmClosing: "2026-11-16", cargoReadinessDate: "2026-11-17", estimatedDeparture: "2026-11-20" });
      const all = cockpit([j]);
      expect(tagsIn(all)).toEqual(["Closing missed · 16.11.", "VGM overdue 2 days", "Cargo ready 17.11., after Closing 16.11."]);
      const seen: [string, string[]][] = [];
      const c = cockpit([j], {
        cutoffsKept: (jobId, cutoffs) => {
          seen.push([jobId, cutoffs.map((cut) => `${cut.key} ${cut.date} ${cut.state}`)]);
          return cutoffs.filter((cut) => cut.key !== "closingDate");
        },
      });
      // It is handed the job's cut-offs as the shared rule reads them, once.
      expect(seen).toEqual([[j.id, ["vgmClosing 2026-11-16 missed", "closingDate 2026-11-16 missed"]]]);
      expect(tagsIn(c)).toEqual(["VGM overdue 2 days", "Cargo ready 17.11., after Closing 16.11."]);
      expect(c.tiles).toMatchObject({ cutoffsDue: 1, signals: { cutoff: 1 } });
    });

    it("does not keep the row URGENT for the cargo that missed a dismissed Closing: the dismissal settled that miss", () => {
      const j = job({ closingDate: "2026-11-16", cargoReadinessDate: "2026-11-17", estimatedDeparture: "2026-11-20" });
      const dismissed = [{ cutoff: "closingDate" as const, date: "2026-11-16" }];
      const c = cockpit([j], {
        cutoffsKept: (_jobId, cutoffs) => withoutDismissed(cutoffs, dismissed),
        closingsDismissed: (jobId) => (jobId === j.id ? ["2026-11-16"] : []),
      });
      expect(c.urgent.total + c.attention.total).toBe(0);
      expect(c.tiles).toMatchObject({ cutoffsDue: 0, signals: { cutoff: 0, cargo_ready: 0 } });
      // Another job's dismissal is not this one's.
      expect(tagsIn(cockpit([j], { cutoffsKept: (_jobId, cutoffs) => withoutDismissed(cutoffs, dismissed), closingsDismissed: () => [] }))).toEqual(["Cargo ready 17.11., after Closing 16.11."]);
    });

    it("drops the job from the cards when the dismissed cut-off was all that asked for a look", () => {
      const j = job({ vgmClosing: "2026-11-16", estimatedDeparture: "2026-11-20" });
      const c = cockpit([j], { cutoffsKept: () => [] });
      expect(c.urgent.total + c.attention.total).toBe(0);
      expect(c.tiles).toMatchObject({ active: 1, cutoffsDue: 0 });
    });
  });

  describe("the Team facts on the people line", () => {
    it("counts a person's jobs by how they travel", () => {
      const c = cockpit([job(), job({ freightMode: "Air Freight" }), job({ freightMode: "Rail Freight" }), job({ freightMode: "Road Freight" }), job({ tradeDirection: "Domestic", freightMode: "" }), job({ freightMode: "" })]);
      expect(c.people).toEqual([person("jan@firma.cz", { active: 6 }, { byMode: { sea: 2, air: 1, rail: 1, road: 2 } })]);
    });

    it("adds up the late to-dos of the jobs a person handles, and the jobs of theirs called untouched", () => {
      const a = job();
      const b = job();
      const pressed = job({ closingDate: "2026-11-18" });
      const evas = job({ personInCharge: "eva@firma.cz" });
      const quiet: OpsSignal = { rank: 430, urgent: false, kind: "not_touched", area: "details", text: "Not touched since 10.11." };
      const c = cockpit([a, b, pressed, evas], {
        team: teamOf({ [a.id]: { todosLate: 2, notTouched: quiet }, [b.id]: { todosLate: 1, notTouched: quiet }, [pressed.id]: { notTouched: quiet }, [evas.id]: { todosLate: 4 } }),
      });
      // The untouched jobs are those that carry the tag: the one with a Closing today does not.
      expect(c.people.map((p) => [p.handledBy, p.todosLate, p.notTouched])).toEqual([
        ["jan@firma.cz", 3, 2],
        ["eva@firma.cz", 4, 0],
      ]);
    });

    it("counts a person's unread @mentions where they are the Handled By and where they cover", () => {
      const own = job();
      const covered = job({ personInCharge: "eva@firma.cz", holidayCover: "jan@firma.cz" });
      const c = cockpit([own, covered], {
        team: teamOf({ [own.id]: { mentionsUnread: new Map([["jan@firma.cz", 2]]) }, [covered.id]: { mentionsUnread: new Map([["jan@firma.cz", 1], ["eva@firma.cz", 4]]) } }),
      });
      expect(c.people.map((p) => [p.handledBy, p.mentionsUnread])).toEqual([
        ["eva@firma.cz", 4],
        ["jan@firma.cz", 3],
      ]);
    });

    it("says since when a person covers: the oldest day one of their covers was set", () => {
      const a = job({ holidayCover: "eva@firma.cz" });
      const b = job({ holidayCover: "eva@firma.cz" });
      const noDay = job({ holidayCover: "eva@firma.cz" });
      const c = cockpit([a, b, noDay], { team: teamOf({ [a.id]: { coverSince: "2026-11-09" }, [b.id]: { coverSince: "2026-10-30" } }) });
      expect(c.people.map((p) => [p.handledBy, p.covers, p.coversSince])).toEqual([
        ["jan@firma.cz", 0, null],
        ["eva@firma.cz", 3, "2026-10-30"],
      ]);
    });

    it("lists somebody who only covers, with no job of their own - and nobody twice", () => {
      const c = cockpit([job({ holidayCover: "Eva@firma.cz " }), job({ holidayCover: "gone@firma.cz" }), job({ personInCharge: "eva@firma.cz" })]);
      expect(c.people).toEqual([
        person("jan@firma.cz", { active: 2 }),
        person("eva@firma.cz", { covers: 1 }),
        person("gone@firma.cz", { isUser: false, active: 0, covers: 1 }),
      ]);
    });

    it("gives null - never 0 - for a figure whose part could not be read", () => {
      const j = job({ holidayCover: "eva@firma.cz" });
      const c = cockpit([j], { team: teamOf({ [j.id]: { todosLate: 1 } }, { todos: false, mentions: false, touched: false, coverSince: false }) });
      expect(c.people.map((p) => [p.handledBy, p.todosLate, p.mentionsUnread, p.notTouched, p.coversSince])).toEqual([
        ["jan@firma.cz", null, null, null, null],
        ["eva@firma.cz", null, null, null, null],
      ]);
      // What is known without them stays known.
      expect(c.people.map((p) => [p.active, p.covers, p.byMode.sea])).toEqual([
        [1, 0, 1],
        [0, 1, 0],
      ]);
    });

    describe("a high load", () => {
      const jobsOf = (loads: Record<string, number>) => Object.entries(loads).flatMap(([who, n]) => Array.from({ length: n }, () => job({ personInCharge: who })));
      const high = (loads: Record<string, number>) => cockpit(jobsOf(loads)).people.filter((p) => p.highLoad).map((p) => p.handledBy);

      it("is more active jobs than 1.5 times the median of the people with jobs", () => {
        // Median 4: more than 6 stands out, 6 itself does not.
        expect(high({ "a@firma.cz": 2, "b@firma.cz": 4, "c@firma.cz": 6 })).toEqual([]);
        expect(high({ "a@firma.cz": 2, "b@firma.cz": 4, "c@firma.cz": 7 })).toEqual(["c@firma.cz"]);
        // An even number of people: the median lies between the two in the middle (3 and 5: 4).
        expect(high({ "a@firma.cz": 1, "b@firma.cz": 3, "c@firma.cz": 5, "d@firma.cz": 7 })).toEqual(["d@firma.cz"]);
      });

      it("is said only among three people or more: of two, one is always above the other", () => {
        expect(high({ "a@firma.cz": 1, "b@firma.cz": 9 })).toEqual([]);
        expect(high({ "a@firma.cz": 1, "b@firma.cz": 1, "c@firma.cz": 9 })).toEqual(["c@firma.cz"]);
      });

      it("is never said of \"nobody\", who is no person - nor do the jobs with nobody count among the people", () => {
        expect(high({ "": 9, "a@firma.cz": 1, "b@firma.cz": 1 })).toEqual([]);
        expect(high({ "": 9, "a@firma.cz": 1, "b@firma.cz": 1, "c@firma.cz": 1 })).toEqual([]);
        expect(high({ "": 1, "a@firma.cz": 1, "b@firma.cz": 1, "c@firma.cz": 2 })).toEqual(["c@firma.cz"]);
      });

      it("does not count somebody who only covers among the people with jobs", () => {
        const c = cockpit([...jobsOf({ "a@firma.cz": 2, "b@firma.cz": 9 }), job({ personInCharge: "a@firma.cz", holidayCover: "c@firma.cz" })]);
        expect(c.people.map((p) => [p.handledBy, p.active, p.highLoad])).toEqual([
          ["b@firma.cz", 9, false],
          ["a@firma.cz", 3, false],
          ["c@firma.cz", 0, false],
        ]);
      });
    });
  });

  describe("\"My reports\" (D3)", () => {
    const MINE = new Set(["jan@firma.cz", "petr@firma.cz"]);
    // Petr reports to the caller as well; the cockpit's helper knows Jan and Eva only.
    const KNOWN = new Set([...USERS, "petr@firma.cz"]);
    const jobs = () => [
      job({ personInCharge: "jan@firma.cz", closingDate: "2026-11-18" }), // a report's, urgent
      job({ personInCharge: "JAN@firma.cz — Jan Novák", holidayCover: "eva@firma.cz" }), // a report's, quiet
      job({ personInCharge: "eva@firma.cz", holidayCover: "petr@firma.cz", closingDate: "2026-11-18" }), // not a report's; covered by one
      job({ personInCharge: "eva@firma.cz", holidayCover: "jan@firma.cz" }),
      job({ personInCharge: "", closingDate: "2026-11-18" }), // nobody's: nobody's report
    ];
    const mine = (over: Partial<OpsCockpitInput> = {}) => cockpit(jobs(), { reports: "mine", reportEmails: MINE, userEmails: KNOWN, ...over });

    it("says which was asked for", () => {
      expect(cockpit(jobs()).reports).toBe("all");
      expect(mine().reports).toBe("mine");
    });

    it("keeps only the jobs handled by somebody who reports to the caller: tiles and cards", () => {
      const c = mine();
      expect(c.tiles).toMatchObject({ active: 2, noHandledBy: 0, cutoffsDue: 1 });
      expect(c.urgent.rows.map((r) => r.handledBy)).toEqual(["jan@firma.cz"]);
      expect(cockpit(jobs()).tiles).toMatchObject({ active: 5, noHandledBy: 1, cutoffsDue: 3 });
    });

    it("narrows the people line to the caller's reports - their covers counted wherever they cover, a report who only covers listed too", () => {
      expect(mine().people).toEqual([
        person("jan@firma.cz", { active: 2, urgent: 1, covers: 1 }),
        // Handles nothing here, covers one of Eva's jobs: still the caller's to look after.
        person("petr@firma.cz", { active: 0, covers: 1 }),
      ]);
      // Eva covers a report's job, but does not report to the caller.
      expect(mine().people.map((p) => p.handledBy)).not.toContain("eva@firma.cz");
    });

    it("works with the Handled By filter, which is picked from the narrowed people", () => {
      expect(mine({ handledBy: "jan@firma.cz" }).tiles.active).toBe(2);
      expect(mine({ handledBy: "eva@firma.cz" }).tiles.active).toBe(0);
      expect(mine({ handledBy: "nobody" }).tiles.active).toBe(0);
      expect(mine({ handledBy: "eva@firma.cz" }).people).toEqual(mine().people);
    });

    it("keeps a Master Job with no house only when its own Handled By reports to the caller", () => {
      const master = (handledBy: string): OpsCockpitInput["masterJobRows"][number] => ({
        id: `mj-${handledBy}`,
        number: `MCZ-${handledBy}`,
        customer: "Gamma GmbH",
        signals: [{ rank: 36, urgent: false, kind: "master_job", area: "details", text: "No shipment linked · ETD in 6 days" }],
        freightMode: "Sea Freight",
        tradeDirection: "Export",
        handledBy,
        holidayCover: "",
      });
      const c = cockpit([], { masterJobRows: [master("petr@firma.cz"), master("eva@firma.cz"), master(""), master("left@firma.cz")], reports: "mine", reportEmails: MINE, userEmails: KNOWN });
      // Petr's - and the one of somebody who is no user: every manager's.
      expect(c.attention.rows.map((r) => r.handledBy)).toEqual(["left@firma.cz", "petr@firma.cz"]);
    });

    it("keeps the jobs of somebody who is no user of the company - a report who was deactivated - on every manager's \"My reports\"", () => {
      const all = [...jobs(), job({ personInCharge: "left@firma.cz" }), job({ personInCharge: "eva@firma.cz", holidayCover: "gone@firma.cz" })];
      for (const reportEmails of [MINE, new Set<string>()]) {
        const c = cockpit(all, { reports: "mine", reportEmails, userEmails: KNOWN });
        expect(c.urgent.rows.filter((r) => r.handledBy === "left@firma.cz").map((r) => r.tags.map((t) => t.text))).toEqual([["Handled By is not a user: left@firma.cz"]]);
        expect(c.tiles.handledByNotUser).toBe(1);
        // On the people line too - with whoever is no user and only covers.
        expect(c.people.filter((p) => !p.isUser)).toEqual([person("left@firma.cz", { isUser: false, urgent: 1 }), person("gone@firma.cz", { isUser: false, active: 0, covers: 1 })]);
      }
      // Whoever nobody reports to sees these, and nothing else.
      expect(cockpit(all, { reports: "mine", reportEmails: new Set(), userEmails: KNOWN }).tiles.active).toBe(1);
    });

    it("keeps nothing when nobody reports to the caller - and nothing when that is not known, which the service refuses before", () => {
      expect(mine({ reportEmails: new Set() })).toMatchObject({ tiles: { active: 0 }, people: [], urgent: { total: 0 }, attention: { total: 0 } });
      expect(mine({ reportEmails: null, userEmails: null })).toMatchObject({ tiles: { active: 0 }, people: [] });
    });
  });

  describe("the audit line", () => {
    it("is handed through as it was read, whatever the page is narrowed to; null when it could not be read", () => {
      const audit = { days: 7, items: [{ key: "deleted", count: 2 }, { key: "requests_decided", count: 12, approvalRate: 0.5 }] };
      expect(cockpit([job()], { audit, mode: "air", handledBy: "eva@firma.cz", reports: "mine", reportEmails: new Set() }).audit).toEqual(audit);
      expect(cockpit([job()]).audit).toBeNull();
    });
  });
});

// Step 5: the warehouse's and Trucking's own word on the jobs, on the cards (their rules are tests/managersCockpitHandover.test.ts).
describe("the warehouse and Trucking", () => {
  const trucking = (over: Partial<OpsCockpitJob> = {}) => job({ tradeDirection: "Domestic", freightMode: "Road Freight", ...over });
  const tagsOf = (c: ReturnType<typeof cockpit>) => [...c.urgent.rows, ...c.attention.rows].map((r) => [r.jobNumber, r.tags.map((t) => t.text)]);
  const record = (ref: string, text: string, urgent = true) => ({ id: `r-${ref}`, ref, lifecycle: "Expected", signals: [{ text, urgent }] });
  const consignment = (ref: string, text: string, urgent = true) => ({ id: `c-${ref}`, ref, status: "Ordered", pickupDate: "2026-11-17", deliveryDate: null, issues: [{ kind: "not_picked_up" as const, text, urgent, since: null }] });
  const warehouseOf = (shipments: { shipmentId: string; records?: ReturnType<typeof record>[]; updatesWaiting?: number | null; updatesFailed?: number | null }[], notKnown: string[] = []) => ({
    shipments: shipments.map((s) => ({ records: [], updatesWaiting: 0, updatesFailed: 0, ...s })),
    notKnown,
  });
  const truckingOf = (
    shipments: { shipmentId: string; consignments?: ReturnType<typeof consignment>[]; updatesWaiting?: number | null; updatesFailed?: number | null }[],
    notKnown: string[] = [],
    read: { issuesRead?: boolean; updatesRead?: boolean } = {},
  ) => ({
    shipments: shipments.map((s) => ({ consignments: [], updatesWaiting: 0, updatesFailed: 0, ...s })),
    notKnown,
    issuesRead: read.issuesRead ?? true,
    updatesRead: read.updatesRead ?? true,
  });

  it("puts their tags on the job's row, in their own words, of the families warehouse and road, worked on in Tracking", () => {
    const a = job();
    const b = trucking();
    const c = cockpit([a, b], {
      handover: handoverFactsOf(
        warehouseOf([{ shipmentId: a.id, records: [record("WCZ00012", "Pick-up PIN: locked 23.10. 09:12"), record("WCZ00013", "MRN missing", false)] }]),
        truckingOf([{ shipmentId: b.id, consignments: [consignment("TCZ00031", "Delivered 3 working days ago — POD missing", false)] }]),
      ),
    });
    expect(c.urgent.rows.map((r) => [r.jobNumber, r.area, r.tags])).toEqual([
      [
        a.jobNumber,
        "tracking",
        [
          { text: "Warehouse · WCZ00012: Pick-up PIN: locked 23.10. 09:12", urgent: true, kind: "warehouse" },
          { text: "Warehouse · WCZ00013: MRN missing", urgent: false, kind: "warehouse" },
        ],
      ],
    ]);
    expect(c.attention.rows.map((r) => [r.jobNumber, r.tags.map((t) => [t.text, t.kind])])).toEqual([[b.jobNumber, [["Trucking · TCZ00031: Delivered 3 working days ago — POD missing", "road"]]]]);
    expect(c.tiles.signals).toMatchObject({ warehouse: 1, road: 1 });
  });

  it("ranks an urgent one after step 2's delivery and road ones, before free time", () => {
    const late = job({ plannedDeliveryDate: "2026-11-16" });
    const stuck = job();
    const c = cockpit([stuck, late], { handover: handoverFactsOf(warehouseOf([{ shipmentId: stuck.id, records: [record("WCZ00012", "Refused 17.11. 09:00")] }]), truckingOf([])) });
    expect(c.urgent.rows.map((r) => r.jobNumber)).toEqual([late.jobNumber, stuck.jobNumber]);
  });

  describe("the road: Trucking's word on a job it answered about, or step 2's", () => {
    // Pick-up today with no haulier confirmed, a pick-up passed, a delivery with no POD for 5 working days - all off the timeline.
    const jobs = () => [trucking({ pickupDate: TODAY }), trucking({ pickupDate: "2026-11-16" }), trucking({ actualDeliveryDate: "2026-11-10" })];
    const STEP_TWO = ["Pick-up today, haulier not confirmed", "Pick-up 16.11. passed, not picked up", "Delivered 10.11., no POD · 5 working days"];
    /** Each job of `of` with a consignment in play in Trucking and nothing wrong with it. */
    const inPlay = (...of: OpsCockpitJob[]) => of.map((j) => ({ shipmentId: j.id, consignments: [{ ...consignment(`TCZ-${j.id}`, ""), issues: [] }] }));

    it("gives step 2's road tags when Trucking was not asked or could not be read", () => {
      for (const handover of [undefined, handoverFactsOf(warehouseOf([]), null), handoverFactsOf(warehouseOf([]), "late")]) {
        expect(tagsOf(cockpit(jobs(), { handover })).flatMap(([, tags]) => tags)).toEqual(STEP_TWO);
      }
    });

    it("keeps step 2's on a job Trucking has nothing of - a Domestic job nobody booked in Trucking yet - though Trucking answered whole", () => {
      const c = cockpit(jobs(), { handover: handoverFactsOf(warehouseOf([]), truckingOf([])) });
      expect(tagsOf(c).flatMap(([, tags]) => tags)).toEqual(STEP_TWO);
    });

    it("gives none of them on a job Trucking answered about with nothing wrong: Trucking sees nothing wrong with its truck", () => {
      const all = jobs();
      const c = cockpit(all, { handover: handoverFactsOf(warehouseOf([]), truckingOf(inPlay(...all))) });
      expect(c.urgent.total + c.attention.total).toBe(0);
    });

    it("gives Trucking's words instead on the job it answered about with issues - the others keep step 2's", () => {
      const [today, passed, delivered] = jobs();
      const c = cockpit([today!, passed!, delivered!], {
        handover: handoverFactsOf(warehouseOf([]), truckingOf([{ shipmentId: passed!.id, consignments: [consignment("TCZ00031", "Pick-up date passed and no pick-up stamped")] }])),
      });
      expect(tagsOf(c)).toEqual([
        // Step 2's urgent road tags rank 59, Trucking's 62.
        [today!.jobNumber, ["Pick-up today, haulier not confirmed"]],
        [delivered!.jobNumber, ["Delivered 10.11., no POD · 5 working days"]],
        [passed!.jobNumber, ["Trucking · TCZ00031: Pick-up date passed and no pick-up stamped"]],
      ]);
    });

    it("does not count a job Trucking lists for its updates only: it has no consignment in play there", () => {
      const all = jobs();
      const c = cockpit(all, { handover: handoverFactsOf(warehouseOf([]), truckingOf(all.map((j) => ({ shipmentId: j.id, updatesWaiting: 1 })))) });
      expect(tagsOf(c).flatMap(([, tags]) => tags)).toEqual(STEP_TWO);
    });

    it("keeps step 2's when Trucking could not read its consignments, trips or exceptions (issuesRead false): a tag too many rather than one too few", () => {
      const all = jobs();
      const c = cockpit(all, { handover: handoverFactsOf(warehouseOf([]), truckingOf(inPlay(...all), ["Trucking's trips (haulier and pick-up issues)"], { issuesRead: false })) });
      expect(tagsOf(c).flatMap(([, tags]) => tags)).toEqual(STEP_TWO);
    });

    it("goes by issuesRead, not by what else Trucking could not read: its holidays not read still leaves its issues whole", () => {
      const all = jobs();
      const c = cockpit(all, { handover: handoverFactsOf(warehouseOf([]), truckingOf(inPlay(...all), ["the company's holidays (POD missing counted on public holidays only)"])) });
      expect(c.urgent.total + c.attention.total).toBe(0);
    });
  });

  describe("a warehouse signal the job says already", () => {
    it("gives no detention tag beside the job's free time clock - one with no clock keeps it", () => {
      const clocked = job();
      const unclocked = job();
      const box = record("MSKU1234567", "Detention expires in 1 day (19.11.2026) — book the empty return");
      const c = cockpit([clocked, unclocked], {
        facts: new Map([[clocked.id, { proposed: [], lastEventDay: null, arrivedAtHub: false, lastNotice: null, clocks: [{ containerNumber: "MSKU1234567", clock: { state: "ending", startDay: null, lastFreeDay: "2026-11-19", daysLeft: 1, chargeableDays: 0, stopDay: null } }] }]]),
        handover: handoverFactsOf(warehouseOf([{ shipmentId: clocked.id, records: [box] }, { shipmentId: unclocked.id, records: [box] }]), truckingOf([])),
      });
      const tags = Object.fromEntries(tagsOf(c));
      expect(tags[unclocked.jobNumber]).toEqual(["Warehouse · MSKU1234567: Detention expires in 1 day (19.11.2026) — book the empty return"]);
      expect(tags[clocked.jobNumber]).toEqual(["Free time ends · MSKU1234567 in 1 d"]);
    });

    it("gives no stuffing tag against a closing beside the job's Closing - one against the ETD, or with no Closing tag, stays", () => {
      const closing = job({ tradeDirection: "Export", closingDate: "2026-11-19" });
      const plain = job({ tradeDirection: "Export" });
      const stuffing = record("MSKU7654321", "Stuffing: 2 houses not stuffed · closing in 1 day (19.11.2026)");
      const byEtd = record("MSKU7654322", "Stuffing: 1 house not stuffed · ETD in 1 day (19.11.2026)");
      const c = cockpit([closing, plain], {
        handover: handoverFactsOf(warehouseOf([{ shipmentId: closing.id, records: [stuffing, byEtd] }, { shipmentId: plain.id, records: [stuffing] }]), truckingOf([])),
      });
      const tags = Object.fromEntries(tagsOf(c));
      expect(tags[closing.jobNumber]).toEqual(["Closing tomorrow", "Warehouse · MSKU7654322: Stuffing: 1 house not stuffed · ETD in 1 day (19.11.2026)"]);
      expect(tags[plain.jobNumber]).toEqual(["Warehouse · MSKU7654321: Stuffing: 2 houses not stuffed · closing in 1 day (19.11.2026)"]);
    });

    it("gives no stuffing tag against a closing a manager dismissed as missed: the dismissal settled that Closing", () => {
      const missed = job({ tradeDirection: "Export", closingDate: "2026-11-16", estimatedDeparture: "2026-11-20" });
      const late = record("MSKU7654321", "Stuffing: 1 house not stuffed · 2 days past the closing (16.11.2026)");
      const handover = handoverFactsOf(warehouseOf([{ shipmentId: missed.id, records: [late] }]), truckingOf([]));
      expect(tagsOf(cockpit([missed], { handover }))).toEqual([[missed.jobNumber, ["Closing missed · 16.11."]]]);
      const c = cockpit([missed], {
        handover,
        cutoffsKept: (_jobId, cutoffs) => withoutDismissed(cutoffs, [{ cutoff: "closingDate", date: "2026-11-16" }]),
        closingsDismissed: () => ["2026-11-16"],
      });
      expect(c.urgent.total + c.attention.total).toBe(0);
    });
  });

  describe("the warehouse: step 2's two tags give way only to a warehouse signal of the same meaning", () => {
    const due = () => job({ etaWarehouse: "2026-11-16" });
    const idle = () => job({ warehouseReceivedDate: "2026-11-12" });

    it("drops \"ETA warehouse passed, not received\" when a record is not arrived; keeps it beside another signal", () => {
      const a = due();
      const b = due();
      const c = cockpit([a, b], {
        handover: handoverFactsOf(warehouseOf([{ shipmentId: a.id, records: [record("WCZ00012", "Not arrived: expected 16.11.2026")] }, { shipmentId: b.id, records: [record("WCZ00013", "Pick-up PIN: locked 23.10. 09:12")] }]), truckingOf([])),
      });
      expect(tagsOf(c)).toEqual([
        [b.jobNumber, ["ETA warehouse 16.11. passed, not received", "Warehouse · WCZ00013: Pick-up PIN: locked 23.10. 09:12"]],
        [a.jobNumber, ["Warehouse · WCZ00012: Not arrived: expected 16.11.2026"]],
      ]);
    });

    it("drops \"In our warehouse since …, no planned delivery\" when a record is ready with no pick-up booked", () => {
      const a = idle();
      const c = cockpit([a], { handover: handoverFactsOf(warehouseOf([{ shipmentId: a.id, records: [record("WCZ00012", "Ready for release, no pick-up booked · 1 free day left", false)] }]), truckingOf([])) });
      expect(tagsOf(c)).toEqual([[a.jobNumber, ["Warehouse · WCZ00012: Ready for release, no pick-up booked · 1 free day left"]]]);
    });

    it("keeps both when the warehouse has nothing for the job, or could not be read", () => {
      for (const handover of [handoverFactsOf(warehouseOf([]), truckingOf([])), handoverFactsOf(null, truckingOf([]))]) {
        expect(tagsOf(cockpit([due(), idle()], { handover })).flatMap(([, tags]) => tags)).toEqual(["ETA warehouse 16.11. passed, not received", "In our warehouse since 12.11., no planned delivery"]);
      }
    });
  });

  describe("the hand-over line", () => {
    it("counts the jobs the page shows - its mode, direction, Handled By and \"My reports\" - from the one answer of every job", () => {
      const sea = job();
      const air = job({ freightMode: "Air Freight", personInCharge: "eva@firma.cz" });
      const handover = handoverFactsOf(
        warehouseOf([{ shipmentId: sea.id, updatesWaiting: 2, updatesFailed: 1 }, { shipmentId: air.id, updatesWaiting: 1 }]),
        truckingOf([{ shipmentId: air.id, updatesFailed: 3 }]),
      );
      expect(cockpit([sea, air], { handover }).handover).toEqual({ warehouseUpdatesWaiting: 3, warehouseUpdatesFailed: 1, truckingUpdatesWaiting: 0, truckingUpdatesFailed: 3 });
      expect(cockpit([sea, air], { handover, mode: "sea" }).handover).toEqual({ warehouseUpdatesWaiting: 2, warehouseUpdatesFailed: 1, truckingUpdatesWaiting: 0, truckingUpdatesFailed: 0 });
      expect(cockpit([sea, air], { handover, handledBy: "eva@firma.cz" }).handover).toEqual({ warehouseUpdatesWaiting: 1, warehouseUpdatesFailed: 0, truckingUpdatesWaiting: 0, truckingUpdatesFailed: 3 });
      expect(cockpit([sea, air], { handover, reports: "mine", reportEmails: new Set(["jan@firma.cz"]) }).handover).toEqual({ warehouseUpdatesWaiting: 2, warehouseUpdatesFailed: 1, truckingUpdatesWaiting: 0, truckingUpdatesFailed: 0 });
    });

    it("is null for Trucking - not 0 - when Trucking could not read its updates, also on a page that keeps only jobs Trucking left out", () => {
      const sea = job();
      const air = job({ freightMode: "Air Freight", personInCharge: "eva@firma.cz" });
      const handover = handoverFactsOf(warehouseOf([{ shipmentId: sea.id }, { shipmentId: air.id }]), truckingOf([{ shipmentId: air.id, consignments: [consignment("TCZ00031", "Damage: not decided", false)], updatesWaiting: null, updatesFailed: null }], ["Trucking's updates to the jobs"], { updatesRead: false }));
      const unread = { warehouseUpdatesWaiting: 0, warehouseUpdatesFailed: 0, truckingUpdatesWaiting: null, truckingUpdatesFailed: null };
      expect(cockpit([sea, air], { handover }).handover).toEqual(unread);
      // Only the sea job, which Trucking left out: not known either.
      expect(cockpit([sea, air], { handover, mode: "sea" }).handover).toEqual(unread);
      // Read, the same page counts 0.
      const read = handoverFactsOf(warehouseOf([{ shipmentId: sea.id }]), truckingOf([{ shipmentId: air.id, updatesWaiting: 2 }]));
      expect(cockpit([sea, air], { handover: read, mode: "sea" }).handover).toEqual({ warehouseUpdatesWaiting: 0, warehouseUpdatesFailed: 0, truckingUpdatesWaiting: 0, truckingUpdatesFailed: 0 });
    });

    it("is null for a module that could not be read, and the answer names it", () => {
      const a = job();
      const c = cockpit([a], { handover: handoverFactsOf(null, truckingOf([])), notKnown: handoverFactsOf(null, truckingOf([])).notKnown });
      expect(c.handover).toEqual({ warehouseUpdatesWaiting: null, warehouseUpdatesFailed: null, truckingUpdatesWaiting: 0, truckingUpdatesFailed: 0 });
      expect(c.notKnown).toEqual(["the warehouse's records"]);
    });
  });
});
