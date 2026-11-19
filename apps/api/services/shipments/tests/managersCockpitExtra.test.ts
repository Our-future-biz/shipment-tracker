import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { addDays, businessInstant } from "../../../lib/businessDate";
import { officeMinutesBetween } from "../../../lib/officeHours";
import { DELIVERY_ORDER_RULE_FROM, ETA_PASSED_KEPT_DAYS, PASSED_DATE_KEPT_DAYS, REMEASURE_WAREHOUSE_CONCEPT_DAYS } from "../lib/cockpitThresholds";
import {
  EXTRA_RANK,
  PAPERWORK_PENDING,
  PAPERWORK_VERIFIED,
  PAPERWORK_WAITING,
  UNDER_CLEARANCE,
  WAITING_STATUSES,
  afterWorkingDays,
  conceptRemeasureOpen,
  arrivingIn,
  customsFieldSignals,
  dangerousSignals,
  deliveryOrderSignals,
  departureAhead,
  documentReviewSignals,
  hasLeft,
  importInstructionSignals,
  isUrgentForCustoms,
  isWaitingStatus,
  masterJobHouseSignals,
  masterJobRowSignals,
  masterJobWindowEnd,
  originalBlSignals,
  paperworkSignals,
  remeasurementSignals,
  requestSignals,
  shownCustomsStatus,
  statusStuckSignals,
  underClearanceSignals,
  waitedWorkingDays,
  watchesStatus,
  workingDayEnd,
  workingDaysAhead,
  REMEASURED_IN_WAREHOUSE_CONCEPT,
  type DocumentFact,
  type ExtraJob,
  type ExtraSignal,
  type ImportInstructionFact,
  type MasterJobFact,
  type RemeasureFact,
  type RequestFact,
} from "../lib/managersCockpitExtra";

// The rules of Shipments → Managers that read other tables than the shipment's (step 2), each at
// the edges of its threshold. The reads are tests/services/managersCockpitExtra.service.test.ts.

// Wednesday 18 Nov 2026, 10:00 in Prague. Tuesday the 17th is a public holiday, so the working
// day before is Monday the 16th; the weekend before that is 14-15 Nov.
const TODAY = "2026-11-18";
/** The moment of a Prague wall time, "YYYY-MM-DD HH:mm". */
const at = (wall: string) => businessInstant(wall.slice(0, 10), wall.slice(11));
const NOW = at("2026-11-18 10:00");
const NONE: readonly string[] = [];
const day = (n: number) => addDays(TODAY, n);
const minutes = (from: Date, n: number) => new Date(from.getTime() + n * 60_000);

const job = (over: Partial<ExtraJob> = {}): ExtraJob => ({
  id: "j1",
  tradeDirection: "Import",
  freightMode: "Sea Freight",
  department: "Operation Department",
  status: "Booked For Further Transport [IMP]",
  customsPriority: "Standard",
  customsStatus: "",
  customsDeadline: "",
  estimatedDeparture: null,
  actualDeparture: null,
  estimatedArrival: null,
  actualArrival: null,
  actualDeliveryDate: null,
  closingDate: null,
  shippingInstructions: "Not Queried",
  bolDraft: "Not Processed",
  masterBolType: "",
  dangerous: "No",
  masterJobId: null,
  customsProcedure: "",
  customsOffice: "",
  mrn: "",
  warehouseReceivedDate: null,
  createdAt: at("2026-11-02 09:00"),
  ...over,
});

const doc = (documentType: string, customsStatus = "", over: Partial<DocumentFact> = {}): DocumentFact => ({
  documentType,
  customsStatus,
  customsReviewedAt: customsStatus ? at("2026-11-16 12:00") : null,
  createdAt: at("2026-11-16 10:00"),
  ...over,
});

/** What a card's row shows of the signals: [text, urgent]. */
const tags = (signals: readonly ExtraSignal[]) => signals.map((s) => [s.text, s.urgent]);

describe("working days of a wait", () => {
  it("lasts n working days at the same Prague time n working days on, public holidays skipped", () => {
    // Monday 16th 10:00 + 1: Tuesday the 17th is a holiday, so Wednesday 10:00.
    expect(afterWorkingDays(at("2026-11-16 10:00"), 1, NONE)).toEqual(at("2026-11-18 10:00"));
    // Thursday 12th + 3: Friday, Monday, Wednesday.
    expect(afterWorkingDays(at("2026-11-12 08:00"), 3, NONE)).toEqual(at("2026-11-18 08:00"));
    expect(afterWorkingDays(at("2026-11-18 10:00"), 0, NONE)).toEqual(at("2026-11-18 10:00"));
  });

  it("counts a wait begun on a weekend or a holiday from the start of the next working day", () => {
    // Saturday afternoon: nobody could answer before Monday, whose whole day it is given.
    expect(afterWorkingDays(at("2026-11-14 15:00"), 1, NONE)).toEqual(at("2026-11-18 00:00"));
    expect(afterWorkingDays(at("2026-11-17 09:00"), 1, NONE)).toEqual(at("2026-11-19 00:00"));
  });

  it("skips the company's own non-working days too", () => {
    expect(afterWorkingDays(at("2026-11-18 10:00"), 1, ["2026-11-19"])).toEqual(at("2026-11-20 10:00"));
    // A day off is no day to begin a wait on either.
    expect(afterWorkingDays(at("2026-11-19 10:00"), 1, ["2026-11-19"])).toEqual(at("2026-11-23 00:00"));
  });

  it("has waited only once it is past that moment", () => {
    const since = at("2026-11-16 10:00");
    expect(waitedWorkingDays(since, 1, at("2026-11-18 10:00"), NONE)).toBe(false);
    expect(waitedWorkingDays(since, 1, at("2026-11-18 10:01"), NONE)).toBe(true);
  });
});

describe("office hours (lib/officeHours)", () => {
  it("counts 08:00-17:00 on working days, as it always did with no extra holidays", () => {
    expect(officeMinutesBetween(at("2026-11-18 08:00"), at("2026-11-18 12:00"))).toBe(240);
    // Monday 16:00 to Wednesday 09:00: an hour on Monday, none on the holiday, an hour on Wednesday.
    expect(officeMinutesBetween(at("2026-11-16 16:00"), at("2026-11-18 09:00"))).toBe(120);
    expect(officeMinutesBetween(at("2026-11-18 12:00"), at("2026-11-18 08:00"))).toBe(0);
  });

  it("skips the company's own days off when given them, so it agrees with the working days", () => {
    expect(officeMinutesBetween(at("2026-11-18 08:00"), at("2026-11-19 12:00"), ["2026-11-19"])).toBe(540);
    expect(officeMinutesBetween(at("2026-11-18 16:00"), at("2026-11-20 09:00"), ["2026-11-19"])).toBe(120);
    expect(officeMinutesBetween(at("2026-11-18 16:00"), at("2026-11-20 09:00"))).toBe(60 + 540 + 60);
  });
});

describe("hasLeft", () => {
  it("is true with an ATD, and with an ATA or a delivery date when no ATD was typed", () => {
    expect(hasLeft(job())).toBe(false);
    expect(hasLeft(job({ actualDeparture: day(-1) }))).toBe(true);
    expect(hasLeft(job({ actualArrival: day(-1) }))).toBe(true);
    expect(hasLeft(job({ actualDeliveryDate: day(-1) }))).toBe(true);
    // A Master Job is read with its ATD and ATA only.
    expect(hasLeft({ actualDeparture: null, actualArrival: day(-1) })).toBe(true);
    expect(hasLeft({ actualDeparture: null })).toBe(false);
    expect(hasLeft(job({ actualDeparture: "soon" }))).toBe(false);
  });
});

