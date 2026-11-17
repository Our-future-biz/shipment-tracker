import { beforeEach, describe, expect, it, vi } from "vitest";

// F6: the shipment changes owed to Trucking and the gate, sent after the write's commit as the
// user who made them, settled by the shared outbox delivery.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  trucking: { _internalShipmentChanged: vi.fn() },
  warehouseConcept: { _internalShipmentChanged: vi.fn() },
}));
vi.mock("../../repositories/shipmentPushOutbox.repository", () => ({
  shipmentPushOutboxRepository: { enqueue: vi.fn(), claimDue: vi.fn(), markSent: vi.fn(), markRetry: vi.fn(), markFailed: vi.fn() },
}));
vi.mock("../../../../lib/outbox/shipmentUpdateAs", () => ({ actingAuthNow: vi.fn() }));
vi.mock("../../../../lib/outbox/serviceIdentity", () => ({ serviceActor: vi.fn(async (companyId: string) => ({ userID: "svc", companyID: companyId, role: "user" })) }));

import { trucking, warehouseConcept } from "~encore/clients";
import { APIError } from "../../../../lib/tests/encoreApi.stub";
import { actingAuthNow } from "../../../../lib/outbox/shipmentUpdateAs";
import { shipmentPushOutboxRepository } from "../../repositories/shipmentPushOutbox.repository";
import { deliverShipmentPushes } from "../../services/shipmentPush.service";

const outbox = vi.mocked(shipmentPushOutboxRepository);
const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const JAN = { userID: "jan", companyID: COMPANY, role: "manager" };
const changes = { pickupDate: { from: "2026-11-18", to: "2026-11-19" } };
const owed = (target: "trucking" | "warehouse", over: Record<string, unknown> = {}) =>
  ({ id: `row-${target}`, companyId: COMPANY, shipmentId: SHIPMENT, target, changes, actingUserId: "jan", actingRole: "manager", attempts: 1, ...over }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(actingAuthNow).mockResolvedValue(JAN);
  vi.mocked(trucking._internalShipmentChanged).mockResolvedValue({ kept: [] });
  vi.mocked(warehouseConcept._internalShipmentChanged).mockResolvedValue({ kept: ["WCZ1 plate: the gate stamped the vehicle already"] });
});

describe("passing a shipment's change on", () => {
  it("sends each row to its side as the user who made the change, and settles it as sent - what a side kept is only logged", async () => {
    outbox.claimDue.mockResolvedValueOnce([owed("trucking"), owed("warehouse")]).mockResolvedValue([]);
    await expect(deliverShipmentPushes(SHIPMENT)).resolves.toMatchObject({ sent: 2, retry: 0, failed: 0 });
    expect(outbox.claimDue).toHaveBeenCalledWith(expect.any(Number), SHIPMENT);
    expect(trucking._internalShipmentChanged).toHaveBeenCalledWith({ shipmentId: SHIPMENT, changes }, { authData: JAN });
    expect(warehouseConcept._internalShipmentChanged).toHaveBeenCalledWith({ shipmentId: SHIPMENT, changes }, { authData: JAN });
    expect(outbox.markSent).toHaveBeenCalledTimes(2);
  });

  it("sends a change of a user who has left since as the company's service identity", async () => {
    vi.mocked(actingAuthNow).mockRejectedValue(APIError.permissionDenied("the acting user no longer exists"));
    outbox.claimDue.mockResolvedValueOnce([owed("trucking")]).mockResolvedValue([]);
    await deliverShipmentPushes();
    expect(trucking._internalShipmentChanged).toHaveBeenCalledWith({ shipmentId: SHIPMENT, changes }, { authData: { userID: "svc", companyID: COMPANY, role: "user" } });
  });

  it("tries again later when the other side can't be reached, and sends only well-formed changes", async () => {
    vi.mocked(trucking._internalShipmentChanged).mockRejectedValue(APIError.unavailable("down"));
    outbox.claimDue.mockResolvedValueOnce([owed("trucking", { changes: { ...changes, plateNumber: { from: 1 } } })]).mockResolvedValue([]);
    await expect(deliverShipmentPushes()).resolves.toMatchObject({ retry: 1 });
    expect(trucking._internalShipmentChanged).toHaveBeenCalledWith({ shipmentId: SHIPMENT, changes }, expect.anything());
    expect(outbox.markRetry).toHaveBeenCalledWith("row-trucking", 1, "Trucking or the warehouse could not be reached", expect.any(Date));
  });
});
