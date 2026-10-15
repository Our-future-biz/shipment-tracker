import { beforeEach, describe, expect, it, vi } from "vitest";

// Where each kind of outbox row goes, and as whom.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  shipments: { _internalShipmentMarkBilling: vi.fn(), shipmentUpdate: vi.fn() },
  invoicing: { _internalInvoicingTruckingLines: vi.fn() },
  auth: { userLookup: vi.fn() },
}));
vi.mock("../db/db", () => ({ db: {} }));
vi.mock("../repositories/truckingOutbox.repository", () => ({ truckingOutboxRepository: {} }));
vi.mock("../repositories/event.repository", () => ({ appendEvent: vi.fn() }));

import { auth, invoicing, shipments } from "~encore/clients";
import { outboxErrorText, sendRow } from "../services/truckingOutbox.service";
import type { TruckingOutboxRecord } from "../schemas/truckingOutbox.schema";

const C = "00000000-0000-0000-0000-000000000001";
const U = "00000000-0000-0000-0000-000000000002";
const S = "00000000-0000-0000-0000-0000000000d1";
const row = (kind: TruckingOutboxRecord["kind"], payload: Record<string, unknown>) =>
  ({ id: "o1", companyId: C, consignmentId: "c1", shipmentId: S, kind, payload, actingUserId: U, actingRole: "user", attempts: 1 }) as TruckingOutboxRecord;
const authData = { userID: U, companyID: C, role: "manager" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth.userLookup).mockResolvedValue({ users: [{ id: U, name: "Jana", role: "manager" }] } as never);
});

describe("outbox delivery", () => {
  it("writes dates and plate through ShipmentUpdate as the acting user (with the role they have now)", async () => {
    await sendRow(row("planned", { pickupDate: "2026-10-16", plannedDeliveryDate: "2026-10-19" }));
    expect(shipments.shipmentUpdate).toHaveBeenCalledWith({ shipmentId: S, pickupDate: "2026-10-16", plannedDeliveryDate: "2026-10-19" }, { authData });
    await sendRow(row("delivered", { actualDeliveryDate: "2026-10-16" }));
    expect(shipments.shipmentUpdate).toHaveBeenLastCalledWith({ shipmentId: S, actualDeliveryDate: "2026-10-16" }, { authData });
  });

  it("asks Shipments for the Billing step, and pushes the cost lines to invoicing", async () => {
    await sendRow(row("billing", {}));
    expect(shipments._internalShipmentMarkBilling).toHaveBeenCalledWith({ shipmentId: S }, { authData });
    const costs = { sourceRef: "trucking:trip:t1", buying: [{ description: "x" }], selling: [] };
    await sendRow(row("costs", costs));
    expect(invoicing._internalInvoicingTruckingLines).toHaveBeenCalledWith({ shipmentId: S, ...costs }, { authData });
  });

  it("refuses for good when the acting user is gone", async () => {
    vi.mocked(auth.userLookup).mockResolvedValue({ users: [] } as never);
    await expect(sendRow(row("billing", {}))).rejects.toMatchObject({ code: "permission_denied" });
    expect(outboxErrorText({ code: "permission_denied" })).toBe("The user who made the change may no longer change this job");
  });
});
