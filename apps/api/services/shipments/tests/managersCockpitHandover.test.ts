import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { TruckingIssue, TruckingOperationsFacts, TruckingShipmentFacts } from "../../trucking/interfaces/interfaces";
import type { WarehouseOperationsFacts, WarehouseShipmentFacts } from "../../warehouseConcept/interfaces/interfaces";
import { OPS_RANK, opsDay, warehouseSignals, type OpsCockpitJob, type OpsSignal } from "../lib/managersCockpit";
import {
  HANDOVER_NOT_KNOWN,
  HANDOVER_RANK,
  NO_HANDOVER_FACTS,
  WAREHOUSE_SAME_MEANING,
  handoverFactsOf,
  handoverLine,
  handoverSignals,
  saidByTheJob,
  stepTwoWarehouseTagStays,
  truckingSpeaksForRoad,
  truckingTags,
  warehouseTags,
} from "../lib/managersCockpitHandover";

// The warehouse's and Trucking's own word on the cockpit's jobs (step 5): their tags, ranks, the
// tags of step 2 they replace, and the hand-over line. How the cockpit puts them on its cards is
// tests/managersCockpit.test.ts ("the warehouse and Trucking"); the calls,
// tests/services/managersCockpitHandover.service.test.ts.

const show = (signals: readonly OpsSignal[]) => signals.map((s) => `${s.urgent ? "URGENT" : "attention"} ${s.rank} ${s.kind} ${s.area} · ${s.text}`);

const warehouseJob = (shipmentId: string, records: WarehouseShipmentFacts["records"] = [], over: Partial<WarehouseShipmentFacts> = {}): WarehouseShipmentFacts => ({
  shipmentId,
  records,
  updatesWaiting: 0,
  updatesFailed: 0,
  ...over,
});
const record = (ref: string, signals: { text: string; urgent: boolean }[]) => ({ id: `r-${ref}`, ref, lifecycle: "In warehouse", signals });
const truckingJob = (shipmentId: string, consignments: TruckingShipmentFacts["consignments"] = [], over: Partial<TruckingShipmentFacts> = {}): TruckingShipmentFacts => ({
  shipmentId,
  consignments,
  updatesWaiting: 0,
  updatesFailed: 0,
  ...over,
});
const issue = (text: string, urgent: boolean, kind: TruckingIssue["kind"] = "not_picked_up"): TruckingIssue => ({ kind, text, urgent, since: null });
const consignment = (ref: string, issues: TruckingIssue[]) => ({ id: `c-${ref}`, ref, status: "Ordered", pickupDate: "2026-11-17", deliveryDate: null, issues });
const answer = (shipments: WarehouseShipmentFacts[], notKnown: string[] = []): WarehouseOperationsFacts => ({ shipments, notKnown });
/** Trucking's answer: it read everything unless `read` says otherwise. */
const truckingAnswer = (shipments: TruckingShipmentFacts[], notKnown: string[] = [], read: Partial<Pick<TruckingOperationsFacts, "issuesRead" | "updatesRead">> = {}): TruckingOperationsFacts => ({
  shipments,
  notKnown,
  issuesRead: true,
  updatesRead: true,
  ...read,
});
/** Both modules answered whole: the warehouse with `w`, Trucking with `t`. */
const read = (w: WarehouseShipmentFacts[] = [], t: TruckingShipmentFacts[] = []) => handoverFactsOf(answer(w), truckingAnswer(t));

