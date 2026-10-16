import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The haulier's page runs for real against in-memory repositories (truckingFakes): the token,
// the one answer, and the POD upload with its stamps and what it owes the job.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: {}, shipments: {}, quotes: {}, holidays: {} }));
vi.mock("../db/db", async () => (await import("./truckingFakes")).dbModule);
vi.mock("../repositories/consignment.repository", async (orig) => ({
  ...(await orig<object>()),
  consignmentRepository: (await import("./truckingFakes")).consignmentRepository,
}));
vi.mock("../repositories/trip.repository", async () => ({ tripRepository: (await import("./truckingFakes")).tripRepository }));
vi.mock("../repositories/truckingDocument.repository", async () => ({ truckingDocumentRepository: (await import("./truckingFakes")).truckingDocumentRepository }));
vi.mock("../repositories/truckingOutbox.repository", async () => ({ truckingOutboxRepository: (await import("./truckingFakes")).truckingOutboxRepository }));
vi.mock("../repositories/event.repository", async () => (await import("./truckingFakes")).eventModule);
vi.mock("../repositories/exception.repository", async () => ({ exceptionRepository: (await import("./truckingFakes")).exceptionRepository }));
vi.mock("../repositories/internal.repository", async () => ({ internalRepository: (await import("./truckingFakes")).internalRepository }));
vi.mock("../services/rate.service", () => ({ rateService: { rate: vi.fn() }, eurRate: vi.fn() }));
vi.mock("../services/settings.service", async () => ({ settingsService: { get: vi.fn(async () => (await import("./truckingFakes")).settings()) } }));
vi.mock("../services/truckingOutbox.service", () => ({ deliverDue: vi.fn(async () => ({ sent: 0, retry: 0, failed: 0 })) }));
vi.mock("../storage/documentBucket", () => ({ truckingDocumentBucket: { upload: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), download: vi.fn() } }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "") }));

import { publicOrderService, LINK_INVALID } from "../services/publicOrder.service";
import { consignmentRepository } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { truckingDocumentBucket } from "../storage/documentBucket";
import { newToken } from "../lib/haulierToken";
import { COMPANY, CUSTOMER, HAULIER, SHIPMENT, TX, eventsOf, load, outboxOf, resetStore, stop, store } from "./truckingFakes";

const SENDER = "00000000-0000-0000-0000-000000000003";
const PDF = Buffer.from("%PDF-1.7\n%…").toString("base64");
const HTML = Buffer.from("<html><script>alert(1)</script></html>").toString("base64");

async function ordered(opts: { expiresAt?: Date; confirmed?: boolean } = {}) {
  const trip = await tripRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: "LCZ2026000002",
    haulierCustomerId: HAULIER,
    haulierName: "Bravo Trans",
    plannedPickupDate: "2026-10-16",
    status: opts.confirmed ? "CONFIRMED" : "ORDERED",
    orderSentAt: new Date("2026-10-14T08:00:00Z"),
    orderSentByUserId: SENDER,
    orderSentByRole: "user",
    ourCompanyName: "SSL Forwarding s.r.o.",
    confirmedAt: opts.confirmed ? new Date("2026-10-14T09:00:00Z") : null,
    buy: { source: "MANUAL", total: 9000, currency: "CZK" } as never,
  });
  const c = await consignmentRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: "TCZ2026000005",
    shipmentId: SHIPMENT,
    jobNumber: "CZ00000042",
    customerId: CUSTOMER,
    customerName: "Alfa",
    status: opts.confirmed ? "CONFIRMED" : "ORDERED",
    pickupDate: "2026-10-16",
    pickup: { ...stop(), postcode: "11000", id: "s1", kind: "PICKUP", actualArrival: null, actualDeparture: null },
    delivery: { ...stop({ city: "Brno" }), postcode: "60200", id: "s2", kind: "DELIVERY", actualArrival: null, actualDeparture: null },
    load: load(),
    sell: { source: "TARIFF", total: 12000, currency: "CZK" } as never,
    sellCzk: 12000,
    tripId: trip.id,
    confirmedAt: opts.confirmed ? new Date("2026-10-14T09:00:00Z") : null,
  });
  const { token, hash } = newToken();
  await tripRepository.renewLink(TX as never, COMPANY, trip.id, hash, opts.expiresAt ?? new Date("2026-11-15T22:59:59Z"));
  return { trip, c, token };
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("the link", () => {
  it("shows the order without the customer's price: the buy price only, no site ids", async () => {
    const { token } = await ordered();
    const order = await publicOrderService.get(token);
    expect(order).toMatchObject({
      orderNumber: "LCZ2026000002",
      haulierName: "Bravo Trans",
      ourCompany: "SSL Forwarding s.r.o.",
      status: "AWAITING_CONFIRMATION",
      agreedPrice: { total: 9000, currency: "CZK" },
      podUploaded: false,
      linkExpiresAt: "2026-11-15T22:59:59.000Z",
    });
    expect(order.pickup).not.toHaveProperty("id");
    expect(order.pickup).not.toHaveProperty("siteId");
    expect(JSON.stringify(order)).not.toContain("12000");
  });

  it("answers the same 404 for an unknown, malformed, expired or revoked link and a cancelled trip", async () => {
    const { token, trip } = await ordered();
    const expired = await ordered({ expiresAt: new Date("2026-10-15T09:00:00Z") });
    const notFound = { code: "not_found", message: LINK_INVALID };
    await expect(publicOrderService.get(newToken().token)).rejects.toMatchObject(notFound);
    await expect(publicOrderService.get("short")).rejects.toMatchObject(notFound);
    await expect(publicOrderService.get(expired.token)).rejects.toMatchObject(notFound);
    store.trips.find((t) => t.id === trip.id)!.cancelledAt = new Date();
    await expect(publicOrderService.get(token)).rejects.toMatchObject(notFound);
    const renewed = await ordered();
    await tripRepository.renewLink(TX as never, COMPANY, renewed.trip.id, newToken().hash, new Date("2026-12-01T00:00:00Z"));
    await expect(publicOrderService.get(renewed.token)).rejects.toMatchObject(notFound);
  });
});