describe("arrivingIn and departureAhead", () => {
  it("counts the working days to the ETA of a job that has not arrived, the calendar days since one that passed (X7)", () => {
    expect(arrivingIn(job({ estimatedArrival: day(1) }), TODAY)).toBe(1);
    expect(arrivingIn(job({ estimatedArrival: day(2) }), TODAY)).toBe(2);
    // The weekend's days are the Monday's: Saturday, Sunday and Monday the 23rd are all 3 working days away.
    expect(arrivingIn(job({ estimatedArrival: day(3) }), TODAY)).toBe(3);
    expect(arrivingIn(job({ estimatedArrival: day(5) }), TODAY)).toBe(3);
    expect(arrivingIn(job({ estimatedArrival: day(6) }), TODAY)).toBe(4);
    expect(arrivingIn(job({ estimatedArrival: TODAY }), TODAY)).toBe(0);
    expect(arrivingIn(job({ estimatedArrival: day(-2) }), TODAY)).toBe(-2);
    // On a Friday Monday is 1 away; on 23 Dec 28 Dec is, over the Christmas holidays; a company day off moves it on.
    expect(arrivingIn(job({ estimatedArrival: "2026-11-23" }), "2026-11-20")).toBe(1);
    expect(arrivingIn(job({ estimatedArrival: "2026-12-28" }), "2026-12-23")).toBe(1);
    expect(arrivingIn(job({ estimatedArrival: "2026-11-24" }), "2026-11-20", ["2026-11-23"])).toBe(1);
  });

  it("counts working days ahead as addWorkingDays reaches them, and stops counting far out", () => {
    expect(workingDaysAhead("2026-11-20", "2026-11-21", NONE)).toBe(1);
    expect(workingDaysAhead("2026-11-20", "2026-11-23", NONE)).toBe(1);
    expect(workingDaysAhead("2026-11-20", "2026-11-24", NONE)).toBe(2);
    // From a Saturday the Monday is the next working day, 1 away as from the Friday, Tuesday 2 (n20):
    // as the URGENT window, which on a Saturday ends on the Monday.
    expect(workingDaysAhead("2026-11-21", "2026-11-22", NONE)).toBe(1);
    expect(workingDaysAhead("2026-11-21", "2026-11-23", NONE)).toBe(1);
    expect(workingDaysAhead("2026-11-21", "2026-11-24", NONE)).toBe(2);
    expect(workingDaysAhead("2026-11-22", "2026-11-23", NONE)).toBe(1);
    expect(workingDaysAhead("2026-11-18", "2026-11-18", NONE)).toBe(0);
    expect(workingDaysAhead("2026-11-18", "2026-11-17", NONE)).toBe(0);
    expect(workingDaysAhead("2026-11-18", "2027-06-01", NONE)).toBe(32);
  });

  it("works each window's end out once per holiday list and day, as addWorkingDays would", () => {
    const holidays = ["2026-11-23"];
    // Wednesday 18th: Thursday, Friday, (Monday off) Tuesday, Wednesday.
    expect([0, 1, 2, 3, 4].map((n) => workingDayEnd(TODAY, n, holidays))).toEqual(["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-24", "2026-11-25"]);
    // Asked out of order, or again, the same days.
    expect(workingDayEnd(TODAY, 10, holidays)).toBe("2026-12-03");
    expect(workingDayEnd(TODAY, 3, holidays)).toBe("2026-11-24");
    // Another list is another calendar, though the day is the same.
    expect(workingDayEnd(TODAY, 3, NONE)).toBe("2026-11-23");
    // A Saturday's first working day after it is Monday, and so is its "0" (the first day work can be done).
    expect(workingDayEnd("2026-11-21", 0, NONE)).toBe("2026-11-23");
    expect(workingDayEnd("2026-11-21", 1, NONE)).toBe("2026-11-23");
    expect(workingDayEnd("2026-11-21", 2, NONE)).toBe("2026-11-24");
    expect(() => workingDayEnd(TODAY, -1, NONE)).toThrow();
  });

  it("is null for a job that has arrived, has no ETA, or one that is no date", () => {
    expect(arrivingIn(job({ estimatedArrival: day(1), actualArrival: day(-1) }), TODAY)).toBeNull();
    // Delivered with no ATA typed: it arrived all the same.
    expect(arrivingIn(job({ estimatedArrival: day(-3), actualDeliveryDate: day(-1) }), TODAY)).toBeNull();
    expect(arrivingIn(job(), TODAY)).toBeNull();
    expect(arrivingIn(job({ estimatedArrival: "next week" }), TODAY)).toBeNull();
    expect(arrivingIn(job({ estimatedArrival: "2026-02-31" }), TODAY)).toBeNull();
  });

  it("drops an ETA that passed long ago with no ATA: that job is not arriving", () => {
    expect(arrivingIn(job({ estimatedArrival: day(-ETA_PASSED_KEPT_DAYS) }), TODAY)).toBe(-ETA_PASSED_KEPT_DAYS);
    expect(arrivingIn(job({ estimatedArrival: day(-ETA_PASSED_KEPT_DAYS - 1) }), TODAY)).toBeNull();
  });

  it("measures a job against its Closing, its ETD when it has none, until it departs", () => {
    expect(departureAhead(job({ closingDate: day(2), estimatedDeparture: day(5) }), TODAY)).toEqual({ what: "Closing", day: day(2), days: 2 });
    // Ahead in working days (Y5): Monday the 23rd is 3 away from Wednesday the 18th; passed, in calendar days.
    expect(departureAhead(job({ estimatedDeparture: day(5) }), TODAY)).toEqual({ what: "ETD", day: day(5), days: 3 });
    expect(departureAhead(job({ closingDate: day(-1) }), TODAY)).toEqual({ what: "Closing", day: day(-1), days: -1 });
    expect(departureAhead(job({ closingDate: day(-4) }), TODAY)).toEqual({ what: "Closing", day: day(-4), days: -4 });
    expect(departureAhead(job({ closingDate: TODAY }), TODAY)).toEqual({ what: "Closing", day: TODAY, days: 0 });
    // On a Friday the Monday is a day away; a company day off moves it on.
    expect(departureAhead(job({ closingDate: "2026-11-23" }), "2026-11-20")?.days).toBe(1);
    expect(departureAhead(job({ closingDate: "2026-11-24" }), "2026-11-20", ["2026-11-23"])?.days).toBe(1);
    expect(departureAhead(job({ closingDate: day(2), actualDeparture: day(-1) }), TODAY)).toBeNull();
    expect(departureAhead(job(), TODAY)).toBeNull();
  });

  it("is past its departure once it has arrived or was delivered, whether or not an ATD was typed", () => {
    expect(departureAhead(job({ closingDate: day(2), actualArrival: day(-1) }), TODAY)).toBeNull();
    expect(departureAhead(job({ estimatedDeparture: day(1), actualDeliveryDate: TODAY }), TODAY)).toBeNull();
  });
});

describe("shownCustomsStatus: the shipment's own rule", () => {
  it("waits until an invoice and a packing list are uploaded", () => {
    expect(shownCustomsStatus("", [])).toBe(PAPERWORK_WAITING);
    expect(shownCustomsStatus("", [doc("Invoice", "approved")])).toBe(PAPERWORK_WAITING);
    // A step set by hand does not show without the paperwork.
    expect(shownCustomsStatus("Customs Cleared/Released", [doc("Packing list")])).toBe(PAPERWORK_WAITING);
  });

  it("is pending until each has an approved document and none waits for review", () => {
    expect(shownCustomsStatus("", [doc("Invoice"), doc("Packing list")])).toBe(PAPERWORK_PENDING);
    expect(shownCustomsStatus("", [doc("Invoice", "approved"), doc("Packing list", "declined")])).toBe(PAPERWORK_PENDING);
    expect(shownCustomsStatus("", [doc("Invoice", "approved"), doc("Invoice"), doc("Packing list", "approved")])).toBe(PAPERWORK_PENDING);
    expect(shownCustomsStatus(UNDER_CLEARANCE, [doc("Invoice", "approved"), doc("Packing list")])).toBe(PAPERWORK_PENDING);
  });

  it("is verified then, a declined document beside the approved one not blocking, and shows a step set by hand", () => {
    const verified = [doc("Invoice", "approved"), doc("Invoice", "declined"), doc("Packing list", "approved")];
    expect(shownCustomsStatus("", verified)).toBe(PAPERWORK_VERIFIED);
    expect(shownCustomsStatus(PAPERWORK_WAITING, verified)).toBe(PAPERWORK_VERIFIED);
    expect(shownCustomsStatus(UNDER_CLEARANCE, verified)).toBe(UNDER_CLEARANCE);
    expect(shownCustomsStatus("Customs Cleared/Released", verified)).toBe("Customs Cleared/Released");
  });
});