describe("what was read", () => {
  it("is by job, and whole when the module named nothing it could not read", () => {
    const facts = read([warehouseJob("id-1")], [truckingJob("id-2")]);
    expect([...facts.warehouse!.byJob.keys()]).toEqual(["id-1"]);
    expect([...facts.trucking!.byJob.keys()]).toEqual(["id-2"]);
    expect(facts).toMatchObject({ warehouse: { whole: true }, trucking: { whole: true }, notKnown: [] });
  });

  it("names a module that could not be asked as a whole, and is null for it", () => {
    expect(handoverFactsOf(null, truckingAnswer([]))).toEqual({ warehouse: null, trucking: { byJob: new Map(), whole: true, issuesRead: true, updatesRead: true }, notKnown: ["the warehouse's records"] });
    expect(handoverFactsOf(answer([]), null).notKnown).toEqual(["Trucking's consignments"]);
    expect(handoverFactsOf(null, null)).toMatchObject({ warehouse: null, trucking: null, notKnown: [HANDOVER_NOT_KNOWN.warehouse, HANDOVER_NOT_KNOWN.trucking] });
  });

  it("names a module that gave no answer in time with the time it was given, and is null for it", () => {
    expect(handoverFactsOf("late", "late")).toEqual({ warehouse: null, trucking: null, notKnown: ["the warehouse's records (no answer within 6 s)", "Trucking's consignments (no answer within 6 s)"] });
    expect(handoverFactsOf("late", null).notKnown).toEqual(["the warehouse's records (no answer within 6 s)", "Trucking's consignments"]);
  });

  it("passes on what a module could not read with its name in front, once each - and is then not whole", () => {
    const facts = handoverFactsOf(answer([], ["the warehouse's records", "the warehouse's records"]), truckingAnswer([], ["Trucking's trips (haulier and pick-up issues)"], { issuesRead: false }));
    expect(facts.notKnown).toEqual(["Warehouse: the warehouse's records", "Trucking: Trucking's trips (haulier and pick-up issues)"]);
    expect(facts).toMatchObject({ warehouse: { whole: false }, trucking: { whole: false, issuesRead: false, updatesRead: true } });
  });

  it("takes Trucking's issuesRead and updatesRead as they come - one it does not send counts as not read", () => {
    expect(read().trucking).toMatchObject({ issuesRead: true, updatesRead: true });
    expect(handoverFactsOf(answer([]), truckingAnswer([], [], { issuesRead: false, updatesRead: false })).trucking).toMatchObject({ issuesRead: false, updatesRead: false });
    const older = { shipments: [], notKnown: [] } as unknown as TruckingOperationsFacts;
    expect(handoverFactsOf(answer([]), older).trucking).toMatchObject({ issuesRead: false, updatesRead: false });
  });
});

describe("the tags", () => {
  it("are the warehouse's signals in its own words, with the record in front: urgent as it says, of the family warehouse, worked on in Tracking", () => {
    const tags = warehouseTags(
      warehouseJob("id-1", [
        record("WCZ00012", [
          { text: "Pick-up PIN: locked 23.10. 09:12", urgent: true },
          { text: "MRN missing", urgent: false },
        ]),
        record("MSKU1234567", [{ text: "Closed 17.11. 08:00, no gate-out", urgent: false }]),
      ]),
    );
    expect(show(tags)).toEqual([
      "URGENT 61 warehouse tracking · Warehouse · WCZ00012: Pick-up PIN: locked 23.10. 09:12",
      "attention 251 warehouse tracking · Warehouse · WCZ00012: MRN missing",
      "attention 251 warehouse tracking · Warehouse · MSKU1234567: Closed 17.11. 08:00, no gate-out",
    ]);
  });

  it("are Trucking's issues in its own words, with the consignment in front: urgent as it says, of the family road", () => {
    const tags = truckingTags(
      truckingJob("id-1", [
        consignment("TCZ00031", [issue("Ordered, not confirmed: pick-up today", true, "haulier_not_confirmed")]),
        consignment("TCZ00032", [issue("Delivered 3 working days ago — POD missing", false, "pod_missing"), issue("Damage: not decided", false, "exception_open")]),
      ]),
    );
    expect(show(tags)).toEqual([
      "URGENT 62 road tracking · Trucking · TCZ00031: Ordered, not confirmed: pick-up today",
      "attention 252 road tracking · Trucking · TCZ00032: Delivered 3 working days ago — POD missing",
      "attention 252 road tracking · Trucking · TCZ00032: Damage: not decided",
    ]);
  });

  it("are none for a job a module has nothing of, and none of a module that was not read", () => {
    expect(warehouseTags(undefined)).toEqual([]);
    expect(truckingTags(undefined)).toEqual([]);
    expect(warehouseTags(warehouseJob("id-1", [record("WCZ00012", [])]))).toEqual([]);
    const facts = read([warehouseJob("id-1", [record("WCZ00012", [{ text: "Refused", urgent: true }])])], [truckingJob("id-1", [consignment("TCZ00031", [issue("Failed delivery: Nobody there", true, "failed_delivery")])])]);
    expect(handoverSignals("id-1", facts).map((s) => s.text)).toEqual(["Warehouse · WCZ00012: Refused", "Trucking · TCZ00031: Failed delivery: Nobody there"]);
    expect(handoverSignals("id-2", facts)).toEqual([]);
    expect(handoverSignals("id-1", { ...facts, warehouse: null, trucking: null })).toEqual([]);
    expect(handoverSignals("id-1", NO_HANDOVER_FACTS)).toEqual([]);
  });
});

