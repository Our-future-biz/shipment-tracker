import { beforeEach, describe, expect, it, vi } from "vitest";

const requests = vi.hoisted(() => ({ usablePass: vi.fn(), use: vi.fn(), giveBack: vi.fn(), closeUsed: vi.fn(), stillUsedAt: vi.fn() }));
const shipments = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const overrides = vi.hoisted(() => ({ create: vi.fn(), createOnce: vi.fn() }));
const audit = vi.hoisted(() => ({ create: vi.fn(), listByShipmentId: vi.fn(async () => [] as unknown[]) }));
const tracking = vi.hoisted(() => ({ add: vi.fn() }));
// The "Prepayment not checked" note is inserted on the transaction itself (its external id tells a repeat):
// `noteInserted` says whether the insert wrote a row.
const noteInserted = vi.hoisted(() => ({ rows: [{ id: "n1" }] as { id: string }[], values: vi.fn() }));
const tx = vi.hoisted(() => ({
  tx: true,
  insert: () => ({
    values: (v: unknown) => {
      noteInserted.values(v);
      return { onConflictDoNothing: () => ({ returning: async () => noteInserted.rows }) };
    },
  }),
}));
const fakeDb = vi.hoisted(() => ({ transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)) }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../../../lib/companyUsers", () => ({ userEmailOf: vi.fn(async () => "jan@firma.cz"), companyUsers: vi.fn(async () => []) }));
vi.mock("../../db/db", () => ({ db: fakeDb }));
vi.mock("../../repositories/shipmentReleaseRequest.repository", () => ({ shipmentReleaseRequestRepository: requests }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentReleaseOverride.repository", () => ({ shipmentReleaseOverrideRepository: overrides }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: audit }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: tracking }));

import { GATE_PREPAYMENT_UNCHECKED_LINE, GATE_UNINVOICED_UNCHECKED_LINE, gateReleaseService, gateWrittenDays } from "../../services/gateRelease.service";

// The shipments' side of the Warehouse Concept gate's WH release of a job the prepayment stop holds, against
// stand-ins for the repositories: an approved request used once (the same conditional use() the shipment
// service's release paths use), given back only by that very use, and the release recorded as any override is.
// The SQL is tests/db/gateRelease.db.test.ts.

const COMPANY = "c1";
const USER = "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c01";
const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const REQUEST = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const CLERK = "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c02";
const NOW = new Date("2026-11-19T09:00:00Z");
const pass = { id: REQUEST, requestedByName: "Jan Novák", reason: "Customer pays on Friday", decidedByName: "Eva Malá", comment: "Agreed with the owner" };

beforeEach(() => vi.clearAllMocks());

describe("an approved request, used for the gate's WH release", () => {
  it("is the job's Warehouse Released pass, marked used by whoever stamps, at once, with who asked and who approved as its reason", async () => {
    requests.usablePass.mockResolvedValue(pass);
    requests.use.mockResolvedValue(true);
    await expect(gateReleaseService.usePass(COMPANY, USER, SHIPMENT, "warehouse_released", NOW)).resolves.toEqual({
      requestId: REQUEST,
      reason: "Asked by Jan Novák: Customer pays on Friday — approved by Eva Malá: Agreed with the owner",
      usedAt: NOW,
    });
    // The warehouse's request, not the House BoL's; good for 7 days from its decision.
    const sevenDaysAgo = new Date(NOW.getTime() - 7 * 86_400_000);
    expect(requests.usablePass).toHaveBeenCalledWith(COMPANY, SHIPMENT, "warehouse", sevenDaysAgo);
    expect(requests.use).toHaveBeenCalledWith(fakeDb, REQUEST, COMPANY, { usedAt: NOW, usedById: USER, usedByName: "jan@firma.cz" }, sevenDaysAgo);
  });

  it("is none when there is no pass, or it was used or withdrawn in between: the gate then refuses", async () => {
    requests.usablePass.mockResolvedValue(null);
    await expect(gateReleaseService.usePass(COMPANY, USER, SHIPMENT, "warehouse_released", NOW)).resolves.toBeNull();
    expect(requests.use).not.toHaveBeenCalled();

    requests.usablePass.mockResolvedValue(pass);
    requests.use.mockResolvedValue(false);
    await expect(gateReleaseService.usePass(COMPANY, USER, SHIPMENT, "warehouse_released", NOW)).resolves.toBeNull();
    // What is not a shipment's id is not looked for.
    await expect(gateReleaseService.usePass(COMPANY, USER, "nope", "warehouse_released", NOW)).resolves.toBeNull();
    expect(requests.usablePass).toHaveBeenCalledTimes(2);
  });

  it("is given back by that very use only", async () => {
    requests.giveBack.mockResolvedValue(true);
    await expect(gateReleaseService.giveBack(COMPANY, USER, REQUEST, NOW)).resolves.toEqual({ givenBack: true, stillUsed: false });
    expect(requests.giveBack).toHaveBeenCalledWith(REQUEST, COMPANY, { usedAt: NOW, usedById: USER }, expect.any(Date));
    await expect(gateReleaseService.giveBack(COMPANY, USER, "nope", NOW)).resolves.toEqual({ givenBack: false, stillUsed: false });
    expect(requests.giveBack).toHaveBeenCalledTimes(1);
    expect(requests.stillUsedAt).not.toHaveBeenCalled();
  });

  it("is given back by the outbox by the moment alone, and says whether one not given back stays used", async () => {
    requests.giveBack.mockResolvedValue(false);
    requests.stillUsedAt.mockResolvedValue(true);
    await expect(gateReleaseService.giveBack(COMPANY, USER, REQUEST, NOW, true)).resolves.toEqual({ givenBack: false, stillUsed: true });
    expect(requests.giveBack).toHaveBeenCalledWith(REQUEST, COMPANY, { usedAt: NOW }, expect.any(Date));
    expect(requests.stillUsedAt).toHaveBeenCalledWith(REQUEST, COMPANY, NOW);
    // Given back before (a delivery sent twice): nothing of the use is left.
    requests.stillUsedAt.mockResolvedValue(false);
    await expect(gateReleaseService.giveBack(COMPANY, USER, REQUEST, NOW, true)).resolves.toEqual({ givenBack: false, stillUsed: false });
  });

  it("is closed, not given back, when somebody else's WH release of the record was first: it lets no later release through (review)", async () => {
    requests.closeUsed.mockResolvedValue(true);
    await expect(gateReleaseService.giveBack(COMPANY, USER, REQUEST, NOW, true, true)).resolves.toEqual({ givenBack: false, stillUsed: false, closed: true });
    expect(requests.giveBack).not.toHaveBeenCalled();
    expect(requests.closeUsed).toHaveBeenCalledWith(REQUEST, COMPANY, { usedAt: NOW }, expect.any(Date), expect.any(Function));
    // With the line a release made another way leaves of an approval nobody used.
    const history = requests.closeUsed.mock.calls[0]![4] as (what: string) => unknown;
    expect(history("warehouse")).toEqual({ userId: USER, field: "releaseRequest", oldValue: null, newValue: "Warehouse Released approval closed unused: released without it" });
    // Nothing of that use left (closed or given back by an earlier delivery): nothing to do; still carrying it: a failure.
    requests.closeUsed.mockResolvedValue(false);
    requests.stillUsedAt.mockResolvedValue(false);
    await expect(gateReleaseService.giveBack(COMPANY, USER, REQUEST, NOW, true, true)).resolves.toEqual({ givenBack: false, stillUsed: false });
    requests.stillUsedAt.mockResolvedValue(true);
    await expect(gateReleaseService.giveBack(COMPANY, USER, REQUEST, NOW, false, true)).resolves.toEqual({ givenBack: false, stillUsed: true });
    expect(requests.closeUsed).toHaveBeenLastCalledWith(REQUEST, COMPANY, { usedAt: NOW, usedById: USER }, expect.any(Date), expect.any(Function));
  });
});

describe("a release the gate let through, recorded on the shipment", () => {
  it("is the override row, the history line and the Tracking note, in one transaction, in the shipments' own words", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, companyId: COMPANY });
    const invoices = [
      { number: "FV2026001", leftToPay: 1200, currency: "EUR" },
      { number: "Not invoiced yet", leftToPay: 800, currency: "EUR" },
    ];
    await gateReleaseService.recordOverride(COMPANY, USER, SHIPMENT, "warehouse_released", { reason: " Paid in cash ", invoices, checked: true });
    const line = "Warehouse Released set on prepayment (unpaid: FV2026001 (1,200.00 EUR left to pay), 800.00 EUR not invoiced yet) - reason: Paid in cash";
    expect(fakeDb.transaction).toHaveBeenCalledTimes(1);
    expect(overrides.create).toHaveBeenCalledWith(tx, {
      companyId: COMPANY,
      shipmentId: SHIPMENT,
      kind: "warehouse_released",
      reason: "Paid in cash",
      invoices,
      checked: true,
      byUserId: USER,
      by: "jan@firma.cz",
    });
    expect(audit.create).toHaveBeenCalledWith({ companyId: COMPANY, shipmentId: SHIPMENT, userId: USER, field: "paymentOverride", oldValue: null, newValue: line }, tx);
    expect(tracking.add).toHaveBeenCalledWith(expect.objectContaining({ companyId: COMPANY, shipmentId: SHIPMENT, kind: "note", source: "warehouse", recordedById: USER, note: line }), tx);
  });

  it("says unchecked when Invoicing could not be asked", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, companyId: COMPANY });
    await gateReleaseService.recordOverride(COMPANY, USER, SHIPMENT, "warehouse_released", { reason: "Bank is slow", invoices: [], checked: false });
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ newValue: "Warehouse Released set on prepayment (payment not checked) - reason: Bank is slow" }), tx);
  });

  it("is recorded once per idempotency key: a key already there writes neither the history line nor the note", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, companyId: COMPANY });
    overrides.createOnce.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const override = { reason: "Paid in cash", invoices: [], checked: true };
    await gateReleaseService.recordOverride(COMPANY, USER, SHIPMENT, "warehouse_released", override, "row-1");
    await gateReleaseService.recordOverride(COMPANY, USER, SHIPMENT, "warehouse_released", override, "row-1");
    expect(overrides.createOnce).toHaveBeenCalledWith(tx, expect.objectContaining({ companyId: COMPANY, shipmentId: SHIPMENT, idempotencyKey: "row-1" }));
    expect(overrides.create).not.toHaveBeenCalled();
    expect(audit.create).toHaveBeenCalledTimes(1);
    expect(tracking.add).toHaveBeenCalledTimes(1);
  });

  it("is refused for a shipment that is not the company's, and nothing is written", async () => {
    shipments.getByIdForCompany.mockResolvedValue(null);
    await expect(gateReleaseService.recordOverride(COMPANY, USER, SHIPMENT, "warehouse_released", { reason: "x y z", invoices: [], checked: true })).rejects.toThrow("Shipment not found");
    await expect(gateReleaseService.recordOverride(COMPANY, USER, "nope", "warehouse_released", { reason: "x y z", invoices: [], checked: true })).rejects.toThrow("Shipment not found");
    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });
});