describe("U10 / A6: an import arriving while it waits for its commercial paperwork", () => {
  const waiting = (over: Partial<ExtraJob>) => paperworkSignals(job(over), PAPERWORK_WAITING, TODAY);

  it("is URGENT a day before the ETA, on the day, and once the ETA has passed", () => {
    expect(waiting({ estimatedArrival: day(1) })).toEqual([{ rank: 3, text: "Waiting For Commercial Paperwork · arriving tomorrow", urgent: true, area: "customs", kind: "paperwork" }]);
    expect(tags(waiting({ estimatedArrival: TODAY }))).toEqual([["Waiting For Commercial Paperwork · arriving today", true]]);
    expect(tags(waiting({ estimatedArrival: day(-1) }))).toEqual([["Waiting For Commercial Paperwork · ETA 17.11. passed", true]]);
  });

  it("stays URGENT once it has arrived, until it is delivered", () => {
    expect(tags(waiting({ estimatedArrival: day(-30), actualArrival: day(-28) }))).toEqual([["Waiting For Commercial Paperwork · arrived 21.10.", true]]);
    expect(tags(waiting({ actualArrival: TODAY }))).toEqual([["Waiting For Commercial Paperwork · arrived 18.11.", true]]);
    // A sea import that was delivered got through customs, whatever was uploaded.
    expect(waiting({ estimatedArrival: day(-30), actualArrival: day(-28), actualDeliveryDate: day(-20) })).toEqual([]);
    expect(waiting({ actualArrival: day(-1), actualDeliveryDate: TODAY })).toEqual([]);
    // Delivered with no ATA typed, the ETA only just passed: not "arriving" either.
    expect(waiting({ estimatedArrival: day(-1), actualDeliveryDate: TODAY })).toEqual([]);
  });

  it("says nothing of C-Goods, which customs does not clear: neither before arrival nor after", () => {
    expect(waiting({ customsProcedure: "C-Goods", actualArrival: day(-1) })).toEqual([]);
    expect(waiting({ customsProcedure: " c-goods ", estimatedArrival: day(-3), actualArrival: day(-2) })).toEqual([]);
    expect(waiting({ customsProcedure: "C-Goods", estimatedArrival: day(1) })).toEqual([]);
    for (const customsProcedure of ["SCP", "JSD", "T1", ""]) expect(waiting({ customsProcedure, actualArrival: day(-1) })).toHaveLength(1);
  });

  it("is ATTENTION from 2 to 5 working days out by sea and rail", () => {
    expect(waiting({ estimatedArrival: day(2) })).toEqual([{ rank: 28, text: "Waiting For Commercial Paperwork · arriving on Fri 20.11.", urgent: false, area: "customs", kind: "paperwork" }]);
    expect(tags(waiting({ estimatedArrival: day(5) }))).toEqual([["Waiting For Commercial Paperwork · arriving on Mon 23.11.", false]]);
    // The fifth working day after Wednesday the 18th is Wednesday the 25th: the weekend counts no day.
    expect(tags(waiting({ estimatedArrival: day(7) }))).toEqual([["Waiting For Commercial Paperwork · arriving on Wed 25.11.", false]]);
    expect(waiting({ estimatedArrival: day(8) })).toEqual([]);
    expect(tags(waiting({ freightMode: "Rail Freight", estimatedArrival: day(5) }))).toEqual([["Waiting For Commercial Paperwork · arriving on Mon 23.11.", false]]);
  });

  it("on a Friday an arrival on Monday is a working day away: URGENT by air (X7), and over Christmas 28.12. from 23.12.", () => {
    const air = (estimatedArrival: string, today: string, holidays: readonly string[] = NONE) => tags(paperworkSignals(job({ freightMode: "Air Freight", estimatedArrival }), PAPERWORK_WAITING, today, holidays));
    expect(air("2026-11-23", "2026-11-20")).toEqual([["Waiting For Commercial Paperwork · arriving on Mon 23.11.", true]]);
    expect(air("2026-11-24", "2026-11-20")).toEqual([["Waiting For Commercial Paperwork · arriving on Tue 24.11.", false]]);
    expect(air("2026-11-25", "2026-11-20")).toEqual([]);
    expect(air("2026-12-28", "2026-12-23")).toEqual([["Waiting For Commercial Paperwork · arriving on Mon 28.12.", true]]);
    // A company day off on the Monday: Tuesday is the next working day.
    expect(air("2026-11-24", "2026-11-20", ["2026-11-23"])).toEqual([["Waiting For Commercial Paperwork · arriving on Tue 24.11.", true]]);
  });

  it("is ATTENTION only 2 days out by air and by road", () => {
    for (const freightMode of ["Air Freight", "Road Freight"]) {
      expect(tags(waiting({ freightMode, estimatedArrival: day(2) }))).toEqual([["Waiting For Commercial Paperwork · arriving on Fri 20.11.", false]]);
      expect(waiting({ freightMode, estimatedArrival: day(3) })).toEqual([]);
      expect(tags(waiting({ freightMode, estimatedArrival: day(1) }))).toEqual([["Waiting For Commercial Paperwork · arriving tomorrow", true]]);
    }
  });

  it("says nothing once the paperwork is there, for an export, or with no ETA", () => {
    expect(paperworkSignals(job({ estimatedArrival: TODAY }), PAPERWORK_PENDING, TODAY)).toEqual([]);
    expect(paperworkSignals(job({ estimatedArrival: TODAY }), PAPERWORK_VERIFIED, TODAY)).toEqual([]);
    expect(waiting({ tradeDirection: "Export", estimatedArrival: TODAY })).toEqual([]);
    expect(waiting({})).toEqual([]);
    expect(tags(waiting({ tradeDirection: " IMPORT ", estimatedArrival: TODAY }))).toHaveLength(1);
  });

  it("leaves a Trucking job alone until it has an MRN or a customs deadline: it reads waiting all its life", () => {
    const road = { department: "Road Department", freightMode: "Road Freight", estimatedArrival: TODAY };
    expect(waiting(road)).toEqual([]);
    expect(tags(waiting({ ...road, mrn: "26CZ1" }))).toHaveLength(1);
    expect(tags(waiting({ ...road, customsDeadline: "2026-11-19 14:00" }))).toHaveLength(1);
  });
});

describe("U10: an original Master BoL not in hand", () => {
  it("is URGENT 2 days before an import's ETA, and once the ETA has passed", () => {
    expect(originalBlSignals(job({ masterBolType: "OBL", estimatedArrival: day(2) }), TODAY)).toEqual([
      { rank: 4, text: "Master BoL is an OBL, not in hand · arriving on Fri 20.11.", urgent: true, area: "details", kind: "bl" },
    ]);
    expect(tags(originalBlSignals(job({ masterBolType: " obl ", estimatedArrival: day(-3) }), TODAY))).toEqual([["Master BoL is an OBL, not in hand · ETA 15.11. passed", true]]);
    expect(originalBlSignals(job({ masterBolType: "OBL", estimatedArrival: day(3) }), TODAY)).toEqual([]);
  });

  it("says nothing for an original in hand, a Telex release or a Sea Waybill, an export, or a job that has arrived", () => {
    for (const masterBolType of ["OMBL ok", "Telex", "SWB", ""]) expect(originalBlSignals(job({ masterBolType, estimatedArrival: TODAY }), TODAY)).toEqual([]);
    expect(originalBlSignals(job({ masterBolType: "OBL", estimatedArrival: TODAY, tradeDirection: "Export" }), TODAY)).toEqual([]);
    expect(originalBlSignals(job({ masterBolType: "OBL", estimatedArrival: TODAY, actualArrival: TODAY }), TODAY)).toEqual([]);
    expect(originalBlSignals(job({ masterBolType: "OBL" }), TODAY)).toEqual([]);
  });

  it("clears once Originals Received or Telex Release Received has a day (step 6), whatever the type still reads", () => {
    const obl = { masterBolType: "OBL", estimatedArrival: day(1) };
    expect(originalBlSignals(job({ ...obl, originalsReceivedDate: day(-1) }), TODAY)).toEqual([]);
    expect(originalBlSignals(job({ ...obl, telexReleaseReceivedDate: TODAY }), TODAY)).toEqual([]);
    // No day, or a row that does not carry the dates: not in hand, as before.
    expect(tags(originalBlSignals(job({ ...obl, originalsReceivedDate: null, telexReleaseReceivedDate: null }), TODAY))).toEqual([["Master BoL is an OBL, not in hand · arriving tomorrow", true]]);
    expect(tags(originalBlSignals(job({ ...obl, originalsReceivedDate: " " }), TODAY))).toHaveLength(1);
  });
});

describe("step 6: an import that arrived with no delivery order", () => {
  // Wednesday the 25th, a week after the rule went live (DELIVERY_ORDER_RULE_FROM, Thursday the 19th): only arrivals since are judged (L9).
  const LATER = "2026-11-25";
  const arrived = (actualArrival: string, over: Partial<ExtraJob> = {}, holidays: readonly string[] = NONE, today = LATER) =>
    deliveryOrderSignals(job({ actualArrival, deliveryOrderDate: null, ...over }), today, holidays);

  it("is ATTENTION a working day after the ATA, and URGENT at three", () => {
    expect(arrived("2026-11-24")).toEqual([{ rank: 28.5, text: "Arrived 24.11., no delivery order", urgent: false, area: "details", kind: "bl" }]);
    // Monday the 23rd: Tuesday and today, two.
    expect(tags(arrived("2026-11-23"))).toEqual([["Arrived 23.11., no delivery order", false]]);
    // Friday the 20th: Monday, Tuesday and today, three.
    expect(arrived("2026-11-20")).toEqual([{ rank: 4.5, text: "Arrived 20.11., no delivery order", urgent: true, area: "details", kind: "bl" }]);
    // A company day off is no working day.
    expect(tags(arrived("2026-11-20", {}, ["2026-11-23"]))).toEqual([["Arrived 20.11., no delivery order", false]]);
  });

  it("judges no arrival before the day the rule went live (L9): those were collected on paper nobody typed here", () => {
    expect(DELIVERY_ORDER_RULE_FROM).toBe("2026-11-19");
    expect(tags(arrived("2026-11-19"))).toEqual([["Arrived 19.11., no delivery order", true]]);
    expect(arrived("2026-11-18")).toEqual([]);
    expect(arrived("2026-11-12", {}, NONE, TODAY)).toEqual([]);
  });

  it("judges only an arrival of the last 14 calendar days: an older one gives no tag (no job had the date before step 6)", () => {
    expect(ETA_PASSED_KEPT_DAYS).toBe(14);
    // On Friday 4 Dec, Friday the 20th is 14 days ago: still judged, and URGENT by then.
    expect(tags(arrived("2026-11-20", {}, NONE, "2026-12-04"))).toEqual([["Arrived 20.11., no delivery order", true]]);
    expect(arrived("2026-11-19", {}, NONE, "2026-12-04")).toEqual([]);
  });

  it("waits a working day: not on the day of arrival, nor before a company day off has passed", () => {
    expect(arrived(LATER)).toEqual([]);
    expect(arrived("2026-11-24", {}, [LATER])).toEqual([]);
    expect(arrived("2026-11-26")).toEqual([]);
  });

  it("is for a sea or rail import only", () => {
    expect(tags(arrived("2026-11-20", { freightMode: "Rail Freight" }))).toHaveLength(1);
    expect(tags(arrived("2026-11-20", { freightMode: "" }))).toHaveLength(1);
    expect(arrived("2026-11-20", { freightMode: "Air Freight" })).toEqual([]);
    expect(arrived("2026-11-20", { freightMode: "Road Freight" })).toEqual([]);
    expect(arrived("2026-11-20", { department: "Road Department" })).toEqual([]);
    expect(arrived("2026-11-20", { tradeDirection: "Export" })).toEqual([]);
    expect(tags(arrived("2026-11-20", { tradeDirection: " IMPORT " }))).toHaveLength(1);
  });

  it("says nothing once the cargo is in our warehouse (m25): an LCL import we collected had its delivery order handled", () => {
    expect(arrived("2026-11-20", { warehouseReceivedDate: "2026-11-23" })).toEqual([]);
    expect(arrived("2026-11-20", { warehouseReceivedDate: null })).toHaveLength(1);
  });

  it("says nothing once there is a delivery order or a delivery, without an ATA, or when the row does not carry the date", () => {
    expect(arrived("2026-11-20", { deliveryOrderDate: "2026-11-23" })).toEqual([]);
    expect(arrived("2026-11-20", { actualDeliveryDate: "2026-11-24" })).toEqual([]);
    expect(deliveryOrderSignals(job({ estimatedArrival: "2026-11-20", deliveryOrderDate: null }), LATER, NONE)).toEqual([]);
    // Not known is no tag (D29).
    expect(deliveryOrderSignals(job({ actualArrival: "2026-11-20" }), LATER, NONE)).toEqual([]);
  });
});

