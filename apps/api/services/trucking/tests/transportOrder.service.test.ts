import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The transport order and CMR run for real against in-memory repositories (truckingFakes); the
// PDF builders are stand-ins that record the document they are given.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  customers: { customerGet: vi.fn(), contactList: vi.fn(), _internalHaulierList: vi.fn() },
  invoicing: { invoiceProfileGet: vi.fn() },
  sales: { prefGet: vi.fn() },
  shipments: {},
  quotes: {},
  holidays: { _internalHolidaysCzNational: vi.fn(async () => ({ dates: [] })) },
}));
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
vi.mock("../repositories/haulier.repository", () => ({ haulierRepository: { findMany: vi.fn(async () => []) } }));
vi.mock("../services/haulier.service", async (orig) => ({ ...(await orig<object>()), haulierService: { get: vi.fn() } }));
vi.mock("../services/rate.service", () => ({ rateService: { rate: vi.fn() }, eurRate: vi.fn() }));
vi.mock("../services/settings.service", async () => ({ settingsService: { get: vi.fn(async () => (await import("./truckingFakes")).settings()) } }));
vi.mock("../services/truckingOutbox.service", () => ({ deliverDue: vi.fn(async () => ({ sent: 0, retry: 0, failed: 0 })) }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));
vi.mock("../lib/transportOrderPdf", () => ({ buildTransportOrderPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock("../lib/cmrPdf", () => ({ buildCmrPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock("../../../lib/email", () => ({ emailConfigured: vi.fn(() => false), sendMail: vi.fn(async () => ({ sent: false, error: "E-mail sending is disabled", providerId: "" })) }));

import { customers, invoicing, sales } from "~encore/clients";
import { transportOrderService } from "../services/transportOrder.service";
import { haulierService } from "../services/haulier.service";
import { consignmentRepository } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { buildTransportOrderPdf } from "../lib/transportOrderPdf";
import { buildCmrPdf } from "../lib/cmrPdf";
import { emailConfigured, sendMail } from "../../../lib/email";
import { hashToken } from "../lib/haulierToken";
import type { HaulierDetail } from "../interfaces/interfaces";
import type { TruckingConsignmentRecord } from "../schemas/truckingConsignment.schema";
import type { TransportOrderDoc } from "../lib/documentTypes";
import { COMPANY, CUSTOMER, HAULIER, SHIPMENT, TX, eventsOf, load, manager, resetStore, stop, store, user } from "./truckingFakes";

const PIN = "482913";

const haulier = (over: Partial<HaulierDetail> = {}): HaulierDetail =>
  ({ customerId: HAULIER, companyName: "Bravo Trans s.r.o.", ico: "12345678", dic: "CZ12345678", city: "Brno", profile: { adrCapable: true, paymentDays: 45 }, status: "ok", issues: [], ...over }) as HaulierDetail;

async function planned(over: Partial<TruckingConsignmentRecord> = {}) {
  const trip = await tripRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: "LCZ2026000007",
    haulierCustomerId: HAULIER,
    haulierName: "Bravo Trans s.r.o.",
    plannedPickupDate: "2026-10-16",
    status: "DRAFT",
    vehicleTypeCode: "solo_72_lift",
    tractorPlate: "1AB2345",
    trailerPlate: "",
    driverName: "Petr Svoboda",
    driverPhone: "+420 603 111 222",
    buy: { source: "MANUAL", total: 9000, totalCzk: 9000, currency: "CZK", lines: [], tariffName: "", overrideReason: "spot" } as never,
    buyCzk: 9000,
  });
  const c = await consignmentRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: "TCZ2026000003",
    shipmentId: SHIPMENT,
    jobNumber: "CZ00000042",
    customerId: CUSTOMER,
    customerName: "Alfa",
    serviceLevel: "D1",
    status: "PLANNED",
    pickupDate: "2026-10-16",
    pickup: { ...stop({ windowFrom: "2026-10-16T06:00:00Z", windowTo: "2026-10-16T10:00:00Z" }), postcode: "11000", id: "s1", kind: "PICKUP", actualArrival: null, actualDeparture: null },
    delivery: { ...stop({ name: "Beta a.s.", city: "Brno", avizaceRequired: true }), postcode: "60200", id: "s2", kind: "DELIVERY", actualArrival: null, actualDeparture: null },
    load: load({ adr: true, adrUn: "1203", adrClass: "3", adrPackingGroup: "II", tailLift: true }),
    sellCzk: 12000,
    estBuyCzk: 9000,
    tripId: trip.id,
    ...over,
  });
  store.written = [];
  return { trip, c };
}

const lastDoc = () => vi.mocked(buildTransportOrderPdf).mock.calls.at(-1)![0] as TransportOrderDoc;

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  vi.mocked(emailConfigured).mockReturnValue(false);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  vi.mocked(haulierService.get).mockResolvedValue(haulier());
  vi.mocked(customers.customerGet).mockResolvedValue({ customer: { registeredAddress: "Hlavní 5, Brno, 60200", country: "CZ" } } as never);
  vi.mocked(customers.contactList).mockResolvedValue({ data: [{ name: "Eva Dispečerka", phone: "+420 777 1", email: "dispo@bravo.cz", isMain: true }] } as never);
  vi.mocked(invoicing.invoiceProfileGet).mockResolvedValue({
    profile: { companyName: "SSL Forwarding s.r.o.", street: "Na Příkopě 1", city: "Praha 1", postalCode: "11000", country: "CZ", ico: "87654321", dic: "CZ87654321", email: "ops@ssl.cz", phone: "+420 222 333 444" },
  } as never);
  vi.mocked(sales.prefGet).mockResolvedValue({ value: null });
});