describe("the days the gate's own WH releases wrote", () => {
  it("are kept to well-formed days, and few", () => {
    expect([...gateWrittenDays([" 2026-11-18 ", "18.11.2026", "", "2026-11-19"])]).toEqual(["2026-11-18", "2026-11-19"]);
    expect(gateWrittenDays(undefined).size).toBe(0);
    const many = Array.from({ length: 80 }, (_, i) => new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10));
    expect(gateWrittenDays(many).size).toBe(50);
  });

  it("are not answered as released in Shipments: the stop runs again on a day a voided gate release left", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, companyId: COMPANY, warehouseReleasedDate: "2026-11-18" });
    await expect(gateReleaseService.warehouseReleasedOf(COMPANY, SHIPMENT, ["2026-11-18"])).resolves.toBeNull();
  });

  it("nor is a day a user edited in Shipments from one of them: the gate's release edited, not one made in Shipments (review)", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, companyId: COMPANY, warehouseReleasedDate: "2026-11-20" });
    // Newest first: the gate wrote 18.11. from empty (its void leaves it), then a user changed it to 20.11.
    audit.listByShipmentId.mockResolvedValue([
      { userId: USER, field: "warehouseReleasedDate", oldValue: "2026-11-18", newValue: "2026-11-20" },
      { userId: CLERK, field: "warehouseReleasedDate", oldValue: null, newValue: "2026-11-18" },
    ]);
    await expect(gateReleaseService.warehouseReleasedOf(COMPANY, SHIPMENT, ["2026-11-18"])).resolves.toBeNull();
    expect(audit.listByShipmentId).toHaveBeenCalledWith(SHIPMENT, COMPANY, ["warehouseReleasedDate"], 50);
  });

  it("while a day set from empty in Shipments is answered as released there, by whoever set the day now", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, companyId: COMPANY, warehouseReleasedDate: "2026-11-20" });
    audit.listByShipmentId.mockResolvedValue([
      { userId: USER, field: "warehouseReleasedDate", oldValue: null, newValue: "2026-11-20" },
      { userId: CLERK, field: "warehouseReleasedDate", oldValue: "2026-11-18", newValue: null },
      { userId: CLERK, field: "warehouseReleasedDate", oldValue: null, newValue: "2026-11-18" },
    ]);
    await expect(gateReleaseService.warehouseReleasedOf(COMPANY, SHIPMENT, ["2026-11-18"])).resolves.toEqual({ date: "2026-11-20", by: "jan@firma.cz" });
    // No history at all (as created or imported): the day, nobody named.
    audit.listByShipmentId.mockResolvedValue([]);
    await expect(gateReleaseService.warehouseReleasedOf(COMPANY, SHIPMENT, ["2026-11-18"])).resolves.toEqual({ date: "2026-11-20", by: "" });
  });
});