describe("A6: documents waiting for customs, declined and not replaced", () => {
  const review = (documents: DocumentFact[], over: Partial<ExtraJob> = {}, now = NOW, shown = PAPERWORK_PENDING) => documentReviewSignals(job(over), shown, documents, now, NONE);

  it("names a document customs has not reviewed for longer than a working day", () => {
    // Uploaded Monday 10:00; Tuesday is a holiday, so the working day ends Wednesday 10:00.
    const invoice = doc("Invoice");
    expect(review([invoice])).toEqual([]);
    expect(review([invoice], {}, minutes(NOW, 1))).toEqual([
      { rank: 30, text: "Commercial Invoice not reviewed by customs since 16.11. 10:00", urgent: false, area: "customs", kind: "paperwork" },
    ]);
  });

  it("gives customs 4 office hours on a job that is Urgent for customs", () => {
    const urgent = { customsPriority: "Urgent" };
    const packing = doc("Packing list", "", { createdAt: at("2026-11-18 08:00") });
    expect(review([packing], urgent, at("2026-11-18 11:59"))).toEqual([]);
    expect(tags(review([packing], urgent, at("2026-11-18 12:00")))).toEqual([["Packing list not reviewed by customs since 18.11. 08:00", false]]);
    // A Standard job waits the working day.
    expect(review([packing], {}, at("2026-11-18 12:00"))).toEqual([]);
    // Uploaded in the evening: the office hours begin the next morning.
    const evening = doc("Invoice", "", { createdAt: at("2026-11-16 19:00") });
    expect(review([evening], urgent, at("2026-11-18 11:59"))).toEqual([]);
    expect(review([evening], urgent, at("2026-11-18 12:00"))).toHaveLength(1);
  });

  it("counts several, aged by the oldest, and only the types customs reviews", () => {
    const late = [doc("Invoice", "", { createdAt: at("2026-11-13 09:00") }), doc("Certificate of origin", "", { createdAt: at("2026-11-12 16:30") }), doc("Bill of Lading"), doc("MSDS"), doc("Customs document", "approved")];
    expect(tags(review(late, {}, minutes(NOW, 1)))).toEqual([["2 documents not reviewed by customs, the oldest since 12.11. 16:30", false]]);
    expect(review([doc("Bill of Lading"), doc("Booking confirmation"), doc("Dangerous Goods Declaration")], {}, minutes(NOW, 1))).toEqual([]);
  });

  it("names a declined document nothing has replaced for 24 hours", () => {
    const declined = doc("Invoice", "declined", { customsReviewedAt: at("2026-11-17 10:00") });
    expect(review([declined])).toEqual([{ rank: 29, text: "Declined Commercial Invoice not replaced since 17.11. 10:00", urgent: false, area: "customs", kind: "paperwork" }]);
    expect(review([declined], {}, minutes(NOW, -1))).toEqual([]);
  });

  it("is replaced by any file of the type that was not declined, and ages a second decline from itself", () => {
    const declined = doc("Invoice", "declined", { customsReviewedAt: at("2026-11-13 10:00") });
    expect(review([declined, doc("Invoice", "approved")])).toEqual([]);
    // The replacement waits for its own review: that is the tag then.
    expect(tags(review([declined, doc("Invoice", "", { createdAt: at("2026-11-18 09:00") })]))).toEqual([]);
    const again = doc("Invoice", "declined", { customsReviewedAt: at("2026-11-18 09:30") });
    expect(review([declined, again])).toEqual([]);
    expect(tags(review([declined, again], {}, at("2026-11-19 09:30")))).toEqual([["Declined Commercial Invoice not replaced since 18.11. 09:30", false]]);
  });

  it("lists every type declined and not replaced in one tag, aged by the oldest", () => {
    const docs = [doc("Packing list", "declined", { customsReviewedAt: at("2026-11-16 15:00") }), doc("Invoice", "declined", { customsReviewedAt: at("2026-11-13 10:00") })];
    expect(tags(review(docs))).toEqual([["Declined Packing list, Commercial Invoice not replaced since 13.11. 10:00", false]]);
  });

  it("ages a decline with no review time from the upload", () => {
    const declined = doc("Invoice", "declined", { customsReviewedAt: null, createdAt: at("2026-11-13 08:00") });
    expect(tags(review([declined]))).toEqual([["Declined Commercial Invoice not replaced since 13.11. 08:00", false]]);
  });

  it("says nothing on a shipment that shows Customs Cleared/Released", () => {
    const docs = [doc("Certificate of origin", "", { createdAt: at("2026-11-02 10:00") }), doc("Customs document", "declined", { customsReviewedAt: at("2026-11-02 10:00") })];
    expect(review(docs, {}, NOW, "Customs Cleared/Released")).toEqual([]);
    expect(review(docs)).toHaveLength(2);
  });
});

describe("U11 / A23: dangerous goods without their safety paperwork", () => {
  const dg = (over: Partial<ExtraJob>, documents: DocumentFact[] = []) => dangerousSignals(job({ dangerous: "Yes", tradeDirection: "Export", ...over }), documents, TODAY);

  it("is URGENT 3 working days before the Closing", () => {
    expect(dg({ closingDate: day(3) })).toEqual([
      { rank: 5, text: "Dangerous goods: no MSDS, no Dangerous Goods Declaration · Closing on Sat 21.11.", urgent: true, area: "details", kind: "dangerous" },
    ]);
    expect(tags(dg({ closingDate: TODAY }))).toEqual([["Dangerous goods: no MSDS, no Dangerous Goods Declaration · Closing today", true]]);
    // Counted in working days (Y5): from Wednesday the 18th, Monday the 23rd is the third - and the weekend before it with it.
    expect(tags(dg({ closingDate: day(5) }))).toEqual([["Dangerous goods: no MSDS, no Dangerous Goods Declaration · Closing on Mon 23.11.", true]]);
  });

  it("is ATTENTION from 4 to 7 working days before it", () => {
    expect(dg({ closingDate: day(6) })).toEqual([
      { rank: 31, text: "Dangerous goods: no MSDS, no Dangerous Goods Declaration · Closing on Tue 24.11.", urgent: false, area: "details", kind: "dangerous" },
    ]);
    expect(tags(dg({ closingDate: day(9) }))).toEqual([["Dangerous goods: no MSDS, no Dangerous Goods Declaration · Closing on Fri 27.11.", false]]);
    // The weekend after the Friday belongs to the Monday: 8 working days away.
    expect(dg({ closingDate: day(10) })).toEqual([]);
    // The company's own day off counts as none: with Tuesday the 24th off, Monday the 30th is the 7th.
    expect(dangerousSignals(job({ dangerous: "Yes", tradeDirection: "Export", closingDate: day(12) }), [], TODAY, ["2026-11-24"])).toHaveLength(1);
  });

  it("is measured against the ETD when the job has no Closing", () => {
    expect(tags(dg({ estimatedDeparture: day(1) }))).toEqual([["Dangerous goods: no MSDS, no Dangerous Goods Declaration · ETD tomorrow", true]]);
    // With a Closing the ETD does not count, however near.
    expect(dg({ closingDate: day(12), estimatedDeparture: day(1) })).toEqual([]);
    expect(dg({})).toEqual([]);
  });

  it("names only what is missing; a declined document does not stand for its type", () => {
    expect(tags(dg({ closingDate: day(2) }, [doc("MSDS")]))).toEqual([["Dangerous goods: no Dangerous Goods Declaration · Closing on Fri 20.11.", true]]);
    expect(tags(dg({ closingDate: day(2) }, [doc("Dangerous Goods Declaration"), doc("MSDS", "declined")]))).toEqual([["Dangerous goods: no MSDS · Closing on Fri 20.11.", true]]);
    expect(dg({ closingDate: day(2) }, [doc("MSDS"), doc("Dangerous Goods Declaration")])).toEqual([]);
  });

  it("keeps a Closing that has passed for a week while the job has no ATD", () => {
    expect(tags(dg({ closingDate: day(-2) }))).toEqual([["Dangerous goods: no MSDS, no Dangerous Goods Declaration · Closing 16.11. passed", true]]);
    expect(dg({ closingDate: day(-PASSED_DATE_KEPT_DAYS) })).toHaveLength(1);
    expect(dg({ closingDate: day(-PASSED_DATE_KEPT_DAYS - 1) })).toEqual([]);
    expect(dg({ closingDate: day(-2), actualDeparture: day(-1) })).toEqual([]);
  });

  it("asks nothing before a departure of a job that has arrived or was delivered with no ATD typed", () => {
    // An air import: its ETD lies ahead on paper, but it has landed.
    const landed = { tradeDirection: "Import", freightMode: "Air Freight", estimatedDeparture: day(1), actualArrival: TODAY };
    expect(dg(landed)).toEqual([]);
    expect(dg({ ...landed, actualArrival: null })).toHaveLength(1);
    expect(dg({ closingDate: day(2), actualDeliveryDate: day(-1) })).toEqual([]);
  });

  it("says nothing unless Dangerous is Yes", () => {
    for (const dangerous of ["No", "", null]) expect(dg({ dangerous, closingDate: TODAY })).toEqual([]);
    expect(dg({ dangerous: " yes ", closingDate: TODAY })).toHaveLength(1);
  });
});