describe("the ranks", () => {
  it("URGENT after step 2's delivery and road ones and before free time; ATTENTION after step 2's delivery, warehouse and road warnings", () => {
    const stepTwoUrgent = [OPS_RANK.deliveryPassed, OPS_RANK.warehousePassed, OPS_RANK.haulierToday, OPS_RANK.pickupPassed, OPS_RANK.podUrgent];
    for (const rank of [HANDOVER_RANK.warehouseUrgent, HANDOVER_RANK.truckingUrgent]) {
      expect(rank).toBeGreaterThan(Math.max(...stepTwoUrgent));
      // Free time is Needs Attention's urgent flag, ranked 80 (lib/managersCockpit URGENT_FLAG_RANK).
      expect(rank).toBeLessThan(80);
    }
    const stepTwoAttention = [OPS_RANK.deliveryNoPlate, OPS_RANK.haulierTomorrow, OPS_RANK.warehouseIdle, OPS_RANK.pod];
    for (const rank of [HANDOVER_RANK.warehouse, HANDOVER_RANK.trucking]) expect(rank).toBeGreaterThan(Math.max(...stepTwoAttention));
  });
});

describe("no two tags of one meaning", () => {
  describe("the road", () => {
    const inPlay = truckingJob("id-1", [consignment("TCZ00031", [])]);

    it("is Trucking's on a job it answered about - a consignment in play there - when it read its issues", () => {
      expect(truckingSpeaksForRoad("id-1", read([], [inPlay]))).toBe(true);
      // Its holidays not read leave its issues whole.
      expect(truckingSpeaksForRoad("id-1", handoverFactsOf(answer([]), truckingAnswer([inPlay], ["the company's holidays (POD missing counted on public holidays only)"])))).toBe(true);
      // The warehouse has no say in it.
      expect(truckingSpeaksForRoad("id-1", handoverFactsOf(null, truckingAnswer([inPlay])))).toBe(true);
    });

    it("stays step 2's on a job Trucking has nothing of, or lists for its updates only: Trucking cannot judge its truck", () => {
      expect(truckingSpeaksForRoad("id-2", read([], [inPlay]))).toBe(false);
      expect(truckingSpeaksForRoad("id-1", read())).toBe(false);
      expect(truckingSpeaksForRoad("id-1", read([], [truckingJob("id-1", [], { updatesWaiting: 2 })]))).toBe(false);
    });

    it("stays step 2's when Trucking could not be read, did not answer in time, or could not read its issues: the fallback", () => {
      expect(truckingSpeaksForRoad("id-1", handoverFactsOf(answer([]), null))).toBe(false);
      expect(truckingSpeaksForRoad("id-1", handoverFactsOf(answer([]), "late"))).toBe(false);
      expect(truckingSpeaksForRoad("id-1", handoverFactsOf(answer([]), truckingAnswer([inPlay], ["Trucking's trips (haulier and pick-up issues)"], { issuesRead: false })))).toBe(false);
      expect(truckingSpeaksForRoad("id-1", NO_HANDOVER_FACTS)).toBe(false);
    });
  });

  describe("a warehouse signal the job says already", () => {
    const DETENTION = ["Detention expires in 2 days (20.11.2026) — book the empty return", "Detention expires today (18.11.2026) — book the empty return", "Detention expired 1 day ago (17.11.2026) — book the empty return"];
    const STUFFING_CLOSING = ["Stuffing: 2 houses not stuffed · closing in 1 day (19.11.2026)", "Stuffing: 1 house not stuffed · closing today (18.11.2026)", "Stuffing: 1 house not stuffed · 2 days past the closing (16.11.2026)"];
    const STUFFING_ETD = "Stuffing: 1 house not stuffed · ETD in 1 day (19.11.2026)";
    const NOTHING = { freeTimeClock: false, closing: false };

    it("is a box's detention beside the job's free time clock", () => {
      for (const text of DETENTION) {
        expect(saidByTheJob(text, { ...NOTHING, freeTimeClock: true })).toBe(true);
        expect(saidByTheJob(text, NOTHING)).toBe(false);
        expect(saidByTheJob(text, { ...NOTHING, closing: true })).toBe(false);
      }
    });

    it("is stuffing against a closing beside the job's Closing - not against the ETD", () => {
      for (const text of STUFFING_CLOSING) {
        expect(saidByTheJob(text, { ...NOTHING, closing: true })).toBe(true);
        expect(saidByTheJob(text, { ...NOTHING, freeTimeClock: true })).toBe(false);
      }
      expect(saidByTheJob(STUFFING_ETD, { freeTimeClock: true, closing: true })).toBe(false);
    });

    it("gives no tag of what is said already; the record's other signals stay", () => {
      const facts = read([warehouseJob("id-1", [record("MSKU1234567", [DETENTION[0]!, STUFFING_CLOSING[0]!, STUFFING_ETD, "Over capacity: 104 % cbm"].map((text) => ({ text, urgent: false })))])]);
      expect(handoverSignals("id-1", facts, { freeTimeClock: true, closing: true }).map((s) => s.text)).toEqual([`Warehouse · MSKU1234567: ${STUFFING_ETD}`, "Warehouse · MSKU1234567: Over capacity: 104 % cbm"]);
      expect(handoverSignals("id-1", facts)).toHaveLength(4);
    });

    it("matches the words the Warehouse cockpit still writes", () => {
      const source = readFileSync(new URL("../../warehouseConcept/services/managersCockpit.ts", import.meta.url), "utf8");
      for (const words of ['`expired ${plural(-d, "day")} ago`', '"expires today"', '`expires in ${plural(d, "day")}`', "`Detention ${when} (", 'const what = closing ? "closing" : "ETD";', "`Stuffing: ${plural(houses.length, \"house\")} not stuffed · ${when} ("]) {
        expect(source).toContain(words);
      }
    });
  });

  describe("the warehouse", () => {
    const NOT_RECEIVED = "ETA warehouse 16.11. passed, not received";
    const NO_ONWARD = "In our warehouse since 12.11., no planned delivery";
    const saying = (...texts: string[]) => read([warehouseJob("id-1", [record("WCZ00012", texts.map((text) => ({ text, urgent: true })))])]);
    const stays = (text: string, facts: ReturnType<typeof read>, jobId = "id-1") => stepTwoWarehouseTagStays({ text }, jobId, facts);

    it("drops step 2's \"not received\" for a record the warehouse calls not arrived - or arrived and not received", () => {
      for (const said of ["Not arrived: expected 16.11.2026", "Not arrived: dock slot D2 16.11. 08:00–09:00 passed", "Not arrived: trip TRP0012 due 17.11. 10:00", "Arrived 17.11. 08:10, not received (26 h)", "Arrived 17.11. 08:10, not received (5 h) · waiting for re-weigh"]) {
        expect(stays(NOT_RECEIVED, saying(said))).toBe(false);
      }
    });

    it("drops step 2's \"no planned delivery\" for a record the warehouse calls ready with no pick-up booked", () => {
      expect(stays(NO_ONWARD, saying("Ready for release, no pick-up booked · 1 free day left"))).toBe(false);
      expect(stays(NO_ONWARD, saying("Ready for release, no pick-up booked · free time over"))).toBe(false);
    });

    it("keeps them when the warehouse says something else, says it of another job, has no record, or was not read", () => {
      expect(stays(NOT_RECEIVED, saying("Ready for release, no pick-up booked · 1 free day left"))).toBe(true);
      expect(stays(NO_ONWARD, saying("Not arrived: expected 16.11.2026", "MRN missing", "On hold (1) since 17.11. 09:00"))).toBe(true);
      expect(stays(NOT_RECEIVED, saying("Not arrived: expected 16.11.2026"), "id-2")).toBe(true);
      expect(stays(NOT_RECEIVED, read([warehouseJob("id-1")]))).toBe(true);
      expect(stays(NOT_RECEIVED, handoverFactsOf(null, truckingAnswer([])))).toBe(true);
      expect(stays(NOT_RECEIVED, NO_HANDOVER_FACTS)).toBe(true);
    });

    it("leaves every other tag alone", () => {
      expect(stays("Planned delivery 16.11. passed, not delivered", saying("Not arrived: expected 16.11.2026"))).toBe(true);
    });

    it("matches step 2's own words as lib/managersCockpit writes them", () => {
      const job = (over: Partial<OpsCockpitJob>) => ({ tradeDirection: "Import", etaWarehouse: null, warehouseReceivedDate: null, warehouseReleasedDate: null, plannedDeliveryDate: null, actualDeliveryDate: null, actualDeparture: null, actualArrival: null, ...over });
      const day = opsDay(new Date("2026-11-18T10:00:00Z"));
      const [notReceived] = warehouseSignals(job({ etaWarehouse: "2026-11-16" }), day);
      const [noOnward] = warehouseSignals(job({ warehouseReceivedDate: "2026-11-12" }), day);
      expect(notReceived!.text).toMatch(WAREHOUSE_SAME_MEANING.notReceived.step2);
      expect(noOnward!.text).toMatch(WAREHOUSE_SAME_MEANING.noOnward.step2);
    });

    // The warehouse's words are its own (warehouseConcept/services/managersCockpit.ts recordSignals):
    // should they change there, this says so before the cockpits show the same thing twice.
    it("matches the words the Warehouse cockpit still writes", () => {
      const source = readFileSync(new URL("../../warehouseConcept/services/managersCockpit.ts", import.meta.url), "utf8");
      for (const words of ["return `Not arrived: dock slot ", "return `Not arrived: trip ", "`Not arrived: expected ", "`Arrived ${stampText(m.gateIn)}, not received (", "`Ready for release, no pick-up booked · "]) {
        expect(source).toContain(words);
      }
    });
  });
});

