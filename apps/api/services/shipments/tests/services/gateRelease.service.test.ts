import { beforeEach, describe, expect, it, vi } from "vitest";

const requests = vi.hoisted(() => ({ usablePass: vi.fn(), use: vi.fn(), giveBack: vi.fn() }));
const shipments = vi.hoisted(() => ({ getByIdForCompany: vi.fn() }));
const overrides = vi.hoisted(() => ({ create: vi.fn() }));
const audit = vi.hoisted(() => ({ create: vi.fn() }));
const tracking = vi.hoisted(() => ({ add: vi.fn() }));
const tx = vi.hoisted(() => ({ tx: true }));
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

import { gateReleaseService } from "../../services/gateRelease.service";

// The shipments' side of the Warehouse Concept gate's WH release of a job the prepayment stop holds, against
// stand-ins for the repositories: an approved request used once (the same conditional use() the shipment
// service's release paths use), given back only by that very use, and the release recorded as any override is.
// The SQL is tests/db/gateRelease.db.test.ts.

const COMPANY = "c1";
const USER = "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c01";
const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const REQUEST = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
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
    await expect(gateReleaseService.giveBack(COMPANY, USER, REQUEST, NOW)).resolves.toBe(true);
    expect(requests.giveBack).toHaveBeenCalledWith(REQUEST, COMPANY, { usedAt: NOW, usedById: USER }, expect.any(Date));
    await expect(gateReleaseService.giveBack(COMPANY, USER, "nope", NOW)).resolves.toBe(false);
    expect(requests.giveBack).toHaveBeenCalledTimes(1);
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

  it("is refused for a shipment that is not the company's, and nothing is written", async () => {
    shipments.getByIdForCompany.mockResolvedValue(null);
    await expect(gateReleaseService.recordOverride(COMPANY, USER, SHIPMENT, "warehouse_released", { reason: "x y z", invoices: [], checked: true })).rejects.toThrow("Shipment not found");
    await expect(gateReleaseService.recordOverride(COMPANY, USER, "nope", "warehouse_released", { reason: "x y z", invoices: [], checked: true })).rejects.toThrow("Shipment not found");
    expect(fakeDb.transaction).not.toHaveBeenCalled();
  });
});