describe("U17: requests waiting for a manager", () => {
  const request = (kind: RequestFact["kind"], wall: string): RequestFact => ({ kind, requestedAt: at(wall) });
  const waiting = (requests: RequestFact[], over: Partial<ExtraJob> = {}, now = NOW) => requestSignals(job(over), requests, now, NONE);

  it("is URGENT once a request has waited longer than a working day", () => {
    const asked = [request("document", "2026-11-16 10:00")];
    expect(waiting(asked)).toEqual([]);
    expect(waiting(asked, {}, minutes(NOW, 1))).toEqual([{ rank: 6, text: "Document change waiting for approval since 16.11. 10:00", urgent: true, area: "customs", kind: "request" }]);
    expect(tags(waiting([request("customs_office", "2026-11-13 15:00")]))).toEqual([["Customs Office change waiting for approval since 13.11. 15:00", true]]);
  });

  it("is URGENT from the first minute on a job that is Urgent for customs and not cleared", () => {
    const asked = [request("customs_office", "2026-11-18 09:55")];
    expect(tags(waiting(asked, { customsPriority: "Urgent" }))).toEqual([["Customs Office change waiting for approval since 18.11. 09:55", true]]);
    expect(waiting(asked, { customsPriority: "Urgent", customsStatus: "Customs Cleared/Released" })).toEqual([]);
    expect(waiting(asked)).toEqual([]);
  });

  it("gives one tag per kind of request, aged by its oldest", () => {
    const asked = [request("document", "2026-11-18 09:00"), request("document", "2026-11-13 09:00"), request("customs_office", "2026-11-12 09:00")];
    expect(tags(waiting(asked))).toEqual([
      ["2 document changes waiting for approval, the oldest since 13.11. 09:00", true],
      ["Customs Office change waiting for approval since 12.11. 09:00", true],
    ]);
  });

  it("says nothing with no request", () => {
    expect(waiting([], { customsPriority: "Urgent" })).toEqual([]);
  });

  it("counts the company's own days off", () => {
    const asked = [request("document", "2026-11-16 10:00")];
    expect(requestSignals(job(), asked, at("2026-11-18 15:00"), ["2026-11-18"])).toEqual([]);
    expect(requestSignals(job(), asked, at("2026-11-19 10:01"), ["2026-11-18"])).toHaveLength(1);
  });
});

describe("A7: what the customs fields lack", () => {
  const fields = (over: Partial<ExtraJob>, shown: string | null = PAPERWORK_PENDING) => customsFieldSignals(job(over), shown, TODAY);

  it("knows a job Urgent for customs as the Customs page does: Urgent, and not stored as cleared", () => {
    expect(isUrgentForCustoms(job({ customsPriority: "Urgent" }))).toBe(true);
    expect(isUrgentForCustoms(job({ customsPriority: "Urgent", customsStatus: "Customs Cleared/Released" }))).toBe(false);
    expect(isUrgentForCustoms(job())).toBe(false);
  });

  it("names an Urgent job with no deadline typed", () => {
    expect(fields({ customsPriority: "Urgent" })).toEqual([{ rank: 32, text: "Customs Urgent with no deadline typed", urgent: false, area: "customs", kind: "customs" }]);
    expect(fields({ customsPriority: "Urgent", customsDeadline: "2026-11-19 14:00" })).toEqual([]);
    expect(fields({ customsPriority: "Urgent", customsStatus: "Customs Cleared/Released" }, PAPERWORK_PENDING)).toEqual([]);
    expect(fields({ customsPriority: "Standard" })).toEqual([]);
  });

  it("names a T1 with no Customs Office 3 days before the ETA", () => {
    expect(fields({ customsProcedure: "T1", estimatedArrival: day(3) })).toEqual([{ rank: 33, text: "T1 with no Customs Office · arriving on Sat 21.11.", urgent: false, area: "customs", kind: "customs" }]);
    expect(tags(fields({ customsProcedure: " t1 ", estimatedArrival: day(-1) }))).toEqual([["T1 with no Customs Office · ETA 17.11. passed", false]]);
    expect(fields({ customsProcedure: "T1", estimatedArrival: day(4) })).toHaveLength(1);
    // 3 working days: Monday the 23rd - and the weekend before it.
    expect(tags(fields({ customsProcedure: "T1", estimatedArrival: day(5) }))).toEqual([["T1 with no Customs Office · arriving on Mon 23.11.", false]]);
    expect(fields({ customsProcedure: "T1", estimatedArrival: day(6) })).toEqual([]);
    expect(fields({ customsProcedure: "T1", customsOffice: "CZ510201 Praha Ruzyně", estimatedArrival: TODAY })).toEqual([]);
    expect(fields({ customsProcedure: "SCP", estimatedArrival: TODAY })).toEqual([]);
    expect(fields({ customsProcedure: "T1", estimatedArrival: TODAY, actualArrival: TODAY })).toEqual([]);
    expect(fields({ customsProcedure: "T1" })).toEqual([]);
  });

  it("names a shipment that shows Customs Cleared/Released with no MRN", () => {
    const cleared = { customsStatus: "Customs Cleared/Released" };
    expect(fields(cleared, "Customs Cleared/Released")).toEqual([{ rank: 35, text: "Customs Cleared/Released with no MRN", urgent: false, area: "customs", kind: "customs" }]);
    expect(fields({ ...cleared, mrn: "26CZ510000ABCDEF12" }, "Customs Cleared/Released")).toEqual([]);
    // Stored as cleared, but the paperwork no longer verified: the shipment does not show it.
    expect(fields(cleared, PAPERWORK_PENDING)).toEqual([]);
  });

  it("does not guess the status the shipment shows when its documents could not be read", () => {
    expect(fields({ customsStatus: "Customs Cleared/Released" }, null)).toEqual([]);
    // What the job's own columns say still stands.
    expect(tags(fields({ customsPriority: "Urgent", customsProcedure: "T1", estimatedArrival: TODAY }, null))).toEqual([
      ["Customs Urgent with no deadline typed", false],
      ["T1 with no Customs Office · arriving today", false],
    ]);
  });
});

describe("A8: Under Customs Clearance for too long", () => {
  it("is named after more than 3 working days", () => {
    // Set Thursday the 12th 08:00: Friday, Monday, Wednesday 08:00 (Tuesday is a holiday).
    const since = at("2026-11-12 08:00");
    expect(underClearanceSignals(UNDER_CLEARANCE, since, NOW, NONE)).toEqual([{ rank: 34, text: "Under Customs Clearance since 12.11.", urgent: false, area: "customs", kind: "customs" }]);
    expect(underClearanceSignals(UNDER_CLEARANCE, since, at("2026-11-18 08:00"), NONE)).toEqual([]);
    expect(underClearanceSignals(UNDER_CLEARANCE, at("2026-11-13 12:00"), NOW, NONE)).toEqual([]);
  });

  it("says nothing when the shipment shows another status, or the history does not say since when", () => {
    expect(underClearanceSignals(PAPERWORK_VERIFIED, at("2026-11-02 08:00"), NOW, NONE)).toEqual([]);
    expect(underClearanceSignals(UNDER_CLEARANCE, null, NOW, NONE)).toEqual([]);
  });
});