describe("the hand-over line", () => {
  const facts = read(
    [warehouseJob("id-1", [], { updatesWaiting: 2, updatesFailed: 1 }), warehouseJob("id-2", [], { updatesWaiting: 1 }), warehouseJob("id-3", [], { updatesFailed: 4 })],
    [truckingJob("id-2", [], { updatesWaiting: 3, updatesFailed: 1 })],
  );

  it("adds up what each module owes the page's jobs only - a job Trucking left out owes nothing", () => {
    expect(handoverLine(facts, ["id-1", "id-2"])).toEqual({ warehouseUpdatesWaiting: 3, warehouseUpdatesFailed: 1, truckingUpdatesWaiting: 3, truckingUpdatesFailed: 1 });
    expect(handoverLine(facts, ["id-1"])).toEqual({ warehouseUpdatesWaiting: 2, warehouseUpdatesFailed: 1, truckingUpdatesWaiting: 0, truckingUpdatesFailed: 0 });
    expect(handoverLine(facts, [])).toEqual({ warehouseUpdatesWaiting: 0, warehouseUpdatesFailed: 0, truckingUpdatesWaiting: 0, truckingUpdatesFailed: 0 });
  });

  it("is null for Trucking - not 0 - when it could not read its updates: a job it left out is not known then either", () => {
    const unread = handoverFactsOf(answer([warehouseJob("id-1")]), truckingAnswer([truckingJob("id-2", [], { updatesWaiting: null, updatesFailed: null })], ["Trucking's updates to the jobs"], { updatesRead: false }));
    expect(handoverLine(unread, ["id-1", "id-2"])).toEqual({ warehouseUpdatesWaiting: 0, warehouseUpdatesFailed: 0, truckingUpdatesWaiting: null, truckingUpdatesFailed: null });
    expect(handoverLine(unread, ["id-1"])).toEqual({ warehouseUpdatesWaiting: 0, warehouseUpdatesFailed: 0, truckingUpdatesWaiting: null, truckingUpdatesFailed: null });
  });

  it("is null - not 0 - for a module that was not read, or that could not read its updates", () => {
    expect(handoverLine(handoverFactsOf(null, truckingAnswer([])), ["id-1"])).toEqual({ warehouseUpdatesWaiting: null, warehouseUpdatesFailed: null, truckingUpdatesWaiting: 0, truckingUpdatesFailed: 0 });
    expect(handoverLine(NO_HANDOVER_FACTS, ["id-1"])).toEqual({ warehouseUpdatesWaiting: null, warehouseUpdatesFailed: null, truckingUpdatesWaiting: null, truckingUpdatesFailed: null });
    const unread = read([warehouseJob("id-1", [], { updatesWaiting: null, updatesFailed: null })], [truckingJob("id-1", [], { updatesWaiting: null, updatesFailed: null })]);
    expect(handoverLine(unread, ["id-1"])).toEqual({ warehouseUpdatesWaiting: null, warehouseUpdatesFailed: null, truckingUpdatesWaiting: null, truckingUpdatesFailed: null });
  });
});
