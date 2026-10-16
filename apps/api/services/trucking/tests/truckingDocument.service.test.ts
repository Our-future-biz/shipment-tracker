import { beforeEach, describe, expect, it, vi } from "vitest";

// Consignment documents against the in-memory repositories (truckingFakes): one POD per
// consignment, replaced only by a manager with a reason; a refused save leaves no file behind.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: {}, shipments: {}, quotes: {}, holidays: {} }));
vi.mock("../db/db", async () => (await import("./truckingFakes")).dbModule);
vi.mock("../repositories/consignment.repository", async (orig) => ({
  ...(await orig<object>()),
  consignmentRepository: (await import("./truckingFakes")).consignmentRepository,
}));
vi.mock("../repositories/trip.repository", async () => ({ tripRepository: (await import("./truckingFakes")).tripRepository }));
vi.mock("../repositories/leg.repository", async () => ({ legRepository: (await import("./truckingFakes")).legRepository }));
vi.mock("../repositories/truckingDocument.repository", async () => ({ truckingDocumentRepository: (await import("./truckingFakes")).truckingDocumentRepository }));
vi.mock("../repositories/event.repository", async () => (await import("./truckingFakes")).eventModule);
vi.mock("../storage/documentBucket", () => ({ truckingDocumentBucket: { upload: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), download: vi.fn() } }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { truckingDocumentService } from "../services/truckingDocument.service";
import { consignmentRepository } from "../repositories/consignment.repository";
import { truckingDocumentBucket } from "../storage/documentBucket";
import { COMPANY, CUSTOMER, SHIPMENT, TX, eventsOf, load, manager, resetStore, stop, store, user } from "./truckingFakes";

const PDF = Buffer.from("%PDF-1.7\n%…").toString("base64");

async function consignment() {
  return consignmentRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: "TCZ2026000009",
    shipmentId: SHIPMENT,
    jobNumber: "CZ00000042",
    customerId: CUSTOMER,
    customerName: "Alfa",
    status: "DELIVERED",
    pickupDate: "2026-10-16",
    pickup: { ...stop(), id: "s1", kind: "PICKUP", actualArrival: null, actualDeparture: null },
    delivery: { ...stop(), id: "s2", kind: "DELIVERY", actualArrival: null, actualDeparture: null },
    load: load(),
    sell: { source: "TARIFF", total: 12000, currency: "CZK" } as never,
    sellCzk: 12000,
  });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("one POD per consignment (decision 13)", () => {
  it("refuses a user's second POD before storing anything; other documents are added freely", async () => {
    const c = await consignment();
    await truckingDocumentService.upload(user, c.id, { kind: "POD", fileName: "pod.pdf", fileBase64: PDF });
    vi.mocked(truckingDocumentBucket.upload).mockClear();
    await expect(truckingDocumentService.upload(user, c.id, { kind: "POD", fileName: "pod2.pdf", fileBase64: PDF })).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringContaining("A manager can replace it"),
    });
    expect(truckingDocumentBucket.upload).not.toHaveBeenCalled();
    await truckingDocumentService.upload(user, c.id, { kind: "CMR", fileName: "cmr.pdf", fileBase64: PDF });
    expect(store.documents.map((d) => d.kind)).toEqual(["POD", "CMR"]);
  });

  it("a manager replaces the POD with a reason: the old one leaves the list, the event names both", async () => {
    const c = await consignment();
    const pod = await truckingDocumentService.upload(user, c.id, { kind: "POD", fileName: "blurry.jpg", fileBase64: PDF });
    await expect(truckingDocumentService.replacePod(user, pod.id, { fileName: "pod.pdf", fileBase64: PDF, reason: "unreadable" })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(truckingDocumentService.replacePod(manager, pod.id, { fileName: "pod.pdf", fileBase64: PDF, reason: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    const replaced = await truckingDocumentService.replacePod(manager, pod.id, { fileName: "pod.pdf", fileBase64: PDF, reason: "first photo unreadable" });
    expect((await truckingDocumentService.list(user, c.id)).map((d) => [d.kind, d.fileName])).toEqual([["POD", "pod.pdf"]]);
    expect(eventsOf("document_replaced")[0]).toMatchObject({
      consignmentId: c.id,
      byName: "Jana Nováková",
      payload: expect.objectContaining({ reason: "first photo unreadable", facts: expect.objectContaining({ documentId: replaced.id, replacedDocumentId: pod.id }) }),
    });
    // The replaced POD cannot be replaced again; the new one can.
    await expect(truckingDocumentService.replacePod(manager, pod.id, { fileName: "x.pdf", fileBase64: PDF, reason: "again" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("removes the stored file when the save fails", async () => {
    const c = await consignment();
    const pod = await truckingDocumentService.upload(user, c.id, { kind: "POD", fileName: "pod.pdf", fileBase64: PDF });
    // Someone else replaced it meanwhile: the retire finds no live row.
    const { truckingDocumentRepository } = await import("../repositories/truckingDocument.repository");
    vi.mocked(truckingDocumentRepository.retire).mockResolvedValueOnce(null);
    vi.mocked(truckingDocumentBucket.upload).mockClear();
    await expect(truckingDocumentService.replacePod(manager, pod.id, { fileName: "new.pdf", fileBase64: PDF, reason: "better copy" })).rejects.toMatchObject({ code: "aborted" });
    const key = vi.mocked(truckingDocumentBucket.upload).mock.calls[0]![0];
    expect(truckingDocumentBucket.remove).toHaveBeenCalledWith(key);
  });
});