afterEach(() => vi.useRealTimers());

describe("transport order: the document", () => {
  it("builds the order from the trip, the consignment and the parties, with the typed PIN", async () => {
    const { trip } = await planned();
    const file = await transportOrderService.pdf(user, trip.id, { pickupPin: PIN, language: "both" });
    expect(file).toEqual({ fileName: "LCZ2026000007.pdf", fileBase64: "JVBERg==", contentType: "application/pdf" });
    const doc = lastDoc();
    expect(doc).toMatchObject({
      language: "both",
      orderNumber: "LCZ2026000007",
      consignmentRef: "TCZ2026000003",
      jobNumber: "CZ00000042",
      plannedPickupDate: "2026-10-16",
      pickupPin: PIN,
      podLink: null,
      plates: "1AB2345",
      driver: "Petr Svoboda, +420 603 111 222",
      vehicleText: "Solo truck 7.2 m with tail lift, čelo / tail lift",
      agreedPrice: { total: 9000, currency: "CZK" },
    });
    expect(doc.ourCompany).toEqual({ name: "SSL Forwarding s.r.o.", street: "Na Příkopě 1", postcode: "110 00", city: "Praha 1", country: "CZ", ico: "87654321", dic: "CZ87654321", contact: "+420 222 333 444, ops@ssl.cz" });
    expect(doc.haulier).toMatchObject({ name: "Bravo Trans s.r.o.", ico: "12345678", dic: "CZ12345678", street: "Hlavní 5, Brno, 60200", contact: "Eva Dispečerka, +420 777 1, dispo@bravo.cz" });
    expect(doc.pickup).toMatchObject({ postcode: "110 00", windowText: "16 Oct 2026, 08:00–12:00", contact: "Jan Novák, +420 777 000 111" });
    expect(doc.delivery.avizaceRequired).toBe(true);
    expect(doc.load.adr).toEqual({ un: "1203", className: "3", packingGroup: "II" });
    expect(doc.paymentTerms).toContain("45");
    // SSL terms, forwarder liability (Civil Code), ADR duty, POD + payment, confidentiality, PIN secrecy.
    expect(doc.terms).toHaveLength(6);
    expect(doc.terms[0]).toContain("SSL");
    expect(doc.terms[1]).toContain("89/2012");
    expect(doc.terms[2]).toContain("UN 1203");
    expect(doc.terms[3]).toContain("POD");
    expect(doc.terms[4]).toContain("confidential");
  });

  it("falls back to the company details printed on quotations", async () => {
    const { trip } = await planned();
    vi.mocked(invoicing.invoiceProfileGet).mockRejectedValue(new Error("down"));
    vi.mocked(sales.prefGet).mockResolvedValue({ value: { name: "SSL Quote s.r.o.", address: "Dlouhá 2\n110 00 Praha", companyId: "111", vatId: "CZ111", phone: "+420 1", email: "q@ssl.cz" } });
    await transportOrderService.pdf(user, trip.id, { pickupPin: null, language: "en" });
    expect(lastDoc().ourCompany).toMatchObject({ name: "SSL Quote s.r.o.", street: "Dlouhá 2", city: "110 00 Praha", ico: "111", dic: "CZ111" });
    expect(lastDoc().terms).toHaveLength(5);
  });

  it("never stores or logs the PIN: only that it was printed", async () => {
    const { trip } = await planned();
    await transportOrderService.pdf(user, trip.id, { pickupPin: PIN, language: "cs" });
    await transportOrderService.send(user, trip.id, { pickupPin: PIN, language: "cs", to: ["dispo@bravo.cz"], note: "" });
    expect(store.written.join("\n")).not.toContain(PIN);
    expect(JSON.stringify(store.events)).not.toContain(PIN);
    expect(JSON.stringify(store.trips)).not.toContain(PIN);
    expect(eventsOf("transport_order_printed")[0]!.payload).toMatchObject({ facts: { pinPrinted: true } });
    expect(eventsOf("transport_order_sent")[0]!.payload).toMatchObject({ facts: { pinPrinted: true } });
    expect(store.trips[0]!.pinPrinted).toBe(true);
  });

  it("refuses a malformed PIN and an unknown language", async () => {
    const { trip } = await planned();
    await expect(transportOrderService.pdf(user, trip.id, { pickupPin: "12ab", language: "cs" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(transportOrderService.pdf(user, trip.id, { pickupPin: null, language: "de" as never })).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("transport order: the gates", () => {
  it("is refused while the margin is below the floor without a manager's approval", async () => {
    const { trip, c } = await planned({ sellCzk: 9300 });
    await expect(transportOrderService.pdf(user, trip.id, { pickupPin: null, language: "cs" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "The margin is below the floor: a manager must approve it before the transport order goes out",
    });
    await expect(transportOrderService.send(user, trip.id, { pickupPin: null, language: "cs", to: [], note: "" })).rejects.toMatchObject({ code: "failed_precondition" });
    store.consignments.find((x) => x.id === c.id)!.marginApproval = { byUserId: manager.userID, byName: "M", at: "", reason: "ok", marginCzk: 300 };
    await expect(transportOrderService.pdf(user, trip.id, { pickupPin: null, language: "cs" })).resolves.toMatchObject({ contentType: "application/pdf" });
  });

  it("is refused while the haulier is blocked", async () => {
    const { trip } = await planned();
    vi.mocked(haulierService.get).mockResolvedValue(haulier({ status: "blocked", issues: [{ code: "blocked", severity: "block", message: "Blocked: unpaid claims" }] }));
    await expect(transportOrderService.pdf(user, trip.id, { pickupPin: null, language: "cs" })).rejects.toMatchObject({ message: "Bravo Trans s.r.o. cannot be used: Blocked: unpaid claims" });
  });
});

describe("transport order: send and confirm", () => {
  it("records the order as sent while e-mail is off, renews the haulier link and orders the consignment", async () => {
    const { trip, c } = await planned();
    const res = await transportOrderService.send(user, trip.id, { pickupPin: null, language: "cs", to: ["dispo@bravo.cz"], note: "Ramp 3" });
    expect(res.recordedOnly).toBe(true);
    expect(res.file.contentType).toBe("application/pdf");
    // E-mail is off: nothing is handed to the mailer, the user sends the PDF.
    expect(sendMail).not.toHaveBeenCalled();
    expect(res.trip).toMatchObject({ status: "ORDERED", transportOrder: { sentBy: "Jana Nováková", recordedOnly: true, pinPrinted: false } });
    expect(res.trip.transportOrder!.podLinkExpiresAt).toBe("2026-11-15T22:59:59.000Z");
    expect(store.consignments.find((x) => x.id === c.id)!.status).toBe("ORDERED");
    // The link printed on the order carries the token; only its hash is stored.
    const link = lastDoc().podLink!;
    const token = link.split("/").pop()!;
    expect(link).toMatch(/\/haulier\/order\/[A-Za-z0-9_-]{43}$/);
    expect(store.links).toHaveLength(1);
    expect(store.links[0]!.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(store.links)).not.toContain(token);
    // Sending again renews the link (the old one is revoked).
    await transportOrderService.send(user, trip.id, { pickupPin: null, language: "cs", to: [], note: "" });
    expect(store.links.filter((l) => !l.revokedAt)).toHaveLength(1);
    expect(store.links).toHaveLength(2);
  });

  it("stores the link before anything is mailed: the mail carries the stored link, keyed by the new version", async () => {
    vi.mocked(emailConfigured).mockReturnValue(true);
    vi.mocked(sendMail).mockImplementationOnce(async () => {
      // When the mail goes out, the link it carries is already stored.
      expect(store.links).toHaveLength(1);
      return { sent: true, error: "", providerId: "m1" };
    });
    const { trip } = await planned();
    const res = await transportOrderService.send(user, trip.id, { pickupPin: null, language: "cs", to: ["dispo@bravo.cz"], note: "" });
    expect(res.recordedOnly).toBe(false);
    const mail = vi.mocked(sendMail).mock.calls[0]![0];
    const token = mail.text.match(/haulier\/order\/([A-Za-z0-9_-]{43})/)![1]!;
    expect(store.links[0]!.tokenHash).toBe(hashToken(token));
    expect(mail.idempotencyKey).toBe(`${trip.id}:${store.trips.find((t) => t.id === trip.id)!.version}`);
  });

  it("a send that loses the race (the trip changed meanwhile) mails nothing and stores no link: no dead link", async () => {
    vi.mocked(emailConfigured).mockReturnValue(true);
    const { trip } = await planned();
    // Another send commits while this one builds its PDF: the version it read is stale when it locks the trip.
    vi.mocked(tripRepository.lock).mockImplementationOnce(async (_tx, _c, id) => {
      const row = store.trips.find((t) => t.id === id)!;
      row.version += 1;
      return { ...row };
    });
    await expect(transportOrderService.send(user, trip.id, { pickupPin: null, language: "cs", to: ["dispo@bravo.cz"], note: "" })).rejects.toMatchObject({ code: "aborted" });
    expect(sendMail).not.toHaveBeenCalled();
    expect(store.links).toHaveLength(0);
  });

  it("a mail that fails after the send is recorded: recorded only, with the reason; the stored link stays", async () => {
    vi.mocked(emailConfigured).mockReturnValue(true);
    vi.mocked(sendMail).mockResolvedValueOnce({ sent: false, error: "Provider down", providerId: "" });
    const { trip } = await planned();
    const res = await transportOrderService.send(user, trip.id, { pickupPin: null, language: "cs", to: ["dispo@bravo.cz"], note: "" });
    expect(res.recordedOnly).toBe(true);
    expect(store.trips.find((t) => t.id === trip.id)!.orderRecordedOnly).toBe(true);
    expect(store.links.filter((l) => !l.revokedAt)).toHaveLength(1);
    expect(eventsOf("transport_order_sent").map((e) => (e.payload as { summary: string }).summary)).toContainEqual(expect.stringContaining("the e-mail was not sent (Provider down)"));
  });

  it("refuses a recipient that is no e-mail address", async () => {
    const { trip } = await planned();
    await expect(transportOrderService.send(user, trip.id, { pickupPin: null, language: "cs", to: ["not-an-address"], note: "" })).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("records a confirmation given by phone once; it stamps the consignment confirmed", async () => {
    const { trip, c } = await planned();
    await expect(transportOrderService.confirm(user, trip.id, "")).rejects.toMatchObject({ message: "Send the transport order first" });
    await transportOrderService.send(user, trip.id, { pickupPin: null, language: "cs", to: [], note: "" });
    const t = await transportOrderService.confirm(user, trip.id, "Called dispatcher");
    expect(t).toMatchObject({ status: "CONFIRMED", transportOrder: { confirmedVia: "USER" } });
    expect(store.consignments.find((x) => x.id === c.id)).toMatchObject({ status: "CONFIRMED", confirmedBy: "Jana Nováková" });
    await expect(transportOrderService.confirm(user, trip.id, "")).rejects.toMatchObject({ code: "already_exists" });
  });
});

describe("CMR", () => {
  it("prints sender and consignee from the stops and the haulier as carrier", async () => {
    const { c } = await planned();
    const file = await transportOrderService.cmr(user, c.id);
    expect(file.fileName).toBe("CMR-TCZ2026000003.pdf");
    const doc = vi.mocked(buildCmrPdf).mock.calls[0]![0];
    expect(doc).toMatchObject({ language: "both", consignmentRef: "TCZ2026000003", jobNumber: "CZ00000042", plates: "1AB2345" });
    expect(doc.sender).toMatchObject({ name: "Alfa s.r.o.", postcode: "110 00", city: "Praha" });
    expect(doc.consignee).toMatchObject({ name: "Beta a.s.", postcode: "602 00", city: "Brno" });
    expect(doc.carrier).toMatchObject({ name: "Bravo Trans s.r.o.", ico: "12345678" });
    expect(doc.documentsAttached).toContain("ADR");
    expect(doc.instructions).toContain("Avizace");
    expect(eventsOf("cmr_printed")).toHaveLength(1);
  });
});
