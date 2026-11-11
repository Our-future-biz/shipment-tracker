import { beforeEach, describe, expect, it, vi } from "vitest";

// A new customer link replaces the live one in the shipment's write turn, so two clicks at once take
// turns instead of the second breaking the one-live-link index. Run against stand-ins for the
// repositories and the shipments service (the race itself: tests/db/customerLink.db.test.ts).
const TX = vi.hoisted(() => ({ fake: "tx" }));
const shipments = vi.hoisted(() => ({
  getByIdForCompany: vi.fn(),
  writeTurn: vi.fn(async (_shipmentId: string, _companyId: string, work: (tx: unknown) => Promise<unknown>) => work(TX)),
}));
const links = vi.hoisted(() => ({ replace: vi.fn(), liveOf: vi.fn(), revoke: vi.fn(), liveByHash: vi.fn(), touchOpened: vi.fn() }));
const service = vi.hoisted(() => ({ mayChangeDetails: vi.fn(), customsStatusOf: vi.fn() }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ invoicing: { invoiceProfileGet: vi.fn() } }));
vi.mock("../../../../lib/outbox/serviceIdentity", () => ({ serviceActor: vi.fn() }));
vi.mock("../../lib/userEmails", () => ({ userEmails: async () => new Map([["u1", "jana@firma.cz"]]) }));
vi.mock("../../repositories/shipment.repository", () => ({ shipmentRepository: shipments }));
vi.mock("../../repositories/shipmentCustomerLink.repository", () => ({ shipmentCustomerLinkRepository: links }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: { listByShipmentId: vi.fn() } }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({ shipmentTrackingEventRepository: { listByShipmentId: vi.fn() } }));
vi.mock("../../services/tracking.service", () => ({ TRACKING_EVENTS_LIMIT: 500 }));
vi.mock("../../services/shipment.service", () => ({ shipmentService: service }));

import { customerLinkService } from "../../services/customerLink.service";

const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const ACTOR = { userID: "u1", companyID: "c1", role: "user" };
const NOW = new Date("2026-11-10T12:00:00Z");
const link = { id: "l1", createdAt: NOW, createdById: "u1", lastOpenedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  shipments.getByIdForCompany.mockResolvedValue({ id: SHIPMENT, status: "Booked", actualDeliveryDate: null, personInCharge: "", holidayCover: "" });
  service.mayChangeDetails.mockResolvedValue(true);
  links.replace.mockResolvedValue(link);
  links.liveOf.mockResolvedValue(link);
});

describe("a new customer link", () => {
  it("replaces the live one in the shipment's write turn", async () => {
    const { url } = await customerLinkService.create(SHIPMENT, ACTOR, NOW);
    expect(url).toMatch(/\/track\//);
    expect(shipments.writeTurn).toHaveBeenCalledWith(SHIPMENT, "c1", expect.any(Function));
    expect(links.replace).toHaveBeenCalledWith(TX, expect.objectContaining({ companyId: "c1", shipmentId: SHIPMENT, createdById: "u1", tokenHash: expect.any(String) }));
  });

  it("is refused before the turn to who may not change the details", async () => {
    service.mayChangeDetails.mockResolvedValue(false);
    await expect(customerLinkService.create(SHIPMENT, ACTOR, NOW)).rejects.toMatchObject({ code: "permission_denied" });
    expect(shipments.writeTurn).not.toHaveBeenCalled();
    expect(links.replace).not.toHaveBeenCalled();
  });
});
