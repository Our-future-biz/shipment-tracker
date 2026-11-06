import { beforeEach, describe, expect, it, vi } from "vitest";

// Where each kind of outbox row goes, and as whom.
const bucket = vi.hoisted(() => ({ download: vi.fn(async () => Buffer.from("pdf bytes")) }));
vi.mock("../storage/documentBucket", () => ({ truckingDocumentBucket: bucket }));
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  shipments: { _internalShipmentMarkBilling: vi.fn(), shipmentUpdate: vi.fn(), _internalModuleDocument: vi.fn(), _internalTrackingFact: vi.fn(), _internalTrackingFactVoid: vi.fn() },
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
    expect(shipments.shipmentUpdate).toHaveBeenCalledWith({ shipmentId: S, pickupDate: "2026-10-16", plannedDeliveryDate: "2026-10-19" }, { authData: { ...authData, appWrite: true } });
    await sendRow(row("delivered", { actualDeliveryDate: "2026-10-16" }));
    expect(shipments.shipmentUpdate).toHaveBeenLastCalledWith({ shipmentId: S, actualDeliveryDate: "2026-10-16" }, { authData: { ...authData, appWrite: true } });
  });

  it("asks Shipments for the Billing step, and pushes the cost lines to invoicing", async () => {
    await sendRow(row("billing", {}));
    expect(shipments._internalShipmentMarkBilling).toHaveBeenCalledWith({ shipmentId: S }, { authData });
  });

  it("hands the POD to the job's Documents once per file, and to its timeline once per stamp", async () => {
    await sendRow(row("pod", { fileName: "pod.pdf", contentType: "application/pdf", sha256: "abc", storageKey: "c/1/x", stampedAt: "2026-11-05T09:00:00.000Z" }));
    expect(bucket.download).toHaveBeenCalledWith("c/1/x");
    expect(shipments._internalModuleDocument).toHaveBeenCalledWith(
      { shipmentId: S, fileName: "pod.pdf", fileType: "application/pdf", contentBase64: Buffer.from("pdf bytes").toString("base64"), documentType: "CMR / POD", sourceRef: "trucking:abc" },
      { authData },
    );
    expect(shipments._internalTrackingFact).toHaveBeenCalledWith(
      { shipmentId: S, kind: "pod_received", occurredAt: "2026-11-05T09:00:00.000Z", note: "pod.pdf", externalId: "pod:c1:2026-11-05T09:00:00.000Z" },
      { authData },
    );
  });

  it("takes a voided POD's fact off the job's timeline and leaves its file in the Documents", async () => {
    await sendRow(row("pod", { stampedAt: "2026-11-05T09:00:00.000Z", voided: true }));
    expect(shipments._internalTrackingFactVoid).toHaveBeenCalledWith({ shipmentId: S, externalId: "pod:c1:2026-11-05T09:00:00.000Z" }, { authData });
    expect(bucket.download).not.toHaveBeenCalled();
    expect(shipments._internalModuleDocument).not.toHaveBeenCalled();
    expect(shipments._internalTrackingFact).not.toHaveBeenCalled();
  });

  it("puts a stamp on the job's timeline, and its void takes back that stamp's fact only", async () => {
    const T1 = "2026-11-05T09:00:00.000Z";
    const T2 = "2026-11-05T11:30:00.000Z";
    await sendRow(row("stamp", { stamp: "confirmed", at: T1 }));
    expect(shipments._internalTrackingFact).toHaveBeenLastCalledWith(
      { shipmentId: S, kind: "haulier_confirmed", occurredAt: T1, note: "", externalId: `stamp:c1:confirmed:${T1}` },
      { authData },
    );
    // Stamped again after a void that failed for good: a fact of its own, not deduplicated
    // against the first one still on the timeline ...
    await sendRow(row("stamp", { stamp: "confirmed", at: T2 }));
    expect(shipments._internalTrackingFact).toHaveBeenLastCalledWith(expect.objectContaining({ externalId: `stamp:c1:confirmed:${T2}` }), { authData });
    // ... and the failed void, sent again by a manager, takes back only the first.
    await sendRow(row("stamp", { stamp: "confirmed", at: T1, voided: true }));
    expect(shipments._internalTrackingFactVoid).toHaveBeenCalledWith({ shipmentId: S, externalId: `stamp:c1:confirmed:${T1}` }, { authData });
    await sendRow(row("stamp", { stamp: "pickedUp", at: T2 }));
    expect(shipments._internalTrackingFact).toHaveBeenLastCalledWith(
      { shipmentId: S, kind: "picked_up", occurredAt: T2, note: "", externalId: `stamp:c1:pickedUp:${T2}` },
      { authData },
    );
  });

  it("hands the delivery advice to the job's timeline", async () => {
    await sendRow(row("delivery_advice", { at: "2026-11-05T09:00:00.000Z", text: "By phone to Jan" }));
    expect(shipments._internalTrackingFact).toHaveBeenCalledWith(
      { shipmentId: S, kind: "delivery_advised", occurredAt: "2026-11-05T09:00:00.000Z", note: "By phone to Jan", externalId: "avizace:c1:2026-11-05T09:00:00.000Z" },
      { authData },
    );
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
