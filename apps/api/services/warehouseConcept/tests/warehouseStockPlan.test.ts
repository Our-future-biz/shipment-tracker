import { describe, expect, it } from "vitest";
import { planStockSync, type StockSyncState } from "../services/warehouseStockPlan";
import type { BondedEntryRecord, StockLineRecord, StockSyncMovement } from "../repositories/warehouseStock.repository";
import type { HouseCtx } from "../services/houses";

// Pure: no database. Runs with the warehouse tests (WAREHOUSE_DB_TESTS=1).

const T0 = new Date("2026-10-01T08:00:00Z");
const T1 = new Date("2026-10-05T12:00:00Z");
const by = { by: "Eva" };

const movement = (over: Partial<StockSyncMovement> = {}): StockSyncMovement =>
  ({
    id: "m1",
    companyId: "c1",
    createdAt: new Date("2026-09-30T08:00:00Z"),
    updatedAt: T0,
    deletedAt: null,
    gateRef: "G-1",
    warehouseTaskId: "t1",
    positionRef: "WCZ2026000123",
    visit: "příjem",
    handling: "Export",
    operationType: "LCL consolidation",
    customsMode: "SCP",
    customsStatus: "Waiting For Commercial Paperwork",
    customer: "ACME",
    pod: "SGSIN",
    colli: 10,
    packing: "Pallet",
    weightKg: 1200,
    measureCbm: 4.5,
    mrn: "",
    customsDocs: "",
    plate: "",
    freeDays: null,
    loadInDate: "",
    gateIn: null,
    gateOut: null,
    impRelease: null,
    expDraft: null,
    expReceipt: null,
    receivedAt: null,
    leftAt: null,
    leftContainerId: null,
    status: "Expected",
    ...over,
  }) as StockSyncMovement;

const state = (m: StockSyncMovement, over: Partial<StockSyncState> = {}): StockSyncState => ({
  m,
  house: null,
  leftContainerNumber: "",
  line: null,
  manualLine: false,
  entry: null,
  manualEntry: false,
  ...over,
});

// The line / entry as the plan would leave them, to feed the next step.
const lineFrom = (plan: ReturnType<typeof planStockSync>, prev: StockLineRecord | null = null): StockLineRecord =>
  ({ id: "l1", location: "", status: "Available", consol: "", closedAt: null, closedReason: "", ...prev, ...plan.line?.insert, ...plan.line?.update }) as StockLineRecord;
const entryFrom = (plan: ReturnType<typeof planStockSync>, prev: BondedEntryRecord | null = null): BondedEntryRecord =>
  ({ id: "e1", mrn: "", balance: 0, dischargedAt: null, dischargeRef: "", voidedReason: "", ...prev, ...plan.entry?.insert, ...plan.entry?.update }) as BondedEntryRecord;