describe("A14: a waiting status that has not moved", () => {
  it("knows the statuses that wait for somebody, for either direction and in any case", () => {
    for (const status of [
      "Booking Confirmation Pending [IMP]",
      "Booking Confirmation Pending [EXP]",
      "Pick Up Date Pending From Customer [EXP]",
      "Arrival Notice Sent - Waiting For Instructions [IMP]",
      "Delivery Date Pending From Customer [IMP]",
      "booking confirmation pending",
      " Delivery Date Pending From Customer  [imp] ",
    ]) {
      expect(isWaitingStatus(status), status).toBe(true);
    }
    for (const status of ["Booked For Further Transport [IMP]", "Customs Clearance Pending [IMP]", "All Done - Waiting To Be Shipped [EXP]", "Billing [IMP]", "Cancelled Shipment", ""]) {
      expect(isWaitingStatus(status), status).toBe(false);
    }
    // "[DOM]" is written on Trucking's jobs only. The words are a waiting status all the same;
    // that such a job is not watched is the job's doing (watchesStatus), not the text's.
    expect(isWaitingStatus("Booking Confirmation Pending [DOM]")).toBe(true);
    expect(watchesStatus(job({ tradeDirection: "Domestic", status: "Booking Confirmation Pending [DOM]" }))).toBe(false);
  });

  it("matches the statuses the web offers (apps/web/src/lib/enums.ts)", () => {
    const enums = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../../../web/src/lib/enums.ts"), "utf8");
    const block = enums.slice(enums.indexOf("export const SHIPMENT_STATUSES"), enums.indexOf("] as const;", enums.indexOf("export const SHIPMENT_STATUSES")));
    const web = [...block.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(web.length).toBeGreaterThan(10);
    // Every waiting status is one the web writes, for at least one direction…
    for (const status of WAITING_STATUSES) expect(web.some((s) => s.startsWith(`${status} [`)), status).toBe(true);
    // …and of the web's statuses exactly those are waiting ones.
    expect(web.filter(isWaitingStatus).sort()).toEqual(web.filter((s) => WAITING_STATUSES.some((w) => s.startsWith(`${w} [`))).sort());
    expect(web.filter(isWaitingStatus)).toHaveLength(5);
  });

  it("is named after more than 3 working days since the status last changed", () => {
    const stuck = job({ status: "Booking Confirmation Pending [EXP]" });
    expect(statusStuckSignals(stuck, at("2026-11-12 08:00"), NOW, NONE)).toEqual([{ rank: 40, text: "Status unchanged since 12.11.", urgent: false, area: "details", kind: "status_stuck" }]);
    expect(statusStuckSignals(stuck, at("2026-11-12 10:00"), NOW, NONE)).toEqual([]);
    expect(statusStuckSignals(stuck, at("2026-11-12 10:00"), minutes(NOW, 1), NONE)).toHaveLength(1);
  });

  it("has stood since the job was created when the history holds no change", () => {
    const created = job({ status: "Delivery Date Pending From Customer [IMP]", createdAt: at("2026-11-02 09:00") });
    expect(statusStuckSignals(created, null, NOW, NONE).map((s) => s.text)).toEqual(["Status unchanged since 02.11."]);
    // The row may carry its creation as an ISO text.
    expect(statusStuckSignals({ ...created, createdAt: "2026-11-02T08:00:00.000Z" }, null, NOW, NONE).map((s) => s.text)).toEqual(["Status unchanged since 02.11."]);
    expect(statusStuckSignals(job({ status: "Delivery Date Pending From Customer [IMP]", createdAt: at("2026-11-16 09:00") }), null, NOW, NONE)).toEqual([]);
    expect(statusStuckSignals({ ...created, createdAt: null }, null, NOW, NONE)).toEqual([]);
    expect(statusStuckSignals({ ...created, createdAt: "long ago" }, null, NOW, NONE)).toEqual([]);
  });

  it("says nothing on a Trucking job: its status is set once when Trucking creates it and stands for its whole life", () => {
    const old = at("2026-10-01 08:00");
    const domestic = job({ tradeDirection: "Domestic", department: "Road Department", freightMode: "Road Freight", status: "Booking Confirmation Pending [DOM]", createdAt: old });
    expect(watchesStatus(domestic)).toBe(false);
    expect(statusStuckSignals(domestic, null, NOW, NONE)).toEqual([]);
    expect(statusStuckSignals(domestic, old, NOW, NONE)).toEqual([]);
    // Either mark of a Trucking job is enough: Domestic, or the Road Department.
    expect(statusStuckSignals(job({ tradeDirection: "Domestic", status: "Booking Confirmation Pending [DOM]" }), old, NOW, NONE)).toEqual([]);
    expect(statusStuckSignals(job({ department: "Road Department", status: "Booking Confirmation Pending [IMP]" }), old, NOW, NONE)).toEqual([]);
    // An international Road Freight job of Operations is no Trucking job: it is watched.
    const road = job({ freightMode: "Road Freight", status: "Booking Confirmation Pending [IMP]" });
    expect(watchesStatus(road)).toBe(true);
    expect(statusStuckSignals(road, old, NOW, NONE)).toHaveLength(1);
    expect(watchesStatus(job())).toBe(false);
  });

  it("says nothing for a status that waits for nobody, however old", () => {
    expect(statusStuckSignals(job({ status: "Booked For Further Transport [IMP]" }), at("2026-10-01 08:00"), NOW, NONE)).toEqual([]);
  });
});

describe("A18: the customer's Import Instructions", () => {
  const form = (over: Partial<ImportInstructionFact>): ImportInstructionFact => ({ status: "open", submittedAt: null, expiresAt: at("2026-11-30 12:00"), ...over });
  const told = (f: ImportInstructionFact | null, over: Partial<ExtraJob> = {}, now = NOW) => importInstructionSignals(job(over), f, TODAY, now, NONE);

  it("names answers waiting for approval longer than a working day", () => {
    const sent = form({ status: "submitted", submittedAt: at("2026-11-16 10:00") });
    expect(told(sent)).toEqual([]);
    expect(told(sent, {}, minutes(NOW, 1))).toEqual([
      { rank: 37, text: "Import Instructions from the customer not answered since 16.11. 10:00", urgent: false, area: "details", kind: "import_instructions" },
    ]);
    // Waiting answers are aged by their wait, wherever the vessel is.
    expect(told(sent, { actualArrival: TODAY }, minutes(NOW, 1))).toHaveLength(1);
    expect(told(form({ status: "submitted", submittedAt: null }))).toEqual([]);
  });

  it("names a link the customer has not filled in 3 days before the ETA", () => {
    expect(told(form({}), { estimatedArrival: day(3) })).toEqual([
      { rank: 37, text: "Import Instructions not filled in by the customer · arriving on Sat 21.11.", urgent: false, area: "details", kind: "import_instructions" },
    ]);
    // 3 working days: Monday the 23rd, the weekend before it too.
    expect(told(form({}), { estimatedArrival: day(5) }).map((s) => s.text)).toEqual(["Import Instructions not filled in by the customer · arriving on Mon 23.11."]);
    expect(told(form({}), { estimatedArrival: day(6) })).toEqual([]);
    expect(told(form({}), {})).toEqual([]);
    expect(told(form({}), { estimatedArrival: TODAY, actualArrival: TODAY })).toEqual([]);
  });

  it("says so when the link has run out meanwhile", () => {
    expect(told(form({ expiresAt: NOW }), { estimatedArrival: day(1) }).map((s) => s.text)).toEqual(["Import Instructions link ran out, not filled in · arriving tomorrow"]);
    expect(told(form({ expiresAt: minutes(NOW, 1) }), { estimatedArrival: day(1) }).map((s) => s.text)).toEqual(["Import Instructions not filled in by the customer · arriving tomorrow"]);
  });

  it("says nothing for a job with no live form", () => {
    expect(told(null, { estimatedArrival: TODAY })).toEqual([]);
  });
});

describe("A19: the warehouse's remeasurement", () => {
  const fact = (over: Partial<RemeasureFact>): RemeasureFact => ({ informed: null, acceptedAt: null, costsCheckedAt: null, ...over });
  const differs = (wall: string) => ({ at: at(wall), verdict: "differs" as const });
  const told = (f: RemeasureFact | null, over: Partial<ExtraJob> = {}, now = NOW) => remeasurementSignals(job(over), f, TODAY, now, NONE);

  it("is ATTENTION 24 hours after a remeasurement that differs and nobody accepted", () => {
    const f = fact({ informed: differs("2026-11-17 10:00") });
    expect(told(f)).toEqual([{ rank: 38, text: "Remeasurement differs, not accepted since 17.11. 10:00", urgent: false, area: "details", kind: "remeasurement" }]);
    expect(told(f, {}, minutes(NOW, -1))).toEqual([]);
  });

  it("is URGENT after 48 hours", () => {
    const f = fact({ informed: differs("2026-11-16 10:00") });
    expect(told(f)).toEqual([{ rank: 7, text: "Remeasurement differs, not accepted since 16.11. 10:00", urgent: true, area: "details", kind: "remeasurement" }]);
    expect(tags(told(f, {}, minutes(NOW, -1)))).toEqual([["Remeasurement differs, not accepted since 16.11. 10:00", false]]);
  });

  it("is ATTENTION after 4 office hours by air", () => {
    const f = fact({ informed: differs("2026-11-18 08:00") });
    const air = { freightMode: "Air Freight" };
    expect(told(f, air, at("2026-11-18 11:59"))).toEqual([]);
    expect(tags(told(f, air, at("2026-11-18 12:00")))).toEqual([["Remeasurement differs, not accepted since 18.11. 08:00", false]]);
    expect(told(f, {}, at("2026-11-18 12:00"))).toEqual([]);
    // Informed on Friday evening: by Saturday evening 24 hours have passed, office hours or not.
    expect(told(fact({ informed: differs("2026-11-13 18:00") }), air, at("2026-11-14 18:00"))).toHaveLength(1);
  });

  it("is URGENT by air as soon as the Closing - the ETD when no Closing - is a day away", () => {
    const f = fact({ informed: differs("2026-11-18 09:55") });
    const air = { freightMode: "Air Freight", tradeDirection: "Export" };
    expect(told(f, { ...air, closingDate: day(1) })).toEqual([
      { rank: 7, text: "Remeasurement differs, not accepted since 18.11. 09:55 · Closing tomorrow", urgent: true, area: "details", kind: "remeasurement" },
    ]);
    expect(tags(told(f, { ...air, estimatedDeparture: TODAY }))).toEqual([["Remeasurement differs, not accepted since 18.11. 09:55 · ETD today", true]]);
    expect(told(f, { ...air, closingDate: day(2) })).toEqual([]);
    // A Closing that has passed, or a flight that has left, hurries nothing any more.
    expect(told(f, { ...air, closingDate: day(-1) })).toEqual([]);
    expect(told(f, { ...air, closingDate: day(1), actualDeparture: TODAY })).toEqual([]);
    // Only by air.
    expect(told(f, { tradeDirection: "Export", closingDate: day(1) })).toEqual([]);
  });

  it("counts the day away in working days (Y5): on a Friday - and a Saturday - a Monday Closing is a day away", () => {
    const air = { freightMode: "Air Freight", tradeDirection: "Export", closingDate: "2026-11-23" };
    const onFriday = fact({ informed: differs("2026-11-20 09:55") });
    expect(tags(remeasurementSignals(job(air), onFriday, "2026-11-20", at("2026-11-20 10:00"), NONE))).toEqual([["Remeasurement differs, not accepted since 20.11. 09:55 · Closing on Mon 23.11.", true]]);
    const onSaturday = fact({ informed: differs("2026-11-21 09:55") });
    expect(tags(remeasurementSignals(job(air), onSaturday, "2026-11-21", at("2026-11-21 10:00"), NONE))).toEqual([["Remeasurement differs, not accepted since 21.11. 09:55 · Closing on Mon 23.11.", true]]);
    // Tuesday's Closing is two working days from a Friday: no hurry yet.
    expect(remeasurementSignals(job({ ...air, closingDate: "2026-11-24" }), onFriday, "2026-11-20", at("2026-11-20 10:00"), NONE)).toEqual([]);
  });

  it("is not hurried by a Closing or an ETD once an air job has arrived or was delivered, ATD typed or not", () => {
    const f = fact({ informed: differs("2026-11-18 09:55") });
    const airImport = { freightMode: "Air Freight", tradeDirection: "Import", estimatedDeparture: TODAY };
    expect(told(f, airImport)).toHaveLength(1);
    expect(told(f, { ...airImport, actualArrival: TODAY })).toEqual([]);
    expect(told(f, { ...airImport, closingDate: day(1), actualDeliveryDate: TODAY })).toEqual([]);
    // The wait itself still counts: after 4 office hours it is ATTENTION, with no departure named.
    expect(tags(told(fact({ informed: differs("2026-11-18 08:00") }), { ...airImport, actualArrival: TODAY }, at("2026-11-18 12:00")))).toEqual([["Remeasurement differs, not accepted since 18.11. 08:00", false]]);
  });

  it("ages the air office hours without the company's own days off", () => {
    const f = fact({ informed: differs("2026-11-18 14:00") });
    const air = { freightMode: "Air Freight" };
    // 3 office hours on the 18th, then the 19th: 4 are reached at 09:00 - unless the 19th is a day off.
    expect(remeasurementSignals(job(air), f, "2026-11-19", at("2026-11-19 09:00"), NONE)).toHaveLength(1);
    expect(remeasurementSignals(job(air), f, "2026-11-19", at("2026-11-19 09:00"), ["2026-11-19"])).toEqual([]);
  });

  it("says nothing when the figures match, are not known, or it was accepted since", () => {
    expect(told(fact({ informed: { at: at("2026-11-10 10:00"), verdict: "matches" } }))).toEqual([]);
    expect(told(fact({ informed: { at: at("2026-11-10 10:00"), verdict: "unknown" } }))).toEqual([]);
    expect(told(fact({ informed: differs("2026-11-10 10:00"), acceptedAt: at("2026-11-18 09:00"), costsCheckedAt: null }))).toEqual([]);
    expect(told(null)).toEqual([]);
    expect(told(fact({}))).toEqual([]);
  });

  describe("from Warehouse Concept (X4), whose lines Accept does not read", () => {
    const concept = (wall: string, matchesCargoDetails = false) => ({ at: at(wall), verdict: "differs" as const, source: "warehouseConcept" as const, matchesCargoDetails });

    it("is ATTENTION to check Cargo Details by hand after the same wait - never URGENT, however long", () => {
      expect(REMEASURED_IN_WAREHOUSE_CONCEPT).toBe("Remeasured in Warehouse Concept: check Cargo Details by hand");
      expect(told(fact({ informed: concept("2026-11-17 10:00") }))).toEqual([
        { rank: 38, text: "Remeasured in Warehouse Concept: check Cargo Details by hand · informed 17.11. 10:00", urgent: false, area: "details", kind: "remeasurement" },
      ]);
      expect(told(fact({ informed: concept("2026-11-17 10:00") }), {}, minutes(NOW, -1))).toEqual([]);
      // 48 hours on: still a warning.
      expect(tags(told(fact({ informed: concept("2026-11-14 10:00") })))).toEqual([["Remeasured in Warehouse Concept: check Cargo Details by hand · informed 14.11. 10:00", false]]);
      // By air with the Closing tomorrow: still a warning - nothing on Cargo Details can clear it but the figures.
      expect(tags(told(fact({ informed: concept("2026-11-16 09:00") }), { freightMode: "Air Freight", tradeDirection: "Export", closingDate: day(1) }))).toEqual([
        ["Remeasured in Warehouse Concept: check Cargo Details by hand · informed 16.11. 09:00", false],
      ]);
    });

    it("stops once Cargo Details match the informed figures, or 7 days after it was informed", () => {
      expect(REMEASURE_WAREHOUSE_CONCEPT_DAYS).toBe(7);
      expect(told(fact({ informed: concept("2026-11-16 10:00", true) }))).toEqual([]);
      expect(told(fact({ informed: concept("2026-11-11 10:01") }))).toHaveLength(1);
      expect(told(fact({ informed: concept("2026-11-11 10:00") }))).toEqual([]);
    });

    it("asks for Cargo Details to be read (conceptRemeasureOpen) only while it differs, is not accepted and is younger than a week", () => {
      expect(conceptRemeasureOpen(fact({ informed: concept("2026-11-16 10:00") }), NOW)).toBe(true);
      // Whatever Cargo Details say: that is what reading them tells.
      expect(conceptRemeasureOpen(fact({ informed: concept("2026-11-16 10:00", true) }), NOW)).toBe(true);
      expect(conceptRemeasureOpen(fact({ informed: concept("2026-11-11 10:01") }), NOW)).toBe(true);
      expect(conceptRemeasureOpen(fact({ informed: concept("2026-11-11 10:00") }), NOW)).toBe(false);
      expect(conceptRemeasureOpen(fact({ informed: concept("2026-11-16 10:00"), acceptedAt: at("2026-11-17 09:00") }), NOW)).toBe(false);
      expect(conceptRemeasureOpen(fact({ informed: { ...concept("2026-11-16 10:00"), verdict: "matches" } }), NOW)).toBe(false);
      expect(conceptRemeasureOpen(fact({ informed: differs("2026-11-16 10:00") }), NOW)).toBe(false);
      expect(conceptRemeasureOpen(fact({}), NOW)).toBe(false);
    });

    it("is the Warehouse's own rule for a line with no source - written before the source was kept", () => {
      expect(tags(told(fact({ informed: { ...differs("2026-11-16 10:00"), source: "warehouse" } })))).toEqual([["Remeasurement differs, not accepted since 16.11. 10:00", true]]);
      expect(tags(told(fact({ informed: differs("2026-11-16 10:00") })))).toEqual([["Remeasurement differs, not accepted since 16.11. 10:00", true]]);
    });
  });

  it("counts an acceptance only for the remeasurement it accepted: a later one that differs waits again", () => {
    const f = fact({ informed: differs("2026-11-16 10:00"), acceptedAt: at("2026-11-13 10:00"), costsCheckedAt: at("2026-11-13 11:00") });
    expect(tags(told(f))).toEqual([["Remeasurement differs, not accepted since 16.11. 10:00", true]]);
    // Accepted at the very moment it was informed counts as accepted.
    expect(told(fact({ informed: differs("2026-11-16 10:00"), acceptedAt: at("2026-11-16 10:00"), costsCheckedAt: at("2026-11-16 10:05") }))).toEqual([]);
  });

  it("names an accepted remeasurement whose costs nobody checked for longer than a working day", () => {
    const f = fact({ informed: differs("2026-11-13 10:00"), acceptedAt: at("2026-11-16 10:00") });
    expect(told(f)).toEqual([]);
    expect(told(f, {}, minutes(NOW, 1))).toEqual([{ rank: 39, text: "Remeasurement accepted 16.11., costs not checked", urgent: false, area: "finance", kind: "remeasurement" }]);
    expect(told({ ...f, costsCheckedAt: at("2026-11-16 10:00") }, {}, minutes(NOW, 1))).toEqual([]);
    // Checked before this acceptance: that was the one before.
    expect(told({ ...f, costsCheckedAt: at("2026-11-13 09:00") }, {}, minutes(NOW, 1))).toHaveLength(1);
    // Accepted without an Inform Operations on record: the costs are owed a look all the same.
    expect(told(fact({ acceptedAt: at("2026-11-12 10:00") }))).toHaveLength(1);
  });
});

describe("A25: Master Jobs", () => {
  const master = (over: Partial<MasterJobFact> = {}): MasterJobFact => ({ id: "m1", mczNumber: "MCZCONSOL00000012", closingDate: null, estimatedDeparture: null, actualDeparture: null, actualArrival: null, ...over });
  const inStep = { shippingInstructions: "Confirmed", bolDraft: "Approved", warehouseReceivedDate: day(-1) };
  /** An export house: the one kind this rule is about. */
  const house = (over: Partial<ExtraJob> = {}) => job({ tradeDirection: "Export", ...over });

  it("tags an export house out of step when its Master Job closes within 5 working days", () => {
    // Wednesday the 18th: the fifth working day on is Wednesday the 25th (Y5).
    expect(masterJobHouseSignals(house(), master({ closingDate: day(7) }), TODAY)).toEqual([
      { rank: 36, text: "Master Job MCZCONSOL00000012: Closing on Wed 25.11. · SI not confirmed, BoL draft not approved, cargo not received", urgent: false, area: "details", kind: "master_job" },
    ]);
    expect(masterJobHouseSignals(house(), master({ closingDate: TODAY }), TODAY).map((s) => s.text)).toEqual(["Master Job MCZCONSOL00000012: Closing today · SI not confirmed, BoL draft not approved, cargo not received"]);
    expect(masterJobHouseSignals(house(), master({ closingDate: day(8) }), TODAY)).toEqual([]);
    expect(masterJobHouseSignals(house(), master({ closingDate: day(-1) }), TODAY)).toEqual([]);
    // A company day off counts as none: with Monday the 23rd off, Wednesday the 25th is the fourth, Thursday the fifth.
    expect(masterJobHouseSignals(house(), master({ closingDate: day(8) }), TODAY, ["2026-11-23"])).toHaveLength(1);
  });

  it("names only what the house is behind with, and nothing for a house in step", () => {
    const m = master({ closingDate: day(1) });
    expect(masterJobHouseSignals(house(inStep), m, TODAY)).toEqual([]);
    expect(masterJobHouseSignals(house({ ...inStep, shippingInstructions: "Not Received" }), m, TODAY).map((s) => s.text)).toEqual(["Master Job MCZCONSOL00000012: Closing tomorrow · SI not confirmed"]);
    expect(masterJobHouseSignals(house({ ...inStep, bolDraft: "Waiting for approval" }), m, TODAY).map((s) => s.text)).toEqual(["Master Job MCZCONSOL00000012: Closing tomorrow · BoL draft not approved"]);
    expect(masterJobHouseSignals(house({ ...inStep, warehouseReceivedDate: null }), m, TODAY).map((s) => s.text)).toEqual(["Master Job MCZCONSOL00000012: Closing tomorrow · cargo not received"]);
    expect(masterJobHouseSignals(house({ ...inStep, shippingInstructions: null, bolDraft: null }), m, TODAY).map((s) => s.text)).toEqual(["Master Job MCZCONSOL00000012: Closing tomorrow · SI not confirmed, BoL draft not approved"]);
  });

  it("says nothing for an import house: SI, BoL draft and cargo received are an export's duties", () => {
    const m = master({ closingDate: day(1) });
    expect(masterJobHouseSignals(job({ tradeDirection: "Import" }), m, TODAY)).toEqual([]);
    expect(masterJobHouseSignals(job({ tradeDirection: "" }), m, TODAY)).toEqual([]);
    expect(masterJobHouseSignals(job({ tradeDirection: "Domestic" }), m, TODAY)).toEqual([]);
    expect(masterJobHouseSignals(job({ tradeDirection: " EXPORT " }), m, TODAY)).toHaveLength(1);
  });

  it("says nothing once the Master Job or the house has left, with no Closing, or with no Master Job read", () => {
    expect(masterJobHouseSignals(house(), master({ closingDate: day(1), actualDeparture: TODAY }), TODAY)).toEqual([]);
    expect(masterJobHouseSignals(house({ actualDeparture: TODAY }), master({ closingDate: day(1) }), TODAY)).toEqual([]);
    // Left is an ATD, or an ATA or a delivery where no ATD was typed.
    expect(masterJobHouseSignals(house(), master({ closingDate: day(1), actualArrival: TODAY }), TODAY)).toEqual([]);
    expect(masterJobHouseSignals(house({ actualArrival: TODAY }), master({ closingDate: day(1) }), TODAY)).toEqual([]);
    expect(masterJobHouseSignals(house({ actualDeliveryDate: TODAY }), master({ closingDate: day(1) }), TODAY)).toEqual([]);
    expect(masterJobHouseSignals(house(), master({ estimatedDeparture: day(1) }), TODAY)).toEqual([]);
    expect(masterJobHouseSignals(house(), null, TODAY)).toEqual([]);
  });

  it("makes a Master Job with no shipment linked a row of its own 10 working days before its ETD", () => {
    // Wednesday the 18th: the tenth working day on is Wednesday 2 Dec (Y5).
    expect(masterJobRowSignals(master({ estimatedDeparture: day(14) }), 0, TODAY)).toEqual([{ rank: 36, text: "No shipment linked · ETD on Wed 02.12.", urgent: false, area: "details", kind: "master_job" }]);
    expect(masterJobRowSignals(master({ estimatedDeparture: day(10) }), 0, TODAY).map((s) => s.text)).toEqual(["No shipment linked · ETD on Sat 28.11."]);
    expect(masterJobRowSignals(master({ estimatedDeparture: TODAY }), 0, TODAY).map((s) => s.text)).toEqual(["No shipment linked · ETD today"]);
    expect(masterJobRowSignals(master({ estimatedDeparture: day(15) }), 0, TODAY)).toEqual([]);
    expect(masterJobRowSignals(master({ estimatedDeparture: day(-1) }), 0, TODAY)).toEqual([]);
    expect(masterJobRowSignals(master({ estimatedDeparture: day(15) }), 0, TODAY, ["2026-11-30"])).toHaveLength(1);
  });

  it("reads the Master Jobs as far ahead as the rule speaks of: the tenth working day", () => {
    expect(masterJobWindowEnd(TODAY, NONE)).toBe("2026-12-02");
    expect(masterJobWindowEnd(TODAY, ["2026-11-30"])).toBe("2026-12-03");
    // Every ETD up to it is a row; the day after is not.
    const end = masterJobWindowEnd(TODAY, NONE);
    expect(masterJobRowSignals(master({ estimatedDeparture: end }), 0, TODAY)).toHaveLength(1);
    expect(masterJobRowSignals(master({ estimatedDeparture: addDays(end, 1) }), 0, TODAY)).toEqual([]);
  });

  it("says nothing for one that has a shipment, has departed, or has no ETD - as before", () => {
    expect(masterJobRowSignals(master({ estimatedDeparture: day(2) }), 1, TODAY)).toEqual([]);
    expect(masterJobRowSignals(master({ estimatedDeparture: day(2), actualDeparture: TODAY }), 0, TODAY)).toEqual([]);
    expect(masterJobRowSignals(master(), 0, TODAY)).toEqual([]);
  });
});

describe("ranks", () => {
  it("keeps the urgent ones between 3 and 9 and the others after step 1's last flag (27), no two alike", () => {
    const urgent = [EXTRA_RANK.paperworkUrgent, EXTRA_RANK.originalBl, EXTRA_RANK.deliveryOrderUrgent, EXTRA_RANK.dangerousUrgent, EXTRA_RANK.request, EXTRA_RANK.remeasureUrgent];
    for (const rank of urgent) expect(rank >= 3 && rank <= 9).toBe(true);
    const attention = Object.values(EXTRA_RANK).filter((rank) => !urgent.includes(rank as (typeof urgent)[number]));
    for (const rank of attention) expect(rank).toBeGreaterThanOrEqual(28);
    expect(new Set(Object.values(EXTRA_RANK)).size).toBe(Object.values(EXTRA_RANK).length);
    // Customs and paperwork first, a request after the cut-offs (step 1: filings 4, Closing 5).
    expect(EXTRA_RANK.paperworkUrgent).toBeLessThan(EXTRA_RANK.originalBl);
    expect(EXTRA_RANK.request).toBeGreaterThan(5);
    // Step 6: the delivery order after the original B/L and before the Closing; its ATTENTION with the paperwork of an arrival.
    expect(EXTRA_RANK.deliveryOrderUrgent).toBeGreaterThan(EXTRA_RANK.originalBl);
    expect(EXTRA_RANK.deliveryOrderUrgent).toBeLessThan(EXTRA_RANK.dangerousUrgent);
    expect(EXTRA_RANK.deliveryOrder).toBeGreaterThan(EXTRA_RANK.paperworkAhead);
    expect(EXTRA_RANK.deliveryOrder).toBeLessThan(EXTRA_RANK.declinedNotReplaced);
  });
});