describe("a WH release the gate let through unchecked (P17)", () => {
  it("says \"Prepayment not checked\" in the history and on the Tracking tab, once per outbox row", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, companyId: COMPANY });
    noteInserted.rows = [{ id: "n1" }];
    await gateReleaseService.recordUnchecked(COMPANY, USER, SHIPMENT, "row-9");
    expect(noteInserted.values).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY, shipmentId: SHIPMENT, kind: "note", source: "warehouse", externalId: "prepayment-unchecked:row-9", recordedById: USER, note: GATE_PREPAYMENT_UNCHECKED_LINE }),
    );
    expect(audit.create).toHaveBeenCalledWith({ companyId: COMPANY, shipmentId: SHIPMENT, userId: USER, field: "prepaymentUnchecked", oldValue: null, newValue: GATE_PREPAYMENT_UNCHECKED_LINE }, tx);
    // The same row again: the note is there already, and no second history line is written.
    noteInserted.rows = [];
    await gateReleaseService.recordUnchecked(COMPANY, USER, SHIPMENT, "row-9");
    expect(audit.create).toHaveBeenCalledTimes(1);
    expect(overrides.create).not.toHaveBeenCalled();
  });

  it("names the Customer Database when it was the work not invoiced yet that could not be checked (P10, review)", async () => {
    shipments.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, companyId: COMPANY });
    noteInserted.rows = [{ id: "n2" }];
    await gateReleaseService.recordUnchecked(COMPANY, USER, SHIPMENT, "row-10", "customerDatabase");
    expect(GATE_UNINVOICED_UNCHECKED_LINE).toBe("Prepayment not checked: the Customer Database could not be read at the gate's WH release");
    expect(noteInserted.values).toHaveBeenCalledWith(expect.objectContaining({ externalId: "prepayment-unchecked:row-10", note: GATE_UNINVOICED_UNCHECKED_LINE }));
    expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ field: "prepaymentUnchecked", newValue: GATE_UNINVOICED_UNCHECKED_LINE }), tx);
  });

  it("is refused for a shipment that is not the company's", async () => {
    shipments.getByIdForCompany.mockResolvedValue(null);
    await expect(gateReleaseService.recordUnchecked(COMPANY, USER, SHIPMENT, "row-9")).rejects.toThrow("Shipment not found");
    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });
});