describe("stock line from the gate", () => {
  it("inbound: no line before the WH receipt; the receipt opens one, the WH release closes it", () => {
    expect(planStockSync(state(movement({ gateIn: T0, expDraft: T0 })), by)).toMatchObject({ line: null, movements: [], lineChange: null });

    const m = movement({ gateIn: T0, expDraft: T0, expReceipt: T0, status: "In Warehouse" });
    const open = planStockSync(state(m), by);
    expect(open.lineChange).toBe("none->open");
    expect(open.line?.insert).toMatchObject({
      source: "auto",
      movementId: "m1",
      taskId: "t1",
      job: "WCZ2026000123",
      pieces: 10,
      weightKg: 1200,
      cbm: 4.5,
      packageType: "Pallet",
      receivedAt: "2026-10-01",
      freeDays: 7,
      customs: "Free circulation",
      status: "Available",
    });
    expect(open.movements).toHaveLength(1);
    expect(open.movements[0]).toMatchObject({ type: "Receipt", job: "WCZ2026000123", pieces: 10, source: "auto", userName: "Eva", reference: "WH receipt" });

    // Run again on the line it made: nothing new in the audit trail (idempotent).
    const line = lineFrom(open);
    const again = planStockSync(state(m, { line }), by);
    expect(again.lineChange).toBeNull();
    expect(again.movements).toEqual([]);

    // A user put it On hold at A-04-2: the sync keeps both.
    const held = { ...line, status: "On hold", location: "A-04-2" };
    expect(planStockSync(state(m, { line: held }), by).line?.update).not.toHaveProperty("status");
    expect(planStockSync(state(m, { line: held }), by).line?.update).not.toHaveProperty("location");

    const released = planStockSync(state({ ...m, impRelease: T1, gateOut: T1, status: "Released" }, { line: held }), by);
    expect(released.lineChange).toBe("open->left");
    expect(released.line?.update).toMatchObject({ status: "Picked", closedAt: T1, closedReason: "WH release" });
    expect(released.movements[0]).toMatchObject({ type: "Pick", fromLocation: "A-04-2" });
  });

  it("a voided receipt voids the line; a new receipt opens the same line again", () => {
    const m = movement({ gateIn: T0, expDraft: T0, expReceipt: T0 });
    const line = lineFrom(planStockSync(state(m), by));
    const voided = planStockSync(state({ ...m, expReceipt: null }, { line }), { by: "Boss", why: "WH receipt voided: wrong position" });
    expect(voided.lineChange).toBe("open->voided");
    expect(voided.line?.update).toMatchObject({ status: "Voided", closedReason: "WH receipt voided: wrong position" });
    expect(voided.movements[0]).toMatchObject({ type: "Adjustment", reference: "Voided — WH receipt voided: wrong position" });

    const reopened = planStockSync(state(m, { line: lineFrom(voided, line) }), by);
    expect(reopened.lineChange).toBe("voided->open");
    expect(reopened.line?.insert).toBeUndefined();
    expect(reopened.line?.update).toMatchObject({ status: "Available", closedAt: null, closedReason: "" });
    expect(reopened.movements[0]).toMatchObject({ type: "Adjustment" });
  });

  it("outbound: the stripping tally tick opens the line with the counted pieces and location", () => {
    const m = movement({ visit: "výdej", handling: "Import", receivedAt: T0, loadInDate: "2026-10-01", colli: 10 });
    const house = {
      container: { id: "k1", number: "MSKU 611 902-7", direction: "Unloading", gateInAt: T0 },
      link: { addedBy: "u", tallyOutcome: "received", tallyPieces: 9, tallyLocation: "b-12", stuffedAt: null, tickedAt: T0 },
      links: [],
    } as unknown as HouseCtx;
    const plan = planStockSync(state(m, { house }), by);
    expect(plan.line?.insert).toMatchObject({ pieces: 9, location: "B-12", receivedAt: "2026-10-01" });
    expect(plan.movements[0]).toMatchObject({ type: "Receipt", reference: "Ticked off at the stripping tally — MSKU 611 902-7", toLocation: "B-12" });
    // With a container the typed date alone is no receipt (the tally is).
    const notTicked = { ...house, link: { ...house.link, tallyOutcome: "" } } as unknown as HouseCtx;
    expect(planStockSync(state({ ...m, receivedAt: null }, { house: notTicked }), by).line).toBeNull();
    // Without a container the "Received in warehouse" date is the receipt.
    expect(planStockSync(state({ ...m, receivedAt: null }), by).lineChange).toBe("none->open");
  });

  it("inbound stuffed in an export container: Allocated to it, then Load at its gate-out", () => {
    const m = movement({ gateIn: T0, expDraft: T0, expReceipt: T0 });
    const house = {
      container: { id: "k2", number: "TGHU 123", direction: "Loading", gateInAt: T0 },
      link: { addedBy: "u", tallyOutcome: "", stuffedAt: T1 },
      links: [],
    } as unknown as HouseCtx;
    const line = lineFrom(planStockSync(state(m), by));
    const stuffed = planStockSync(state(m, { line, house }), by);
    expect(stuffed.line?.update).toMatchObject({ status: "Allocated", consol: "TGHU 123" });
    const unstuffed = { ...house, link: { ...house.link, stuffedAt: null } } as unknown as HouseCtx;
    expect(planStockSync(state(m, { line: lineFrom(stuffed, line), house: unstuffed }), by).line?.update).toMatchObject({ status: "Available", consol: "" });
    const gone = planStockSync(state({ ...m, leftAt: T1, leftContainerId: "k2", status: "Released" }, { line: lineFrom(stuffed, line), house, leftContainerNumber: "TGHU 123" }), by);
    expect(gone.line?.update).toMatchObject({ status: "Picked", closedReason: "Left in container TGHU 123" });
    expect(gone.movements[0]).toMatchObject({ type: "Load", toLocation: "TGHU 123" });
  });

  it("an archived position voids its line; a manual line linked to it means no automatic line", () => {
    const m = movement({ gateIn: T0, expDraft: T0, expReceipt: T0 });
    const line = lineFrom(planStockSync(state(m), by));
    expect(planStockSync(state({ ...m, deletedAt: T1 }, { line }), by).line?.update).toMatchObject({ status: "Voided", closedReason: "Position archived" });
    const manual = planStockSync(state(m, { manualLine: true }), by);
    expect(manual).toMatchObject({ line: null, skippedManual: true, movements: [] });
  });
});

