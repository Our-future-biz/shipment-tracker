import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const warehouseConcept = vi.hoisted(() => ({ _internalWarehouseOperationsFacts: vi.fn() }));
const trucking = vi.hoisted(() => ({ _internalTruckingOperationsFacts: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({ warehouseConcept, trucking }));

import { HANDOVER_CALL_TIMEOUT_MS, HANDOVER_FACTS_KEPT_MINUTES } from "../../lib/cockpitThresholds";
import { forgetHandoverFacts, handoverFacts } from "../../services/managersCockpitHandover.service";

// The calls of step 5 to the warehouse and Trucking, against stand-ins for the two modules: one
// call each per answer, what the facts say when a module fails, and how long an answer is kept.
// The rules are tests/managersCockpitHandover.test.ts.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const OTHER = "0b8f8a8e-7a2c-4d8e-9a8e-2f1e6c0d9b11";
// Wednesday 18 Nov 2026, 11:00 in Prague.
const NOW = new Date("2026-11-18T10:00:00Z");
const later = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const IDS = ["id-1", "id-2"];

const WAREHOUSE = {
  shipments: [
    { shipmentId: "id-1", records: [{ id: "r1", ref: "WCZ00012", lifecycle: "Expected", signals: [{ text: "Not arrived: expected 16.11.2026", urgent: true }] }], updatesWaiting: 1, updatesFailed: 0 },
    { shipmentId: "id-2", records: [], updatesWaiting: 0, updatesFailed: 0 },
  ],
  notKnown: [],
};
const TRUCKING = { shipments: [{ shipmentId: "id-2", consignments: [], updatesWaiting: 0, updatesFailed: 2 }], notKnown: [], issuesRead: true, updatesRead: true };
const ask = (now = NOW, ids = IDS, companyId = COMPANY) => handoverFacts(ids, { companyId, now });
/** Lets the answers' bookkeeping (kept, or forgotten once they failed) run. */
const settle = () => new Promise((done) => setTimeout(done, 0));

beforeEach(() => {
  vi.clearAllMocks();
  forgetHandoverFacts();
  warehouseConcept._internalWarehouseOperationsFacts.mockResolvedValue(WAREHOUSE);
  trucking._internalTruckingOperationsFacts.mockResolvedValue(TRUCKING);
});

describe("the calls to the warehouse and Trucking", () => {
  it("asks each module once, about every job, and hands on what they said", async () => {
    const facts = await ask();
    expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledTimes(1);
    expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledWith({ shipmentIds: IDS });
    expect(trucking._internalTruckingOperationsFacts).toHaveBeenCalledWith({ shipmentIds: IDS });
    expect(facts.warehouse!.byJob.get("id-1")!.records[0]!.ref).toBe("WCZ00012");
    expect([...facts.trucking!.byJob.keys()]).toEqual(["id-2"]);
    expect(facts).toMatchObject({ warehouse: { whole: true }, trucking: { whole: true }, notKnown: [] });
  });

  it("asks nothing about no jobs: both are read, and say nothing", async () => {
    const facts = await ask(NOW, []);
    expect(warehouseConcept._internalWarehouseOperationsFacts).not.toHaveBeenCalled();
    expect(trucking._internalTruckingOperationsFacts).not.toHaveBeenCalled();
    expect(facts).toMatchObject({ warehouse: { whole: true }, trucking: { whole: true }, notKnown: [] });
  });

  describe("a module that gives no answer in time", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());
    /** A call that answers only when `answer` is called. */
    const hanging = () => {
      let answer!: (value: typeof WAREHOUSE) => void;
      warehouseConcept._internalWarehouseOperationsFacts.mockReturnValue(new Promise((done) => (answer = done)));
      return (value = WAREHOUSE) => answer(value);
    };

    it(`is waited for ${HANDOVER_CALL_TIMEOUT_MS / 1000} s, then not read and named - the other still answers`, async () => {
      hanging();
      const facts = ask();
      await vi.advanceTimersByTimeAsync(HANDOVER_CALL_TIMEOUT_MS - 1);
      let done = false;
      void facts.then(() => (done = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await facts).toMatchObject({ warehouse: null, trucking: { whole: true }, notKnown: ["the warehouse's records (no answer within 6 s)"] });
    });

    it("is not kept as not read: its call goes on, and an answer that comes whole after all serves the next poll", async () => {
      const answer = hanging();
      const first = ask();
      await vi.advanceTimersByTimeAsync(HANDOVER_CALL_TIMEOUT_MS);
      expect((await first).warehouse).toBeNull();
      answer();
      await vi.advanceTimersByTimeAsync(0);
      const next = await ask(later(60));
      expect(next).toMatchObject({ warehouse: { whole: true }, notKnown: [] });
      expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledTimes(1);
    });

    it("an answer that came late and failed is not kept: the next poll calls again", async () => {
      let fail!: (err: Error) => void;
      warehouseConcept._internalWarehouseOperationsFacts.mockReturnValueOnce(new Promise((_, no) => (fail = no)));
      const first = ask();
      await vi.advanceTimersByTimeAsync(HANDOVER_CALL_TIMEOUT_MS);
      expect((await first).notKnown).toEqual(["the warehouse's records (no answer within 6 s)"]);
      fail(new Error("down"));
      await vi.advanceTimersByTimeAsync(0);
      expect((await ask(later(60))).warehouse).toMatchObject({ whole: true });
      expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledTimes(2);
    });
  });

  describe("a module that does not answer", () => {
    it("is null in the facts and named; the other still answers", async () => {
      warehouseConcept._internalWarehouseOperationsFacts.mockRejectedValue(new Error("the warehouse is down"));
      const facts = await ask();
      expect(facts.warehouse).toBeNull();
      expect(facts.trucking).toMatchObject({ whole: true });
      expect(facts.notKnown).toEqual(["the warehouse's records"]);

      forgetHandoverFacts();
      warehouseConcept._internalWarehouseOperationsFacts.mockResolvedValue(WAREHOUSE);
      trucking._internalTruckingOperationsFacts.mockRejectedValue(new Error("Trucking is down"));
      const road = await ask();
      expect(road).toMatchObject({ warehouse: { whole: true }, trucking: null, notKnown: ["Trucking's consignments"] });
    });

    it("both failing: neither, and both named", async () => {
      warehouseConcept._internalWarehouseOperationsFacts.mockRejectedValue(new Error("down"));
      trucking._internalTruckingOperationsFacts.mockRejectedValue(new Error("down"));
      expect(await ask()).toEqual({ warehouse: null, trucking: null, notKnown: ["the warehouse's records", "Trucking's consignments"] });
    });

    it("passes on the parts a module could not read, with its name in front", async () => {
      warehouseConcept._internalWarehouseOperationsFacts.mockResolvedValue({ ...WAREHOUSE, notKnown: ["the warehouse's updates to the shipments"] });
      trucking._internalTruckingOperationsFacts.mockResolvedValue({ ...TRUCKING, notKnown: ["Trucking's delivery exceptions"] });
      expect((await ask()).notKnown).toEqual(["Warehouse: the warehouse's updates to the shipments", "Trucking: Trucking's delivery exceptions"]);
    });
  });

  describe("kept per company", () => {
    it(`answers from memory for ${HANDOVER_FACTS_KEPT_MINUTES} minutes, then calls again`, async () => {
      await ask();
      await settle();
      await ask(later(60));
      await ask(later(HANDOVER_FACTS_KEPT_MINUTES * 60 - 1));
      expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledTimes(1);
      expect(trucking._internalTruckingOperationsFacts).toHaveBeenCalledTimes(1);
      await ask(later(HANDOVER_FACTS_KEPT_MINUTES * 60));
      expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledTimes(2);
      expect(trucking._internalTruckingOperationsFacts).toHaveBeenCalledTimes(2);
    });

    it("is the company's: another company is asked about by itself", async () => {
      await ask();
      await ask(NOW, IDS, OTHER);
      expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledTimes(2);
    });

    it("serves fewer jobs from what was asked about more; a job not asked about yet calls again", async () => {
      await ask();
      await settle();
      await ask(later(30), ["id-2"]);
      expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledTimes(1);
      await ask(later(40), ["id-1", "id-2", "id-3"]);
      expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledTimes(2);
      expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenLastCalledWith({ shipmentIds: ["id-1", "id-2", "id-3"] });
    });

    it("shares one call between two asks at the same moment", async () => {
      let answer!: (value: typeof WAREHOUSE) => void;
      warehouseConcept._internalWarehouseOperationsFacts.mockReturnValue(new Promise((done) => (answer = done)));
      const first = ask();
      const second = ask(later(1));
      answer(WAREHOUSE);
      const [a, b] = await Promise.all([first, second]);
      expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledTimes(1);
      expect(trucking._internalTruckingOperationsFacts).toHaveBeenCalledTimes(1);
      expect(b.warehouse!.byJob.get("id-1")).toEqual(a.warehouse!.byJob.get("id-1"));
    });

    it("keeps no answer that failed: the next ask calls again - the module that answered stays kept", async () => {
      warehouseConcept._internalWarehouseOperationsFacts.mockRejectedValueOnce(new Error("down"));
      expect((await ask()).warehouse).toBeNull();
      await settle();
      const again = await ask(later(10));
      expect(again.warehouse).toMatchObject({ whole: true });
      expect(again.notKnown).toEqual([]);
      expect(warehouseConcept._internalWarehouseOperationsFacts).toHaveBeenCalledTimes(2);
      expect(trucking._internalTruckingOperationsFacts).toHaveBeenCalledTimes(1);
    });

    it("keeps no answer that names a part it could not read", async () => {
      trucking._internalTruckingOperationsFacts.mockResolvedValueOnce({ ...TRUCKING, notKnown: ["Trucking's trips (haulier and pick-up issues)"] });
      expect((await ask()).trucking).toMatchObject({ whole: false });
      await settle();
      expect((await ask(later(10))).trucking).toMatchObject({ whole: true });
      expect(trucking._internalTruckingOperationsFacts).toHaveBeenCalledTimes(2);
    });
  });
});