describe("confirm or reject, once", () => {
  it("confirms through the link: trip and consignment confirmed by the haulier", async () => {
    const { token, c } = await ordered();
    const order = await publicOrderService.respond(token, { action: "CONFIRM", name: "Eva", reason: "" });
    expect(order.status).toBe("CONFIRMED");
    expect(store.trips[0]).toMatchObject({ status: "CONFIRMED", confirmedVia: "LINK", confirmedBy: "Eva (haulier)" });
    expect(store.consignments.find((x) => x.id === c.id)).toMatchObject({ status: "CONFIRMED", confirmedBy: "Eva (haulier)" });
    await expect(publicOrderService.respond(token, { action: "REJECT", name: "Eva", reason: "No truck" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "This transport order was already answered",
    });
  });

  it("a rejection needs the name and the reason, and shows on the worklist", async () => {
    const { token } = await ordered();
    await expect(publicOrderService.respond(token, { action: "REJECT", name: "Eva", reason: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(publicOrderService.respond(token, { action: "REJECT", name: "", reason: "No truck" })).rejects.toMatchObject({ code: "invalid_argument" });
    const order = await publicOrderService.respond(token, { action: "REJECT", name: "Eva", reason: "No truck free" });
    expect(order.status).toBe("REJECTED");
    expect(eventsOf("transport_order_rejected")[0]).toMatchObject({ byName: "Eva (haulier)", payload: expect.objectContaining({ reason: "No truck free" }) });
  });
});

describe("POD through the link", () => {
  it("stores the file and stamps picked up, delivered and POD received (source HAULIER); owes the job its dates and Billing", async () => {
    const { token, c } = await ordered({ confirmed: true });
    const order = await publicOrderService.pod(token, { fileName: "pod.pdf", fileBase64: PDF, deliveredAt: "2026-10-15T08:30:00Z", receiverName: "K. Malá" });
    expect(order).toMatchObject({ status: "DELIVERED", podUploaded: true });
    expect(truckingDocumentBucket.upload).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${COMPANY}/${c.id}/`)), expect.any(Buffer), { contentType: "application/pdf" });
    expect(store.documents[0]).toMatchObject({ kind: "POD", source: "HAULIER", contentType: "application/pdf", uploadedBy: "Bravo Trans (haulier), received by K. Malá" });
    const row = store.consignments.find((x) => x.id === c.id)!;
    expect(row).toMatchObject({ status: "READY_TO_BILL", podSource: "HAULIER" });
    expect(row.pickedUpAt!.toISOString()).toBe("2026-10-15T08:30:00.000Z");
    expect(row.deliveredAt!.toISOString()).toBe("2026-10-15T08:30:00.000Z");
    expect(row.podReceivedAt!.toISOString()).toBe("2026-10-15T10:00:00.000Z");
    expect(store.trips[0]!.status).toBe("DONE");
    // Sent to Shipments as the user who sent the transport order.
    expect(outboxOf("delivered")).toEqual([expect.objectContaining({ payload: { actualDeliveryDate: "2026-10-15" }, actingUserId: SENDER, actingRole: "user" })]);
    expect(outboxOf("billing")).toEqual([expect.objectContaining({ shipmentId: SHIPMENT, actingUserId: SENDER })]);
    expect(eventsOf("stamp_set").map((e) => (e.payload as { facts: { kind: string } }).facts.kind)).toEqual(["pickedUp", "delivered", "podReceived"]);
  });

  it("one POD per stop: a second is refused before anything is stored (a manager replaces it in the app)", async () => {
    const { token } = await ordered({ confirmed: true });
    await publicOrderService.pod(token, { fileName: "pod.pdf", fileBase64: PDF, deliveredAt: null, receiverName: "" });
    vi.mocked(truckingDocumentBucket.upload).mockClear();
    await expect(publicOrderService.pod(token, { fileName: "pod2.pdf", fileBase64: PDF, deliveredAt: null, receiverName: "" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringContaining("A POD for this stop is already uploaded"),
    });
    expect(truckingDocumentBucket.upload).not.toHaveBeenCalled();
    expect(store.documents).toHaveLength(1);
    expect(eventsOf("stamp_set")).toHaveLength(3);
    expect(outboxOf("billing")).toHaveLength(1);
  });

  it("only once the order is confirmed: nothing is stamped or stored before", async () => {
    const { token } = await ordered();
    await expect(publicOrderService.pod(token, { fileName: "pod.pdf", fileBase64: PDF, deliveredAt: null, receiverName: "" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Confirm the transport order first: the POD can be uploaded once the order is confirmed.",
    });
    expect(truckingDocumentBucket.upload).not.toHaveBeenCalled();
    expect(eventsOf("stamp_set")).toHaveLength(0);
  });

  it("runs the portal's stamp rules before storing, and removes the file when the transaction fails", async () => {
    const { token, c } = await ordered({ confirmed: true });
    // The trip's order is taken back meanwhile: the pick-up may not be stamped.
    const row = store.trips[0]!;
    row.orderSentAt = null;
    await expect(publicOrderService.pod(token, { fileName: "pod.pdf", fileBase64: PDF, deliveredAt: null, receiverName: "" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Send the transport order before stamping the pick-up",
    });
    expect(truckingDocumentBucket.upload).not.toHaveBeenCalled();
    row.orderSentAt = new Date("2026-10-14T08:00:00Z");
    // A stamp refused inside the transaction (the consignment changed meanwhile): the stored file goes.
    vi.spyOn(consignmentRepository, "update").mockResolvedValueOnce(null);
    await expect(publicOrderService.pod(token, { fileName: "pod.pdf", fileBase64: PDF, deliveredAt: null, receiverName: "" })).rejects.toBeTruthy();
    const key = vi.mocked(truckingDocumentBucket.upload).mock.calls[0]![0];
    expect(key).toMatch(new RegExp(`^${COMPANY}/${c.id}/`));
    expect(truckingDocumentBucket.remove).toHaveBeenCalledWith(key);
  });

  it("takes photos and PDFs only, at most 10 MB, and not on a rejected order", async () => {
    const { token } = await ordered({ confirmed: true });
    await expect(publicOrderService.pod(token, { fileName: "pod.pdf", fileBase64: HTML, deliveredAt: null, receiverName: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    big.write("%PDF-");
    await expect(publicOrderService.pod(token, { fileName: "pod.pdf", fileBase64: big.toString("base64"), deliveredAt: null, receiverName: "" })).rejects.toMatchObject({
      message: "The file is larger than 10 MB",
    });
    const rejected = await ordered();
    await publicOrderService.respond(rejected.token, { action: "REJECT", name: "Eva", reason: "No truck" });
    await expect(publicOrderService.pod(rejected.token, { fileName: "pod.pdf", fileBase64: PDF, deliveredAt: null, receiverName: "" })).rejects.toMatchObject({
      message: "This transport order was rejected",
    });
    expect(store.documents).toHaveLength(0);
  });
});