describe("bonded register from the gate", () => {
  const t1 = movement({ visit: "výdej", handling: "Import", customsMode: "T1", mrn: "26cz5100001234a7", customsDocs: "T1 26CZ…", receivedAt: T0, loadInDate: "2026-10-01" });

  it("T1 cargo opens an entry at the receipt with the 90-day deadline; WH release discharges it", () => {
    const open = planStockSync(state(t1), by);
    expect(open.entryChange).toBe("none->open");
    expect(open.entry?.insert).toMatchObject({
      source: "auto",
      regime: "Transit T1",
      mrn: "26CZ5100001234A7",
      entryDate: "2026-10-01",
      enteredAt: T0,
      deadline: "2026-12-30",
      pieces: 10,
      balance: 10,
    });
    expect(open.line?.insert).toMatchObject({ customs: "T1 bonded", customsRegime: "Transit T1" });
    const entry = entryFrom(open);
    const done = planStockSync(state({ ...t1, impRelease: T1 }, { entry, line: lineFrom(open) }), by);
    expect(done.entryChange).toBe("open->discharged");
    expect(done.entry?.update).toMatchObject({ balance: 0, dischargedAt: T1, dischargeRef: "26CZ5100001234A7 · T1 26CZ… · WH release" });
  });

  it("customs cleared in the warehouse discharges; SCP opens nothing; a voided receipt voids", () => {
    const entry = entryFrom(planStockSync(state(t1), by));
    const cleared = planStockSync(state({ ...t1, customsStatus: "Customs Cleared/Released" }, { entry }), by);
    expect(cleared.entry?.update).toMatchObject({ balance: 0, dischargeRef: "26CZ5100001234A7 · T1 26CZ… · customs cleared/released" });
    expect(cleared.line?.insert).toMatchObject({ customs: "Free circulation", customsRegime: "" });
    expect(planStockSync(state({ ...t1, customsMode: "SCP" }), by).entry).toBeNull();
    const voided = planStockSync(state({ ...t1, receivedAt: null, loadInDate: "" }, { entry }), { by: "Boss", why: "tally voided: wrong house" });
    expect(voided.entryChange).toBe("open->voided");
    expect(voided.entry?.update).toMatchObject({ balance: 0, voidedReason: "tally voided: wrong house" });
    // Received again: the same entry opens again.
    const back = planStockSync(state(t1, { entry: entryFrom(voided, entry) }), by);
    expect(back.entryChange).toBe("voided->open");
    expect(back.entry?.update).toMatchObject({ voidedReason: "", dischargedAt: null, balance: 10 });
  });

  it("an entry opened with 0 pieces stays open (no spurious change) and is discharged when the position leaves", () => {
    const zero = { ...t1, colli: 0 };
    const open = planStockSync(state(zero), by);
    expect(open.entry?.insert).toMatchObject({ pieces: 0, balance: 0 });
    const entry = entryFrom(open);
    const again = planStockSync(state(zero, { entry, line: lineFrom(open) }), by);
    expect(again.entryChange).toBeNull();
    const done = planStockSync(state({ ...zero, impRelease: T1 }, { entry, line: lineFrom(open) }), by);
    expect(done.entryChange).toBe("open->discharged");
    expect(done.entry?.update).toMatchObject({ dischargedAt: T1, dischargeRef: "26CZ5100001234A7 · T1 26CZ… · WH release" });
  });

  it("a bonded storage operation is a customs warehouse: no deadline; MRN filled in later", () => {
    const m = movement({ operationType: "Cargo storage (bonded)", gateIn: T0, expDraft: T0, expReceipt: T0 });
    const open = planStockSync(state(m), by);
    expect(open.entry?.insert).toMatchObject({ regime: "Customs warehouse", deadline: "", mrn: "", procedure: "71 00 — customs warehousing" });
    const entry = entryFrom(open);
    expect(planStockSync(state({ ...m, mrn: "26CZ1" }, { entry }), by).entry?.update).toMatchObject({ mrn: "26CZ1" });
  });
});
