import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What the shipments service does about the sales quote a shipment names - on create, on a
// changed Sales Number and on delete - run for real against stand-ins for its repositories, for
// the other services and for the service that tells quotes about their shipments.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  auth: { usersList: vi.fn(), userLookup: vi.fn(), departmentList: vi.fn() },
  customers: { customerUpdate: vi.fn(), customerGet: vi.fn(), addressList: vi.fn(), contactList: vi.fn() },
  invoicing: { invoicingImportQuote: vi.fn(), openInvoiceCount: vi.fn(), _internalShipmentBillingStart: vi.fn(), _internalInvoicedShipments: vi.fn(), _internalChargeCount: vi.fn(), _internalPaidSupplierInvoices: vi.fn(), _internalReleaseCheck: vi.fn(), _internalLateChargeShipments: vi.fn() },
  quotes: { salesQuoteGet: vi.fn(), _internalSalesQuoteData: vi.fn() },
  warehouse: { _internalPickupPlates: vi.fn(), warehouseSectionGet: vi.fn() },
  holidays: { _internalHolidaysCzNational: vi.fn() },
}));
// The signed-in user, when there is one: the role decides whether the Warehouse Concept's plate is asked for.
const signedIn = vi.hoisted(() => ({ role: null as string | null }));
vi.mock("~encore/auth", () => ({ getAuthData: () => (signedIn.role ? { userID: "u1", companyID: "c1", role: signedIn.role } : null) }));
// A shipment's write turn: its work runs at once, handed this stand-in for the transaction.
const TX = vi.hoisted(() => ({ fake: "tx" }));
vi.mock("../../repositories/shipment.repository", () => ({
  ATTENTION_TILE: "attention",
  INVOICING_FILTERS_WITH_LATE_CHARGES: ["all", "billing"],
  shipmentRepository: {
    createWithJobNumber: vi.fn(),
    createFromQuote: vi.fn(),
    setBookedDimensionsOnce: vi.fn(),
    createForHouseBol: vi.fn(),
    getByIdForCompany: vi.fn(),
    updateForCompany: vi.fn(),
    findByMasterJobId: vi.fn(async () => []),
    softDeleteForCompany: vi.fn(),
    softDeleteWithEvent: vi.fn(),
    customerRollups: vi.fn(),
    customerFacts: vi.fn(),
    truckPlate: vi.fn(),
    liveBySalesNumbers: vi.fn(),
    liveBySalesNumber: vi.fn(),
    peopleOf: vi.fn(),
    rewritePeople: vi.fn(),
    setTruckPlate: vi.fn(),
    referencesOf: vi.fn(),
    referenceInTurn: vi.fn(),
    getInTurn: vi.fn(),
    listFiltered: vi.fn(),
    tileCounts: vi.fn(),
    needsAttentionCandidates: vi.fn(),
    renameJobNumber: vi.fn(),
    markJobNumberFinal: vi.fn(),
    openJobIdsOfCustomer: vi.fn(),
    writeTurn: vi.fn(async (_shipmentId: string, _companyId: string, work: (tx: unknown) => Promise<unknown>) => work(TX)),
    moveSalesNumber: vi.fn(async () => true),
    searchMain: vi.fn(),
  },
}));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: { documentTypesByShipmentIds: vi.fn() } }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: { create: vi.fn(), listByShipmentId: vi.fn() } }));
vi.mock("../../repositories/shipmentTask.repository", () => ({ shipmentTaskRepository: { upsert: vi.fn() } }));
vi.mock("../../repositories/shipmentTrackingEvent.repository", () => ({
  shipmentTrackingEventRepository: { findSameDay: vi.fn(async () => null), add: vi.fn(), resolveOpen: vi.fn(), supersede: vi.fn(), settle: vi.fn(), latestPerShipment: vi.fn(async () => new Map()), factsOfKinds: vi.fn() },
}));
vi.mock("../../repositories/masterJob.repository", () => ({ masterJobRepository: { mczNumbersByIds: vi.fn(), getByIdForCompany: vi.fn() } }));
vi.mock("../../repositories/shipmentRefCounter.repository", () => ({ shipmentRefCounterRepository: { peek: vi.fn() } }));
vi.mock("../../repositories/container.repository", () => ({
  containerRepository: { syncForShipment: vi.fn(async () => new Map()), listByShipmentId: vi.fn(), listByShipmentIds: vi.fn(), searchMain: vi.fn() },
}));
vi.mock("../../repositories/cargoItem.repository", () => ({
  cargoItemRepository: { replaceForShipment: vi.fn(), listByShipmentId: vi.fn(), listByShipmentIds: vi.fn(), assignLooseToContainer: vi.fn(), detachFromContainers: vi.fn() },
}));
vi.mock("../../repositories/cargoDimension.repository", () => ({
  cargoDimensionRepository: { replaceForShipment: vi.fn(), listByShipmentId: vi.fn(), listByShipmentIds: vi.fn(), assignLooseToContainer: vi.fn(), detachFromContainers: vi.fn() },
}));
vi.mock("../../repositories/commercialInvoice.repository", () => ({
  commercialInvoiceRepository: { listByShipmentId: vi.fn(async () => []), listByShipmentIds: vi.fn(), replaceForShipment: vi.fn() },
}));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../services/coLoadingSailing.service", () => ({ coLoadingSailingService: { shipmentDeleted: vi.fn(), sailingsOfShipments: vi.fn(async () => new Map()) } }));
vi.mock("../../services/quoteLinks.service", () => ({ quoteLinksService: { syncReference: vi.fn(), markDirty: vi.fn() } }));
vi.mock("../../services/shipmentEvents.service", () => ({ deliverShipmentEvents: vi.fn(async () => ({ sent: 1, retry: 0, failed: 0 })) }));
vi.mock("../../repositories/shipmentReleaseOverride.repository", () => ({ shipmentReleaseOverrideRepository: { create: vi.fn() } }));
vi.mock("../../repositories/shipmentCutoffDismissal.repository", () => ({ shipmentCutoffDismissalRepository: { liveByShipmentIds: vi.fn(async () => []) } }));
vi.mock("../../repositories/shipmentReleaseRequest.repository", () => ({ shipmentReleaseRequestRepository: { usablePass: vi.fn(), use: vi.fn(), closeUnused: vi.fn(async () => ({ waiting: 0, approved: 0 })) } }));
vi.mock("../../repositories/shipmentPushOutbox.repository", () => ({ shipmentPushOutboxRepository: { enqueue: vi.fn(), claimDue: vi.fn(), markSent: vi.fn(), markRetry: vi.fn(), markFailed: vi.fn() } }));

import log from "encore.dev/log";
import { auth, customers, holidays, invoicing, quotes, warehouse } from "~encore/clients";
import { APIError } from "../../../../lib/tests/encoreApi.stub";
import type { QuoteSyncResult } from "../../interfaces/interfaces";
import { cargoDimensionRepository } from "../../repositories/cargoDimension.repository";
import { cargoItemRepository } from "../../repositories/cargoItem.repository";
import { commercialInvoiceRepository } from "../../repositories/commercialInvoice.repository";
import { containerRepository } from "../../repositories/container.repository";
import { masterJobRepository } from "../../repositories/masterJob.repository";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { deliverShipmentEvents } from "../../services/shipmentEvents.service";
import { shipmentAttachmentRepository } from "../../repositories/shipmentAttachment.repository";
import type { ShipmentRecord } from "../../schemas/shipment.schema";
import { shipmentAuditRepository } from "../../repositories/shipmentAudit.repository";
import { shipmentTaskRepository } from "../../repositories/shipmentTask.repository";
import { shipmentTrackingEventRepository } from "../../repositories/shipmentTrackingEvent.repository";
import { quoteLinksService } from "../../services/quoteLinks.service";
import { coLoadingSailingService } from "../../services/coLoadingSailing.service";
import { LATE_CHARGE_IDS_KEPT_MS, shipmentService } from "../../services/shipment.service";
import { shipmentPartiesChanged } from "../../topics";
import { RELEASED_BEFORE_RECEIVED } from "../../lib/shipmentEditRule";
import { addDays, businessDay } from "../../../../lib/businessDate";
import { opsDay } from "../../lib/managersCockpit";
import { shipmentPushOutboxRepository } from "../../repositories/shipmentPushOutbox.repository";
import { shipmentReleaseOverrideRepository } from "../../repositories/shipmentReleaseOverride.repository";
import { shipmentCutoffDismissalRepository } from "../../repositories/shipmentCutoffDismissal.repository";
import { shipmentReleaseRequestRepository } from "../../repositories/shipmentReleaseRequest.repository";
import { PAYMENT_UNCHECKED, RELEASE_CHANGED_MEANWHILE } from "../../lib/prepaymentStop";

const repository = vi.mocked(shipmentRepository);
const links = vi.mocked(quoteLinksService);
const salesQuoteGet = vi.mocked(quotes.salesQuoteGet);
const quoteData = vi.mocked(quotes._internalSalesQuoteData);
const importQuote = vi.mocked(invoicing.invoicingImportQuote);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const USER = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";
const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const REF = "QCZ20261010001";
const OTHER_REF = "QCZ20261010002";
// The users of the company: the signed-in one (Jan) and two colleagues.
const JAN = { id: USER, email: "jan@firma.cz", displayName: "Jan Novák" };
const MARTIN = { id: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c01", email: "martin@firma.cz", displayName: "Martin Koubek" };
const JANA = { id: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c02", email: "jana@firma.cz", displayName: "Jana Nováková" };
const MEMBERS = [JAN, MARTIN, JANA];

/** The shipments the repository holds, by id. */
let stored: Map<string, ShipmentRecord>;
const row = (over: Record<string, unknown> = {}) =>
  ({
    id: SHIPMENT,
    companyId: COMPANY,
    jobNumber: "CZ00000101",
    salesNumber: "",
    salesPerson: "",
    bookingNumber: "",
    customerId: null,
    masterJobId: null,
    customsStatus: "",
    warehouseTruck: "",
    createdAt: new Date("2026-10-13T10:00:00Z"),
    updatedAt: new Date("2026-10-13T10:00:00Z"),
    deletedAt: null,
    ...over,
  }) as unknown as ShipmentRecord;

// Invoicing's word on a job that is not stopped for payment (its _internalReleaseCheck).
const PAID = { warn: false, customer: "", prepayment: false, customerOverdueCount: 0, unpaid: [], prepaymentUnpaid: false, prepaymentInvoices: [] };

const synced = (over: Partial<QuoteSyncResult> = {}): QuoteSyncResult => ({
  quoteNumber: REF,
  found: true,
  shipmentId: SHIPMENT,
  shipmentJobNumber: "CZ00000101",
  status: "quoted",
  becameWon: false,
  revertedTo: null,
  note: null,
  ...over,
});
// What the database layer throws when a statement fails: the statement and what went into it.
const DATABASE_FAILURE = new Error('Failed query: insert into "container" ("id", "container_number") values (default, $1)\nparams: MSKU1234567');
// A quote as the quotes service answers it: Won unless said otherwise, shown as it is stored
// unless an `effectiveStatus` is given (an expired quote is stored Quoted and shown Expired).
const quote = (over: Record<string, unknown> = {}) =>
  ({ quote: { quoteNumber: REF, ownerUserId: MARTIN.id, ownerName: "Martin Koubek", status: "won", effectiveStatus: over.status ?? "won", data: {}, ...over } }) as Awaited<
    ReturnType<typeof quotes.salesQuoteGet>
  >;

beforeEach(() => {
  vi.resetAllMocks();
  stored = new Map();
  const insert = (data: Record<string, unknown>) => {
    const created = row({ ...data });
    stored.set(created.id, created);
    return created;
  };
  // What comes with the new shipment is written in the create's own transaction, handed the row.
  repository.createWithJobNumber.mockImplementation(async (_companyId, data, alongside) => {
    const created = insert(data as Record<string, unknown>);
    if (alongside) await alongside(TX as never, created);
    return created;
  });
  repository.getInTurn.mockImplementation(async (_tx, id) => stored.get(id) ?? null);
  repository.createFromQuote.mockImplementation(async (_companyId, reference, data) => ({ created: insert({ ...(data as Record<string, unknown>), salesNumber: reference }) }));
  repository.getByIdForCompany.mockImplementation(async (id) => stored.get(id) ?? null);
  repository.updateForCompany.mockImplementation(async (id, _companyId, data) => {
    const updated = { ...stored.get(id)!, ...(data as Record<string, unknown>) } as ShipmentRecord;
    stored.set(id, updated);
    return updated;
  });
  repository.softDeleteForCompany.mockImplementation(async (id) => stored.get(id) ?? null);
  repository.softDeleteWithEvent.mockImplementation(async (id) => stored.has(id));
  // The reference writes, against the shipments held: a rename only while the row still reads what it was worked out from.
  repository.referencesOf.mockImplementation(async () => [...stored.values()]);
  repository.referenceInTurn.mockImplementation(async (_tx, id) => stored.get(id) ?? null);
  repository.renameJobNumber.mockImplementation(async (_tx, _companyId, from, to) => {
    const current = stored.get(from.id);
    if (!current || current.jobNumber !== from.jobNumber || current.freightMode !== from.freightMode || current.loadType !== from.loadType) return null;
    const renamed = { ...current, jobNumber: to };
    stored.set(from.id, renamed);
    return renamed;
  });
  repository.markJobNumberFinal.mockImplementation(async (_tx, id) => {
    const current = stored.get(id);
    if (!current) return null;
    stored.set(id, { ...current, jobNumberFinal: true });
    return current.jobNumber;
  });
  vi.mocked(shipmentAttachmentRepository.documentTypesByShipmentIds).mockResolvedValue([]);
  vi.mocked(invoicing.openInvoiceCount).mockResolvedValue({ count: 0 });
  vi.mocked(invoicing._internalPaidSupplierInvoices).mockResolvedValue({ invoiceNumbers: [] });
  vi.mocked(invoicing._internalInvoicedShipments).mockResolvedValue({ shipmentIds: [] });
  // Every charge on an open invoice unless a test says otherwise: Invoiced may then be set.
  vi.mocked(invoicing._internalChargeCount).mockResolvedValue({ invoiced: 2, total: 2 });
  // The job is paid, or not on prepayment, unless a test says otherwise: a release goes through.
  vi.mocked(invoicing._internalReleaseCheck).mockResolvedValue(PAID);
  vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([]);
  vi.mocked(cargoItemRepository.listByShipmentId).mockResolvedValue([]);
  vi.mocked(cargoDimensionRepository.listByShipmentId).mockResolvedValue([]);
  vi.mocked(warehouse._internalPickupPlates).mockResolvedValue({ plates: [] });
  salesQuoteGet.mockResolvedValue(quote());
  vi.mocked(auth.usersList).mockResolvedValue({ users: MEMBERS } as never);
  vi.mocked(auth.userLookup).mockImplementation(
    async ({ ids }) => ({ users: MEMBERS.filter((m) => ids.includes(m.id)).map((m) => ({ id: m.id, name: m.displayName, email: m.email, role: "user" })) }) as never,
  );
  links.syncReference.mockResolvedValue(synced({ status: "won", becameWon: true }));
  importQuote.mockResolvedValue({ buying: 3, selling: 2 });
});

describe("create", () => {
  it("refuses a new shipment marked Invoiced: it has no charges yet", async () => {
    await expect(shipmentService.create(COMPANY, { invoicingStatus: "Invoiced", tradeDirection: "Import" } as never)).rejects.toMatchObject({
      code: "failed_precondition",
      message: expect.stringMatching(/no charges to invoice/),
    });
    expect(repository.createWithJobNumber).not.toHaveBeenCalled();
  });
});

// X6: a pre-alert read twice made a House B/L twice. The create a reading makes names the House
// B/L, and the repository finds the shipment that has it under one lock on the B/L.
// F6: a person's change of a shipment reaches Trucking's jobs and the gate records, through an
// outbox row written in the shipment's write turn; the app's own writes (theirs) owe nothing back.
describe("changes passed on to Trucking and the gate", () => {
  const pushes = vi.mocked(shipmentPushOutboxRepository);
  beforeEach(() => {
    stored.set(SHIPMENT, row({ pickupDate: "2026-11-18", plateNumber: "3AB 1234", estimatedArrival: "2026-11-24", personInCharge: "", holidayCover: "", jobNumber: "CZROAD00000101", freightMode: "Road Freight", loadType: "Full Load" }));
    pushes.claimDue.mockResolvedValue([]);
  });

  it("owes each side the fields it keeps that a person's edit changed, in the write's turn, and sends them after it", async () => {
    await shipmentService.update(SHIPMENT, COMPANY, { pickupDate: "2026-11-19", plateNumber: "4CD 5678", etaWarehouse: "2026-11-21" } as never, USER, "manager");
    expect(pushes.enqueue).toHaveBeenCalledTimes(1);
    const [tx, rows] = pushes.enqueue.mock.calls[0]!;
    expect(tx).toBe(TX);
    const owed = { companyId: COMPANY, shipmentId: SHIPMENT, actingUserId: USER, actingRole: "manager" };
    expect(rows).toEqual([
      { ...owed, target: "trucking", changes: { pickupDate: { from: "2026-11-18", to: "2026-11-19" }, plateNumber: { from: "3AB 1234", to: "4CD 5678" } } },
      // The gate keeps the ETA Warehouse/HUB too (Trucking does not).
      { ...owed, target: "warehouse", changes: { etaWarehouse: { from: "", to: "2026-11-21" }, plateNumber: { from: "3AB 1234", to: "4CD 5678" } } },
    ]);
    expect(pushes.claimDue).toHaveBeenCalledWith(expect.any(Number), SHIPMENT);
  });

  it("owes the gate the master job's ETA Warehouse/HUB a person saved onto its houses", async () => {
    await shipmentService.update(SHIPMENT, COMPANY, { etaWarehouse: "2026-11-21" } as never, USER, undefined, "master_job");
    expect(pushes.enqueue.mock.calls[0]![1]).toEqual([expect.objectContaining({ target: "warehouse", changes: { etaWarehouse: { from: "", to: "2026-11-21" } } })]);
  });

  it("owes them for the master job's values a person saved onto its houses", async () => {
    await shipmentService.update(SHIPMENT, COMPANY, { plateNumber: "4CD 5678" } as never, USER, undefined, "master_job");
    expect(pushes.enqueue.mock.calls[0]![1]).toEqual([
      expect.objectContaining({ target: "trucking", actingRole: "user", changes: { plateNumber: { from: "3AB 1234", to: "4CD 5678" } } }),
      expect.objectContaining({ target: "warehouse" }),
    ]);
  });

  it("owes nothing for the app's own write (Trucking's or the gate's update of the shipment), so a change never loops", async () => {
    await shipmentService.update(SHIPMENT, COMPANY, { pickupDate: "2026-11-19", plateNumber: "4CD 5678" } as never, USER);
    expect(pushes.enqueue).not.toHaveBeenCalled();
    expect(pushes.claimDue).not.toHaveBeenCalled();
  });

  it("sends nothing when the edit changes none of the fields the others keep", async () => {
    await shipmentService.update(SHIPMENT, COMPANY, { plannedDeliveryDate: "2026-11-21", pickupDate: "2026-11-18" } as never, USER, "manager");
    expect(pushes.enqueue).not.toHaveBeenCalled();
    expect(pushes.claimDue).not.toHaveBeenCalled();
  });
});

describe("create for a House B/L of a reading", () => {
  const forHouse = (houseBol: string, over: Record<string, unknown> = {}) => shipmentService.create(COMPANY, { fromHouseBol: houseBol, ...over } as never);
  const key = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  beforeEach(() => {
    repository.createForHouseBol.mockImplementation(async (_companyId, houseBol, data) => {
      const existing = [...stored.values()].find((r) => key(r.houseBolNumber) === key(houseBol));
      if (existing) return { existing: { id: existing.id, jobNumber: existing.jobNumber } };
      const created = row({ ...(data as Record<string, unknown>) });
      stored.set(created.id, created);
      return { created };
    });
  });

  it("stores the House B/L as the shipment's House BoL Number, created under the B/L's lock", async () => {
    const result = await forHouse("  HBLTEST-A1 ", { pol: "Shanghai" });
    const [companyId, houseBol, data] = repository.createForHouseBol.mock.calls[0]!;
    expect([companyId, houseBol]).toEqual([COMPANY, "HBLTEST-A1"]);
    expect(data).toMatchObject({ houseBolNumber: "HBLTEST-A1", pol: "Shanghai" });
    expect(data).not.toHaveProperty("fromHouseBol");
    expect(repository.createWithJobNumber).not.toHaveBeenCalled();
    expect(result.shipment).toMatchObject({ id: SHIPMENT, houseBolNumber: "HBLTEST-A1" });
  });

  it("refuses a second shipment of the same House B/L, however it is written, naming the shipment that has it", async () => {
    stored.set(SHIPMENT, row({ jobNumber: "CZLCL00000134", houseBolNumber: "HBLTEST-A1" }));
    await expect(forHouse("hbltest a1")).rejects.toMatchObject({
      code: "already_exists",
      message: "House B/L hbltest a1 is already on shipment CZLCL00000134, so it is not created again",
      details: { shipmentId: SHIPMENT, jobNumber: "CZLCL00000134" },
    });
    expect(stored.size).toBe(1);
  });

  it("refuses a House B/L without letters or digits, and one together with a quote", async () => {
    await expect(forHouse(" / - ")).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(forHouse("HBLTEST-A1", { fromQuoteNumber: REF })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.createForHouseBol).not.toHaveBeenCalled();
    expect(repository.createFromQuote).not.toHaveBeenCalled();
  });

  it("creates as before when the reading names no House B/L", async () => {
    await forHouse("   ");
    expect(repository.createForHouseBol).not.toHaveBeenCalled();
    expect(repository.createWithJobNumber).toHaveBeenCalledTimes(1);
  });
});

describe("create from a quote", () => {
  const fromQuote = (over: Record<string, unknown> = {}) => shipmentService.create(COMPANY, { fromQuoteNumber: REF, ...over } as never);

  it("creates the shipment under the quote's reference, tells the quote it was created from it, and has the quote's costs copied", async () => {
    const result = await fromQuote({ pol: "Shanghai" });

    expect(salesQuoteGet).toHaveBeenCalledWith({ quoteNumber: REF });
    const [companyId, reference, data, allowSecond] = repository.createFromQuote.mock.calls[0]!;
    expect([companyId, reference, allowSecond]).toEqual([COMPANY, REF, false]);
    expect(data).toMatchObject({ pol: "Shanghai", salesPerson: "martin@firma.cz" });
    // What says how to create is not a field of the shipment.
    expect(data).not.toHaveProperty("fromQuoteNumber");
    expect(data).not.toHaveProperty("allowSecondShipment");

    expect(links.syncReference).toHaveBeenCalledWith(COMPANY, REF, { wonByShipmentId: SHIPMENT });
    expect(importQuote).toHaveBeenCalledWith({ shipmentId: SHIPMENT, quoteNumber: REF, target: "both" });
    expect(result).toMatchObject({
      shipment: { id: SHIPMENT, salesNumber: REF, salesPerson: "martin@firma.cz" },
      quoteLink: { linked: true, becameWon: true, quoteStatus: "won" },
      costImport: { buying: 3, selling: 2 },
    });
    expect(result.quoteLink).not.toHaveProperty("error");
    expect(result.detailRowsError).toBeUndefined();
    expect(repository.createWithJobNumber).not.toHaveBeenCalled();
  });

  it("goes by the reference the quote is stored under, and reads the request's with the spaces around it gone", async () => {
    salesQuoteGet.mockResolvedValue(quote({ quoteNumber: `${REF}-2` }));
    await fromQuote({ fromQuoteNumber: `  ${REF}-2 `, salesNumber: "typed by hand" });
    expect(salesQuoteGet).toHaveBeenCalledWith({ quoteNumber: `${REF}-2` });
    expect(repository.createFromQuote.mock.calls[0]![1]).toBe(`${REF}-2`);
    expect(importQuote).toHaveBeenCalledWith({ shipmentId: SHIPMENT, quoteNumber: `${REF}-2`, target: "both" });
  });

  it("keeps a Sales Person the request names itself, and leaves it empty for a quote nobody owns", async () => {
    await fromQuote({ salesPerson: "jana@firma.cz" });
    expect(repository.createFromQuote.mock.calls[0]![2]).toMatchObject({ salesPerson: "jana@firma.cz" });
    salesQuoteGet.mockResolvedValue(quote({ ownerUserId: null, ownerName: "" }));
    await fromQuote();
    expect(repository.createFromQuote.mock.calls[1]![2]).not.toHaveProperty("salesPerson");
  });

  it("refuses a reference that is no sales quote before anything is written", async () => {
    salesQuoteGet.mockRejectedValue(APIError.notFound("Quote not found"));
    await expect(fromQuote()).rejects.toMatchObject({ code: "invalid_argument", message: `quote ${REF} not found` });
    expect(repository.createFromQuote).not.toHaveBeenCalled();
    expect(links.syncReference).not.toHaveBeenCalled();
  });

  it("fails as it is when the quote cannot be read: nothing is created on a guess", async () => {
    salesQuoteGet.mockRejectedValue(new Error("quotes is unreachable"));
    await expect(fromQuote()).rejects.toThrow("quotes is unreachable");
    expect(repository.createFromQuote).not.toHaveBeenCalled();
  });

  it("creates the shipment from an open or expired quote, and tells the quote it was created from it, which makes it Won", async () => {
    for (const over of [{ status: "draft" }, { status: "quoted" }, { status: "revised" }, { status: "quoted", effectiveStatus: "expired" }]) {
      salesQuoteGet.mockResolvedValueOnce(quote(over));
      await fromQuote();
    }
    expect(repository.createFromQuote).toHaveBeenCalledTimes(4);
    expect(links.syncReference).toHaveBeenCalledTimes(4);
    expect(links.syncReference.mock.calls.every((call) => call[2]?.wonByShipmentId)).toBe(true);
  });

  it("refuses a Lost or Replaced quote, by the status it is shown with, before anything is written - also one whose number is no QCZ reference", async () => {
    for (const over of [{ status: "lost" }, { status: "replaced" }, { quoteNumber: "TEST-FX-Q1", status: "lost" }]) {
      salesQuoteGet.mockResolvedValueOnce(quote(over));
      await expect(fromQuote()).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/ - the quote is (Lost|Replaced) - no shipment can be created from it$/) });
    }
    expect(repository.createFromQuote).not.toHaveBeenCalled();
    expect(links.syncReference).not.toHaveBeenCalled();
  });

  it("refuses a quote that never went out while its customer waits for approval - in the words of creating the shipment", async () => {
    salesQuoteGet.mockResolvedValueOnce(
      quote({ status: "draft", sendBlocked: "ACME s.r.o. waits for a manager's approval (Sales → Managers → Company approval) — the quote can be sent once it is approved" }),
    );
    await expect(fromQuote()).rejects.toMatchObject({
      code: "failed_precondition",
      message: `${REF} - ACME s.r.o. waits for a manager's approval (Sales → Managers → Company approval) — the shipment can be created once it is approved`,
    });
    expect(repository.createFromQuote).not.toHaveBeenCalled();
  });

  it("refuses a second shipment from the same quote with a conflict that names the first - and does nothing else", async () => {
    repository.createFromQuote.mockResolvedValue({ existing: { id: "shipment-0", jobNumber: "CZ00000100" } });
    await expect(fromQuote()).rejects.toMatchObject({
      code: "already_exists",
      message: `shipment CZ00000100 was already created from quote ${REF}`,
      details: { shipmentId: "shipment-0", jobNumber: "CZ00000100" },
    });
    expect(containerRepository.syncForShipment).not.toHaveBeenCalled();
    expect(links.syncReference).not.toHaveBeenCalled();
    expect(importQuote).not.toHaveBeenCalled();
  });

  it("creates the second shipment when that is asked for", async () => {
    await fromQuote({ allowSecondShipment: true });
    expect(repository.createFromQuote.mock.calls[0]![3]).toBe(true);
    // Only a real `true` allows it.
    await fromQuote({ allowSecondShipment: "yes" });
    expect(repository.createFromQuote.mock.calls[1]![3]).toBe(false);
  });

  it("says why the quote did not become Won when it stays what it is", async () => {
    links.syncReference.mockResolvedValue(synced({ status: "lost", note: "the quote is Lost and stays Lost" }));
    await expect(fromQuote()).resolves.toMatchObject({
      quoteLink: { linked: true, becameWon: false, quoteStatus: "lost", note: "the quote is Lost and stays Lost" },
    });
  });

  describe("once the shipment exists, the request no longer fails", () => {
    it("reports that the quote could not be told, in the words of the refusal, marks the company for the reconcile, and copies the costs regardless", async () => {
      links.syncReference.mockRejectedValue(APIError.invalidArgument("a shipment must be named by its id"));
      const result = await fromQuote();
      expect(result).toMatchObject({
        shipment: { id: SHIPMENT },
        quoteLink: { linked: false, becameWon: false, quoteStatus: null, error: "a shipment must be named by its id" },
        costImport: { buying: 3, selling: 2 },
      });
      expect(links.markDirty).toHaveBeenCalledWith(COMPANY);
      expect(log.warn).toHaveBeenCalledTimes(1);
    });

    it("reports a quote that went away between the read and the link", async () => {
      links.syncReference.mockResolvedValue(synced({ found: false, shipmentId: null, shipmentJobNumber: null, status: null }));
      await expect(fromQuote()).resolves.toMatchObject({
        quoteLink: { linked: false, becameWon: false, quoteStatus: null, error: `quote ${REF} could not be linked` },
      });
    });

    it("reports that the costs were not copied, with the reason, and still links the quote", async () => {
      importQuote.mockRejectedValue(APIError.failedPrecondition(`costs from ${REF} were already copied to this shipment`));
      await expect(fromQuote()).resolves.toMatchObject({
        quoteLink: { linked: true, becameWon: true },
        costImport: { buying: 0, selling: 0, error: `costs from ${REF} were already copied to this shipment` },
      });
    });

    it("reports cargo lines that were not saved, and still tells the quote and copies the costs", async () => {
      vi.mocked(containerRepository.syncForShipment).mockRejectedValue(DATABASE_FAILURE);
      const result = await fromQuote({ containers: [{ containerNumber: "MSKU1234567" }] });
      expect(result).toMatchObject({ shipment: { id: SHIPMENT }, detailRowsError: "an unexpected error occurred", quoteLink: { linked: true }, costImport: { buying: 3 } });
    });

    it("answers a failure that is nobody's refusal without its text - a statement and its values belong in the log", async () => {
      links.syncReference.mockRejectedValue(DATABASE_FAILURE);
      importQuote.mockRejectedValue("no connection");
      const result = await fromQuote();
      expect(result).toMatchObject({
        shipment: { id: SHIPMENT },
        quoteLink: { linked: false, error: "an unexpected error occurred" },
        costImport: { buying: 0, selling: 0, error: "an unexpected error occurred" },
      });
      expect(JSON.stringify(result)).not.toContain("Failed query");
      // Logged whole, once per step.
      expect(vi.mocked(log.warn).mock.calls.map(([err]) => err)).toEqual([DATABASE_FAILURE, "no connection"]);
    });
  });
});

describe("create without a quote", () => {
  const create = (over: Record<string, unknown> = {}) => shipmentService.create(COMPANY, { ...over } as never);

  it("stores the Sales Number trimmed and tells the quote it names - without marking it Won, and with no costs copied", async () => {
    const result = await create({ salesNumber: `  ${REF} ` });
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ salesNumber: REF });
    expect(links.syncReference).toHaveBeenCalledWith(COMPANY, REF);
    expect(importQuote).not.toHaveBeenCalled();
    expect(repository.createFromQuote).not.toHaveBeenCalled();
    expect(result).toEqual({ shipment: expect.objectContaining({ id: SHIPMENT, salesNumber: REF }) });
  });

  it("marks the reference final when the job is created with a Booking Number, and not without (mock council R13)", async () => {
    await create({ bookingNumber: " MAEU123456 " });
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ jobNumberFinal: true });
    await create({ bookingNumber: "" });
    expect(repository.createWithJobNumber.mock.calls[1]![1]).not.toHaveProperty("jobNumberFinal");
  });

  it("is created also when the quote could not be told: logged, and left to the reconcile", async () => {
    links.syncReference.mockRejectedValue(new Error("quotes is unreachable"));
    await expect(create({ salesNumber: REF })).resolves.toMatchObject({ shipment: { id: SHIPMENT } });
    expect(links.markDirty).toHaveBeenCalledWith(COMPANY);
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it("makes the owner of the sales quote typed as Sales Number the Sales Person", async () => {
    const result = await create({ salesNumber: ` ${REF} ` });
    expect(salesQuoteGet).toHaveBeenCalledWith({ quoteNumber: REF });
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ salesNumber: REF, salesPerson: "martin@firma.cz" });
    expect(result).toMatchObject({ shipment: { salesPerson: "martin@firma.cz" } });
  });

  it("keeps a Sales Person the request names itself - the quote is still checked", async () => {
    await create({ salesNumber: REF, salesPerson: "jana@firma.cz" });
    expect(salesQuoteGet).toHaveBeenCalledWith({ quoteNumber: REF });
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ salesPerson: "jana@firma.cz" });
  });

  it("leaves the Sales Person empty for a Sales Number that is no sales quote and a quote nobody owns", async () => {
    salesQuoteGet.mockRejectedValueOnce(APIError.notFound("Quote not found"));
    await create({ salesNumber: "PO 4411" });
    salesQuoteGet.mockResolvedValueOnce(quote({ ownerUserId: null, ownerName: "" }));
    await create({ salesNumber: REF });
    expect(repository.createWithJobNumber).toHaveBeenCalledTimes(2);
    for (const [, data] of repository.createWithJobNumber.mock.calls) expect(data).not.toHaveProperty("salesPerson");
  });

  it("refuses a Sales Number naming a quote that is not Won, before anything is written", async () => {
    for (const status of ["draft", "ready_to_send", "quoted", "lost"]) {
      salesQuoteGet.mockResolvedValueOnce(quote({ status }));
      await expect(create({ salesNumber: REF })).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/^QCZ\S+ - the quote is [A-Z][A-Za-z ]+ - only a Won quote can be linked to a shipment$/) });
    }
    expect(repository.createWithJobNumber).not.toHaveBeenCalled();
    expect(links.syncReference).not.toHaveBeenCalled();
  });

  it("refuses an expired quote by the status it is shown with", async () => {
    salesQuoteGet.mockResolvedValueOnce(quote({ status: "feedback", effectiveStatus: "expired" }));
    await expect(create({ salesNumber: REF })).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("the quote is Expired") });
    expect(repository.createWithJobNumber).not.toHaveBeenCalled();
  });

  it("refuses a quote reference that cannot be checked, and lets free text pass when the quotes cannot be read", async () => {
    salesQuoteGet.mockRejectedValueOnce(new Error("quotes is unreachable"));
    await expect(create({ salesNumber: REF })).rejects.toThrow("quotes is unreachable");
    expect(repository.createWithJobNumber).not.toHaveBeenCalled();
    salesQuoteGet.mockRejectedValueOnce(new Error("quotes is unreachable"));
    await create({ salesNumber: "PO 4411" });
    expect(repository.createWithJobNumber).toHaveBeenCalledTimes(1);
  });

  it("links a quote that is not Won for a caller that allows it (Trucking's road jobs)", async () => {
    salesQuoteGet.mockResolvedValueOnce(quote({ status: "draft" }));
    await shipmentService.create(COMPANY, { salesNumber: REF } as never, undefined, { allowUnfinishedQuote: true });
    expect(links.syncReference).toHaveBeenCalledWith(COMPANY, REF);
  });

  it("does not make up a Sales Number for a request that sends none", async () => {
    await create();
    expect(repository.createWithJobNumber.mock.calls[0]![1]).not.toHaveProperty("salesNumber");
  });

  it("treats a blank fromQuoteNumber as none", async () => {
    await create({ fromQuoteNumber: "   " });
    expect(salesQuoteGet).not.toHaveBeenCalled();
    expect(repository.createWithJobNumber).toHaveBeenCalledTimes(1);
  });

  it("writes the containers and cargo lines in the shipment's own transaction, not in a second one", async () => {
    const result = await create({ containers: [{ containerNumber: "MSKU1234567" }], cargoItems: [{ cargoDescription: "Shoes" }] });
    expect(result).toEqual({ shipment: expect.objectContaining({ id: SHIPMENT }) });
    expect(containerRepository.syncForShipment).toHaveBeenCalledWith(SHIPMENT, COMPANY, [expect.objectContaining({ containerNumber: "MSKU1234567" })], TX);
    expect(cargoItemRepository.replaceForShipment).toHaveBeenCalledWith(SHIPMENT, COMPANY, [expect.objectContaining({ cargoDescription: "Shoes" })], TX);
    expect(repository.writeTurn).not.toHaveBeenCalled();
  });

  it("fails as a whole when a line can't be written: no shipment is left to tell anybody of, nor for a retry to duplicate", async () => {
    vi.mocked(containerRepository.syncForShipment).mockRejectedValueOnce(DATABASE_FAILURE);
    await expect(create({ salesNumber: REF, containers: [{ containerNumber: "MSKU1234567" }] })).rejects.toBe(DATABASE_FAILURE);
    expect(links.syncReference).not.toHaveBeenCalled();
    expect(repository.customerRollups).not.toHaveBeenCalled();
  });

  it("opens nothing more for a shipment sent without lines", async () => {
    await create({ pol: "Hamburg" });
    expect(repository.createWithJobNumber.mock.calls[0]![2]).toBeUndefined();
    expect(containerRepository.syncForShipment).not.toHaveBeenCalled();
  });
});

describe("Created by", () => {
  it("is the e-mail of the signed-in user who creates the shipment, whatever the request says (when is createdAt)", async () => {
    await shipmentService.create(COMPANY, { createdBy: "someone else" } as never, USER);
    await shipmentService.create(COMPANY, { fromQuoteNumber: REF, createdBy: "someone else" } as never, USER);
    const createdBy = [repository.createWithJobNumber.mock.calls[0]![1].createdBy, repository.createFromQuote.mock.calls[0]![2].createdBy];
    for (const stamp of createdBy) expect(stamp).toBe("jan@firma.cz");
    expect(auth.userLookup).toHaveBeenCalledWith({ ids: [USER], selfInOwnCompany: true });
  });

  it("is the superadmin's own e-mail when a superadmin working as the company creates it (found in their own company)", async () => {
    const ROOT = "5e1d2c3b-4a59-4687-9a6b-7c8d9e0f1a2b";
    // The auth service finds the caller themself in their own company only when asked to (selfInOwnCompany).
    vi.mocked(auth.userLookup).mockImplementation(
      async ({ ids, selfInOwnCompany }) => ({ users: selfInOwnCompany && ids.includes(ROOT) ? [{ id: ROOT, name: "Root", email: "Root@Platform.cz", role: "superadmin" }] : [] }) as never,
    );
    await shipmentService.create(COMPANY, {} as never, ROOT);
    expect(repository.createWithJobNumber.mock.calls[0]![1].createdBy).toBe("root@platform.cz");
  });

  it("takes the e-mail from the users list when the lookup fails, and never writes a display name", async () => {
    vi.mocked(auth.userLookup).mockRejectedValue(new Error("auth is unreachable"));
    await shipmentService.create(COMPANY, {} as never, USER);
    expect(repository.createWithJobNumber.mock.calls[0]![1].createdBy).toBe("jan@firma.cz");
    // Nobody can tell who: it stays empty.
    vi.mocked(auth.usersList).mockRejectedValue(new Error("auth is unreachable"));
    await shipmentService.create(COMPANY, {} as never, USER);
    expect(repository.createWithJobNumber.mock.calls[1]![1].createdBy).toBe("");
  });

  it("keeps the stamp a caller inside the backend passes when no user creates it (Trucking's road jobs)", async () => {
    await shipmentService.create(COMPANY, { createdBy: "Trucking (system)" } as never);
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ createdBy: "Trucking (system)" });
    expect(auth.usersList).not.toHaveBeenCalled();
  });
});

describe("update", () => {
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);

  describe("Invoicing Status Invoiced, only once all the charges are invoiced", () => {
    it("refuses it while a selling line is not on an invoice, a manager's request too", async () => {
      stored.set(SHIPMENT, row({ invoicingStatus: "Not Invoiced" }));
      vi.mocked(invoicing._internalChargeCount).mockResolvedValue({ invoiced: 2, total: 3 });
      await expect(update({ invoicingStatus: "Invoiced" })).rejects.toMatchObject({
        code: "failed_precondition",
        message: "Not all charges are invoiced: 2 of 3 selling lines are on an invoice. Invoice the rest first",
      });
      await expect(shipmentService.update(SHIPMENT, COMPANY, { invoicingStatus: "Invoiced" } as never, USER, "admin")).rejects.toMatchObject({ code: "failed_precondition" });
      expect(invoicing._internalChargeCount).toHaveBeenCalledWith({ shipmentId: SHIPMENT });
      expect(repository.updateForCompany).not.toHaveBeenCalled();
    });

    it("refuses it on a shipment with no charges", async () => {
      stored.set(SHIPMENT, row({ invoicingStatus: "Not Invoiced" }));
      vi.mocked(invoicing._internalChargeCount).mockResolvedValue({ invoiced: 0, total: 0 });
      await expect(update({ invoicingStatus: "Invoiced" })).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/no charges to invoice/) });
    });

    it("sets it once every charge is invoiced", async () => {
      stored.set(SHIPMENT, row({ invoicingStatus: "Not Invoiced" }));
      await update({ invoicingStatus: "Invoiced" });
      expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ invoicingStatus: "Invoiced" });
    });

    it("does not ask about a shipment already Invoiced, nor about Not Invoiced", async () => {
      stored.set(SHIPMENT, row({ invoicingStatus: "Invoiced" }));
      await update({ invoicingStatus: "Invoiced" });
      await update({ invoicingStatus: "Not Invoiced" });
      expect(invoicing._internalChargeCount).not.toHaveBeenCalled();
    });
  });

  describe("a shipment read with no Trade Direction", () => {
    it("starts its status on the side of the direction it is given", async () => {
      stored.set(SHIPMENT, row({ tradeDirection: "", status: "" }));
      await update({ tradeDirection: "Export" });
      expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ tradeDirection: "Export", status: "Booking Confirmation Pending [EXP]" });
    });

    it("keeps a status someone already picked", async () => {
      stored.set(SHIPMENT, row({ tradeDirection: "", status: "Cancelled Shipment" }));
      await update({ tradeDirection: "Import" });
      expect(repository.updateForCompany.mock.calls[0]![2]).not.toHaveProperty("status");
    });
  });

  describe("the Internal Reference's letters", () => {
    const renamedTo = () => repository.renameJobNumber.mock.calls.map((call) => call[3]);
    // The shipment row as the write in the turn finds it: `meanwhile` was saved by a parallel write
    // after this update read the shipment.
    const savedMeanwhile = (meanwhile: Record<string, unknown>) =>
      repository.updateForCompany.mockImplementationOnce(async (id, _companyId, data) => {
        const updated = { ...stored.get(id)!, ...meanwhile, ...(data as Record<string, unknown>) } as ShipmentRecord;
        stored.set(id, updated);
        return updated;
      });

    it("follow a changed Freight Mode or Load Type, the number kept, in the write turn, and the quote is told", async () => {
      stored.set(SHIPMENT, row({ jobNumber: "CZ00000101", freightMode: "Sea Freight", loadType: "", salesNumber: REF }));
      await update({ loadType: "Full Load" });
      expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ loadType: "Full Load" });
      expect(repository.updateForCompany.mock.calls[0]![2]).not.toHaveProperty("jobNumber");
      expect(repository.renameJobNumber).toHaveBeenCalledWith(
        TX,
        COMPANY,
        expect.objectContaining({ id: SHIPMENT, jobNumber: "CZ00000101", freightMode: "Sea Freight", loadType: "Full Load" }),
        "CZFCL00000101",
      );
      expect(vi.mocked(shipmentAuditRepository.create)).toHaveBeenCalledWith(
        expect.objectContaining({ field: "jobNumber", oldValue: "CZ00000101", newValue: "CZFCL00000101" }),
        TX,
      );
      expect(stored.get(SHIPMENT)!.jobNumber).toBe("CZFCL00000101");
      // The quote keeps its shipment's reference too.
      expect(links.syncReference).toHaveBeenCalledWith(COMPANY, REF);

      await update({ freightMode: "Air Freight" });
      expect(renamedTo()).toEqual(["CZFCL00000101", "CZAIR00000101"]);
    });

    it("keep a shipment on a master job to its filling: no other Load Type while it is there, the master job's one goes through", async () => {
      const MJ = "5b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c09";
      vi.mocked(masterJobRepository.getByIdForCompany).mockResolvedValue({ id: MJ, mczNumber: "MCZCONSOL00000003", loadType: "Consolidation" } as never);
      stored.set(SHIPMENT, row({ jobNumber: "CZLCL00000089", freightMode: "Sea Freight", loadType: "Consolidation", masterJobId: MJ }));
      await expect(update({ loadType: "Full Load" })).rejects.toMatchObject({
        code: "failed_precondition",
        message: "CZLCL00000089 is on MCZCONSOL00000003, a Consolidation master job, so its Load Type stays Consolidation - take it off the master job first",
      });
      expect(repository.updateForCompany).not.toHaveBeenCalled();
      // Off the master job, it may change.
      stored.set(SHIPMENT, row({ jobNumber: "CZLCL00000089", freightMode: "Sea Freight", loadType: "Consolidation", masterJobId: null }));
      await update({ loadType: "Full Load" });
      expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ loadType: "Full Load" });
    });

    it("are worked out from the row as the write turn finds it: an edit of the other field saved meanwhile counts", async () => {
      // Read as Sea Freight, Full Load; meanwhile another edit made it Air Freight (CZAIR…).
      stored.set(SHIPMENT, row({ jobNumber: "CZFCL00000101", freightMode: "Sea Freight", loadType: "Full Load" }));
      savedMeanwhile({ freightMode: "Air Freight", jobNumber: "CZAIR00000101" });
      await update({ loadType: "Consolidation" });
      // Air Freight with a Consolidation stays CZAIR - not the CZLCL the read alone would give.
      expect(renamedTo()).toEqual([]);
      expect(stored.get(SHIPMENT)).toMatchObject({ jobNumber: "CZAIR00000101", freightMode: "Air Freight", loadType: "Consolidation" });

      // Read as Sea Freight, Full Load; meanwhile another edit made it a Consolidation (CZLCL…).
      stored.set(SHIPMENT, row({ jobNumber: "CZFCL00000101", freightMode: "Sea Freight", loadType: "Full Load" }));
      savedMeanwhile({ loadType: "Project Shipment", jobNumber: "CZPROJECT00000101" });
      await update({ freightMode: "Rail Freight" });
      expect(renamedTo()).toEqual([]);
      expect(stored.get(SHIPMENT)!.jobNumber).toBe("CZPROJECT00000101");
    });

    it("stay once Invoicing took the reference for an invoice number - also when it did while the edit was on its way", async () => {
      stored.set(SHIPMENT, row({ jobNumber: "CZFCL00000101", freightMode: "Sea Freight", loadType: "Full Load", salesNumber: REF }));
      savedMeanwhile({ jobNumberFinal: true });
      await update({ loadType: "Consolidation" });
      expect(repository.renameJobNumber).not.toHaveBeenCalled();
      expect(stored.get(SHIPMENT)!.jobNumber).toBe("CZFCL00000101");
      expect(links.syncReference).not.toHaveBeenCalled();
    });

    it("stay on a job whose row says the reference is final, without asking Invoicing", async () => {
      for (const over of [{ jobNumberFinal: true }, { invoicingStatus: "Invoiced" }]) {
        stored.set(SHIPMENT, row({ jobNumber: "CZFCL00000101", freightMode: "Sea Freight", loadType: "Full Load", ...over }));
        await update({ loadType: "Consolidation" });
      }
      expect(repository.renameJobNumber).not.toHaveBeenCalled();
      expect(invoicing._internalInvoicedShipments).not.toHaveBeenCalled();
    });

    it("stay once the job has a Booking Number (Q33), also one saved while the edit was on its way, without asking Invoicing", async () => {
      stored.set(SHIPMENT, row({ jobNumber: "CZFCL00000101", freightMode: "Sea Freight", loadType: "Full Load", bookingNumber: "MAEU123456" }));
      await update({ loadType: "Consolidation" });
      await update({ freightMode: "Air Freight" });
      expect(invoicing._internalInvoicedShipments).not.toHaveBeenCalled();

      stored.set(SHIPMENT, row({ jobNumber: "CZFCL00000101", freightMode: "Sea Freight", loadType: "Full Load", salesNumber: REF }));
      savedMeanwhile({ bookingNumber: "MAEU123456" });
      await update({ loadType: "Consolidation" });
      expect(repository.renameJobNumber).not.toHaveBeenCalled();
      expect(stored.get(SHIPMENT)!.jobNumber).toBe("CZFCL00000101");
      expect(links.syncReference).not.toHaveBeenCalled();
    });

    it("still follow the Freight Mode and Load Type saved with the job's first Booking Number, and stay from then on", async () => {
      stored.set(SHIPMENT, row({ jobNumber: "CZ00000101", freightMode: "Sea Freight", loadType: "" }));
      await update({ loadType: "Full Load", bookingNumber: "MAEU123456" });
      expect(renamedTo()).toEqual(["CZFCL00000101"]);
      await update({ loadType: "Consolidation" });
      expect(renamedTo()).toEqual(["CZFCL00000101"]);
      expect(stored.get(SHIPMENT)).toMatchObject({ jobNumber: "CZFCL00000101", loadType: "Consolidation" });
    });

    it("stay when the Booking Number is cleared: the first booking marked the reference final (mock council R13)", async () => {
      stored.set(SHIPMENT, row({ jobNumber: "CZ00000101", freightMode: "Sea Freight", loadType: "Full Load" }));
      await update({ bookingNumber: "MAEU123456" });
      expect(stored.get(SHIPMENT)!.jobNumberFinal).toBe(true);
      await update({ bookingNumber: "" });
      await update({ loadType: "Consolidation" });
      expect(renamedTo()).toEqual([]);
      expect(stored.get(SHIPMENT)!.jobNumber).toBe("CZ00000101");
    });

    it("stay on a job booked before the flag counted, once its Booking Number is cleared (mock council R13)", async () => {
      stored.set(SHIPMENT, row({ jobNumber: "CZFCL00000101", freightMode: "Sea Freight", loadType: "Full Load", bookingNumber: "MAEU123456" }));
      await update({ bookingNumber: "" });
      expect(stored.get(SHIPMENT)!.jobNumberFinal).toBe(true);
      await update({ loadType: "Consolidation" });
      expect(renamedTo()).toEqual([]);
    });

    it("stay on a job marked Invoiced by hand in the same edit", async () => {
      stored.set(SHIPMENT, row({ jobNumber: "CZFCL00000101", freightMode: "Sea Freight", loadType: "Full Load", invoicingStatus: "Not Invoiced" }));
      await update({ loadType: "Consolidation", invoicingStatus: "Invoiced" });
      expect(repository.renameJobNumber).not.toHaveBeenCalled();
    });

    it("stay once the job has had an invoice - one issued before the shipment kept its own flag", async () => {
      stored.set(SHIPMENT, row({ jobNumber: "CZFCL00000101", freightMode: "Sea Freight", loadType: "Full Load" }));
      vi.mocked(invoicing._internalInvoicedShipments).mockResolvedValue({ shipmentIds: [SHIPMENT] });
      await update({ loadType: "Consolidation" });
      expect(invoicing._internalInvoicedShipments).toHaveBeenCalledWith({ shipmentIds: [SHIPMENT] });
      // Asked before the write turn, not under its lock.
      expect(vi.mocked(invoicing._internalInvoicedShipments).mock.invocationCallOrder[0]).toBeLessThan(repository.writeTurn.mock.invocationCallOrder[0]!);
      expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ loadType: "Consolidation" });
      expect(repository.renameJobNumber).not.toHaveBeenCalled();
      expect(links.syncReference).not.toHaveBeenCalled();
    });

    it("are not looked at by an edit that changes neither, nor on a reference that is no CZ number", async () => {
      stored.set(SHIPMENT, row({ jobNumber: "CZ00000101", freightMode: "Air Freight", loadType: "" }));
      await update({ pol: "Shanghai" });
      stored.set(SHIPMENT, row({ jobNumber: "IMPORT-1", freightMode: "Sea Freight", loadType: "" }));
      await update({ loadType: "Full Load" });
      expect(repository.renameJobNumber).not.toHaveBeenCalled();
      expect(invoicing._internalInvoicedShipments).not.toHaveBeenCalled();
    });
  });

  it("tells the new quote and the old one when the Sales Number changes, after the shipment is written", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF, salesPerson: "martin@firma.cz" }));
    await update({ salesNumber: ` ${OTHER_REF} ` });
    expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ salesNumber: OTHER_REF });
    expect(links.syncReference.mock.calls).toEqual([
      [COMPANY, OTHER_REF],
      [COMPANY, REF],
    ]);
    expect(repository.updateForCompany.mock.invocationCallOrder[0]).toBeLessThan(links.syncReference.mock.invocationCallOrder[0]!);
  });

  it("tells the old quote when the Sales Number is cleared", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF }));
    await update({ salesNumber: "" });
    expect(links.syncReference.mock.calls).toEqual([
      [COMPANY, ""],
      [COMPANY, REF],
    ]);
  });

  it("hands the shipment to the owner of the sales quote its Sales Number now names", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF, salesPerson: "martin@firma.cz" }));
    salesQuoteGet.mockResolvedValue(quote({ quoteNumber: OTHER_REF, ownerUserId: JANA.id, ownerName: "Jana Nováková" }));
    await update({ salesNumber: OTHER_REF });
    expect(salesQuoteGet).toHaveBeenCalledWith({ quoteNumber: OTHER_REF });
    expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ salesNumber: OTHER_REF, salesPerson: "jana@firma.cz" });
  });

  it("refuses another Sales Number, or clearing it, on an invoiced shipment; before it asks for any quote", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF, invoicingStatus: "Invoiced" }));
    await expect(update({ salesNumber: OTHER_REF })).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/invoiced/) });
    await expect(update({ salesNumber: "" })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(salesQuoteGet).not.toHaveBeenCalled();
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("refuses another Sales Number while an issued invoice stands, whatever the Invoicing Status says", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF, invoicingStatus: "Not Invoiced" }));
    vi.mocked(invoicing.openInvoiceCount).mockResolvedValue({ count: 1 });
    await expect(update({ salesNumber: OTHER_REF })).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/invoiced/) });
    expect(vi.mocked(invoicing.openInvoiceCount)).toHaveBeenCalledWith({ shipmentId: SHIPMENT });
    expect(salesQuoteGet).not.toHaveBeenCalled();
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("lets the same Sales Number through on an invoiced shipment, and a change once it is no longer invoiced", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF, invoicingStatus: "Invoiced" }));
    await expect(update({ salesNumber: ` ${REF} ` })).resolves.toBeDefined();
    stored.set(SHIPMENT, row({ salesNumber: REF, invoicingStatus: "Not Invoiced" }));
    salesQuoteGet.mockResolvedValue(quote({ quoteNumber: OTHER_REF }));
    await expect(update({ salesNumber: OTHER_REF })).resolves.toBeDefined();
  });

  it("keeps the Sales Person when the request names one, when the new Sales Number is no sales quote, and when the number is cleared or the same", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF, salesPerson: "martin@firma.cz" }));
    await update({ salesNumber: OTHER_REF, salesPerson: "jana@firma.cz" });
    expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ salesPerson: "jana@firma.cz" });
    expect(salesQuoteGet).toHaveBeenCalledWith({ quoteNumber: OTHER_REF });

    salesQuoteGet.mockRejectedValueOnce(APIError.notFound("Quote not found"));
    await update({ salesNumber: "PO 4411" });
    expect(repository.updateForCompany.mock.calls[1]![2]).not.toHaveProperty("salesPerson");

    await update({ salesNumber: "" });
    await update({ salesNumber: "" });
    await update({ pol: "Shanghai" });
    expect(salesQuoteGet).toHaveBeenCalledTimes(2);
    for (const [, , data] of repository.updateForCompany.mock.calls.slice(2)) expect(data).not.toHaveProperty("salesPerson");
  });

  it("refuses a Sales Number naming a quote that is not Won: nothing is written or told", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF }));
    salesQuoteGet.mockResolvedValue(quote({ quoteNumber: OTHER_REF, status: "draft" }));
    await expect(update({ salesNumber: OTHER_REF })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(links.syncReference).not.toHaveBeenCalled();
  });

  it("leaves a link made before the rule alone: a shipment that already names a draft quote is saved", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF }));
    salesQuoteGet.mockResolvedValue(quote({ status: "draft" }));
    await update({ pol: "Shanghai" });
    expect(repository.updateForCompany).toHaveBeenCalledTimes(1);
    expect(salesQuoteGet).not.toHaveBeenCalled();
  });

  it("tells nobody when the Sales Number is the same once trimmed, or is not part of the update", async () => {
    stored.set(SHIPMENT, row({ salesNumber: `${REF} ` }));
    await update({ salesNumber: REF });
    // The stored value loses its space all the same.
    expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ salesNumber: REF });
    await update({ pol: "Shanghai" });
    expect(links.syncReference).not.toHaveBeenCalled();
  });

  it("is saved also when a quote could not be told: logged, and left to the reconcile", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF }));
    links.syncReference.mockRejectedValue(new Error("quotes is unreachable"));
    await expect(update({ salesNumber: OTHER_REF })).resolves.toMatchObject({ salesNumber: OTHER_REF });
    expect(links.markDirty).toHaveBeenCalledWith(COMPANY);
    // The old quote is still tried after the new one failed.
    expect(links.syncReference).toHaveBeenCalledTimes(2);
  });
});

describe("what a change is worth on the Tracking tab", () => {
  const update = (data: Record<string, unknown>, role?: string, origin?: "master_job") => shipmentService.update(SHIPMENT, COMPANY, data as never, USER, role, origin);
  const events = vi.mocked(shipmentTrackingEventRepository);
  const invoicedRow = () => stored.set(SHIPMENT, row({ tradeDirection: "Import", invoicingStatus: "Not Invoiced" }));

  beforeEach(() => {
    invoicedRow();
    vi.mocked(invoicing.openInvoiceCount).mockResolvedValue({ count: 0 });
    events.findSameDay.mockResolvedValue(null);
  });

  it("stores the fact in the write turn, with who and from where", async () => {
    await update({ actualArrival: "2026-11-05" }, "admin");
    expect(events.add).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: COMPANY, shipmentId: SHIPMENT, kind: "arrived", occurredOn: "2026-11-05", source: "user", recordedById: USER, effect: "applied", effectField: "actualArrival" }),
      TX,
    );
  });

  it("says a master job's sync came from the master job", async () => {
    await update({ actualArrival: "2026-11-05" }, undefined, "master_job");
    expect(events.add).toHaveBeenCalledWith(expect.objectContaining({ source: "master_job" }), TX);
  });

  it("doesn't store the same fact twice", async () => {
    events.findSameDay.mockResolvedValue({ id: "e1" } as never);
    await update({ actualArrival: "2026-11-05" }, "admin");
    expect(events.add).not.toHaveBeenCalled();
  });

  it("closes the exceptions the fact ends", async () => {
    await update({ actualArrival: "2026-11-05" }, "admin");
    expect(events.resolveOpen).toHaveBeenCalledWith(SHIPMENT, COMPANY, ["delayed", "rolled"], USER, TX);
  });

  it("closes them also when the fact stood already, as a source's proposal now confirmed", async () => {
    events.findSameDay.mockResolvedValue({ id: "e1" } as never);
    await update({ actualArrival: "2026-11-05" }, "admin");
    expect(events.resolveOpen).toHaveBeenCalledWith(SHIPMENT, COMPANY, ["delayed", "rolled"], USER, TX);
  });

  it("confirms what a source proposed of the day set, whoever set it, before looking for the fact", async () => {
    await update({ actualArrival: "2026-11-05" }, undefined, "master_job");
    expect(events.supersede).toHaveBeenCalledWith(SHIPMENT, COMPANY, "actualArrival", "2026-11-05", USER, TX);
    expect(events.settle).toHaveBeenCalledWith(SHIPMENT, COMPANY, "actualArrival", "2026-11-05", USER, TX);
    expect(events.settle.mock.invocationCallOrder[0]).toBeLessThan(events.findSameDay.mock.invocationCallOrder[0]!);
  });

  it("sets aside the facts of a date corrected or cleared, and stores none for a cleared one", async () => {
    stored.set(SHIPMENT, row({ tradeDirection: "Import", invoicingStatus: "Not Invoiced", actualArrival: "2026-11-07" }));
    await update({ actualArrival: null }, "admin");
    expect(events.supersede).toHaveBeenCalledWith(SHIPMENT, COMPANY, "actualArrival", null, USER, TX);
    expect(events.settle).not.toHaveBeenCalled();
    expect(events.add).not.toHaveBeenCalled();
  });

  it("stores nothing for a field that is no fact", async () => {
    await update({ freeComments: "hello" }, "admin");
    expect(events.add).not.toHaveBeenCalled();
    expect(vi.mocked(shipmentTaskRepository.upsert)).not.toHaveBeenCalled();
  });

  it("ticks Billed when the app marks the job invoiced", async () => {
    await update({ invoicingStatus: "Invoiced" });
    expect(vi.mocked(shipmentTaskRepository.upsert)).toHaveBeenCalledWith(SHIPMENT, COMPANY, "imp_billed", true, USER, TX);
  });

  it("ticks Delivered when the delivery date comes, and stores Trucking as its source", async () => {
    await update({ actualDeliveryDate: "2026-11-05" });
    expect(vi.mocked(shipmentTaskRepository.upsert)).toHaveBeenCalledWith(SHIPMENT, COMPANY, "imp_delivered", true, USER, TX);
    expect(events.add).toHaveBeenCalledWith(expect.objectContaining({ kind: "delivered", source: "trucking" }), TX);
  });
});

describe("the customs status of several shipments", () => {
  it("reads their paperwork in one query and gives each its own", async () => {
    const docs = vi.mocked(shipmentAttachmentRepository.documentTypesByShipmentIds);
    docs.mockResolvedValue([
      { shipmentId: "a", documentType: "Invoice", customsStatus: "approved" },
      { shipmentId: "a", documentType: "Packing list", customsStatus: "approved" },
      { shipmentId: "b", documentType: "Packing list", customsStatus: "" },
    ] as never);
    const statuses = await shipmentService.customsStatusesOf([{ id: "a", customsStatus: "Customs Cleared/Released" }, { id: "b", customsStatus: "Customs Cleared/Released" }], COMPANY);
    expect(docs).toHaveBeenCalledTimes(1);
    expect(docs).toHaveBeenCalledWith(["a", "b"], COMPANY);
    expect(statuses.get("a")).toBe("Customs Cleared/Released");
    expect(statuses.get("b")).not.toBe("Customs Cleared/Released");
  });
});

describe("a shipper or consignee picked from the Customer Database", () => {
  const PARTY = "3c1e2f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);
  const written = () => repository.updateForCompany.mock.calls[0]![2] as Record<string, unknown>;
  const SITE_ID = "946e01e8-a4ed-4aa7-932b-2c5d5e991c30";

  beforeEach(() => {
    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { companyName: "Alza.cz a.s.", registeredAddress: "Jankovcova, 1522/53, Praha, 17000", country: "CZ" } } as never);
    vi.mocked(customers.addressList).mockResolvedValue({
      data: [
        { types: ["Registered"], street: "Jankovcova 1522/53", city: "Praha", postalCode: "170 00", country: "CZ" },
        { types: ["Delivery"], street: "Dopravní", city: "Praha 11", postalCode: "18000", country: "CZ" },
      ],
    } as never);
    vi.mocked(customers.contactList).mockResolvedValue({
      data: [
        { id: "c-eva", name: "Eva Prodej", role: "Sales", isMain: true },
        { id: "c-jana", name: "Jana Servis", role: "Customer Service", isMain: false },
      ],
    } as never);
  });

  it("fills the Contact with the Customer Service contact, by name and id, unless the write sends one", async () => {
    stored.set(SHIPMENT, row({ consigneeId: null, consigneeContact: "Old Person" }));
    await update({ consigneeId: PARTY });
    expect(written()).toMatchObject({ consigneeContact: "Jana Servis", consigneeContactId: "c-jana", deliveryAddress: "Dopravní, Praha 11" });

    stored.set(SHIPMENT, row({ consigneeId: null }));
    await update({ consigneeId: PARTY, consigneeContact: "Typed Person" });
    expect(repository.updateForCompany.mock.calls[1]![2]).toMatchObject({ consigneeContact: "Typed Person", consigneeContactId: null, deliveryAddress: "Dopravní, Praha 11" });

    vi.mocked(customers.contactList).mockResolvedValue({ data: [] } as never);
    stored.set(SHIPMENT, row({ consigneeId: null }));
    await update({ consigneeId: PARTY });
    expect(repository.updateForCompany.mock.calls[2]![2]).not.toHaveProperty("consigneeContact");
  });

  it("reads the customer once: the link check and the fill share it", async () => {
    stored.set(SHIPMENT, row({ consigneeId: null }));
    await update({ consigneeId: PARTY });
    expect(customers.customerGet).toHaveBeenCalledTimes(1);
  });

  it("fills the consignee's delivery from its Delivery address and clears the old site, hours, phone and notes (E5)", async () => {
    stored.set(SHIPMENT, row({ consigneeId: null, deliveryAddress: "old street", deliverySiteId: SITE_ID, consigneeOpeningFrom: "08:00", deliveryPhone: "+420 602", deliveryNotes: "Mon-Fri 8-14" }));
    await update({ consignee: "Alza.cz a.s.", consigneeId: PARTY });
    expect(customers.addressList).toHaveBeenCalledWith({ customerId: PARTY });
    expect(written()).toMatchObject({
      deliveryAddress: "Dopravní, Praha 11",
      deliveryPostcode: "18000",
      deliveryCountry: "CZ",
      deliverySiteId: null,
      consigneeOpeningFrom: "",
      consigneeOpeningTo: "",
      deliveryPhone: "",
      deliveryNotes: "",
    });
  });

  it("clears the old Delivery Phone and Notes on any consignee change: one with no address, unlinked, or sent with its own address (mock council S3-6)", async () => {
    const old = { deliveryPhone: "+420 602", deliveryNotes: "Mon-Fri 8-14" };
    vi.mocked(customers.addressList).mockResolvedValue({ data: [] } as never);
    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { companyName: "X", registeredAddress: "", country: "CZ" } } as never);
    const writes: Record<string, unknown>[] = [
      { consigneeId: "8d2e1f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5d" },
      { consignee: "Typed s.r.o.", consigneeId: null },
      { consigneeId: "8d2e1f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5d", deliveryAddress: "typed by hand" },
      // The same consignee, or a write that sends the phone itself, keeps them.
      { consigneeId: PARTY },
      { consignee: "Typed s.r.o.", consigneeId: null, deliveryPhone: "+420 777" },
    ];
    for (const data of writes) {
      stored.set(SHIPMENT, row({ consignee: "Alza.cz a.s.", consigneeId: PARTY, ...old }));
      await update(data);
    }
    const calls = repository.updateForCompany.mock.calls.map((c) => c[2] as Record<string, unknown>);
    for (const data of calls.slice(0, 3)) expect(data).toMatchObject({ deliveryPhone: "", deliveryNotes: "" });
    expect(calls[3]).not.toHaveProperty("deliveryPhone");
    expect(calls[4]).toMatchObject({ deliveryPhone: "+420 777", deliveryNotes: "" });
  });

  it("clears them when a consignee typed as free text is retyped as another, linked or not (Shipments review)", async () => {
    const alfa = { consignee: "Alfa s.r.o.", consigneeId: null, deliveryPhone: "+420 602", deliveryNotes: "Ramp 2" };
    for (const data of [{ consignee: "Beta s.r.o.", consigneeId: null }, { consignee: "Beta s.r.o." }]) {
      stored.set(SHIPMENT, row(alfa));
      await update(data);
    }
    const calls = repository.updateForCompany.mock.calls.map((c) => c[2] as Record<string, unknown>);
    for (const data of calls) expect(data).toMatchObject({ deliveryPhone: "", deliveryNotes: "" });
  });

  it("keeps them while the consignee stays the same: retyped in another case, linked to its own record, or unlinked (Shipments review)", async () => {
    const phone = { deliveryPhone: "+420 602", deliveryNotes: "Ramp 2" };
    stored.set(SHIPMENT, row({ consignee: "Alfa s.r.o.", consigneeId: null, ...phone }));
    await update({ consignee: "  ALFA s.r.o. ", consigneeId: null });
    stored.set(SHIPMENT, row({ consignee: "Alza.cz a.s.", consigneeId: null, ...phone }));
    await update({ consignee: "Alza.cz a.s.", consigneeId: PARTY });
    stored.set(SHIPMENT, row({ consignee: "Alza.cz a.s.", consigneeId: PARTY, ...phone }));
    await update({ consigneeId: null });
    const calls = repository.updateForCompany.mock.calls.map((c) => c[2] as Record<string, unknown>);
    for (const data of calls) {
      expect(data).not.toHaveProperty("deliveryPhone");
      expect(data).not.toHaveProperty("deliveryNotes");
    }
    // Linked, it still takes its record's delivery address.
    expect(calls[1]).toMatchObject({ deliveryAddress: "Dopravní, Praha 11" });
  });

  it("fills a new consignee's delivery address though the write sends a Delivery Phone, and keeps that phone (Shipments review)", async () => {
    stored.set(SHIPMENT, row({ consignee: "Old s.r.o.", consigneeId: null, deliveryAddress: "old street", deliveryNotes: "Ramp 2" }));
    await update({ consigneeId: PARTY, deliveryPhone: "+420 999" });
    expect(customers.addressList).toHaveBeenCalledWith({ customerId: PARTY });
    expect(written()).toMatchObject({ deliveryAddress: "Dopravní, Praha 11", deliveryPostcode: "18000", deliveryPhone: "+420 999", deliveryNotes: "" });
  });

  it("fills the shipper's pick-up from the Registered address when there is no Pickup one", async () => {
    await shipmentService.create(COMPANY, { shipper: "Alza.cz a.s.", shipperId: PARTY, pickupAddress: "" } as never);
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({
      pickupAddress: "Jankovcova 1522/53, Praha",
      pickupPostcode: "17000",
      pickupCountry: "CZ",
    });
    // A shipper has no delivery telephone or notes to clear.
    expect(repository.createWithJobNumber.mock.calls[0]![1]).not.toHaveProperty("deliveryPhone");
    expect(repository.createWithJobNumber.mock.calls[0]![1]).not.toHaveProperty("deliveryNotes");
  });

  it("leaves the stop alone when the party is the same, unlinked, sent with its own address, or has no address", async () => {
    stored.set(SHIPMENT, row({ consigneeId: PARTY }));
    await update({ consigneeId: PARTY });
    await update({ consigneeId: null });
    await update({ consigneeId: "7d2e1f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5c", deliveryAddress: "typed by hand" });
    expect(customers.addressList).not.toHaveBeenCalled();
    // The address typed by hand keeps the address, not the contact.
    expect(customers.contactList).toHaveBeenCalledTimes(1);
    expect(repository.updateForCompany.mock.calls[2]![2]).toMatchObject({ consigneeContact: "Jana Servis" });

    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { companyName: "X", registeredAddress: "", country: "CZ" } } as never);
    vi.mocked(customers.addressList).mockResolvedValue({ data: [] } as never);
    stored.set(SHIPMENT, row({ consigneeId: null, deliveryAddress: "kept" }));
    await update({ consigneeId: "8d2e1f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5d" });
    for (const [, , data] of repository.updateForCompany.mock.calls) expect(data).not.toHaveProperty("deliverySiteId");
    expect(repository.updateForCompany.mock.calls[2]![2]).toMatchObject({ deliveryAddress: "typed by hand" });
  });
});

describe("people are users of the company, stored by e-mail", () => {
  const create = (over: Record<string, unknown> = {}) => shipmentService.create(COMPANY, { ...over } as never);
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);
  const written = (call = 0) => repository.updateForCompany.mock.calls[call]![2] as Record<string, unknown>;
  const PICK = (label: string) => ({ code: "invalid_argument", message: `${label}: pick a user of the company (by e-mail)` });

  it("stores each person picked as the user's e-mail in lower case, nobody as empty - reading the users once", async () => {
    await create({ personInCharge: " Jan@Firma.cz ", holidayCover: "jana@firma.cz", salesPerson: "", switchBolApprovedBy: "MARTIN@firma.cz", approvedBy: "jan@firma.cz" });
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({
      personInCharge: "jan@firma.cz",
      holidayCover: "jana@firma.cz",
      salesPerson: "",
      switchBolApprovedBy: "martin@firma.cz",
      approvedBy: "jan@firma.cz",
    });
    expect(auth.usersList).toHaveBeenCalledTimes(1);
  });

  it("refuses a name or an e-mail of nobody in the company, naming the field, before anything is written", async () => {
    for (const [field, label] of [
      ["personInCharge", "Handled By"],
      ["holidayCover", "Holiday Cover"],
      ["salesPerson", "Sales Person"],
      ["switchBolApprovedBy", "Switch BoL Approved By"],
    ]) {
      await expect(create({ [field]: "Jan Novák" })).rejects.toMatchObject(PICK(label!));
      await expect(create({ [field]: "petr@jinde.cz" })).rejects.toMatchObject(PICK(label!));
    }
    await expect(create({ approvedBy: "Jan Novák" })).rejects.toMatchObject(PICK("Approved By"));
    expect(repository.createWithJobNumber).not.toHaveBeenCalled();
  });

  it("does not read the users for a write that names nobody", async () => {
    await create({ pol: "Shanghai" });
    stored.set(SHIPMENT, row({ personInCharge: "Lukáš" }));
    await update({ pol: "Hamburg", personInCharge: "Lukáš", holidayCover: "" });
    expect(auth.usersList).not.toHaveBeenCalled();
  });

  it("keeps a value the shipment already holds - an old name too - so the record can still be saved", async () => {
    stored.set(SHIPMENT, row({ personInCharge: "Lukáš", approvedBy: "Lukáš — 1. 10. 2026 8:00:00" }));
    await update({ personInCharge: " Lukáš ", approvedBy: "Lukáš — 1. 10. 2026 8:00:00", pol: "Hamburg" });
    expect(written()).toMatchObject({ personInCharge: "Lukáš", approvedBy: "Lukáš — 1. 10. 2026 8:00:00" });
    // Unchanged values are no change in the history.
    const audited = vi.mocked(shipmentAuditRepository.create).mock.calls.map(([entry]) => entry.field);
    expect(audited).not.toContain("personInCharge");
    expect(audited).not.toContain("approvedBy");
  });

  it("refuses a new name in place of an old one, and lets the old one be replaced by a user or cleared", async () => {
    stored.set(SHIPMENT, row({ personInCharge: "Lukáš" }));
    await expect(update({ personInCharge: "Petr" })).rejects.toMatchObject(PICK("Handled By"));
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    await update({ personInCharge: "Jana@firma.cz" });
    expect(written(0)).toMatchObject({ personInCharge: "jana@firma.cz" });
    stored.set(SHIPMENT, row({ personInCharge: "Lukáš" }));
    await update({ personInCharge: "" });
    expect(written(1)).toMatchObject({ personInCharge: "" });
  });

  it("takes Approved By as a user's e-mail or as the stamp a credit approval leaves, with a user's e-mail", async () => {
    stored.set(SHIPMENT, row());
    await update({ approvedBy: "JANA@firma.cz — 26. 10. 2026 9:15:00" });
    expect(written()).toMatchObject({ approvedBy: "jana@firma.cz — 26. 10. 2026 9:15:00" });
    await expect(update({ approvedBy: "Petr — 26. 10. 2026 9:15:00" })).rejects.toMatchObject(PICK("Approved By"));
    // After the e-mail only the time: a name can't ride along.
    await expect(update({ approvedBy: "jana@firma.cz — Petr Novák" })).rejects.toMatchObject(PICK("Approved By"));
  });

  it("stamps a credit approval and a House BoL release with the e-mail of the user who did it", async () => {
    stored.set(SHIPMENT, row({ creditCheck: "Red", houseBolRelease: "" }));
    await update({ creditCheck: "Green" });
    expect(written(0).approvedBy).toMatch(/^jan@firma\.cz — \S/);
    await shipmentService.releaseHouseBol(SHIPMENT, COMPANY, USER);
    expect(written(1).houseBolRelease).toMatch(/^jan@firma\.cz — \S/);
    // The stamps are the server's own: no users list is read to check them.
    expect(auth.usersList).not.toHaveBeenCalled();
  });

  it("refuses a second House BoL release, naming the first: the stamp is never rewritten", async () => {
    stored.set(SHIPMENT, row({ houseBolRelease: "jana@firma.cz — 10. 11. 2026 9:00:00" }));
    await expect(shipmentService.releaseHouseBol(SHIPMENT, COMPANY, USER)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "The House BoL was already released (jana@firma.cz — 10. 11. 2026 9:00:00)",
    });
    expect(repository.writeTurn).not.toHaveBeenCalled();
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("refuses the release that finds another one's stamp in the write turn - two at once - and writes nothing of it", async () => {
    stored.set(SHIPMENT, row({ houseBolRelease: "" }));
    // Released by the other request between this one's read and its turn.
    repository.getInTurn.mockResolvedValueOnce(row({ houseBolRelease: "jana@firma.cz — 11. 11. 2026 10:00:00" }));
    await expect(shipmentService.releaseHouseBol(SHIPMENT, COMPANY, USER)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("already released") });
    expect(repository.getInTurn).toHaveBeenCalledWith(TX, SHIPMENT, COMPANY);
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
    expect(shipmentTrackingEventRepository.add).not.toHaveBeenCalled();
  });

  it("reads the shipment in the turn only for a write decided on what it read (a plain edit doesn't)", async () => {
    stored.set(SHIPMENT, row({ pol: "Hamburg" }));
    await update({ pol: "Bremen" });
    expect(repository.getInTurn).not.toHaveBeenCalled();
  });

  it("makes a user's credit approval their own: an approver sent with it is replaced by the stamp", async () => {
    stored.set(SHIPMENT, row({ creditCheck: "Red", approvedBy: "" }));
    await shipmentService.update(SHIPMENT, COMPANY, { creditCheck: "Green", approvedBy: "jana@firma.cz" } as never, USER, "user");
    expect(written(0).approvedBy).toMatch(/^jan@firma\.cz — \S/);
    // a manager may name who approved it
    stored.set(SHIPMENT, row({ creditCheck: "Red", approvedBy: "" }));
    await shipmentService.update(SHIPMENT, COMPANY, { creditCheck: "Green", approvedBy: "jana@firma.cz" } as never, USER, "manager");
    expect(written(1).approvedBy).toBe("jana@firma.cz");
  });

  it("stamps a shipment a user creates already approved with that user", async () => {
    await shipmentService.create(COMPANY, { creditCheck: "Green", approvedBy: "jana@firma.cz" } as never, USER, { creatorRole: "user" });
    expect(repository.createWithJobNumber.mock.calls.at(-1)![1].approvedBy).toMatch(/^jan@firma\.cz — \S/);
    await shipmentService.create(COMPANY, { creditCheck: "Green", approvedBy: "jana@firma.cz" } as never, USER, { creatorRole: "admin" });
    expect(repository.createWithJobNumber.mock.calls.at(-1)![1].approvedBy).toBe("jana@firma.cz");
  });

  describe("the Sales Person a shipment takes from its quote", () => {
    const takenFrom = async (over: Record<string, unknown>) => {
      salesQuoteGet.mockResolvedValue(quote(over));
      await create({ salesNumber: REF });
      return repository.createWithJobNumber.mock.calls.at(-1)![1].salesPerson;
    };

    it("is the e-mail of the user who owns the quote", async () => {
      await expect(takenFrom({ ownerUserId: JANA.id, ownerName: "Jana Nováková" })).resolves.toBe("jana@firma.cz");
      expect(auth.userLookup).toHaveBeenCalledWith({ ids: [JANA.id], selfInOwnCompany: true });
    });

    it("is the one user the owner's name fits, for a quote owned by a typed name", async () => {
      await expect(takenFrom({ ownerUserId: null, ownerName: "martin koubek" })).resolves.toBe("martin@firma.cz");
    });

    it("is left empty when the owner is no user: a name is never copied", async () => {
      await expect(takenFrom({ ownerUserId: null, ownerName: "Petr Neznámý" })).resolves.toBeUndefined();
      // An owner who is no user of the company any more is not guessed from the name either.
      await expect(takenFrom({ ownerUserId: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c99", ownerName: "Martin Koubek" })).resolves.toBeUndefined();
    });

    it("is left empty, and the shipment created, when the users can't be read", async () => {
      vi.mocked(auth.usersList).mockRejectedValue(new Error("auth is unreachable"));
      await expect(takenFrom({ ownerUserId: null, ownerName: "Martin Koubek" })).resolves.toBeUndefined();
      expect(repository.createWithJobNumber).toHaveBeenCalledTimes(1);
    });
  });
});

describe("normalizePeople", () => {
  it("turns the names in the company's live shipments into the users' e-mails and reports what it did", async () => {
    repository.peopleOf.mockResolvedValue([
      { id: "s-1", personInCharge: "Jan Novák", holidayCover: "", salesPerson: "Petr", switchBolApprovedBy: "", createdBy: "1. 10. 2026 8:00:00 — Martin Koubek", approvedBy: "", houseBolRelease: "" },
      { id: "s-2", personInCharge: "Jan Novák", holidayCover: "jana@firma.cz", salesPerson: "", switchBolApprovedBy: "", createdBy: "", approvedBy: "", houseBolRelease: "" },
    ]);
    repository.rewritePeople.mockResolvedValue(3);
    await expect(shipmentService.normalizePeople(COMPANY)).resolves.toEqual({
      checked: 5,
      changed: 3,
      unmatched: [{ field: "salesPerson", value: "Petr", count: 1 }],
    });
    expect(repository.peopleOf).toHaveBeenCalledWith(COMPANY);
    expect(repository.rewritePeople).toHaveBeenCalledWith(COMPANY, [
      { field: "personInCharge", from: "Jan Novák", to: "jan@firma.cz" },
      { field: "createdBy", from: "1. 10. 2026 8:00:00 — Martin Koubek", to: "1. 10. 2026 8:00:00 — martin@firma.cz" },
    ]);
    // A backfill, not an edit: no history lines.
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
  });

  it("changes nothing when the users can't be read", async () => {
    vi.mocked(auth.usersList).mockRejectedValue(new Error("auth is unreachable"));
    await expect(shipmentService.normalizePeople(COMPANY)).rejects.toThrow("auth is unreachable");
    expect(repository.rewritePeople).not.toHaveBeenCalled();
  });
});

describe("finalizeReference", () => {
  it("marks the reference final under the shipment's write turn and gives it back as it is now", async () => {
    stored.set(SHIPMENT, row({ jobNumber: "CZFCL00000101" }));
    await expect(shipmentService.finalizeReference(SHIPMENT, COMPANY)).resolves.toBe("CZFCL00000101");
    expect(repository.writeTurn).toHaveBeenCalledWith(SHIPMENT, COMPANY, expect.any(Function));
    expect(repository.markJobNumberFinal).toHaveBeenCalledWith(TX, SHIPMENT, COMPANY);
    expect(stored.get(SHIPMENT)!.jobNumberFinal).toBe(true);
  });

  it("answers not found for a shipment the company does not have, and for what is no id without reading", async () => {
    await expect(shipmentService.finalizeReference(SHIPMENT, COMPANY)).rejects.toMatchObject({ code: "not_found" });
    await expect(shipmentService.finalizeReference("CZ00000101", COMPANY)).rejects.toMatchObject({ code: "not_found" });
    expect(repository.writeTurn).toHaveBeenCalledTimes(1);
  });

  it("keeps the letters from then on", async () => {
    stored.set(SHIPMENT, row({ jobNumber: "CZFCL00000101", freightMode: "Sea Freight", loadType: "Full Load" }));
    await shipmentService.finalizeReference(SHIPMENT, COMPANY);
    await shipmentService.update(SHIPMENT, COMPANY, { loadType: "Consolidation" } as never, USER);
    expect(repository.renameJobNumber).not.toHaveBeenCalled();
    expect(stored.get(SHIPMENT)!.jobNumber).toBe("CZFCL00000101");
  });
});

describe("normalizeReferences", () => {
  const renamedJobs = () => repository.renameJobNumber.mock.calls.map((call) => call[3]);
  const put = (id: string, over: Record<string, unknown>) => stored.set(id, row({ id, invoicingStatus: "Not Invoiced", jobNumberFinal: false, ...over }));
  const normalize = () => shipmentService.normalizeReferences(COMPANY, USER);
  const asked = () => vi.mocked(invoicing._internalInvoicedShipments).mock.calls.map(([req]) => req.shipmentIds);

  it("gives each live shipment the letters of its Freight Mode and Load Type, audited as the user who ran it, and tells each quote once", async () => {
    put("s-1", { jobNumber: "CZ00000001", freightMode: "Sea Freight", loadType: "Full Load", salesNumber: REF });
    put("s-2", { jobNumber: "CZ00000002", freightMode: "Air Freight", loadType: "", salesNumber: ` ${REF}` });
    // Letters that can't be told yet, and letters it has already: nothing to do.
    put("s-3", { jobNumber: "CZ00000003", freightMode: "Sea Freight", loadType: "" });
    put("s-4", { jobNumber: "CZRAIL00000004", freightMode: "Rail Freight", loadType: "" });
    await expect(normalize()).resolves.toEqual({ checked: 4, renamed: 2, keptInvoiced: [] });
    expect(stored.get("s-1")!.jobNumber).toBe("CZFCL00000001");
    expect(stored.get("s-2")!.jobNumber).toBe("CZAIR00000002");
    expect(shipmentAuditRepository.create).toHaveBeenCalledWith(
      { companyId: COMPANY, shipmentId: "s-1", userId: USER, field: "jobNumber", oldValue: "CZ00000001", newValue: "CZFCL00000001" },
      TX,
    );
    expect(shipmentAuditRepository.create).toHaveBeenCalledTimes(2);
    expect(links.syncReference.mock.calls).toEqual([[COMPANY, REF]]);
    // Invoicing is asked about those that need letters only.
    expect(asked()).toEqual([["s-1", "s-2"]]);
  });

  it("keeps the reference of a job that is final: one Invoicing numbered, one marked Invoiced (by hand too), one booked, one with an invoice", async () => {
    put("s-1", { jobNumber: "CZ00000001", freightMode: "Air Freight", jobNumberFinal: true });
    put("s-2", { jobNumber: "CZ00000002", freightMode: "Air Freight", invoicingStatus: "Invoiced" });
    put("s-3", { jobNumber: "CZ00000003", freightMode: "Air Freight" });
    put("s-4", { jobNumber: "CZ00000004", freightMode: "Air Freight" });
    put("s-5", { jobNumber: "CZ00000005", freightMode: "Air Freight", bookingNumber: "176-12345675" });
    vi.mocked(invoicing._internalInvoicedShipments).mockResolvedValue({ shipmentIds: ["s-3"] });
    await expect(normalize()).resolves.toEqual({ checked: 5, renamed: 1, keptInvoiced: ["CZ00000001", "CZ00000002", "CZ00000005", "CZ00000003"] });
    // What the shipment row already says is final is not asked about.
    expect(asked()).toEqual([["s-3", "s-4"]]);
    expect(renamedJobs()).toEqual(["CZAIR00000004"]);
  });

  it("works each rename out again under the shipment's write turn, from the row as it is then", async () => {
    put("s-1", { jobNumber: "CZ00000001", freightMode: "Air Freight" });
    put("s-2", { jobNumber: "CZ00000002", freightMode: "Air Freight" });
    put("s-3", { jobNumber: "CZ00000003", freightMode: "Sea Freight", loadType: "Full Load" });
    put("s-4", { jobNumber: "CZ00000004", freightMode: "Air Freight" });
    // After the backfill read the shipments: Invoicing numbered s-1, an edit made s-2 a Project
    // Shipment, one gave s-3 its letters already, and s-4 was deleted.
    vi.mocked(invoicing._internalInvoicedShipments).mockImplementationOnce(async () => {
      stored.set("s-1", { ...stored.get("s-1")!, jobNumberFinal: true });
      stored.set("s-2", { ...stored.get("s-2")!, loadType: "Project Shipment" });
      stored.set("s-3", { ...stored.get("s-3")!, loadType: "Consolidation", jobNumber: "CZLCL00000003" });
      stored.delete("s-4");
      return { shipmentIds: [] };
    });
    await expect(normalize()).resolves.toEqual({ checked: 4, renamed: 1, keptInvoiced: ["CZ00000001"] });
    expect(renamedJobs()).toEqual(["CZPROJECT00000002"]);
    expect(stored.get("s-3")!.jobNumber).toBe("CZLCL00000003");
    expect(repository.referenceInTurn).toHaveBeenCalledWith(TX, "s-1", COMPANY);
  });

  it("counts, audits and tells nothing the guarded rename did not write", async () => {
    put("s-1", { jobNumber: "CZ00000001", freightMode: "Air Freight", salesNumber: REF });
    repository.renameJobNumber.mockResolvedValueOnce(null);
    await expect(normalize()).resolves.toEqual({ checked: 1, renamed: 0, keptInvoiced: [] });
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
    expect(links.syncReference).not.toHaveBeenCalled();
  });

  it("is safe to run again: a second run renames nothing and asks Invoicing nothing", async () => {
    put("s-1", { jobNumber: "CZ00000001", freightMode: "Sea Freight", loadType: "Consolidation", salesNumber: REF });
    await expect(normalize()).resolves.toEqual({ checked: 1, renamed: 1, keptInvoiced: [] });
    await expect(normalize()).resolves.toEqual({ checked: 1, renamed: 0, keptInvoiced: [] });
    expect(stored.get("s-1")!.jobNumber).toBe("CZLCL00000001");
    expect(invoicing._internalInvoicedShipments).toHaveBeenCalledTimes(1);
    expect(shipmentAuditRepository.create).toHaveBeenCalledTimes(1);
    expect(links.syncReference).toHaveBeenCalledTimes(1);
  });

  it("asks Invoicing a few shipments at a time, right before renaming them", async () => {
    for (let n = 1; n <= 120; n++) put(`s-${n}`, { jobNumber: `CZ${String(n).padStart(8, "0")}`, freightMode: "Air Freight" });
    const done: string[] = [];
    vi.mocked(invoicing._internalInvoicedShipments).mockImplementation(async ({ shipmentIds }) => {
      done.push(`ask ${shipmentIds.length}`);
      return { shipmentIds: [] };
    });
    const rename = repository.renameJobNumber.getMockImplementation()!;
    repository.renameJobNumber.mockImplementation(async (...args) => {
      done.push("rename");
      return rename(...args);
    });
    await expect(normalize()).resolves.toMatchObject({ renamed: 120 });
    const renames = (n: number) => Array.from({ length: n }, () => "rename");
    expect(done).toEqual(["ask 50", ...renames(50), "ask 50", ...renames(50), "ask 20", ...renames(20)]);
  });
});

describe("softDelete", () => {
  it("takes the deleted shipment out of its Co-Loading box, and still deletes it when that fails", async () => {
    stored.set(SHIPMENT, row());
    await shipmentService.softDelete(SHIPMENT, COMPANY, USER);
    expect(coLoadingSailingService.shipmentDeleted).toHaveBeenCalledWith(SHIPMENT, COMPANY, USER);
    stored.set(SHIPMENT, row());
    vi.mocked(coLoadingSailingService.shipmentDeleted).mockRejectedValueOnce(new Error("down"));
    await expect(shipmentService.softDelete(SHIPMENT, COMPANY, USER)).resolves.toBeUndefined();
  });

  it("tells the quote the deleted shipment named, after the shipment is gone", async () => {
    stored.set(SHIPMENT, row({ salesNumber: ` ${REF}` }));
    await shipmentService.softDelete(SHIPMENT, COMPANY, USER);
    expect(links.syncReference).toHaveBeenCalledWith(COMPANY, REF);
    expect(repository.softDeleteWithEvent.mock.invocationCallOrder[0]).toBeLessThan(links.syncReference.mock.invocationCallOrder[0]!);
  });

  it("writes the shipment-deleted event with the delete, in the shipment's write turn, then publishes it", async () => {
    stored.set(SHIPMENT, row({ salesNumber: "" }));
    await shipmentService.softDelete(SHIPMENT, COMPANY, USER, "manager");
    // The event is owed in the delete's own transaction (the outbox row), so it can't be lost.
    expect(repository.writeTurn).toHaveBeenCalledWith(SHIPMENT, COMPANY, expect.any(Function));
    expect(repository.softDeleteWithEvent).toHaveBeenCalledWith(SHIPMENT, COMPANY, { userId: USER, role: "manager" }, TX);
    expect(deliverShipmentEvents).toHaveBeenCalledWith(SHIPMENT);
    expect(repository.softDeleteWithEvent.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deliverShipmentEvents).mock.invocationCallOrder[0]!);
  });

  it("asks Invoicing inside the write turn Invoicing numbers an invoice under, and writes the history line there too", async () => {
    stored.set(SHIPMENT, row({ salesNumber: "" }));
    await shipmentService.softDelete(SHIPMENT, COMPANY, USER);
    const turn = repository.writeTurn.mock.invocationCallOrder[0]!;
    expect(turn).toBeLessThan(vi.mocked(invoicing.openInvoiceCount).mock.invocationCallOrder[0]!);
    expect(vi.mocked(invoicing.openInvoiceCount).mock.invocationCallOrder[0]).toBeLessThan(repository.softDeleteWithEvent.mock.invocationCallOrder[0]!);
    expect(shipmentAuditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ shipmentId: SHIPMENT, field: "deletedAt", oldValue: null }), TX);
  });

  it("refuses an invoiced shipment in the turn: nothing deleted, no history line, no event, nobody told", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF }));
    vi.mocked(invoicing.openInvoiceCount).mockResolvedValue({ count: 1 });
    await expect(shipmentService.softDelete(SHIPMENT, COMPANY, USER)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("credit its invoices first") });
    expect(repository.softDeleteWithEvent).not.toHaveBeenCalled();
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
    expect(deliverShipmentEvents).not.toHaveBeenCalled();
    expect(links.syncReference).not.toHaveBeenCalled();
  });

  it("refuses a shipment whose costs are on a supplier invoice marked paid: nothing deleted, no event", async () => {
    stored.set(SHIPMENT, row({ salesNumber: "" }));
    vi.mocked(invoicing._internalPaidSupplierInvoices).mockResolvedValue({ invoiceNumbers: ["FV-77"] });
    await expect(shipmentService.softDelete(SHIPMENT, COMPANY, USER)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("supplier invoices marked paid (FV-77)") });
    expect(vi.mocked(invoicing._internalPaidSupplierInvoices)).toHaveBeenCalledWith({ shipmentId: SHIPMENT });
    expect(repository.softDeleteWithEvent).not.toHaveBeenCalled();
    expect(deliverShipmentEvents).not.toHaveBeenCalled();
  });

  it("says not found when the shipment went meanwhile, and owes no event", async () => {
    stored.set(SHIPMENT, row({ salesNumber: "" }));
    repository.softDeleteWithEvent.mockResolvedValueOnce(false);
    await expect(shipmentService.softDelete(SHIPMENT, COMPANY, USER)).rejects.toMatchObject({ code: "not_found" });
    expect(deliverShipmentEvents).not.toHaveBeenCalled();
  });

  it("is deleted also when the quote could not be told", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF }));
    links.syncReference.mockRejectedValue(new Error("quotes is unreachable"));
    await expect(shipmentService.softDelete(SHIPMENT, COMPANY, USER)).resolves.toBeUndefined();
    expect(links.markDirty).toHaveBeenCalledWith(COMPANY);
  });
});

describe("linkQuote", () => {
  const USER_ACTOR = { userID: "00000000-0000-0000-0000-0000000000u1", companyID: COMPANY, role: "user" };

  it("tells the quote in the shipment's Sales Number about it and answers what the quote says", async () => {
    stored.set(SHIPMENT, row({ salesNumber: `${REF} ` }));
    links.syncReference.mockResolvedValue(synced());
    await expect(shipmentService.linkQuote(SHIPMENT, USER_ACTOR, false)).resolves.toEqual(synced());
    expect(links.syncReference).toHaveBeenCalledWith(COMPANY, REF, {});
  });

  it("with markWon says that the shipment was created from the quote - when the server made it from that quote", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF, createdFromQuote: true }));
    await shipmentService.linkQuote(SHIPMENT, USER_ACTOR, true);
    expect(links.syncReference).toHaveBeenCalledWith(COMPANY, REF, { wonByShipmentId: SHIPMENT });
  });

  it("links without marking Won when a plain user names a quote the shipment was not created from", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF, createdFromQuote: false }));
    await shipmentService.linkQuote(SHIPMENT, USER_ACTOR, true);
    expect(links.syncReference).toHaveBeenCalledWith(COMPANY, REF, {});
  });

  it("lets a sales manager mark the quote Won for any shipment that names it", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF, createdFromQuote: false }));
    await shipmentService.linkQuote(SHIPMENT, { ...USER_ACTOR, role: "manager" }, true);
    expect(links.syncReference).toHaveBeenCalledWith(COMPANY, REF, { wonByShipmentId: SHIPMENT });
  });

  it("is not found for a shipment that does not exist, and refused for a Sales Number that is no quote reference", async () => {
    await expect(shipmentService.linkQuote(SHIPMENT, USER_ACTOR, false)).rejects.toMatchObject({ code: "not_found" });
    stored.set(SHIPMENT, row({ salesNumber: "PO 4411" }));
    links.syncReference.mockResolvedValue(null);
    await expect(shipmentService.linkQuote(SHIPMENT, USER_ACTOR, false)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "the Sales Reference of this shipment is not the reference of a sales quote",
    });
  });

  it("hands a failure to the caller instead of swallowing it", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF }));
    links.syncReference.mockRejectedValue(new Error("quotes is unreachable"));
    await expect(shipmentService.linkQuote(SHIPMENT, USER_ACTOR, true)).rejects.toThrow("quotes is unreachable");
    expect(links.markDirty).not.toHaveBeenCalled();
  });
});

describe("customerFacts", () => {
  it("hands out what the shipments say about each customer, times as ISO strings, and the count of shipments without a customer", async () => {
    repository.customerFacts.mockResolvedValue({
      customers: [
        {
          customerId: "946e01e8-a4ed-4aa7-932b-2c5d5e991c30",
          firstShipmentAt: new Date("2026-09-15T08:00:00.000Z"),
          firstShipmentId: SHIPMENT,
          firstJobNumber: "CZ00000012",
          lastShipmentAt: new Date("2026-10-06T08:00:00.123Z"),
          shipmentCount: 2,
        },
      ],
      shipmentsWithoutCustomer: 19,
    });
    await expect(shipmentService.customerFacts(COMPANY)).resolves.toEqual({
      customers: [
        {
          customerId: "946e01e8-a4ed-4aa7-932b-2c5d5e991c30",
          firstShipmentAt: "2026-09-15T08:00:00.000Z",
          firstShipmentId: SHIPMENT,
          firstJobNumber: "CZ00000012",
          lastShipmentAt: "2026-10-06T08:00:00.123Z",
          shipmentCount: 2,
        },
      ],
      shipmentsWithoutCustomer: 19,
    });
    expect(repository.customerFacts).toHaveBeenCalledWith(COMPANY);
    // A read of facts: no quote is told anything, nothing is reconciled.
    expect(links.syncReference).not.toHaveBeenCalled();
  });
});

describe("moveQuoteReference", () => {
  it("moves every shipment that names the Won quote to its revision, with a history line, and tells both quotes", async () => {
    repository.liveBySalesNumber.mockResolvedValue([
      { id: "s-1", jobNumber: "CZ00000101" },
      { id: "s-2", jobNumber: "CZ00000102" },
    ]);
    await expect(shipmentService.moveQuoteReference(COMPANY, USER, REF, `${REF}-R1`)).resolves.toEqual(["CZ00000101", "CZ00000102"]);
    // Each in its write turn, only while it still names the quote; the history line in the same transaction.
    expect(repository.moveSalesNumber).toHaveBeenCalledWith(TX, "s-1", COMPANY, REF, `${REF}-R1`);
    expect(repository.moveSalesNumber).toHaveBeenCalledWith(TX, "s-2", COMPANY, REF, `${REF}-R1`);
    expect(vi.mocked(shipmentAuditRepository.create)).toHaveBeenCalledWith({ companyId: COMPANY, shipmentId: "s-1", userId: USER, field: "salesNumber", oldValue: REF, newValue: `${REF}-R1` }, TX);
    expect(links.syncReference.mock.calls.map((c) => c[1])).toEqual([`${REF}-R1`, REF]);
  });

  it("leaves a shipment whose Sales Number a user changed meanwhile, with no history line", async () => {
    repository.liveBySalesNumber.mockResolvedValue([
      { id: "s-1", jobNumber: "CZ00000101" },
      { id: "s-2", jobNumber: "CZ00000102" },
    ]);
    // s-1 was moved to another quote by hand between the read and its turn.
    repository.moveSalesNumber.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(shipmentService.moveQuoteReference(COMPANY, USER, REF, `${REF}-R1`)).resolves.toEqual(["CZ00000102"]);
    expect(vi.mocked(shipmentAuditRepository.create)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(shipmentAuditRepository.create)).toHaveBeenCalledWith(expect.objectContaining({ shipmentId: "s-2" }), TX);
  });

  it("leaves an invoiced shipment with the offer it was invoiced from", async () => {
    repository.liveBySalesNumber.mockResolvedValue([
      { id: "s-1", jobNumber: "CZ00000101", invoicingStatus: "Invoiced" },
      { id: "s-2", jobNumber: "CZ00000102", invoicingStatus: "Not Invoiced" },
    ]);
    await expect(shipmentService.moveQuoteReference(COMPANY, USER, REF, `${REF}-R1`)).resolves.toEqual(["CZ00000102"]);
    expect(repository.moveSalesNumber).toHaveBeenCalledTimes(1);
    expect(repository.moveSalesNumber).toHaveBeenCalledWith(TX, "s-2", COMPANY, REF, `${REF}-R1`);
  });

  it("leaves a shipment with an issued invoice with its offer, whatever its Invoicing Status says", async () => {
    repository.liveBySalesNumber.mockResolvedValue([
      { id: "s-1", jobNumber: "CZ00000101", invoicingStatus: "Not Invoiced" },
      { id: "s-2", jobNumber: "CZ00000102", invoicingStatus: "Not Invoiced" },
    ]);
    vi.mocked(invoicing.openInvoiceCount).mockImplementation(async ({ shipmentId }) => ({ count: shipmentId === "s-1" ? 1 : 0 }));
    await expect(shipmentService.moveQuoteReference(COMPANY, USER, REF, `${REF}-R1`)).resolves.toEqual(["CZ00000102"]);
    expect(repository.moveSalesNumber).toHaveBeenCalledTimes(1);
    expect(repository.moveSalesNumber).toHaveBeenCalledWith(TX, "s-2", COMPANY, REF, `${REF}-R1`);
  });

  it("moves nothing and tells nobody when no shipment names the quote", async () => {
    repository.liveBySalesNumber.mockResolvedValue([]);
    await expect(shipmentService.moveQuoteReference(COMPANY, USER, REF, `${REF}-R1`)).resolves.toEqual([]);
    expect(repository.moveSalesNumber).not.toHaveBeenCalled();
    expect(links.syncReference).not.toHaveBeenCalled();
  });
});

describe("shipmentsNamingQuotes", () => {
  it("answers every reference asked for - trimmed, once - with the shipments that name it, the oldest first", async () => {
    repository.liveBySalesNumbers.mockResolvedValue([
      { reference: REF, id: "s-1", jobNumber: "CZ00000101", status: "Booked" },
      { reference: REF, id: "s-2", jobNumber: "CZ00000102", status: "Delivered" },
    ]);
    await expect(shipmentService.shipmentsNamingQuotes(COMPANY, [` ${REF} `, REF, OTHER_REF, "  "])).resolves.toEqual([
      {
        reference: REF,
        shipments: [
          { id: "s-1", jobNumber: "CZ00000101", status: "Booked" },
          { id: "s-2", jobNumber: "CZ00000102", status: "Delivered" },
        ],
      },
      { reference: OTHER_REF, shipments: [] },
    ]);
    expect(repository.liveBySalesNumbers).toHaveBeenCalledWith(COMPANY, [REF, OTHER_REF]);
  });

  it("counts a shipment whose copy of the reference is from before the quote's letters changed", async () => {
    const LCL = `QCZLCL${REF.slice(3)}`;
    repository.liveBySalesNumbers.mockResolvedValue([
      { reference: REF, id: "s-1", jobNumber: "CZ00000101", status: "Booked" },
      { reference: LCL, id: "s-2", jobNumber: "CZ00000102", status: "Booked" },
    ]);
    await expect(shipmentService.shipmentsNamingQuotes(COMPANY, [LCL])).resolves.toEqual([
      {
        reference: LCL,
        shipments: [
          { id: "s-1", jobNumber: "CZ00000101", status: "Booked" },
          { id: "s-2", jobNumber: "CZ00000102", status: "Booked" },
        ],
      },
    ]);
  });

  it("refuses more than a page of quotes at once, before reading anything", async () => {
    const references = Array.from({ length: 201 }, (_, i) => `QCZ20261010${String(i).padStart(3, "0")}`);
    await expect(shipmentService.shipmentsNamingQuotes(COMPANY, references)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.liveBySalesNumbers).not.toHaveBeenCalled();
  });

  it("counts the references as sent: 201 copies of one quote are over the limit as well", async () => {
    await expect(shipmentService.shipmentsNamingQuotes(COMPANY, Array.from({ length: 201 }, () => REF))).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.liveBySalesNumbers).not.toHaveBeenCalled();
  });
});

describe("linkMasterJob", () => {
  const masterJobs = masterJobRepository as unknown as Record<string, ReturnType<typeof vi.fn>>;
  beforeEach(() => {
    masterJobs.findByMczNumber = vi.fn(async () => null);
    masterJobs.createForCompany = vi.fn(async (_companyId: string, values: { mczNumber: string }) => ({ id: "mj-new", ...values }));
    repository.updateForCompany.mockResolvedValue({ id: "s-1" } as never);
  });

  it("makes a master job that has no Load Type yet under its plain number, whatever letters were typed", async () => {
    await shipmentService.linkMasterJob("s-1", COMPANY, "MCZFULL00000020");
    expect(masterJobs.createForCompany).toHaveBeenCalledWith(COMPANY, { mczNumber: "MCZ00000020", createdBy: "" });
    expect(repository.updateForCompany).toHaveBeenCalledWith("s-1", COMPANY, { masterJobId: "mj-new" });
  });

  it("links to the master job the number names, letters or not, without making another", async () => {
    masterJobs.findByMczNumber = vi.fn(async () => ({ id: "mj-7", mczNumber: "MCZCONSOL00000007" }));
    await shipmentService.linkMasterJob("s-1", COMPANY, "MCZ00000007");
    expect(masterJobs.createForCompany).not.toHaveBeenCalled();
    expect(repository.updateForCompany).toHaveBeenCalledWith("s-1", COMPANY, { masterJobId: "mj-7" });
  });

  it("joins the master job another link to the same new number created a moment before", async () => {
    masterJobs.findByMczNumber = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "mj-first", mczNumber: "MCZ00000020" });
    masterJobs.createForCompany = vi.fn(async () => {
      throw Object.assign(new Error("duplicate key"), { cause: { code: "23505", constraint: "master_job_company_mcz_unique" } });
    });
    await shipmentService.linkMasterJob("s-1", COMPANY, "MCZ00000020");
    expect(repository.updateForCompany).toHaveBeenCalledWith("s-1", COMPANY, { masterJobId: "mj-first" });
  });

  it("does not take another unique clash for that one", async () => {
    masterJobs.createForCompany = vi.fn(async () => {
      throw Object.assign(new Error("duplicate key"), { cause: { code: "23505", constraint: "something_else" } });
    });
    await expect(shipmentService.linkMasterJob("s-1", COMPANY, "MCZ00000020")).rejects.toThrow("duplicate key");
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });
});

describe("Customer's PIC is a contact of the shipment's customer", () => {
  const CUSTOMER = "00000000-0000-0000-0000-00000000c0c0";
  const create = (over: Record<string, unknown> = {}) => shipmentService.create(COMPANY, { ...over } as never);
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);
  const written = () => repository.updateForCompany.mock.calls[0]![2] as Record<string, unknown>;
  const contacts = (...names: string[]) =>
    vi.mocked(customers.contactList).mockResolvedValue({ data: names.map((name, i) => ({ id: `k${i}`, name })) } as never);
  beforeEach(() => {
    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { id: CUSTOMER, companyName: "Alfa", registeredAddress: "", country: "CZ" } } as never);
    vi.mocked(customers.addressList).mockResolvedValue({ data: [] } as never);
  });

  it("stores the picked contact by its saved name, nobody as empty", async () => {
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customerPic: "" }));
    contacts("Petr Pádlo", "Jana Malá");
    await update({ customerPic: " petr pádlo " });
    expect(customers.contactList).toHaveBeenCalledWith({ customerId: CUSTOMER });
    expect(written()).toMatchObject({ customerPic: "Petr Pádlo" });
  });

  it("refuses a name that is no contact of the customer, and any name without a customer", async () => {
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customerPic: "" }));
    contacts("Petr Pádlo");
    await expect(update({ customerPic: "Petr" })).rejects.toMatchObject({
      code: "invalid_argument",
      message: "Customer's Contact: pick a contact saved for this customer in the Customer Database",
    });
    stored.set(SHIPMENT, row({ customerId: null, customerPic: "" }));
    await expect(update({ customerPic: "Petr Pádlo" })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("link the shipment to a customer first") });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("checks against the customer picked in the same write", async () => {
    stored.set(SHIPMENT, row({ customerId: null, customerPic: "" }));
    contacts("Jana Malá");
    await update({ customerId: CUSTOMER, customer: "Alfa", customerPic: "Jana Malá" });
    expect(customers.contactList).toHaveBeenCalledWith({ customerId: CUSTOMER });
    expect(written()).toMatchObject({ customerPic: "Jana Malá" });
  });

  it("starts the billing of a shipment linked to a customer in the customer's currency, once per new customer", async () => {
    stored.set(SHIPMENT, row({ customerId: null, customerPic: "" }));
    await update({ customerId: CUSTOMER, customer: "Alfa" });
    expect(invoicing._internalShipmentBillingStart).toHaveBeenCalledWith({ shipmentId: SHIPMENT });
    vi.mocked(invoicing._internalShipmentBillingStart).mockClear();
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customerPic: "" }));
    await update({ pol: "Hamburg" });
    expect(invoicing._internalShipmentBillingStart).not.toHaveBeenCalled();
  });

  it("saves the shipment all the same when invoicing can't start its billing", async () => {
    stored.set(SHIPMENT, row({ customerId: null, customerPic: "" }));
    vi.mocked(invoicing._internalShipmentBillingStart).mockRejectedValueOnce(new Error("invoicing is unreachable"));
    await expect(update({ customerId: CUSTOMER, customer: "Alfa" })).resolves.toBeDefined();
    expect(log.error).toHaveBeenCalled();
  });

  it("keeps an old free-text value the shipment holds, without asking for the contacts", async () => {
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customerPic: "Petr" }));
    await update({ customerPic: "Petr", pol: "Hamburg" });
    expect(customers.contactList).not.toHaveBeenCalled();
    expect(written()).toMatchObject({ customerPic: "Petr" });
  });

  it("leaves a name that is no contact out of a new shipment instead of failing it", async () => {
    contacts("Petr Pádlo");
    await create({ customerId: CUSTOMER, customer: "Alfa", customerPic: "Somebody" });
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ customerPic: "", customerPicContactId: null });
  });

  it("stores the contact's id with its name, so a rename in the Customer Database reaches the shipment", async () => {
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customerPic: "", customerPicContactId: null }));
    contacts("Petr Pádlo", "Jana Malá");
    await update({ customerPic: "jana malá" });
    expect(written()).toMatchObject({ customerPic: "Jana Malá", customerPicContactId: "k1" });
  });

  it("takes a contact sent by its id, with the name it has now", async () => {
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customerPic: "", customerPicContactId: null }));
    contacts("Petr Masák");
    await update({ customerPicContactId: "k0", customerPic: "Petr" });
    expect(written()).toMatchObject({ customerPic: "Petr Masák", customerPicContactId: "k0" });
  });

  it("refuses an id that is no contact of the customer, and clears name and id together", async () => {
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customerPic: "Petr Masák", customerPicContactId: "k0" }));
    contacts("Petr Masák");
    await expect(update({ customerPicContactId: "k9" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    await update({ customerPicContactId: null });
    expect(written()).toMatchObject({ customerPic: "", customerPicContactId: null });
  });

  it("clears the PIC when the shipment moves to a customer it is no contact of, and keeps it on one it is", async () => {
    const OTHER = "00000000-0000-0000-0000-00000000c0c1";
    vi.mocked(customers.contactList).mockImplementation(async ({ customerId }) =>
      ({ data: customerId === CUSTOMER ? [{ id: "k0", name: "Petr Masák" }] : [{ id: "k7", name: "Eva Nová" }] }) as never,
    );
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customerPic: "Petr Masák", customerPicContactId: "k0" }));
    await update({ customerId: OTHER, customer: "Beta" });
    expect(written()).toMatchObject({ customerId: OTHER, customerPic: "", customerPicContactId: null });

    stored.set(SHIPMENT, row({ customerId: OTHER, customerPic: "Petr Masák", customerPicContactId: "k0" }));
    await update({ customerId: CUSTOMER });
    expect(repository.updateForCompany.mock.calls[1]![2]).toMatchObject({ customerId: CUSTOMER, customerPic: "Petr Masák", customerPicContactId: "k0" });
  });

  it("reads each customer's contacts once per write", async () => {
    stored.set(SHIPMENT, row({ customerId: null, customerPic: "", shipperId: null, shipperContact: "" }));
    contacts("Jana Malá");
    await update({ customerId: CUSTOMER, customerPic: "Jana Malá", shipperId: CUSTOMER, shipperContact: "jana malá", pickupAddress: "typed" });
    expect(customers.contactList).toHaveBeenCalledTimes(1);
    expect(written()).toMatchObject({ customerPicContactId: "k0", shipperContact: "Jana Malá", shipperContactId: "k0" });
  });
});

describe("a party linked to a customer carries the customer's current name", () => {
  const CUSTOMER = "00000000-0000-0000-0000-00000000c0c0";
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);
  const written = () => repository.updateForCompany.mock.calls[0]![2] as Record<string, unknown>;
  beforeEach(() => {
    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { id: CUSTOMER, companyName: "Alfa s.r.o.", registeredAddress: "", country: "CZ" } } as never);
    vi.mocked(customers.addressList).mockResolvedValue({ data: [] } as never);
    vi.mocked(customers.contactList).mockResolvedValue({ data: [] } as never);
  });

  it("stores the Customer Database's name with the id, whatever text the write sends", async () => {
    stored.set(SHIPMENT, row({ customerId: null, customer: "" }));
    await update({ customerId: CUSTOMER, customer: "alfa sro", shipperId: CUSTOMER, consigneeId: CUSTOMER, principalPartyId: CUSTOMER });
    expect(written()).toMatchObject({ customer: "Alfa s.r.o.", shipper: "Alfa s.r.o.", consignee: "Alfa s.r.o.", principalParty: "Alfa s.r.o." });
  });

  it("does so on create too (Trucking's road jobs send the name they have)", async () => {
    await shipmentService.create(COMPANY, { customerId: CUSTOMER, customer: "ALFA" } as never);
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ customerId: CUSTOMER, customer: "Alfa s.r.o." });
  });

  it("keeps the text of a party that is unlinked", async () => {
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customer: "Alfa s.r.o." }));
    await update({ customerId: null, customer: "Walk-in customer" });
    expect(written()).toMatchObject({ customerId: null, customer: "Walk-in customer" });
  });
});

describe("the shipment's Customer is a company with the Customer role", () => {
  const CUSTOMER = "00000000-0000-0000-0000-00000000c0c0";
  const HAULIER = "00000000-0000-0000-0000-00000000a1a1";
  const byManager = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER, "manager");
  beforeEach(() => {
    vi.mocked(customers.customerGet).mockImplementation(
      async ({ id }) =>
        ({
          customer:
            id === HAULIER
              ? { id, companyName: "Rychlá Doprava s.r.o.", roles: ["haulier"], registeredAddress: "", country: "CZ" }
              : { id, companyName: "Alfa s.r.o.", roles: ["customer", "haulier"], registeredAddress: "", country: "CZ" },
        }) as never,
    );
    vi.mocked(customers.addressList).mockResolvedValue({ data: [] } as never);
    vi.mocked(customers.contactList).mockResolvedValue({ data: [] } as never);
  });

  it("refuses a person's pick of a company without it, and writes nothing", async () => {
    stored.set(SHIPMENT, row({ customerId: null, customer: "" }));
    await expect(byManager({ customerId: HAULIER, customer: "Rychlá Doprava s.r.o." })).rejects.toMatchObject({
      code: "invalid_argument",
      message: "Not a customer: Rychlá Doprava s.r.o. has no Customer role in the Customer Database",
    });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("links a company with the Customer role, also one that is a supplier too", async () => {
    stored.set(SHIPMENT, row({ customerId: null, customer: "" }));
    await byManager({ customerId: CUSTOMER, customer: "Alfa" });
    expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ customerId: CUSTOMER, customer: "Alfa s.r.o." });
  });

  it("keeps the Customer the shipment has, also one that lost the role since", async () => {
    stored.set(SHIPMENT, row({ customerId: HAULIER, customer: "Rychlá Doprava s.r.o." }));
    await byManager({ customerId: HAULIER, customer: "Rychlá Doprava s.r.o.", customerReference: "PO-7" });
    expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ customerId: HAULIER, customerReference: "PO-7" });
  });

  it("lets a shipper be any company", async () => {
    stored.set(SHIPMENT, row({ shipperId: null, shipper: "" }));
    await byManager({ shipperId: HAULIER, shipper: "Rychlá Doprava s.r.o." });
    expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ shipperId: HAULIER });
  });

  it("holds a person's create to it, not the app's own (a Trucking road job)", async () => {
    await expect(shipmentService.create(COMPANY, { customerId: HAULIER, customer: "x" } as never, undefined, { creatorRole: "manager" })).rejects.toMatchObject({
      code: "invalid_argument",
      message: expect.stringMatching(/^Not a customer: /),
    });
    await shipmentService.create(COMPANY, { customerId: HAULIER, customer: "x" } as never);
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ customerId: HAULIER, customer: "Rychlá Doprava s.r.o." });
  });
});

describe("a shipper's or consignee's Contact", () => {
  const PARTY = "3c1e2f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
  const OTHER = "7d2e1f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5c";
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);
  const written = () => repository.updateForCompany.mock.calls[0]![2] as Record<string, unknown>;
  beforeEach(() => {
    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { companyName: "Alza.cz a.s.", registeredAddress: "", country: "CZ" } } as never);
    vi.mocked(customers.addressList).mockResolvedValue({ data: [] } as never);
    vi.mocked(customers.contactList).mockImplementation(async ({ customerId }) =>
      ({ data: customerId === PARTY ? [{ id: "c-jana", name: "Jana Servis", role: "Customer Service", isMain: false }] : [] }) as never,
    );
  });

  it("links a name of one of the party's contacts, and keeps somebody else's name as typed", async () => {
    stored.set(SHIPMENT, row({ shipperId: PARTY, shipperContact: "", shipperContactId: null }));
    await update({ shipperContact: "jana servis" });
    expect(written()).toMatchObject({ shipperContact: "Jana Servis", shipperContactId: "c-jana" });
    await update({ shipperContact: "Driver Karel" });
    expect(repository.updateForCompany.mock.calls[1]![2]).toMatchObject({ shipperContact: "Driver Karel", shipperContactId: null });
  });

  it("clears a linked Contact when the party changes to one it is no contact of; a typed one stays", async () => {
    stored.set(SHIPMENT, row({ consigneeId: PARTY, consigneeContact: "Jana Servis", consigneeContactId: "c-jana" }));
    await update({ consigneeId: OTHER });
    expect(written()).toMatchObject({ consigneeId: OTHER, consigneeContact: "", consigneeContactId: null });

    stored.set(SHIPMENT, row({ consigneeId: PARTY, consigneeContact: "Driver Karel", consigneeContactId: null }));
    await update({ consigneeId: OTHER });
    expect(repository.updateForCompany.mock.calls[1]![2]).not.toHaveProperty("consigneeContact");
  });
});

describe("the Agent and the Agent's Contact", () => {
  const AGENT = "5a1e2f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5d";
  const NO_MAIN = "6b2e1f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5e";
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);
  const written = () => repository.updateForCompany.mock.calls[0]![2] as Record<string, unknown>;
  beforeEach(() => {
    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { companyName: "EPT Global India", registeredAddress: "", country: "IN" } } as never);
    vi.mocked(customers.addressList).mockResolvedValue({ data: [] } as never);
    vi.mocked(customers.contactList).mockImplementation(async ({ customerId }) =>
      ({
        data:
          customerId === AGENT
            ? [
                { id: "c-ops", name: "Ravi Ops", role: "Customer Service", isMain: false },
                { id: "c-sunil", name: "Sunil Nablil", role: "Sales", isMain: true },
              ]
            : [{ id: "c-x", name: "Somebody", role: "", isMain: false }],
      }) as never,
    );
  });

  it("brings the agent's main contact when the agent is picked", async () => {
    stored.set(SHIPMENT, row({ agentId: null, agent: "", agentPic: "", agentPicContactId: null }));
    await update({ agent: "ept", agentId: AGENT });
    expect(written()).toMatchObject({ agent: "EPT Global India", agentId: AGENT, agentPic: "Sunil Nablil", agentPicContactId: "c-sunil" });
  });

  it("takes the previous agent's contact away when the new agent has no main contact", async () => {
    stored.set(SHIPMENT, row({ agentId: AGENT, agent: "EPT Global India", agentPic: "Sunil Nablil", agentPicContactId: "c-sunil" }));
    await update({ agentId: NO_MAIN });
    expect(written()).toMatchObject({ agentId: NO_MAIN, agentPic: "", agentPicContactId: null });
  });

  it("keeps a contact the write sends itself, and leaves the contact alone when the agent stays", async () => {
    stored.set(SHIPMENT, row({ agentId: null, agent: "", agentPic: "", agentPicContactId: null }));
    await update({ agentId: AGENT, agentPic: "Ravi Ops", agentPicContactId: "c-ops" });
    expect(written()).toMatchObject({ agentPic: "Ravi Ops", agentPicContactId: "c-ops" });

    stored.set(SHIPMENT, row({ agentId: AGENT, agent: "EPT Global India", agentPic: "Ravi Ops", agentPicContactId: "c-ops" }));
    await update({ agentId: AGENT });
    expect(repository.updateForCompany.mock.calls[1]![2]).not.toHaveProperty("agentPic");
  });
});

describe("other services are told when the Customer or the Customer's PIC changes", () => {
  const CUSTOMER = "00000000-0000-0000-0000-00000000c0c0";
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);
  const publish = vi.mocked(shipmentPartiesChanged.publish);
  beforeEach(() => {
    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { id: CUSTOMER, companyName: "Alfa s.r.o.", registeredAddress: "", country: "CZ" } } as never);
    vi.mocked(customers.addressList).mockResolvedValue({ data: [] } as never);
    vi.mocked(customers.contactList).mockResolvedValue({ data: [{ id: "k0", name: "Petr Masák" }] } as never);
  });

  it("publishes the shipment's Customer and Customer's PIC as they now read", async () => {
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customer: "Alfa s.r.o.", customerPic: "", customerPicContactId: null }));
    await update({ customerPic: "Petr Masák" });
    expect(publish).toHaveBeenCalledWith({ companyId: COMPANY, shipmentId: SHIPMENT, customer: "Alfa s.r.o.", customerPic: "Petr Masák" });

    stored.set(SHIPMENT, row({ customerId: null, customer: "Old name", customerPic: "" }));
    await update({ customerId: CUSTOMER });
    expect(publish).toHaveBeenLastCalledWith({ companyId: COMPANY, shipmentId: SHIPMENT, customer: "Alfa s.r.o.", customerPic: "" });
  });

  it("publishes nothing when neither changes", async () => {
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customer: "Alfa s.r.o.", customerPic: "Petr Masák", customerPicContactId: "k0" }));
    await update({ pol: "Hamburg", customerPic: "Petr Masák" });
    expect(publish).not.toHaveBeenCalled();
  });

  it("saves the shipment also when the news can't be published: logged", async () => {
    publish.mockRejectedValue(new Error("pubsub is down"));
    stored.set(SHIPMENT, row({ customerId: CUSTOMER, customer: "Alfa s.r.o.", customerPic: "" }));
    await expect(update({ customerPic: "Petr Masák" })).resolves.toMatchObject({ customerPic: "Petr Masák" });
    expect(log.warn).toHaveBeenCalledWith(expect.any(Error), "shipment parties change not published", expect.objectContaining({ shipmentId: SHIPMENT }));
  });
});

describe("the Customer's PIC of a shipment made from a quote", () => {
  const CUSTOMER = "00000000-0000-0000-0000-00000000c0c0";
  const fromQuote = (data: Record<string, unknown>, over: Record<string, unknown> = {}) => {
    salesQuoteGet.mockResolvedValue(quote({ data }));
    return shipmentService.create(COMPANY, { fromQuoteNumber: REF, customerId: CUSTOMER, customer: "Alfa", ...over } as never);
  };
  const created = () => repository.createFromQuote.mock.calls[0]![2] as Record<string, unknown>;
  beforeEach(() => {
    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { id: CUSTOMER, companyName: "Alfa", registeredAddress: "", country: "CZ" } } as never);
    vi.mocked(customers.contactList).mockResolvedValue({ data: [{ id: "k0", name: "Petr Masák" }, { id: "k1", name: "Jana Malá" }] } as never);
  });

  it("is the contact the quote keeps by id, with the name it has now", async () => {
    await fromQuote({ customerContact: "Petr", customerContactId: "k0" }, { customerPic: "Petr" });
    expect(created()).toMatchObject({ customerPic: "Petr Masák", customerPicContactId: "k0" });
  });

  it("is taken from the quote when the request names nobody", async () => {
    await fromQuote({ customerContact: "Petr", customerContactId: "k0" });
    expect(created()).toMatchObject({ customerPic: "Petr Masák", customerPicContactId: "k0" });
  });

  it("is matched by name for a quote that keeps no id, and left out when it is no contact", async () => {
    await fromQuote({ customerContact: "jana malá" }, { customerPic: "jana malá" });
    expect(created()).toMatchObject({ customerPic: "Jana Malá", customerPicContactId: "k1" });
    await fromQuote({ customerContact: "Petr", customerContactId: "gone" }, { customerPic: "Petr" });
    expect(repository.createFromQuote.mock.calls[1]![2]).toMatchObject({ customerPic: "", customerPicContactId: null });
  });

  it("is whom the request names instead, or nobody", async () => {
    await fromQuote({ customerContact: "Petr", customerContactId: "k0" }, { customerPic: "Jana Malá" });
    expect(created()).toMatchObject({ customerPic: "Jana Malá", customerPicContactId: "k1" });
    await fromQuote({ customerContact: "Petr", customerContactId: "k0" }, { customerPic: "" });
    expect(repository.createFromQuote.mock.calls[1]![2]).toMatchObject({ customerPic: "", customerPicContactId: null });
  });
});

describe("cargo lines and containers", () => {
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);
  const A = "0b8e1d2c-0000-4000-8000-00000000000a";
  const B = "0b8e1d2c-0000-4000-8000-00000000000b";
  const dim = (containerId: string | null, pieces = "2") => ({ containerId, pieces, lengthCm: "1", widthCm: "1", heightCm: "1", weightPerPcKg: "1", packageType: "", stackable: "" });
  const containers = (...ids: string[]) =>
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue(ids.map((id) => ({ id, containerNumber: "MSKU1234567", sealNumber: "", type: "", teu: "", packages: "", packageType: "", grossWeight: "", volume: "" })) as never);

  beforeEach(() => stored.set(SHIPMENT, row()));

  it("with exactly one container, lines without one are saved to it and stored loose lines move to it", async () => {
    containers(A);
    await update({ cargoDimensions: [dim(null), dim(A, "3")] });
    expect(vi.mocked(cargoDimensionRepository.replaceForShipment).mock.calls[0]![2]).toMatchObject([dim(A), dim(A, "3")]);
    expect(cargoDimensionRepository.assignLooseToContainer).toHaveBeenCalledWith(SHIPMENT, COMPANY, A, TX);
    expect(cargoItemRepository.assignLooseToContainer).toHaveBeenCalledWith(SHIPMENT, COMPANY, A, TX);
  });

  it("moves stored loose lines when only the containers are saved (the first container was just added)", async () => {
    containers(A);
    await update({ containers: [{ id: A, containerNumber: "MSKU1234567" }] });
    expect(cargoDimensionRepository.replaceForShipment).not.toHaveBeenCalled();
    expect(cargoDimensionRepository.assignLooseToContainer).toHaveBeenCalledWith(SHIPMENT, COMPANY, A, TX);
  });

  it("with two containers, keeps lines without a container as they are", async () => {
    containers(A, B);
    await update({ cargoDimensions: [dim(null), dim(B)] });
    expect(vi.mocked(cargoDimensionRepository.replaceForShipment).mock.calls[0]![2]).toMatchObject([dim(null), dim(B)]);
    expect(cargoDimensionRepository.assignLooseToContainer).not.toHaveBeenCalled();
  });

  it("with one container, gives it also a line naming a container that is gone (a stale screen after the only one was replaced)", async () => {
    containers(A);
    await update({ cargoDimensions: [dim("0b8e1d2c-0000-4000-8000-0000000000ff")] });
    expect(vi.mocked(cargoDimensionRepository.replaceForShipment).mock.calls[0]![2]).toMatchObject([dim(A)]);
  });

  it("drops a line of a container that no longer exists instead of bringing it back as shipment cargo", async () => {
    containers(A, B);
    await update({ cargoDimensions: [dim(A), dim("0b8e1d2c-0000-4000-8000-0000000000ff")] });
    expect(vi.mocked(cargoDimensionRepository.replaceForShipment).mock.calls[0]![2]).toMatchObject([dim(A)]);
  });

  it("stores the volume typed for a piece as a plain number, and none beside all three sizes", async () => {
    containers(A);
    const unsized = { ...dim(A), heightCm: "", volumePerPcM3: "0,50" };
    await update({ cargoDimensions: [unsized, { ...dim(A), volumePerPcM3: "4" }] });
    expect(vi.mocked(cargoDimensionRepository.replaceForShipment).mock.calls[0]![2]).toMatchObject([
      { heightCm: "", volumePerPcM3: "0.5" },
      { heightCm: "1", volumePerPcM3: "" },
    ]);
  });

  it("refuses a typed volume that is no plain number of m³ and writes nothing", async () => {
    containers(A);
    await expect(update({ cargoDimensions: [dim(A), { ...dim(A), heightCm: "", volumePerPcM3: "-2" }] })).rejects.toMatchObject({
      code: "invalid_argument",
      message: "Cargo line 2: volume per piece cannot be negative",
    });
    await expect(update({ cargoDimensions: [{ ...dim(A), heightCm: "", volumePerPcM3: "0.5 m3" }] })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(cargoDimensionRepository.replaceForShipment).not.toHaveBeenCalled();
  });

  describe("ADR details and Dangerous", () => {
    const adrLine = { ...dim(A), adrUn: "UN 1203" };
    const dangerousSaved = () =>
      repository.updateForCompany.mock.calls.map(([, , data]) => (data as { dangerous?: string }).dangerous).filter((value) => value !== undefined);

    beforeEach(() => containers(A));

    it("a line saved with ADR details switches Dangerous to Yes, in the shipment's history", async () => {
      stored.set(SHIPMENT, row({ dangerous: "" }));
      await update({ cargoDimensions: [dim(A), adrLine] });
      expect(dangerousSaved()).toEqual(["Yes"]);
      expect(shipmentAuditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ field: "dangerous", oldValue: "", newValue: "Yes" }), TX);
    });

    it("wins over a No, also one sent in the same write", async () => {
      stored.set(SHIPMENT, row({ dangerous: "No" }));
      await update({ dangerous: "No", cargoDimensions: [adrLine] });
      expect(dangerousSaved()).toEqual(["Yes"]);
    });

    it("leaves Dangerous alone when the lines have no ADR details, the ADR details just removed included", async () => {
      stored.set(SHIPMENT, row({ dangerous: "Yes" }));
      await update({ cargoDimensions: [dim(A)] });
      expect(dangerousSaved()).toEqual([]);
    });

    it("leaves a Dangerous picked by hand alone when the write does not touch the lines", async () => {
      stored.set(SHIPMENT, row({ dangerous: "" }));
      await update({ dangerous: "No" });
      expect(dangerousSaved()).toEqual(["No"]);
    });

    it("a refused UN number changes nothing", async () => {
      stored.set(SHIPMENT, row({ dangerous: "" }));
      await expect(update({ cargoDimensions: [{ ...dim(A), adrUn: "12" }] })).rejects.toMatchObject({ code: "invalid_argument" });
      expect(repository.updateForCompany).not.toHaveBeenCalled();
    });

    it("a new shipment with ADR details starts as Dangerous", async () => {
      await shipmentService.create(COMPANY, { cargoDimensions: [dim(null), { ...dim(null), adrClass: "3" }] } as never);
      expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ dangerous: "Yes" });
    });
  });
});

describe("removing the only container", () => {
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);
  const A = "0b8e1d2c-0000-4000-8000-00000000000a";
  const N = "0b8e1d2c-0000-4000-8000-00000000000c";
  const one = { id: A, containerNumber: "MSKU1234567", sealNumber: "", type: "", teu: "", packages: "", packageType: "", grossWeight: "", volume: "" };
  beforeEach(() => {
    stored.set(SHIPMENT, row());
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([one] as never);
  });

  it("keeps its cargo as shipment cargo when it is deleted", async () => {
    await update({ containers: [] });
    expect(cargoItemRepository.detachFromContainers).toHaveBeenCalledWith(SHIPMENT, COMPANY, [A], TX);
    expect(cargoDimensionRepository.detachFromContainers).toHaveBeenCalledWith(SHIPMENT, COMPANY, [A], TX);
  });

  it("keeps its cargo when it is replaced by a new container", async () => {
    await update({ containers: [{ ...one, id: N, containerNumber: "TGHU2205539" }] });
    expect(cargoDimensionRepository.detachFromContainers).toHaveBeenCalledWith(SHIPMENT, COMPANY, [A], TX);
  });

  it("touches nothing when the container stays", async () => {
    await update({ containers: [one] });
    expect(cargoDimensionRepository.detachFromContainers).not.toHaveBeenCalled();
  });

  it("touches nothing when a line without a usable id takes its place - the sync updates the container in place", async () => {
    await update({ containers: [{ ...one, id: undefined, containerNumber: "TGHU2205539" }] });
    await update({ containers: [{ ...one, id: "row-1", containerNumber: "TGHU2205539" }] });
    expect(cargoItemRepository.detachFromContainers).not.toHaveBeenCalled();
    expect(cargoDimensionRepository.detachFromContainers).not.toHaveBeenCalled();
  });

  it("keeps a cargo line sent in the same write naming it as shipment cargo, like the lines it had", async () => {
    // Read for the audit log, by the sync before it removes the container, then after it.
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValueOnce([one] as never).mockResolvedValueOnce([one] as never).mockResolvedValueOnce([]);
    const dim = (containerId: string | null) => ({ containerId, pieces: "2", lengthCm: "1", widthCm: "1", heightCm: "1", weightPerPcKg: "1", packageType: "", stackable: "" });
    await update({ containers: [], cargoDimensions: [dim(A), dim(null)] });
    expect(vi.mocked(cargoDimensionRepository.replaceForShipment).mock.calls[0]![2]).toMatchObject([dim(null), dim(null)]);
  });
});

describe("the detail rows of one write", () => {
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);
  const A = "0b8e1d2c-0000-4000-8000-00000000000a";
  const B = "0b8e1d2c-0000-4000-8000-00000000000b";
  const one = { id: A, containerNumber: "MSKU1234567", sealNumber: "", type: "", teu: "", packages: "", packageType: "", grossWeight: "", volume: "" };
  const dim = (containerId: string | null) => ({ containerId, pieces: "2", lengthCm: "1", widthCm: "1", heightCm: "1", weightPerPcKg: "1", packageType: "", stackable: "" });
  // The audit entries of the detail-row lists (the shipment's own fields have theirs too).
  const LISTS = ["containers", "cargoItems", "cargoDimensions", "commercialInvoices"];
  const listEntries = () => vi.mocked(shipmentAuditRepository.create).mock.calls.map(([entry]) => entry).filter((e) => LISTS.includes(e.field));
  beforeEach(() => stored.set(SHIPMENT, row()));

  it("are written with the audit entries and the shipment row in one transaction holding the shipment's turn", async () => {
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([one] as never);
    await update({
      vessel: "MSC ANNA",
      containers: [one],
      cargoItems: [{ containerId: A, cargoDescription: "Shoes" }],
      cargoDimensions: [{ containerId: A, pieces: "1" }],
      commercialInvoices: [{ invoiceNumber: "INV-1", value: "10", currency: "EUR" }],
    });
    expect(shipmentRepository.writeTurn).toHaveBeenCalledTimes(1);
    expect(shipmentRepository.writeTurn).toHaveBeenCalledWith(SHIPMENT, COMPANY, expect.any(Function));
    expect(vi.mocked(containerRepository.syncForShipment).mock.calls[0]![3]).toBe(TX);
    expect(vi.mocked(cargoItemRepository.replaceForShipment).mock.calls[0]![3]).toBe(TX);
    expect(vi.mocked(cargoDimensionRepository.replaceForShipment).mock.calls[0]![3]).toBe(TX);
    expect(vi.mocked(commercialInvoiceRepository.replaceForShipment).mock.calls[0]![3]).toBe(TX);
    expect(vi.mocked(shipmentRepository.updateForCompany).mock.calls[0]![3]).toBe(TX);
    for (const [, tx] of vi.mocked(shipmentAuditRepository.create).mock.calls) expect(tx).toBe(TX);
    // The reads of the lines for the audit log and for the sync are inside it too (the
    // shipment the update answers with is read after it).
    expect(vi.mocked(containerRepository.listByShipmentId).mock.calls.slice(0, 4)).toEqual(Array(4).fill([SHIPMENT, COMPANY, TX]));
  });

  it("are neither read nor written when the write has none", async () => {
    await update({ vessel: "MSC ANNA" });
    expect(containerRepository.listByShipmentId).not.toHaveBeenCalledWith(SHIPMENT, COMPANY, TX);
    expect(containerRepository.syncForShipment).not.toHaveBeenCalled();
    expect(listEntries()).toEqual([]);
    expect(vi.mocked(shipmentAuditRepository.create).mock.calls.map(([entry]) => entry.field)).toContain("vessel");
  });

  it("leave an audit entry for each list that came out different, its lines before and after", async () => {
    const item = { containerId: A, cargoDescription: "Shoes", hsCode: "", pieces: "1", packageType: "", grossWeight: "", commercialInvoiceValue: "", currency: "EUR" };
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([one] as never);
    vi.mocked(cargoItemRepository.listByShipmentId).mockResolvedValueOnce([]).mockResolvedValue([item] as never);
    await update({ containers: [one], cargoItems: [item] });
    expect(listEntries()).toEqual([{ companyId: COMPANY, shipmentId: SHIPMENT, userId: USER, field: "cargoItems", oldValue: "[]", newValue: JSON.stringify([item]) }]);
  });

  it("leave no audit entry when the lines sent are the lines stored", async () => {
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([one] as never);
    await update({ containers: [one] });
    expect(listEntries()).toEqual([]);
  });

  it("give a cargo line the id its new container got when the id the client made for it was taken", async () => {
    const CLIENT = "0b8e1d2c-0000-4000-8000-0000000000cc";
    vi.mocked(containerRepository.syncForShipment).mockResolvedValue(new Map([[CLIENT, A]]));
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValue([one, { ...one, id: B }] as never);
    await update({ containers: [{ ...one, id: CLIENT }, { ...one, id: B }], cargoDimensions: [dim(CLIENT), dim(B)] });
    expect(vi.mocked(cargoDimensionRepository.replaceForShipment).mock.calls[0]![2]).toMatchObject([dim(A), dim(B)]);
  });
});

describe("the caller's own write alongside an update", () => {
  const vessel = { vessel: "MSC ANNA" } as never;
  beforeEach(() => stored.set(SHIPMENT, row()));

  it("is done in the update's write turn, handed its transaction, once the shipment row is saved", async () => {
    const alongside = vi.fn(async () => {});
    await shipmentService.update(SHIPMENT, COMPANY, vessel, USER, undefined, undefined, undefined, { alongside });
    expect(alongside).toHaveBeenCalledWith(TX);
    expect(vi.mocked(shipmentRepository.updateForCompany).mock.invocationCallOrder[0]!).toBeLessThan(alongside.mock.invocationCallOrder[0]!);
  });

  it("is not done when the turn refuses the write, and refuses the write itself when it throws", async () => {
    const alongside = vi.fn(async () => {});
    const changed = () => {
      throw APIError.aborted("The job changed meanwhile");
    };
    await expect(shipmentService.update(SHIPMENT, COMPANY, vessel, USER, undefined, undefined, changed, { alongside })).rejects.toMatchObject({ code: "aborted" });
    expect(alongside).not.toHaveBeenCalled();
    const refusing = vi.fn(async () => {
      throw APIError.aborted("The row was closed meanwhile");
    });
    await expect(shipmentService.update(SHIPMENT, COMPANY, vessel, USER, undefined, undefined, undefined, { alongside: refusing })).rejects.toMatchObject({ code: "aborted" });
    expect(refusing).toHaveBeenCalledWith(TX);
  });
});

describe("the Pick-up tab's License Plate", () => {
  it("comes with the shipment, read from the warehouse service", async () => {
    stored.set(SHIPMENT, row());
    vi.mocked(warehouse._internalPickupPlates).mockResolvedValue({ plates: [{ shipmentId: SHIPMENT, licensePlate: "1AB 2345, 3CD 4567" }] });
    const shipment = await shipmentService.getById(SHIPMENT, COMPANY);
    expect(shipment?.licensePlate).toBe("1AB 2345, 3CD 4567");
    expect(warehouse._internalPickupPlates).toHaveBeenCalledWith({ companyId: COMPANY, shipmentIds: [SHIPMENT], seesConcepts: false });
  });

  it("asks for the Warehouse Concept's plate only for a user who sees the Concept (review of mock council C2)", async () => {
    stored.set(SHIPMENT, row());
    try {
      signedIn.role = "superadmin";
      await shipmentService.getById(SHIPMENT, COMPANY);
      expect(warehouse._internalPickupPlates).toHaveBeenLastCalledWith({ companyId: COMPANY, shipmentIds: [SHIPMENT], seesConcepts: true });
      signedIn.role = "admin";
      await shipmentService.getById(SHIPMENT, COMPANY);
      expect(warehouse._internalPickupPlates).toHaveBeenLastCalledWith({ companyId: COMPANY, shipmentIds: [SHIPMENT], seesConcepts: false });
    } finally {
      signedIn.role = null;
    }
  });

  it("is empty for a shipment without one", async () => {
    stored.set(SHIPMENT, row());
    expect((await shipmentService.getById(SHIPMENT, COMPANY))?.licensePlate).toBe("");
  });

  it("leaves the column empty, not the shipment unreadable, when the warehouse service fails", async () => {
    stored.set(SHIPMENT, row());
    vi.mocked(warehouse._internalPickupPlates).mockRejectedValue(new Error("warehouse down"));
    const shipment = await shipmentService.getById(SHIPMENT, COMPANY);
    expect(shipment?.jobNumber).toBe("CZ00000101");
    expect(shipment?.licensePlate).toBe("");
  });
});

// User council O2 / E7: a job with only a dimension line has no HS code, description or package
// type to compute; what was typed on the job still shows. What a line gives wins.
describe("Colli, Type of packages, HS code and Cargo description of a job with lines", () => {
  const typed = { pcs: "22", typeOfPackages: "Pallets", hsCode: "85044090", cargoDescription: "Power adapters, 3 pallets" };
  const dimension = { id: "d1", containerId: null, pieces: "3", lengthCm: "120", widthCm: "80", heightCm: "100", dimensionUnit: "cm", weightPerPcKg: "100", volumePerPcM3: "", packageType: "", stackable: "", palletType: null, adrUn: "", adrClass: "", adrPackingGroup: null, adrLimitedQuantity: false };
  const item = { id: "i1", containerId: null, cargoDescription: "Gears", hsCode: "84834021", pieces: "", packageType: "", grossWeight: "", commercialInvoiceValue: "", currency: "EUR" };
  beforeEach(() => stored.set(SHIPMENT, row(typed)));

  it("keep each typed value the lines give none of", async () => {
    vi.mocked(cargoDimensionRepository.listByShipmentId).mockResolvedValue([dimension] as never);
    const shipment = await shipmentService.getById(SHIPMENT, COMPANY);
    // The dimension line gives the pieces; the rest stays as typed.
    expect(shipment).toMatchObject({ pcs: "3", typeOfPackages: "Pallets", hsCode: "85044090", cargoDescription: "Power adapters, 3 pallets" });
  });

  it("show what a cargo line gives in place of the typed value, field by field", async () => {
    vi.mocked(cargoItemRepository.listByShipmentId).mockResolvedValue([item] as never);
    const shipment = await shipmentService.getById(SHIPMENT, COMPANY);
    expect(shipment).toMatchObject({ pcs: "22", typeOfPackages: "Pallets", hsCode: "84834021", cargoDescription: "Gears" });
  });

  it("are the typed values on a job with no lines", async () => {
    expect(await shipmentService.getById(SHIPMENT, COMPANY)).toMatchObject(typed);
  });
});

describe("who may change a shipment's details", () => {
  const asRole = (data: Record<string, unknown>, role?: string) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER, role);
  const named = (personInCharge: string, holidayCover = "") => stored.set(SHIPMENT, row({ personInCharge, holidayCover }));
  const REFUSAL = "Only the user in this shipment's Handled By or Holiday Cover, or a manager, can change its details";

  it("refuses a user who is neither its Person in Charge nor its Holiday Cover, and writes nothing", async () => {
    named(MARTIN.email, JANA.email);
    await expect(asRole({ vessel: "SEASPAN" }, "user")).rejects.toThrow(REFUSAL);
    await expect(asRole({ containers: [] }, "user")).rejects.toThrow(REFUSAL);
    expect(repository.updateForCompany).not.toHaveBeenCalled();
  });

  it("lets its Person in Charge and its Holiday Cover change them", async () => {
    named(JAN.email);
    await expect(asRole({ vessel: "SEASPAN" }, "user")).resolves.toBeTruthy();
    named(MARTIN.email, JAN.email);
    await expect(asRole({ voyage: "078W" }, "user")).resolves.toBeTruthy();
  });

  it("always lets a manager, an admin and a superadmin", async () => {
    named(MARTIN.email);
    for (const role of ["manager", "admin", "superadmin"]) await expect(asRole({ vessel: role }, role)).resolves.toBeTruthy();
  });

  it("leaves a shipment with nobody named open to any user", async () => {
    named("");
    await expect(asRole({ vessel: "SEASPAN" }, "user")).resolves.toBeTruthy();
  });

  it("leaves the departments' own fields open to any user", async () => {
    named(MARTIN.email);
    await expect(asRole({ mrn: "26CZ1" }, "user")).resolves.toBeTruthy();
    await expect(asRole({ warehouseReceivedDate: "2026-11-06" }, "user")).resolves.toBeTruthy();
    await expect(asRole({ invoicingStatus: "Billing" }, "user")).resolves.toBeTruthy();
  });

  it("refuses an edit that mixes a department's field with a detail", async () => {
    named(MARTIN.email);
    await expect(asRole({ mrn: "26CZ1", vessel: "SEASPAN" }, "user")).rejects.toThrow(REFUSAL);
  });

  it("does not hold the app's own writes to it", async () => {
    named(MARTIN.email);
    await expect(asRole({ vessel: "SEASPAN" })).resolves.toBeTruthy();
  });

  describe("the warehouse dates, held to the warehouse's rules", () => {
    const today = businessDay(new Date());
    const [earlier, ahead] = [addDays(today, -5), addDays(today, 1)];
    const atWarehouse = (warehouseReceivedDate: string | null, warehouseReleasedDate: string | null = null) =>
      stored.set(SHIPMENT, row({ personInCharge: MARTIN.email, warehouseReceivedDate, warehouseReleasedDate }));

    it("refuses a user a Warehouse Received still to come, moved later, cleared or changed after the release, and writes nothing", async () => {
      atWarehouse(null);
      await expect(asRole({ warehouseReceivedDate: ahead }, "user")).rejects.toMatchObject({ code: "permission_denied", message: expect.stringContaining("can't be a day still to come") });
      // Padded, it is still the same day ahead.
      await expect(asRole({ warehouseReceivedDate: ` ${ahead}` }, "user")).rejects.toMatchObject({ code: "permission_denied" });
      atWarehouse(earlier);
      await expect(asRole({ warehouseReceivedDate: today }, "user")).rejects.toMatchObject({ code: "permission_denied", message: expect.stringContaining("later or clears it") });
      await expect(asRole({ warehouseReceivedDate: "" }, "user")).rejects.toMatchObject({ code: "permission_denied" });
      atWarehouse(today, today);
      await expect(asRole({ warehouseReceivedDate: earlier }, "user")).rejects.toMatchObject({ code: "permission_denied", message: "The cargo was released: only a manager changes Warehouse Received now" });
      expect(repository.updateForCompany).not.toHaveBeenCalled();
    });

    it("lets a user set it up to today or move it earlier, and a manager do all", async () => {
      atWarehouse(null);
      await expect(asRole({ warehouseReceivedDate: today }, "user")).resolves.toBeTruthy();
      await expect(asRole({ warehouseReceivedDate: earlier }, "user")).resolves.toBeTruthy();
      atWarehouse(earlier, today);
      await expect(asRole({ warehouseReceivedDate: ahead }, "manager")).resolves.toBeTruthy();
      await expect(asRole({ warehouseReceivedDate: "", warehouseReleasedDate: "" }, "admin")).resolves.toBeTruthy();
    });

    it("refuses Warehouse Released while Warehouse Received is empty", async () => {
      atWarehouse(null);
      for (const role of ["user", "manager"]) {
        await expect(asRole({ warehouseReleasedDate: today }, role)).rejects.toMatchObject({ code: "failed_precondition", message: RELEASED_BEFORE_RECEIVED });
      }
      await expect(asRole({ warehouseReceivedDate: earlier, warehouseReleasedDate: today }, "user")).resolves.toBeTruthy();
    });

    it("refuses a date that is no day", async () => {
      atWarehouse(null);
      await expect(asRole({ warehouseReceivedDate: "2026-02-31" }, "user")).rejects.toMatchObject({ code: "invalid_argument", message: 'Warehouse Received must be a date as "YYYY-MM-DD"' });
    });

    it("does not hold the Warehouse Concept's or Trucking's own updates to it", async () => {
      atWarehouse(earlier, earlier);
      await expect(asRole({ warehouseReceivedDate: ahead })).resolves.toBeTruthy();
      atWarehouse(null);
      await expect(asRole({ warehouseReleasedDate: today })).resolves.toBeTruthy();
    });
  });

  it("refuses a user the actions that aren't a field edit, on someone else's shipment", async () => {
    named(MARTIN.email);
    const actor = { companyID: COMPANY, userID: USER, role: "user" };
    await expect(shipmentService.requireDetailsEditor(SHIPMENT, actor)).rejects.toThrow(REFUSAL);
    named(JAN.email);
    await expect(shipmentService.requireDetailsEditor(SHIPMENT, actor)).resolves.toBeUndefined();
    named(MARTIN.email);
    await expect(shipmentService.requireDetailsEditor(SHIPMENT, { ...actor, role: "manager" })).resolves.toBeUndefined();
  });
});

describe("list", () => {
  const MASTER = "3c1d5e7f-0a2b-4c6d-8e0f-1a2b3c4d5e01";
  const OTHER_MASTER = "3c1d5e7f-0a2b-4c6d-8e0f-1a2b3c4d5e02";
  const page = (rows: ShipmentRecord[]) => repository.listFiltered.mockResolvedValue({ data: rows, total: rows.length } as never);
  const filters = { limit: 50, offset: 0, sortDirection: "desc" as const };

  beforeEach(() => {
    for (const lines of [containerRepository, cargoItemRepository, cargoDimensionRepository, commercialInvoiceRepository]) vi.mocked(lines.listByShipmentIds).mockResolvedValue([]);
    vi.mocked(masterJobRepository.mczNumbersByIds).mockResolvedValue(new Map([[MASTER, "MCZ00000007"]]));
  });

  it("reads the master jobs of the whole page in one query, each once, and names each house's", async () => {
    page([
      row({ id: "s-1", masterJobId: MASTER }),
      row({ id: "s-2", masterJobId: MASTER }),
      row({ id: "s-3", masterJobId: OTHER_MASTER }),
      row({ id: "s-4", masterJobId: null }),
    ]);
    const { data } = await shipmentService.list(COMPANY, filters);
    expect(masterJobRepository.mczNumbersByIds).toHaveBeenCalledTimes(1);
    expect(masterJobRepository.mczNumbersByIds).toHaveBeenCalledWith([MASTER, OTHER_MASTER], COMPANY);
    expect(masterJobRepository.getByIdForCompany).not.toHaveBeenCalled();
    // A master job the query doesn't find (deleted meanwhile, another company's) names none.
    expect(data.map((s) => s.masterJobMczNumber)).toEqual(["MCZ00000007", "MCZ00000007", null, null]);
  });
});

describe("Needs Attention: the two cards, the Overview tile and the list it opens", () => {
  // One instant for the three places: Wednesday 18 Nov 2026, 11:00 in Prague. Each is handed it, so
  // no test here stands on the clock - URGENT is up to Thu 19, ATTENTION Fri 20 and Mon 23.
  const NOW = new Date("2026-11-18T10:00:00Z");
  const day = opsDay(NOW);
  const LIST = { limit: 50, offset: 0, sortDirection: "desc" as const };
  const due = (id: string, jobNumber: string, over: Record<string, unknown> = {}) => ({
    id,
    jobNumber,
    customerId: null,
    customer: "ACME s.r.o.",
    tradeDirection: "Export",
    status: "Booked [EXP]",
    cargoReadinessDate: null,
    pickupDate: null,
    estimatedDeparture: null,
    actualDeparture: null,
    estimatedArrival: null,
    actualArrival: null,
    actualDeliveryDate: null,
    etaWarehouse: null,
    warehouseReceivedDate: null,
    plannedDeliveryDate: null,
    closingDate: null,
    closingTime: "",
    vgmClosing: null,
    vgmClosingTime: "",
    vgm: "",
    siClosing: null,
    siClosingTime: "",
    shippingInstructions: "",
    ams: "",
    amsDeadline: null,
    amsDeadlineTime: "",
    isf: "",
    isfDeadline: null,
    isfDeadlineTime: "",
    ...over,
  });

  beforeEach(() => {
    expect(day).toMatchObject({ today: "2026-11-18", urgentUntil: "2026-11-19", attentionUntil: "2026-11-23" });
    vi.mocked(holidays._internalHolidaysCzNational).mockResolvedValue({ dates: [] });
    vi.mocked(shipmentTrackingEventRepository.factsOfKinds).mockResolvedValue([{ shipmentId: "s-made", kind: "gate_in", occurredOn: "2026-11-15", effect: "", resolvedAt: null, createdAt: new Date("2026-11-15T08:00:00Z") }]);
    vi.mocked(shipmentCutoffDismissalRepository.liveByShipmentIds).mockResolvedValue([]);
    repository.needsAttentionCandidates.mockResolvedValue([
      due("s-today", "CZFCL00000401", { estimatedDeparture: "2026-11-18" }),
      due("s-next", "CZFCL00000402", { pickupDate: "2026-11-19", tradeDirection: "Domestic" }),
      due("s-missed", "CZFCL00000403", { closingDate: "2026-11-16", closingTime: "14:00" }),
      due("s-made", "CZFCL00000404", { closingDate: "2026-11-16" }),
      due("s-overdue", "CZFCL00000405", { vgmClosing: "2026-11-17", vgm: "Pending" }),
      // Due at 10:00 today: overdue for an hour.
      due("s-timed", "CZFCL00000409", { siClosing: "2026-11-18", siClosingTime: "10:00" }),
      due("s-after", "CZFCL00000406", { plannedDeliveryDate: "2026-11-23" }),
      due("s-both", "CZFCL00000407", { estimatedArrival: "2026-11-18", etaWarehouse: "2026-11-23" }),
      due("s-passed", "CZFCL00000408", { estimatedArrival: "2026-11-17" }),
    ] as never);
    repository.tileCounts.mockResolvedValue({ active: 40, etaMoved: 2, import: 10, export: 30, week: 5, nextWeek: 6 } as never);
    repository.listFiltered.mockResolvedValue({ data: [], total: 0 } as never);
    for (const lines of [containerRepository, cargoItemRepository, cargoDimensionRepository, commercialInvoiceRepository]) vi.mocked(lines.listByShipmentIds).mockResolvedValue([]);
    vi.mocked(masterJobRepository.mczNumbersByIds).mockResolvedValue(new Map());
    vi.mocked(shipmentAttachmentRepository.documentTypesByShipmentIds).mockResolvedValue([]);
    vi.mocked(warehouse._internalPickupPlates).mockResolvedValue({ plates: [] } as never);
  });

  // The most pressing first: the earliest date, then the reference.
  const URGENT = ["s-missed", "s-overdue", "s-today", "s-both", "s-timed", "s-next"];

  it("searches Handled By and Holiday Cover also by the users' names, and asks for no names for any other search (mock council S7-5)", async () => {
    await shipmentService.list(COMPANY, { ...LIST, search: "Koubek", searchColumns: ["personInCharge", "pol"] }, NOW);
    expect(repository.listFiltered.mock.lastCall![1].searchPeopleNames).toEqual(
      new Map([["jan@firma.cz", "Jan Novák"], ["martin@firma.cz", "Martin Koubek"], ["jana@firma.cz", "Jana Nováková"]]),
    );
    await shipmentService.list(COMPANY, { ...LIST, search: "Koubek", searchColumns: ["pol"] }, NOW);
    expect(repository.listFiltered.mock.lastCall![1].searchPeopleNames).toBeUndefined();
    // All fields take Handled By and Holiday Cover in: the names too (review of S7-5).
    await shipmentService.list(COMPANY, { ...LIST, search: "Koubek" }, NOW);
    expect(repository.listFiltered.mock.lastCall![1].searchPeopleNames).toEqual(
      new Map([["jan@firma.cz", "Jan Novák"], ["martin@firma.cz", "Martin Koubek"], ["jana@firma.cz", "Jana Nováková"]]),
    );
    await shipmentService.list(COMPANY, { ...LIST, search: "  " }, NOW);
    expect(repository.listFiltered.mock.lastCall![1].searchPeopleNames).toBeUndefined();
    // The users could not be read: the e-mails are still searched.
    vi.mocked(auth.usersList).mockRejectedValueOnce(new Error("auth is unreachable"));
    await shipmentService.list(COMPANY, { ...LIST, search: "Koubek", searchColumns: ["holidayCover"] }, NOW);
    expect(repository.listFiltered.mock.lastCall![1].searchPeopleNames).toEqual(new Map());
  });

  it("agree: the URGENT card's jobs are the jobs the tile counts and the jobs tile=attention asks the list for", async () => {
    const cards = await shipmentService.needsAttention(COMPANY, NOW);
    const urgent = cards.within24h.map((i) => i.id);
    expect(urgent).toEqual(URGENT);
    expect(cards.within48h.map((i) => i.id)).toEqual(["s-after", "s-both"]);

    const counts = await shipmentService.tileCounts(COMPANY, NOW);
    expect(counts).toEqual({ active: 40, attention: urgent.length, etaMoved: 2, import: 10, export: 30, week: 5, nextWeek: 6 });

    await shipmentService.list(COMPANY, { tile: "attention", ...LIST }, NOW);
    expect(repository.listFiltered).toHaveBeenCalledTimes(1);
    expect(repository.listFiltered.mock.lastCall![1]).toMatchObject({ tile: "attention", attentionIds: urgent });
  });

  it("agree on a dismissed cut-off too: off the card, out of the tile's count and out of the list tile=attention asks for", async () => {
    vi.mocked(shipmentCutoffDismissalRepository.liveByShipmentIds).mockResolvedValue([
      { shipmentId: "s-missed", cutoff: "closingDate", cutoffDate: "2026-11-16" },
      { shipmentId: "s-timed", cutoff: "siClosing", cutoffDate: "2026-11-18" },
    ]);
    const left = URGENT.filter((id) => id !== "s-missed" && id !== "s-timed");
    const cards = await shipmentService.needsAttention(COMPANY, NOW);
    expect(cards.within24h.map((i) => i.id)).toEqual(left);
    // Only the jobs with a missed cut-off are asked about - the made Closing too, as the read does not wait for the timeline.
    expect(vi.mocked(shipmentCutoffDismissalRepository.liveByShipmentIds).mock.lastCall).toEqual([["s-missed", "s-made", "s-overdue", "s-timed"], COMPANY]);
    expect((await shipmentService.tileCounts(COMPANY, NOW)).attention).toBe(left.length);
    await shipmentService.list(COMPANY, { tile: "attention", ...LIST }, NOW);
    expect(repository.listFiltered.mock.lastCall![1]).toMatchObject({ tile: "attention", attentionIds: left });
  });

  it("shows a missed Closing as missed and a filing past its time today as overdue, each with its time - and no Closing the cargo made", async () => {
    const cards = await shipmentService.needsAttention(COMPANY, NOW);
    const of = (id: string) => cards.within24h.find((i) => i.id === id)?.deadlines;
    expect(of("s-missed")).toEqual([{ field: "closingDate", date: "2026-11-16", daysLeft: -2, missed: true, time: "14:00" }]);
    expect(of("s-timed")).toEqual([{ field: "siClosing", date: "2026-11-18", daysLeft: 0, missed: true, time: "10:00" }]);
    expect(of("s-made")).toBeUndefined();
    expect(cards).toMatchObject({ capped: false, holidaysKnown: true, notKnown: [] });
  });

  it("works the rule out once for a page of the list, and not at all for another tile or none", async () => {
    await shipmentService.list(COMPANY, { tile: "attention", ...LIST }, NOW);
    expect(repository.needsAttentionCandidates).toHaveBeenCalledTimes(1);
    expect(holidays._internalHolidaysCzNational).toHaveBeenCalledTimes(1);
    expect(shipmentTrackingEventRepository.factsOfKinds).toHaveBeenCalledTimes(1);
    repository.needsAttentionCandidates.mockClear();
    for (const tile of ["active", "claims", "all", undefined]) {
      await shipmentService.list(COMPANY, { tile, ...LIST }, NOW);
      expect(repository.listFiltered.mock.lastCall![1].attentionIds).toBeUndefined();
    }
    expect(repository.needsAttentionCandidates).not.toHaveBeenCalled();
  });

  it("counts the tile with one read of the rule beside the counting query", async () => {
    await shipmentService.tileCounts(COMPANY, NOW);
    expect(repository.tileCounts).toHaveBeenCalledTimes(1);
    expect(repository.needsAttentionCandidates).toHaveBeenCalledTimes(1);
    expect(holidays._internalHolidaysCzNational).toHaveBeenCalledTimes(1);
  });

  it("one page load - the cards, the tile's count and the tile's list asked at once - works the rule out once, and the three agree", async () => {
    // As the controllers ask: no instant of their own, so the clock is held for this test.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      const [cards, counts] = await Promise.all([shipmentService.needsAttention(COMPANY), shipmentService.tileCounts(COMPANY), shipmentService.list(COMPANY, { tile: "attention", ...LIST })]);
      expect(repository.needsAttentionCandidates).toHaveBeenCalledTimes(1);
      expect(holidays._internalHolidaysCzNational).toHaveBeenCalledTimes(1);
      expect(shipmentTrackingEventRepository.factsOfKinds).toHaveBeenCalledTimes(1);
      expect(cards.within24h.map((i) => i.id)).toEqual(URGENT);
      expect(counts.attention).toBe(URGENT.length);
      expect(repository.listFiltered.mock.lastCall![1].attentionIds).toEqual(URGENT);
      // Nothing is kept: the next page load reads again.
      await shipmentService.tileCounts(COMPANY);
      expect(repository.needsAttentionCandidates).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails the tile counts when the rule could not be read: a 0 would say nothing is due", async () => {
    repository.needsAttentionCandidates.mockRejectedValue(new Error("the database is away"));
    await expect(shipmentService.tileCounts(COMPANY, NOW)).rejects.toThrow("the database is away");
  });
});

describe("requireLive", () => {
  it("finds a live shipment of the company, and refuses one that is deleted or no id without asking SQL", async () => {
    stored.set(SHIPMENT, row());
    await expect(shipmentService.requireLive(SHIPMENT, COMPANY)).resolves.toBeUndefined();
    stored.clear();
    await expect(shipmentService.requireLive(SHIPMENT, COMPANY)).rejects.toMatchObject({ code: "not_found" });
    repository.getByIdForCompany.mockClear();
    await expect(shipmentService.requireLive("s1", COMPANY)).rejects.toMatchObject({ code: "not_found" });
    await expect(shipmentService.isLive("s1", COMPANY)).resolves.toBe(false);
    expect(repository.getByIdForCompany).not.toHaveBeenCalled();
  });
});

// Mock test S21-041: the top bar listed a sea job's old carrier code by the airport's name.
describe("the main search in shipments", () => {
  it("names a sea job's ports by their port name and leaves an air job's as stored", async () => {
    const old = { customer: "ACME", customerId: null, status: "Booked", tradeDirection: "Import", etd: null, eta: null };
    vi.mocked(shipmentRepository.searchMain).mockResolvedValue({
      rows: [
        { ...old, id: "s1", jobNumber: "CZFCL00000301", freightMode: "Sea Freight", pol: "Shanghai Hongqiao International Apt (CNSHA)", pod: "Hamburg (DEHAM)" },
        { ...old, id: "s2", jobNumber: "CZAIR00000302", freightMode: "Air Freight", pol: "Shanghai Hongqiao International Apt (CNSHA)", pod: null },
      ],
      total: 2,
    } as never);
    const { items } = await shipmentService.searchMain(COMPANY, "shanghai", 5);
    expect(items.map((i) => [i.pol, i.pod])).toEqual([
      ["Shanghai (CNSHA)", "Hamburg (DEHAM)"],
      ["Shanghai Hongqiao International Apt (CNSHA)", ""],
    ]);
  });

  // Review of system-22: a Trucking job is by road to the field defaults (lib/trackingEvents freightKindOf),
  // whatever its Freight Mode says - so its airport stays the airport here too.
  it("leaves a Road Department or Domestic job's places as stored, though its Freight Mode says sea", async () => {
    const old = { customer: "ACME", customerId: null, status: "Booked", etd: null, eta: null, freightMode: "Sea Freight", pol: "Shanghai Hongqiao International Apt (CNSHA)", pod: null };
    vi.mocked(shipmentRepository.searchMain).mockResolvedValue({
      rows: [
        { ...old, id: "s1", jobNumber: "CZFCL00000301", tradeDirection: "Import", department: "Road Department" },
        { ...old, id: "s2", jobNumber: "CZFCL00000302", tradeDirection: "Domestic", department: "Operation Department" },
        { ...old, id: "s3", jobNumber: "CZFCL00000303", tradeDirection: "Import", department: "Operation Department" },
      ],
      total: 3,
    } as never);
    const { items } = await shipmentService.searchMain(COMPANY, "shanghai", 5);
    expect(items.map((i) => i.pol)).toEqual(["Shanghai Hongqiao International Apt (CNSHA)", "Shanghai Hongqiao International Apt (CNSHA)", "Shanghai (CNSHA)"]);
  });
});

// Review of system-22: the job page names its places by the same rule of how the job travels as the field defaults.
describe("a job's places on its page", () => {
  const old = { freightMode: "Sea Freight", tradeDirection: "Import", department: "Operation Department", pol: "Shanghai Hongqiao International Apt (CNSHA)", pod: "Ningbo Lishe International Apt (CNNGB)" };

  it("read by their port's name on a sea job", async () => {
    stored.set(SHIPMENT, row(old));
    expect(await shipmentService.getById(SHIPMENT, COMPANY)).toMatchObject({ pol: "Shanghai (CNSHA)", pod: "Ningbo (CNNGB)" });
  });

  it("stay as stored on a Road Department job whose Freight Mode says sea", async () => {
    stored.set(SHIPMENT, row({ ...old, department: "Road Department" }));
    expect(await shipmentService.getById(SHIPMENT, COMPANY)).toMatchObject({ pol: old.pol, pod: old.pod });
  });
});

describe("the main search in containers", () => {
  const search = vi.mocked(containerRepository.searchMain);
  const row = { id: "c1", containerNumber: "MSCU1234567", type: "40HC", shipmentId: SHIPMENT, jobNumber: "CZFCL00000301", masterJobId: null, mczNumber: null };

  it("asks for the number typed, its spaces left out and in capitals, and lists each with its job", async () => {
    search.mockResolvedValue({ rows: [row], total: 3 });
    await expect(shipmentService.searchContainers(COMPANY, "mscu 1234", 5)).resolves.toEqual({ items: [row], total: 3 });
    expect(search).toHaveBeenCalledWith(COMPANY, "MSCU1234", 5);
  });

  it("asks nothing for text that can't be part of a container number", async () => {
    search.mockClear();
    await expect(shipmentService.searchContainers(COMPANY, "gmbh hamburg", 5)).resolves.toEqual({ items: [], total: 0 });
    await expect(shipmentService.searchContainers(COMPANY, "msc", 5)).resolves.toEqual({ items: [], total: 0 });
    expect(search).not.toHaveBeenCalled();
  });
});

// Accounts Receivable step 7 (D20's later yes): a job on prepayment that is not paid is not released - the House BoL,
// or Warehouse Released set from empty - unless a manager gives a reason, recorded with the release. The app's own
// writes are never stopped, and Invoicing is asked only by a write that releases.
describe("the prepayment stop", () => {
  const today = businessDay(new Date());
  const earlier = addDays(today, -3);
  const check = vi.mocked(invoicing._internalReleaseCheck);
  const overrides = vi.mocked(shipmentReleaseOverrideRepository.create);
  const UNPAID = {
    warn: true,
    customer: "Firma s.r.o.",
    prepayment: true,
    customerOverdueCount: 0,
    unpaid: [{ invoiceId: "inv-1", number: "FV2026-0012", leftToPay: 1200, currency: "EUR", daysOverdue: 0 }],
    prepaymentUnpaid: true,
    prepaymentInvoices: [{ invoiceId: "inv-1", number: "FV2026-0012", leftToPay: 1200, currency: "EUR" }],
  };
  const inStock = (over: Record<string, unknown> = {}) =>
    stored.set(SHIPMENT, row({ personInCharge: "", holidayCover: "", warehouseReceivedDate: earlier, warehouseReleasedDate: null, houseBolRelease: "", ...over }));
  const release = (role: string | undefined, paymentOverrideReason?: string, data: Record<string, unknown> = { warehouseReleasedDate: today }) =>
    shipmentService.update(SHIPMENT, COMPANY, data as never, USER, role, undefined, undefined, { paymentOverrideReason });
  const releaseBol = (role: string, paymentOverrideReason?: string) => shipmentService.releaseHouseBol(SHIPMENT, COMPANY, USER, { role, paymentOverrideReason });
  const nothingWritten = () => {
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(overrides).not.toHaveBeenCalled();
  };

  beforeEach(() => inStock());

  it("refuses a user Warehouse Released on an unpaid prepayment job, naming the invoice, and writes nothing", async () => {
    check.mockResolvedValue(UNPAID);
    await expect(release("user")).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Warehouse Released can't be set: the job is on prepayment and not paid - FV2026-0012 (1,200.00 EUR left to pay). A manager can release it with a reason",
    });
    expect(check).toHaveBeenCalledWith({ shipmentId: SHIPMENT });
    // A user's reason doesn't count.
    await expect(release("user", "Paid by phone")).rejects.toMatchObject({ code: "failed_precondition" });
    nothingWritten();
  });

  it("refuses a manager without a reason (or a too short one), telling them to give one", async () => {
    check.mockResolvedValue(UNPAID);
    for (const reason of [undefined, "", "  ", "ok"]) {
      await expect(release("manager", reason)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/FV2026-0012.*give a reason \(at least 3 characters\)/) });
    }
    nothingWritten();
  });

  it("lets a manager release it with a reason, recorded in the release's own turn", async () => {
    check.mockResolvedValue(UNPAID);
    await expect(release("manager", "  Customer sent the payment proof  ")).resolves.toBeTruthy();
    expect(repository.updateForCompany).toHaveBeenCalledWith(SHIPMENT, COMPANY, expect.objectContaining({ warehouseReleasedDate: today }), TX);
    expect(overrides).toHaveBeenCalledTimes(1);
    expect(overrides).toHaveBeenCalledWith(TX, {
      companyId: COMPANY,
      shipmentId: SHIPMENT,
      kind: "warehouse_released",
      reason: "Customer sent the payment proof",
      invoices: [{ number: "FV2026-0012", leftToPay: 1200, currency: "EUR" }],
      checked: true,
      byUserId: USER,
      by: JAN.email,
    });
    // A line in the shipment's history and a note on its Tracking tab, in the same turn.
    expect(shipmentAuditRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ shipmentId: SHIPMENT, field: "paymentOverride", oldValue: null, newValue: expect.stringContaining("reason: Customer sent the payment proof") }),
      TX,
    );
    expect(shipmentTrackingEventRepository.add).toHaveBeenCalledWith(
      expect.objectContaining({ shipmentId: SHIPMENT, kind: "note", source: "user", recordedById: USER, note: expect.stringContaining("FV2026-0012 (1,200.00 EUR left to pay)") }),
      TX,
    );
  });

  it("never stops a job that is not on unpaid prepayment, and records no reason sent with it", async () => {
    await expect(release("user")).resolves.toBeTruthy();
    // Overdue debt of the customer stays a warning only.
    inStock();
    check.mockResolvedValue({ ...UNPAID, prepayment: false, customerOverdueCount: 2, prepaymentUnpaid: false });
    await expect(release("user")).resolves.toBeTruthy();
    inStock();
    await expect(release("manager", "Not needed")).resolves.toBeTruthy();
    expect(repository.updateForCompany).toHaveBeenCalledTimes(3);
    expect(overrides).not.toHaveBeenCalled();
    expect(shipmentAuditRepository.create).not.toHaveBeenCalledWith(expect.objectContaining({ field: "paymentOverride" }), TX);
  });

  it("refuses when Invoicing can't be asked, and lets a manager release with a reason, recorded as unchecked", async () => {
    check.mockRejectedValue(new APIError("unavailable", "invoicing down"));
    await expect(release("user")).rejects.toMatchObject({ code: "failed_precondition", message: `${PAYMENT_UNCHECKED}. A manager can release it with a reason` });
    await expect(release("manager")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining(PAYMENT_UNCHECKED) });
    nothingWritten();
    await expect(release("manager", "Cash at the counter")).resolves.toBeTruthy();
    expect(overrides).toHaveBeenCalledWith(TX, expect.objectContaining({ kind: "warehouse_released", reason: "Cash at the counter", invoices: [], checked: false }));
  });

  it("asks Invoicing only when the write sets Warehouse Released from empty", async () => {
    check.mockResolvedValue(UNPAID);
    await expect(release("user", undefined, { vessel: "SEASPAN" })).resolves.toBeTruthy();
    await expect(release("user", undefined, { warehouseReleasedDate: "" })).resolves.toBeTruthy();
    inStock({ warehouseReleasedDate: earlier });
    // Cleared, or moved to another day once released: no release from empty.
    await expect(release("user", undefined, { warehouseReleasedDate: "" })).resolves.toBeTruthy();
    inStock({ warehouseReleasedDate: earlier });
    await expect(release("user", undefined, { warehouseReleasedDate: today })).resolves.toBeTruthy();
    inStock({ warehouseReleasedDate: earlier });
    await expect(release("manager", undefined, { warehouseReceivedDate: addDays(earlier, -1) })).resolves.toBeTruthy();
    expect(check).not.toHaveBeenCalled();
    expect(overrides).not.toHaveBeenCalled();
  });

  it("never stops the app's own writes: the gate's, Trucking's, Invoicing's", async () => {
    check.mockResolvedValue(UNPAID);
    await expect(release(undefined)).resolves.toBeTruthy();
    await expect(shipmentService.releaseHouseBol(SHIPMENT, COMPANY, USER)).resolves.toBeTruthy();
    expect(check).not.toHaveBeenCalled();
    expect(overrides).not.toHaveBeenCalled();
  });

  it("asks again a release decided on a row whose Warehouse Released was emptied in between", async () => {
    check.mockResolvedValue(UNPAID);
    inStock({ warehouseReleasedDate: earlier });
    repository.getInTurn.mockResolvedValueOnce(row({ warehouseReceivedDate: earlier, warehouseReleasedDate: null }));
    await expect(release("user", undefined, { warehouseReleasedDate: today })).rejects.toMatchObject({ code: "failed_precondition", message: RELEASE_CHANGED_MEANWHILE });
    nothingWritten();
  });

  it("records no override when another release got there first: this write sets no release from empty", async () => {
    check.mockResolvedValue(UNPAID);
    repository.getInTurn.mockResolvedValueOnce(row({ warehouseReceivedDate: earlier, warehouseReleasedDate: earlier }));
    await expect(release("manager", "Customer sent the payment proof")).resolves.toBeTruthy();
    expect(overrides).not.toHaveBeenCalled();
  });

  it("says why the stop refuses a user's release right now - what a request to a manager is asked against - and null for a job it does not hold", async () => {
    await expect(shipmentService.prepaymentRefusal(SHIPMENT, "house_bol")).resolves.toBeNull();
    check.mockResolvedValue(UNPAID);
    await expect(shipmentService.prepaymentRefusal(SHIPMENT, "house_bol")).resolves.toBe(
      "The House BoL can't be released: the job is on prepayment and not paid - FV2026-0012 (1,200.00 EUR left to pay). A manager can release it with a reason",
    );
    await expect(shipmentService.prepaymentRefusal(SHIPMENT, "warehouse_released")).resolves.toContain("Warehouse Released can't be set");
    // Invoicing can't be asked: a user is refused then too, so a manager may be asked.
    check.mockRejectedValue(new Error("timeout"));
    await expect(shipmentService.prepaymentRefusal(SHIPMENT, "house_bol")).resolves.toBe(`${PAYMENT_UNCHECKED}. A manager can release it with a reason`);
    // It only asks: nothing is written.
    nothingWritten();
  });

  describe("a release a manager approved on request (lib/releaseRequest: a pass, used once)", () => {
    const passes = vi.mocked(shipmentReleaseRequestRepository);
    const PASS = "9c1e2d3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f";
    const approved = (over: Record<string, unknown> = {}) =>
      ({ id: PASS, what: "warehouse", status: "approved", reason: "customer pays on Friday", requestedByName: "Martin Koubek", decidedByName: "Jana Nováková", comment: "agreed with the owner", decidedAt: new Date(), usedAt: null, ...over }) as never;
    const REASON = "Asked by Martin Koubek: customer pays on Friday — approved by Jana Nováková: agreed with the owner";
    const WAREHOUSE_REFUSAL = "Warehouse Released can't be set: the job is on prepayment and not paid - FV2026-0012 (1,200.00 EUR left to pay). A manager can release it with a reason";

    beforeEach(() => {
      check.mockResolvedValue(UNPAID);
      passes.usablePass.mockResolvedValue(approved());
      passes.use.mockResolvedValue(true);
    });

    it("lets a user's Warehouse Released through as an override: the row, the history line and the Tracking note as a manager's own, the pass marked used in the same turn", async () => {
      await expect(release("user")).resolves.toBeTruthy();
      expect(passes.usablePass).toHaveBeenCalledTimes(1);
      expect(passes.usablePass).toHaveBeenCalledWith(COMPANY, SHIPMENT, "warehouse", expect.any(Date));
      // Good for 7 days from the manager's decision.
      const since = passes.usablePass.mock.lastCall![3];
      expect(Math.round((Date.now() - since.getTime()) / 86_400_000)).toBe(7);
      expect(repository.updateForCompany).toHaveBeenCalledWith(SHIPMENT, COMPANY, expect.objectContaining({ warehouseReleasedDate: today }), TX);
      expect(passes.use).toHaveBeenCalledTimes(1);
      expect(passes.use).toHaveBeenCalledWith(TX, PASS, COMPANY, { usedAt: expect.any(Date), usedById: USER, usedByName: JAN.email }, expect.any(Date));
      // The one releasing is who did it; the manager who allowed it is named in the reason.
      expect(overrides).toHaveBeenCalledTimes(1);
      expect(overrides).toHaveBeenCalledWith(TX, {
        companyId: COMPANY,
        shipmentId: SHIPMENT,
        kind: "warehouse_released",
        reason: REASON,
        invoices: [{ number: "FV2026-0012", leftToPay: 1200, currency: "EUR" }],
        checked: true,
        byUserId: USER,
        by: JAN.email,
      });
      expect(shipmentAuditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ field: "paymentOverride", newValue: expect.stringContaining(`reason: ${REASON}`) }), TX);
      expect(shipmentTrackingEventRepository.add).toHaveBeenCalledWith(expect.objectContaining({ kind: "note", note: expect.stringContaining(REASON) }), TX);
      // Used before the override is recorded: a pass that is gone stops the turn first.
      expect(passes.use.mock.invocationCallOrder[0]!).toBeLessThan(overrides.mock.invocationCallOrder[0]!);
    });

    it("lets the House BoL through the same way, for whoever on the job releases it", async () => {
      passes.usablePass.mockResolvedValue(approved({ what: "house_bol" }));
      await expect(releaseBol("user")).resolves.toBeTruthy();
      expect(passes.usablePass).toHaveBeenCalledWith(COMPANY, SHIPMENT, "house_bol", expect.any(Date));
      expect(passes.use).toHaveBeenCalledWith(TX, PASS, COMPANY, { usedAt: expect.any(Date), usedById: USER, usedByName: JAN.email }, expect.any(Date));
      expect(overrides).toHaveBeenCalledWith(TX, expect.objectContaining({ kind: "house_bol", reason: REASON, checked: true, byUserId: USER }));
      expect(repository.updateForCompany).toHaveBeenCalledWith(SHIPMENT, COMPANY, expect.objectContaining({ houseBolRelease: expect.stringMatching(/^jan@firma\.cz — /) }), TX);
    });

    it("refuses as before when there is none - never approved, used already, or run out (the read is bound to the last 7 days and to unused ones)", async () => {
      passes.usablePass.mockResolvedValue(null);
      await expect(release("user")).rejects.toMatchObject({ code: "failed_precondition", message: WAREHOUSE_REFUSAL });
      await expect(releaseBol("user")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("The House BoL can't be released") });
      expect(passes.use).not.toHaveBeenCalled();
      nothingWritten();
    });

    it("is used once: when it is gone by the time of the write - used by a release at the same moment, or just run out - the stop refuses after all and no override is recorded", async () => {
      passes.use.mockResolvedValue(false);
      await expect(release("user")).rejects.toMatchObject({ code: "failed_precondition", message: WAREHOUSE_REFUSAL });
      expect(passes.use).toHaveBeenCalledTimes(1);
      expect(overrides).not.toHaveBeenCalled();
      expect(shipmentAuditRepository.create).not.toHaveBeenCalledWith(expect.objectContaining({ field: "paymentOverride" }), TX);
    });

    it("refuses as before when the approved requests can't be read", async () => {
      passes.usablePass.mockRejectedValue(new Error("the requests table is away"));
      await expect(release("user")).rejects.toMatchObject({ code: "failed_precondition", message: WAREHOUSE_REFUSAL });
      nothingWritten();
    });

    it("is not looked for, and not used, by a manager's own override with a reason, nor on a job the stop does not hold", async () => {
      await expect(release("manager", "Customer sent the payment proof")).resolves.toBeTruthy();
      expect(overrides).toHaveBeenCalledWith(TX, expect.objectContaining({ reason: "Customer sent the payment proof", byUserId: USER }));
      inStock();
      check.mockResolvedValue(PAID);
      await expect(release("user")).resolves.toBeTruthy();
      expect(passes.usablePass).not.toHaveBeenCalled();
      expect(passes.use).not.toHaveBeenCalled();
    });

    it("lets through a manager who gives no reason of their own, too: the approval is the reason", async () => {
      await expect(release("manager")).resolves.toBeTruthy();
      expect(passes.use).toHaveBeenCalledTimes(1);
      expect(overrides).toHaveBeenCalledWith(TX, expect.objectContaining({ reason: REASON }));
    });

    it("is recorded as unchecked when Invoicing can't be asked, as a manager's own override is", async () => {
      check.mockRejectedValue(new Error("timeout"));
      await expect(release("user")).resolves.toBeTruthy();
      expect(overrides).toHaveBeenCalledWith(TX, expect.objectContaining({ reason: REASON, invoices: [], checked: false }));
    });

    it("is not used when another release got there first: this write sets no release from empty", async () => {
      repository.getInTurn.mockResolvedValueOnce(row({ warehouseReceivedDate: earlier, warehouseReleasedDate: earlier }));
      await expect(release("user")).resolves.toBeTruthy();
      expect(passes.use).not.toHaveBeenCalled();
      expect(overrides).not.toHaveBeenCalled();
    });

    it("is never touched by the app's own writes", async () => {
      await expect(release(undefined)).resolves.toBeTruthy();
      await expect(shipmentService.releaseHouseBol(SHIPMENT, COMPANY, USER)).resolves.toBeTruthy();
      expect(passes.usablePass).not.toHaveBeenCalled();
      expect(passes.use).not.toHaveBeenCalled();
    });
  });

  describe("what a release made another way leaves with nothing to do: a request still waiting, an approval nobody used", () => {
    const requests = vi.mocked(shipmentReleaseRequestRepository);
    const closedLines = () => vi.mocked(shipmentAuditRepository.create).mock.calls.filter(([entry]) => entry.field === "releaseRequest").map(([entry]) => entry.newValue);
    const closes = (waiting: number, approved: number) => requests.closeUnused.mockResolvedValue({ waiting, approved });

    it("closes the waiting request in the release's own turn, with a line in the job's history - Warehouse Released set from empty", async () => {
      closes(1, 0);
      await expect(release("user")).resolves.toBeTruthy();
      expect(requests.closeUnused).toHaveBeenCalledTimes(1);
      expect(requests.closeUnused).toHaveBeenCalledWith(TX, COMPANY, SHIPMENT, "warehouse", expect.any(Date));
      expect(closedLines()).toEqual(["Warehouse Released request closed: released without it"]);
    });

    it("closes an approval nobody used, with its own line: an old approval lets no later release through", async () => {
      closes(0, 1);
      await expect(release("user")).resolves.toBeTruthy();
      expect(closedLines()).toEqual(["Warehouse Released approval closed unused: released without it"]);
      vi.mocked(shipmentAuditRepository.create).mockClear();
      inStock();
      closes(1, 1);
      await expect(releaseBol("user")).resolves.toBeTruthy();
      expect(closedLines()).toEqual(["House BoL release request closed: released without it", "House BoL release approval closed unused: released without it"]);
    });

    it("leaves the approval this very release used as used: it is marked before anything unused is closed", async () => {
      check.mockResolvedValue(UNPAID);
      requests.usablePass.mockResolvedValue({ id: "pass-1", what: "warehouse", status: "approved", reason: "pays on Friday", requestedByName: "Martin Koubek", decidedByName: "Jana Nováková", comment: "agreed", decidedAt: new Date(), usedAt: null } as never);
      requests.use.mockResolvedValue(true);
      await expect(release("user")).resolves.toBeTruthy();
      expect(requests.use).toHaveBeenCalledTimes(1);
      expect(requests.closeUnused).toHaveBeenCalledTimes(1);
      // Used first: what is closed afterwards is only what is still unused.
      expect(requests.use.mock.invocationCallOrder[0]!).toBeLessThan(requests.closeUnused.mock.invocationCallOrder[0]!);
      expect(closedLines()).toEqual([]);
    });

    it("does so for a manager's direct override and for the app's own release as well: whoever releases, nothing is left to ask or to use", async () => {
      check.mockResolvedValue(UNPAID);
      await expect(release("manager", "Customer sent the payment proof")).resolves.toBeTruthy();
      expect(requests.closeUnused).toHaveBeenLastCalledWith(TX, COMPANY, SHIPMENT, "warehouse", expect.any(Date));
      inStock();
      await expect(release(undefined)).resolves.toBeTruthy();
      expect(requests.closeUnused).toHaveBeenCalledTimes(2);
    });

    it("does so when the House BoL is released", async () => {
      closes(1, 0);
      await expect(releaseBol("user")).resolves.toBeTruthy();
      expect(requests.closeUnused).toHaveBeenCalledExactlyOnceWith(TX, COMPANY, SHIPMENT, "house_bol", expect.any(Date));
      expect(closedLines()).toEqual(["House BoL release request closed: released without it"]);
    });

    it("writes no line when there was nothing to close, and is not asked about by a write that releases nothing", async () => {
      await expect(release("user")).resolves.toBeTruthy();
      expect(closedLines()).toEqual([]);
      requests.closeUnused.mockClear();
      inStock({ warehouseReleasedDate: earlier });
      await expect(release("user", undefined, { vessel: "SEASPAN" })).resolves.toBeTruthy();
      // Moved to another day once released, or cleared: no release from empty.
      await expect(release("user", undefined, { warehouseReleasedDate: today })).resolves.toBeTruthy();
      inStock({ warehouseReleasedDate: earlier });
      await expect(release("manager", undefined, { warehouseReleasedDate: "" })).resolves.toBeTruthy();
      expect(requests.closeUnused).not.toHaveBeenCalled();
    });

    it("and once it is cleared, setting Warehouse Released again is a release from empty again: asked of the stop, with whatever is unused closed - an old approval is closed by then", async () => {
      check.mockResolvedValue(UNPAID);
      // The first release (a manager's own) closed the unused approval: the read finds none.
      requests.usablePass.mockResolvedValue(null);
      inStock({ warehouseReleasedDate: null });
      await expect(release("user")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("A manager can release it with a reason") });
      expect(requests.use).not.toHaveBeenCalled();
    });
  });

  describe("the House BoL release", () => {
    it("refuses a user on an unpaid prepayment job, naming the invoice", async () => {
      check.mockResolvedValue(UNPAID);
      await expect(releaseBol("user")).rejects.toMatchObject({
        code: "failed_precondition",
        message: "The House BoL can't be released: the job is on prepayment and not paid - FV2026-0012 (1,200.00 EUR left to pay). A manager can release it with a reason",
      });
      await expect(releaseBol("manager")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("give a reason") });
      nothingWritten();
      expect(repository.writeTurn).not.toHaveBeenCalled();
    });

    it("lets a manager release it with a reason, stamped and recorded together", async () => {
      check.mockResolvedValue(UNPAID);
      await expect(releaseBol("admin", "Original B/L held by the bank")).resolves.toBeTruthy();
      expect(repository.updateForCompany).toHaveBeenCalledWith(SHIPMENT, COMPANY, expect.objectContaining({ houseBolRelease: expect.stringMatching(/^jan@firma\.cz — /) }), TX);
      expect(overrides).toHaveBeenCalledWith(TX, expect.objectContaining({ kind: "house_bol", reason: "Original B/L held by the bank", checked: true, by: JAN.email }));
    });

    it("releases a job that is paid or not on prepayment for anyone, and refuses a user when Invoicing can't be asked", async () => {
      await expect(releaseBol("user")).resolves.toBeTruthy();
      expect(overrides).not.toHaveBeenCalled();
      inStock();
      check.mockRejectedValue(new Error("timeout"));
      await expect(releaseBol("user")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining(PAYMENT_UNCHECKED) });
      await expect(releaseBol("manager", "Paid in cash")).resolves.toBeTruthy();
      expect(overrides).toHaveBeenCalledWith(TX, expect.objectContaining({ kind: "house_bol", checked: false, invoices: [] }));
    });
  });
});

describe("the customer's open jobs (Accounts Receivable's work not yet invoiced)", () => {
  const CUSTOMER = "3f1d2c4b-5a6e-4f70-8a9b-0c1d2e3f4a5b";
  it("lists the live, not Cancelled jobs, newest first, capped at 5000", async () => {
    repository.openJobIdsOfCustomer.mockResolvedValueOnce(["s3", "s2", "s1"]);
    await expect(shipmentService.openJobIdsOfCustomer(COMPANY, CUSTOMER)).resolves.toEqual({ shipmentIds: ["s3", "s2", "s1"], capped: false });
    expect(repository.openJobIdsOfCustomer).toHaveBeenCalledWith(COMPANY, CUSTOMER, 5001);
    const many = Array.from({ length: 5001 }, (_, i) => `s${i}`);
    repository.openJobIdsOfCustomer.mockResolvedValueOnce(many);
    const answer = await shipmentService.openJobIdsOfCustomer(COMPANY, CUSTOMER);
    expect(answer.capped).toBe(true);
    expect(answer.shipmentIds).toEqual(many.slice(0, 5000));
  });

  it("answers nothing for what is not a customer id, without asking the database", async () => {
    await expect(shipmentService.openJobIdsOfCustomer(COMPANY, "not-an-id")).resolves.toEqual({ shipmentIds: [], capped: false });
    expect(repository.openJobIdsOfCustomer).not.toHaveBeenCalled();
  });
});

describe("a hand-over (services/handOver.service) is the single edit's own write, with one more history line", () => {
  const handOver = { history: [{ field: "handOver", oldValue: null, newValue: "jan@firma.cz → martin@firma.cz: Jan is ill" }] };

  it("writes Handled By, its history line and the hand-over's line in one write turn, as the manager", async () => {
    stored.set(SHIPMENT, row({ personInCharge: "jan@firma.cz", holidayCover: "" }));
    await shipmentService.update(SHIPMENT, COMPANY, { personInCharge: "Martin@Firma.cz" }, JANA.id, "manager", undefined, undefined, handOver);
    expect(repository.updateForCompany).toHaveBeenCalledWith(SHIPMENT, COMPANY, expect.objectContaining({ personInCharge: "martin@firma.cz" }), TX);
    // The line the cover bell reads (lib/coverBell: field personInCharge, written by somebody else) …
    expect(shipmentAuditRepository.create).toHaveBeenCalledWith({ companyId: COMPANY, shipmentId: SHIPMENT, userId: JANA.id, field: "personInCharge", oldValue: "jan@firma.cz", newValue: "martin@firma.cz" }, TX);
    // … and the hand-over's own, beside it.
    expect(shipmentAuditRepository.create).toHaveBeenCalledWith({ companyId: COMPANY, shipmentId: SHIPMENT, userId: JANA.id, field: "handOver", oldValue: null, newValue: "jan@firma.cz → martin@firma.cz: Jan is ill" }, TX);
  });

  it("is held to the single edit's rules: a person who is no user of the company is refused, and nothing is written", async () => {
    stored.set(SHIPMENT, row({ personInCharge: "jan@firma.cz", holidayCover: "" }));
    await expect(shipmentService.update(SHIPMENT, COMPANY, { personInCharge: "nobody@else.cz" }, JANA.id, "manager", undefined, undefined, handOver)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "Handled By: pick a user of the company (by e-mail)",
    });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
  });
});

// Step 6 (Council Outlay 11): the job's own new fields - the B/L dates (D31), the cancel reason
// (D22) and the users Handled By and Holiday Cover name, by id.
describe("step 6: the B/L dates, the cancel reason and the users' ids", () => {
  const update = (data: Record<string, unknown>, role?: string) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER, role);
  const create = (data: Record<string, unknown>) => shipmentService.create(COMPANY, data as never);
  const written = (call = 0) => repository.updateForCompany.mock.calls[call]![2] as Record<string, unknown>;
  const audited = () => vi.mocked(shipmentAuditRepository.create).mock.calls.map(([entry]) => entry.field);

  it("stores the three B/L dates trimmed, a blank one as none, each with its line in the history", async () => {
    stored.set(SHIPMENT, row({ originalsReceivedDate: null, telexReleaseReceivedDate: "2026-11-10", deliveryOrderDate: null }));
    await update({ originalsReceivedDate: " 2026-11-16 ", telexReleaseReceivedDate: "", deliveryOrderDate: "2026-11-18" }, "manager");
    expect(written()).toMatchObject({ originalsReceivedDate: "2026-11-16", telexReleaseReceivedDate: null, deliveryOrderDate: "2026-11-18" });
    expect(audited()).toEqual(expect.arrayContaining(["originalsReceivedDate", "telexReleaseReceivedDate", "deliveryOrderDate"]));
  });

  it("refuses a B/L date that is no day, naming it, before anything is written", async () => {
    stored.set(SHIPMENT, row());
    for (const [field, label] of [
      ["originalsReceivedDate", "Originals Received"],
      ["telexReleaseReceivedDate", "Telex Release Received"],
      ["deliveryOrderDate", "Delivery Order"],
    ]) {
      await expect(update({ [field!]: "2026-02-30" })).rejects.toMatchObject({ code: "invalid_argument", message: `${label} must be a date as "YYYY-MM-DD"` });
      await expect(update({ [field!]: "16.11.2026" })).rejects.toMatchObject({ code: "invalid_argument" });
    }
    await expect(create({ deliveryOrderDate: "tomorrow" })).rejects.toMatchObject({ code: "invalid_argument", message: 'Delivery Order must be a date as "YYYY-MM-DD"' });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(repository.createWithJobNumber).not.toHaveBeenCalled();
  });

  it("refuses a B/L date after today (Prague's day) - a manager's too, on create as well - and keeps one already stored", async () => {
    const today = businessDay(new Date());
    const tomorrow = addDays(today, 1);
    stored.set(SHIPMENT, row({ originalsReceivedDate: null, telexReleaseReceivedDate: null, deliveryOrderDate: tomorrow }));
    for (const [field, label] of [
      ["originalsReceivedDate", "Originals Received"],
      ["telexReleaseReceivedDate", "Telex Release Received"],
    ]) {
      await expect(update({ [field!]: tomorrow }, "manager")).rejects.toMatchObject({
        code: "invalid_argument",
        message: `${label} can't be a day still to come: it says when it happened (today is ${today.split("-").reverse().join(".")})`,
      });
    }
    await expect(create({ deliveryOrderDate: tomorrow })).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringContaining("Delivery Order can't be a day still to come") });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    // Today is fine; a date stored before the rule, sent back as it is, is not asked again.
    await update({ originalsReceivedDate: today, deliveryOrderDate: tomorrow }, "manager");
    expect(written()).toMatchObject({ originalsReceivedDate: today });
  });

  it("lets only a manager cancel an invoiced job - marked Invoiced, or with an issued invoice not credited", async () => {
    const open = (invoicingStatus: string) => stored.set(SHIPMENT, row({ status: "Booking Confirmation Pending [IMP]", invoicingStatus, personInCharge: "", holidayCover: "" }));
    const cancel = { status: "Cancelled Shipment", cancelReason: "Customer cancelled" };
    open("Invoiced");
    await expect(update(cancel, "user")).rejects.toMatchObject({ code: "permission_denied", message: "This shipment is invoiced: only a manager can cancel it" });
    open("");
    vi.mocked(invoicing.openInvoiceCount).mockResolvedValue({ count: 1 });
    await expect(update(cancel, "user")).rejects.toMatchObject({ code: "permission_denied" });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    for (const role of ["manager", "admin", "superadmin"]) {
      open("Invoiced");
      await update(cancel, role);
      expect(stored.get(SHIPMENT)).toMatchObject({ status: "Cancelled Shipment" });
    }
    // Not invoiced: a user cancels as before.
    open("");
    vi.mocked(invoicing.openInvoiceCount).mockResolvedValue({ count: 0 });
    await update(cancel, "user");
    expect(stored.get(SHIPMENT)).toMatchObject({ status: "Cancelled Shipment" });
  });

  // Mock test council n35: Invoicing Status moved off Invoiced first, or in the same write.
  it("judges a user's cancel by the Invoicing Status before and after the write, and keeps Invoiced while an invoice is open", async () => {
    const open = (invoicingStatus: string) => stored.set(SHIPMENT, row({ status: "Booking Confirmation Pending [IMP]", invoicingStatus, personInCharge: "", holidayCover: "" }));
    const cancel = { status: "Cancelled Shipment", cancelReason: "Customer cancelled" };
    open("Invoiced");
    await expect(update({ ...cancel, invoicingStatus: "Not Invoiced" }, "user")).rejects.toMatchObject({ code: "permission_denied", message: "This shipment is invoiced: only a manager can cancel it" });
    open("");
    await expect(update({ ...cancel, invoicingStatus: "Invoiced" }, "user")).rejects.toMatchObject({ code: "permission_denied" });
    // An open invoice: a user may not take the status off Invoiced, a manager may.
    open("Invoiced");
    vi.mocked(invoicing.openInvoiceCount).mockResolvedValue({ count: 1 });
    await expect(update({ invoicingStatus: "Not Invoiced" }, "user")).rejects.toMatchObject({
      code: "permission_denied",
      message: "This shipment has an open invoice: only a manager can move its Invoicing Status away from Invoiced",
    });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    await update({ invoicingStatus: "Not Invoiced" }, "manager");
    expect(stored.get(SHIPMENT)).toMatchObject({ invoicingStatus: "Not Invoiced" });
    // Marked by hand with no invoice: a user may still correct it.
    open("Invoiced");
    vi.mocked(invoicing.openInvoiceCount).mockResolvedValue({ count: 0 });
    await update({ invoicingStatus: "Not Invoiced" }, "user");
    expect(stored.get(SHIPMENT)).toMatchObject({ invoicingStatus: "Not Invoiced" });
  });

  // Mock test council n36.
  it("refuses a user's cancel, not fails, when Invoicing can't say whether the job is invoiced", async () => {
    stored.set(SHIPMENT, row({ status: "Booking Confirmation Pending [IMP]", invoicingStatus: "", personInCharge: "", holidayCover: "" }));
    vi.mocked(invoicing.openInvoiceCount).mockRejectedValue(new Error("invoicing is down"));
    await expect(update({ status: "Cancelled Shipment", cancelReason: "Customer cancelled" }, "user")).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Whether the job is invoiced could not be checked: try again or ask a manager",
    });
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    // A manager's cancel never asks.
    await update({ status: "Cancelled Shipment", cancelReason: "Customer cancelled" }, "manager");
    expect(stored.get(SHIPMENT)).toMatchObject({ status: "Cancelled Shipment" });
  });

  it("refuses to cancel a job without a reason in the same write - a person's or the app's - and writes nothing", async () => {
    stored.set(SHIPMENT, row({ status: "Booking Confirmation Pending [IMP]", cancelReason: "an old one" }));
    for (const reason of [undefined, "", "   "]) {
      await expect(update({ status: "Cancelled Shipment", ...(reason === undefined ? {} : { cancelReason: reason }) }, "manager")).rejects.toMatchObject({
        code: "invalid_argument",
        message: "Say why the shipment is cancelled",
      });
      await expect(update({ status: "Cancelled Shipment", cancelReason: reason })).rejects.toMatchObject({ message: "Say why the shipment is cancelled" });
    }
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
  });

  it("cancels with the reason stored trimmed, the status and the reason each a line in the history", async () => {
    stored.set(SHIPMENT, row({ status: "Booking Confirmation Pending [IMP]", cancelReason: "" }));
    await update({ status: "Cancelled Shipment", cancelReason: "  Customer cancelled the order  " }, "manager");
    expect(written()).toMatchObject({ status: "Cancelled Shipment", cancelReason: "Customer cancelled the order" });
    expect(shipmentAuditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ field: "cancelReason", oldValue: "", newValue: "Customer cancelled the order" }), TX);
    expect(shipmentAuditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ field: "status", newValue: "Cancelled Shipment" }), TX);
  });

  it("asks nothing of a job already cancelled, nor when it is un-cancelled - which keeps the reason", async () => {
    stored.set(SHIPMENT, row({ status: "Cancelled Shipment", cancelReason: "Customer cancelled the order" }));
    await update({ status: "Cancelled Shipment", pol: "Hamburg" });
    await update({ cancelReason: "Booked twice" });
    expect(written(1)).toMatchObject({ cancelReason: "Booked twice" });
    stored.set(SHIPMENT, row({ status: "Cancelled Shipment", cancelReason: "Customer cancelled the order" }));
    await update({ status: "Booking Confirmation Pending [IMP]" });
    expect(written(2)).not.toHaveProperty("cancelReason");
    expect(stored.get(SHIPMENT)).toMatchObject({ status: "Booking Confirmation Pending [IMP]", cancelReason: "Customer cancelled the order" });
  });

  it("links a new Handled By and Holiday Cover to their users by id, nobody to none, with no history line of the ids", async () => {
    stored.set(SHIPMENT, row({ personInCharge: "jan@firma.cz", personInChargeUserId: JAN.id, holidayCover: "", holidayCoverUserId: null }));
    await update({ personInCharge: "Martin@Firma.cz", holidayCover: "jana@firma.cz" }, "manager");
    expect(written()).toMatchObject({ personInCharge: "martin@firma.cz", personInChargeUserId: MARTIN.id, holidayCover: "jana@firma.cz", holidayCoverUserId: JANA.id });
    await update({ holidayCover: "" }, "manager");
    expect(written(1)).toMatchObject({ holidayCover: "", holidayCoverUserId: null });
    expect(audited()).not.toContain("personInChargeUserId");
    expect(audited()).not.toContain("holidayCoverUserId");
    expect(audited()).toEqual(expect.arrayContaining(["personInCharge", "holidayCover"]));
  });

  it("links the people of a new shipment too, reading the users once", async () => {
    await create({ personInCharge: "JAN@firma.cz", holidayCover: "" });
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ personInCharge: "jan@firma.cz", personInChargeUserId: JAN.id, holidayCover: "", holidayCoverUserId: null });
    expect(auth.usersList).toHaveBeenCalledTimes(1);
  });

  it("never takes an id from the caller: only the e-mail beside it decides", async () => {
    stored.set(SHIPMENT, row({ personInCharge: "jan@firma.cz", personInChargeUserId: JAN.id }));
    await update({ pol: "Hamburg", personInChargeUserId: MARTIN.id, holidayCoverUserId: MARTIN.id });
    expect(written()).not.toHaveProperty("personInChargeUserId");
    expect(written()).not.toHaveProperty("holidayCoverUserId");
    await create({ personInChargeUserId: MARTIN.id });
    expect(repository.createWithJobNumber.mock.calls[0]![1]).not.toHaveProperty("personInChargeUserId");
  });

  it("keeps the id of a value sent back as it is; fills one it lacks when the users can be read, and saves without it when they cannot", async () => {
    // Linked already: the users are not read for it.
    stored.set(SHIPMENT, row({ personInCharge: "jan@firma.cz", personInChargeUserId: JAN.id, holidayCover: "" }));
    await update({ personInCharge: "jan@firma.cz" });
    expect(auth.usersList).not.toHaveBeenCalled();
    expect(written(0)).not.toHaveProperty("personInChargeUserId");
    // Not linked yet: linked now.
    stored.set(SHIPMENT, row({ personInCharge: "jana@firma.cz", personInChargeUserId: null }));
    await update({ personInCharge: "jana@firma.cz" });
    expect(written(1)).toMatchObject({ personInChargeUserId: JANA.id });
    // An old e-mail of somebody who left keeps the id it has, and one with none stays without.
    stored.set(SHIPMENT, row({ personInCharge: "left@firma.cz", personInChargeUserId: null }));
    await update({ personInCharge: "left@firma.cz" });
    expect(written(2)).not.toHaveProperty("personInChargeUserId");
    // The users unreadable: the edit is saved all the same, the id left for the backfill.
    vi.mocked(auth.usersList).mockRejectedValue(new Error("auth is unreachable"));
    stored.set(SHIPMENT, row({ personInCharge: "jana@firma.cz", personInChargeUserId: null }));
    await update({ personInCharge: "jana@firma.cz", pol: "Hamburg" });
    expect(written(3)).toMatchObject({ pol: "Hamburg" });
    expect(written(3)).not.toHaveProperty("personInChargeUserId");
  });
});

// Review of step 6: a job created already cancelled needs a reason too (D22).
describe("step 6: a job created as Cancelled Shipment", () => {
  const create = (data: Record<string, unknown>, by?: string) => shipmentService.create(COMPANY, data as never, by, { creatorRole: by ? "user" : undefined });
  const cancelLines = () => vi.mocked(shipmentAuditRepository.create).mock.calls.filter(([entry]) => entry.field === "cancelReason");

  it("is refused without a reason - by a person or by the app - and nothing is created", async () => {
    for (const reason of [undefined, "", "  "]) {
      await expect(create({ status: "Cancelled Shipment", cancelReason: reason }, USER)).rejects.toMatchObject({ code: "invalid_argument", message: "Say why the shipment is cancelled" });
      await expect(create({ status: "Cancelled Shipment", cancelReason: reason })).rejects.toMatchObject({ message: "Say why the shipment is cancelled" });
    }
    await expect(create({ status: "Cancelled Shipment", fromQuoteNumber: REF }, USER)).rejects.toMatchObject({ message: "Say why the shipment is cancelled" });
    expect(repository.createWithJobNumber).not.toHaveBeenCalled();
    expect(repository.createFromQuote).not.toHaveBeenCalled();
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
  });

  it("stores the reason trimmed, with its line in the history in the create's own transaction", async () => {
    await create({ status: "Cancelled Shipment", cancelReason: "  Booked by mistake  " }, USER);
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ status: "Cancelled Shipment", cancelReason: "Booked by mistake" });
    expect(cancelLines()).toEqual([[{ companyId: COMPANY, shipmentId: SHIPMENT, userId: USER, field: "cancelReason", oldValue: null, newValue: "Booked by mistake" }, TX]]);
  });

  it("writes the line for one made from a quote too, once the shipment exists", async () => {
    await create({ fromQuoteNumber: REF, status: "Cancelled Shipment", cancelReason: "Customer withdrew" }, USER);
    expect(repository.createFromQuote.mock.calls[0]![2]).toMatchObject({ cancelReason: "Customer withdrew" });
    expect(cancelLines()).toEqual([[{ companyId: COMPANY, shipmentId: SHIPMENT, userId: USER, field: "cancelReason", oldValue: null, newValue: "Customer withdrew" }, undefined]]);
  });

  it("asks nothing of a job created with any other status, and writes no line for a reason that cancels nothing", async () => {
    await create({ status: "Booking Confirmation Pending [IMP]", tradeDirection: "Import" }, USER);
    await create({ status: "Booking Confirmation Pending [DOM]", tradeDirection: "Domestic", cancelReason: "kept as typed" });
    expect(repository.createWithJobNumber).toHaveBeenCalledTimes(2);
    expect(cancelLines()).toEqual([]);
  });
});

// Cargo Details → Accept remeasurement (lib/remeasureAccept). Since 22 Nov (owner's answer) the
// acceptance is only recorded: one history entry with the figures before and after and the lines
// accepted, which the Remeasured by Warehouse tile, Alerts, Shipments → Managers and Costs
// Breakdown read. Cargo Details' lines, Pcs, Total Weight, Total Volume and the container stay as
// they are. Lines not measured in full are still never accepted.
describe("accepting the warehouse's remeasurement", () => {
  const job = (rows: unknown[]) => {
    const saved = JSON.stringify(rows);
    vi.mocked(warehouse.warehouseSectionGet).mockResolvedValue({ section: { data: { remeasure_rows: saved } } } as never);
    return saved;
  };
  const MANAGER = { companyID: COMPANY, userID: USER, role: "manager" };
  const full = { pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" };
  const ALREADY = "These remeasured lines were already accepted: the warehouse has saved nothing new since";
  const acceptance = (lines: string) => ({ id: "a1", userId: USER, field: "remeasurementAccepted", oldValue: "{}", newValue: JSON.stringify({ colli: 5, lines }), changedAt: new Date() });
  const entries = () => vi.mocked(shipmentAuditRepository.create).mock.calls.filter(([entry]) => entry.field === "remeasurementAccepted");
  // Nothing of the shipment is written, whatever the outcome: no shipment row, container or line write.
  const shipmentUntouched = () => {
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    expect(containerRepository.syncForShipment).not.toHaveBeenCalled();
    expect(cargoDimensionRepository.replaceForShipment).not.toHaveBeenCalled();
    expect(cargoItemRepository.replaceForShipment).not.toHaveBeenCalled();
  };

  const A = "0b8e1d2c-0000-4000-8000-00000000000a";
  const B = "0b8e1d2c-0000-4000-8000-00000000000b";
  const container = (id: string) => ({ id, containerNumber: "MSKU1234567", sealNumber: "", type: "40' HC", teu: "2", packages: "5", packageType: "Pallet(s)", grossWeight: "170", volume: "7.2" });
  const dimRow = (over: Record<string, unknown> = {}) => ({
    containerId: A,
    pieces: "4",
    lengthCm: "120",
    widthCm: "80",
    heightCm: "150",
    dimensionUnit: "cm",
    weightPerPcKg: "34",
    volumePerPcM3: "",
    packageType: "Pallet(s)",
    stackable: "",
    palletType: null,
    adrUn: null,
    adrClass: null,
    adrPackingGroup: null,
    adrLimitedQuantity: false,
    ...over,
  });

  beforeEach(() => {
    stored.set(SHIPMENT, row({ pcs: "5", totalWeightTons: "0.1700", totalVolumeCbm: "7.2000", personInCharge: "", holidayCover: "" }));
    vi.mocked(shipmentAuditRepository.listByShipmentId).mockResolvedValue([]);
  });

  it("is refused while a line with pieces has no kg per piece or no size, naming the line, and nothing is written", async () => {
    const saved = job([full, { ...full, weightPerPcKg: "" }]);
    await expect(shipmentService.acceptRemeasurement(SHIPMENT, MANAGER, saved)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Remeasured line 2 has no kg per piece: the warehouse must measure weight and sizes of every line before it can be accepted",
    });
    const noHeight = job([{ ...full, heightCm: "" }]);
    await expect(shipmentService.acceptRemeasurement(SHIPMENT, MANAGER, noHeight)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Remeasured line 1 has no height: the warehouse must measure weight and sizes of every line before it can be accepted",
    });
    expect(repository.writeTurn).not.toHaveBeenCalled();
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
    shipmentUntouched();
  });

  // The page showed other lines than the warehouse holds now: they are not accepted unseen.
  it("is refused when the warehouse changed the lines meanwhile, and nothing is written", async () => {
    job([full]);
    const shown = JSON.stringify([{ ...full, pieces: "4" }]);
    await expect(shipmentService.acceptRemeasurement(SHIPMENT, MANAGER, shown)).rejects.toMatchObject({
      code: "aborted",
      message: "The warehouse changed the remeasured lines meanwhile — they are shown again; check them and accept again",
    });
    expect(repository.writeTurn).not.toHaveBeenCalled();
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
  });

  it("is refused to a user who may not change the shipment's details, and allowed to its Handled By", async () => {
    stored.set(SHIPMENT, row({ pcs: "5", personInCharge: MARTIN.email, holidayCover: JANA.email }));
    const saved = job([full]);
    const user = { ...MANAGER, role: "user" };
    await expect(shipmentService.acceptRemeasurement(SHIPMENT, user, saved)).rejects.toMatchObject({
      code: "permission_denied",
      message: "Only the user in this shipment's Handled By or Holiday Cover, or a manager, can change its details",
    });
    expect(repository.writeTurn).not.toHaveBeenCalled();
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
    stored.set(SHIPMENT, row({ pcs: "5", personInCharge: JAN.email, holidayCover: "" }));
    await shipmentService.acceptRemeasurement(SHIPMENT, user, saved);
    expect(entries()).toHaveLength(1);
  });

  it("records one history entry - the figures before and after, the lines accepted - in the write turn, and changes nothing of the shipment", async () => {
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([container(A)] as never);
    vi.mocked(cargoDimensionRepository.listByShipmentId).mockResolvedValue([dimRow({ pieces: "5" })] as never);
    const before = stored.get(SHIPMENT);
    const saved = job([full]);
    const answer = await shipmentService.acceptRemeasurement(SHIPMENT, MANAGER, saved);
    expect(repository.writeTurn).toHaveBeenCalledTimes(1);
    expect(repository.writeTurn).toHaveBeenCalledWith(SHIPMENT, COMPANY, expect.any(Function));
    expect(shipmentAuditRepository.create).toHaveBeenCalledTimes(1);
    expect(shipmentAuditRepository.create).toHaveBeenCalledWith(
      {
        companyId: COMPANY,
        shipmentId: SHIPMENT,
        userId: USER,
        field: "remeasurementAccepted",
        // 5 × 120×80×150 cm, 34 kg each before; 5 × 140×220×225 cm, 50 kg each remeasured.
        oldValue: JSON.stringify({ colli: 5, weightKg: 170, volumeCbm: 7.2 }),
        newValue: JSON.stringify({ colli: 5, weightKg: 250, volumeCbm: 34.65, lines: saved }),
      },
      TX,
    );
    // Asked for the last acceptance, the same way Alerts and the tile read it.
    expect(shipmentAuditRepository.listByShipmentId).toHaveBeenCalledWith(SHIPMENT, COMPANY, ["remeasurementAccepted"], 1);
    shipmentUntouched();
    expect(stored.get(SHIPMENT)).toBe(before);
    // The answer is the shipment as it stands: its own figures, not the remeasured ones.
    expect(answer).toMatchObject({ id: SHIPMENT, pcs: "5", totalWeightTons: "0.1700", totalVolumeCbm: "7.2000" });
  });

  // Council finding m8: a stale page or a second person records no second acceptance of the same
  // lines - whatever Cargo Details hold, which an acceptance no longer changes.
  it("is refused as already accepted when the last acceptance took the same lines, also saved with other spacing", async () => {
    const saved = job([full]);
    vi.mocked(cargoDimensionRepository.listByShipmentId).mockResolvedValue([dimRow({ pieces: "5" })] as never);
    vi.mocked(shipmentAuditRepository.listByShipmentId).mockResolvedValue([acceptance(JSON.stringify([{ ...full, pieces: " 5 " }]))] as never);
    await expect(shipmentService.acceptRemeasurement(SHIPMENT, MANAGER, saved)).rejects.toMatchObject({ code: "failed_precondition", message: ALREADY });
    expect(repository.writeTurn).not.toHaveBeenCalled();
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
  });

  it("is accepted again when the warehouse saved other lines since the last acceptance", async () => {
    vi.mocked(shipmentAuditRepository.listByShipmentId).mockResolvedValue([acceptance(JSON.stringify([{ ...full, pieces: "4" }]))] as never);
    const saved = job([full]);
    await shipmentService.acceptRemeasurement(SHIPMENT, MANAGER, saved);
    expect(entries()).toHaveLength(1);
    expect(JSON.parse(entries()[0]![0].newValue!)).toMatchObject({ colli: 5, lines: saved });
    shipmentUntouched();
  });

  // Review of system-23: a delete that had the shipment's write turn first leaves no acceptance on a deleted job.
  it("is refused as not found when the shipment is gone by its write turn, and nothing is recorded", async () => {
    const saved = job([full]);
    repository.getInTurn.mockResolvedValueOnce(null);
    await expect(shipmentService.acceptRemeasurement(SHIPMENT, MANAGER, saved)).rejects.toMatchObject({ code: "not_found", message: "Shipment not found" });
    expect(repository.writeTurn).toHaveBeenCalledTimes(1);
    expect(repository.getInTurn).toHaveBeenCalledWith(TX, SHIPMENT, COMPANY);
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
  });

  it("is refused in the write turn when another Accept of the same lines got there first", async () => {
    const saved = job([full]);
    // Nothing accepted when this Accept looked; the other's entry is there once its turn comes.
    vi.mocked(shipmentAuditRepository.listByShipmentId).mockResolvedValueOnce([]).mockResolvedValue([acceptance(saved)] as never);
    await expect(shipmentService.acceptRemeasurement(SHIPMENT, MANAGER, saved)).rejects.toMatchObject({ code: "failed_precondition", message: ALREADY });
    expect(repository.writeTurn).toHaveBeenCalledTimes(1);
    expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
  });

  // Nothing is taken over line for line any more, so dangerous goods and several containers no
  // longer send it to be done by hand (the old X2/Y8 refusal).
  it("is recorded when dangerous goods or several containers are on the lines, whatever lines the warehouse saved", async () => {
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([container(A), container(B)] as never);
    vi.mocked(cargoDimensionRepository.listByShipmentId).mockResolvedValue([dimRow(), dimRow({ pieces: "1", containerId: B, adrUn: "1993", adrClass: "3" })] as never);
    await shipmentService.acceptRemeasurement(SHIPMENT, MANAGER, job([full]));
    expect(entries()).toHaveLength(1);
    shipmentUntouched();
  });

  // Mock test council n18: the acceptance is saved before its read-back asks Invoicing.
  it("answers the acceptance with the job read as not invoiced when Invoicing can't be asked", async () => {
    vi.mocked(shipmentAuditRepository.listByShipmentId).mockImplementation(async (_id, _companyId, fields) =>
      (fields.includes("remeasurementAccepted") ? [{ id: "a1", userId: USER, field: "remeasurementAccepted", oldValue: "{}", newValue: "{}", changedAt: new Date() }] : []) as never,
    );
    vi.mocked(invoicing.openInvoiceCount).mockRejectedValue(new Error("invoicing is down"));
    expect(await shipmentService.remeasureAcceptance(SHIPMENT, COMPANY)).toMatchObject({ invoiced: false });
  });

  // Review: a job made from a quote stores no Pcs; it shows its container's pieces, as Inform
  // Operations and Cargo Details compare them - the history's "before" says those, not "— colli".
  it("records the Pcs the job showed before - its container's - when it stores none", async () => {
    stored.set(SHIPMENT, row({ pcs: "", totalWeightTons: "0.1700", totalVolumeCbm: "7.2000", personInCharge: "", holidayCover: "" }));
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([container(A)] as never);
    vi.mocked(cargoDimensionRepository.listByShipmentId).mockResolvedValue([]);
    await shipmentService.acceptRemeasurement(SHIPMENT, MANAGER, job([full]));
    expect(JSON.parse(entries()[0]![0].oldValue!)).toEqual({ colli: 5, weightKg: 170, volumeCbm: 7.2 });
  });

  // Council finding m7: "140." and ".5" are numbers - the figures after are worked out on them tidied.
  it("takes a figure typed with a point at its end or start", async () => {
    const saved = job([{ ...full, lengthCm: "140.", weightPerPcKg: ".5" }]);
    await shipmentService.acceptRemeasurement(SHIPMENT, MANAGER, saved);
    expect(JSON.parse(entries()[0]![0].newValue!)).toEqual({ colli: 5, weightKg: 2.5, volumeCbm: 34.65, lines: saved });
  });
});

// Mock test council Y10: Cargo Details' line saves send the lines the page started from.
describe("a save of Cargo Details' lines from a page that started from other lines", () => {
  const line = (over: Record<string, unknown> = {}) => ({
    containerId: null,
    pieces: "4",
    lengthCm: "120",
    widthCm: "80",
    heightCm: "150",
    dimensionUnit: "cm",
    weightPerPcKg: "34",
    volumePerPcM3: "",
    packageType: "Pallet(s)",
    stackable: "",
    palletType: null,
    adrUn: null,
    adrClass: null,
    adrPackingGroup: null,
    adrLimitedQuantity: false,
    ...over,
  });
  const save = (expectedCargoDimensions: unknown[] | undefined) =>
    shipmentService.update(SHIPMENT, COMPANY, { cargoDimensions: [line({ pieces: "6" })] } as never, USER, "manager", undefined, undefined, { expectedCargoDimensions } as never);

  beforeEach(() => {
    stored.set(SHIPMENT, row({ personInCharge: "", holidayCover: "" }));
  });

  it("is refused when the shipment holds other lines now - an accepted remeasurement - and nothing is written", async () => {
    // The page started from the 4 pallets; an Accept wrote the warehouse's 5 × 140×220×225 since.
    vi.mocked(cargoDimensionRepository.listByShipmentId).mockResolvedValue([line({ pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" })] as never);
    await expect(save([line()])).rejects.toMatchObject({ code: "aborted", message: "Cargo Details changed meanwhile: they are shown again - make your change again" });
    expect(cargoDimensionRepository.replaceForShipment).not.toHaveBeenCalled();
    // Read in the write's turn.
    expect(cargoDimensionRepository.listByShipmentId).toHaveBeenCalledWith(SHIPMENT, COMPANY, TX);
  });

  it("is saved while the shipment holds the lines it started from, written alike or not ('UN 1203', '1,5')", async () => {
    vi.mocked(cargoDimensionRepository.listByShipmentId).mockResolvedValue([line({ adrUn: "1203", weightPerPcKg: "1.5" })] as never);
    await save([line({ adrUn: "UN 1203", weightPerPcKg: "1,5" })]);
    expect(vi.mocked(cargoDimensionRepository.replaceForShipment).mock.calls[0]![2]).toMatchObject([{ pieces: "6" }]);
  });

  it("is saved as sent when the page names no lines it started from (the grid, a document reading)", async () => {
    vi.mocked(cargoDimensionRepository.listByShipmentId).mockResolvedValue([line({ pieces: "9" })] as never);
    await save(undefined);
    expect(vi.mocked(cargoDimensionRepository.replaceForShipment).mock.calls[0]![2]).toMatchObject([{ pieces: "6" }]);
  });
});

// Review: a Container Details page opened before an accepted remeasurement (the only container
// 20 pcs / 300 kg then, 18 / 250 / 34.65 since) saves a new seal - and with it its old figures.
describe("a save of Container Details from a page that started from other containers", () => {
  const C = "0b8e1d2c-0000-4000-8000-00000000000c";
  const box = (over: Record<string, unknown> = {}) => ({ id: C, containerNumber: "MSKU1234567", sealNumber: "", type: "40' HC", teu: "2", packages: "20", packageType: "Pallet(s)", grossWeight: "300", volume: "36", ...over });
  const save = (expectedContainers: unknown[] | undefined) =>
    shipmentService.update(SHIPMENT, COMPANY, { containers: [box({ sealNumber: "SEAL1" })] } as never, USER, "manager", undefined, undefined, { expectedContainers } as never);

  beforeEach(() => {
    stored.set(SHIPMENT, row({ personInCharge: "", holidayCover: "" }));
  });

  it("is refused when the containers changed since - an accepted remeasurement - and the old figures are not written back", async () => {
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([box({ packages: "18", grossWeight: "250", volume: "34.65" })] as never);
    await expect(save([box()])).rejects.toMatchObject({ code: "aborted", message: "Container Details changed meanwhile: they are shown again - make your change again" });
    expect(containerRepository.syncForShipment).not.toHaveBeenCalled();
    expect(repository.updateForCompany).not.toHaveBeenCalled();
    // Read in the write's turn.
    expect(containerRepository.listByShipmentId).toHaveBeenCalledWith(SHIPMENT, COMPANY, TX);
  });

  it("is saved while the shipment holds the containers the page started from, the number written alike or not", async () => {
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([box()] as never);
    await save([box({ containerNumber: "msku 123456-7", teu: "" })]);
    expect(vi.mocked(containerRepository.syncForShipment).mock.calls[0]![2]).toMatchObject([{ id: C, sealNumber: "SEAL1", packages: "20" }]);
  });

  it("is saved as sent when the page names no containers it started from (a document reading)", async () => {
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([box({ packages: "18" })] as never);
    await save(undefined);
    expect(vi.mocked(containerRepository.syncForShipment).mock.calls[0]![2]).toMatchObject([{ sealNumber: "SEAL1" }]);
  });
});

// Mock test council n19: an old container number ("TBA") no longer stops every save of the containers.
describe("a container number the container already has", () => {
  const C = "0b8e1d2c-0000-4000-8000-00000000000c";
  const box = (containerNumber: string, id: string | undefined = C) => ({ id, containerNumber, sealNumber: "", type: "40' HC", teu: "2", packages: "5", packageType: "", grossWeight: "170", volume: "7.2" });

  beforeEach(() => {
    stored.set(SHIPMENT, row({ personInCharge: "", holidayCover: "" }));
    vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([box("TBA")] as never);
  });

  it("is not asked again, while a new or changed number still is", async () => {
    await shipmentService.update(SHIPMENT, COMPANY, { containers: [{ ...box("TBA"), packages: "6" }] } as never, USER, "manager");
    expect(containerRepository.syncForShipment).toHaveBeenCalled();
    await expect(shipmentService.update(SHIPMENT, COMPANY, { containers: [box("TBD")] } as never, USER, "manager")).rejects.toMatchObject({
      code: "invalid_argument",
      message: 'Container number "TBD" must be 4 letters followed by 7 digits (e.g. MSKU1234567)',
    });
    await expect(shipmentService.update(SHIPMENT, COMPANY, { containers: [box("TBA"), box("XYZ", "0b8e1d2c-0000-4000-8000-00000000000d")] } as never, USER, "manager")).rejects.toMatchObject({
      message: expect.stringContaining('"XYZ"'),
    });
  });
});

// Mock test council P10: the work not yet invoiced could not be held against the customer's terms.
describe("a release whose prepayment could not be checked in full", () => {
  const NOT_CHECKED = "Prepayment not checked: the Customer Database could not be read";
  const lines = () => vi.mocked(shipmentAuditRepository.create).mock.calls.map(([entry]) => entry);

  beforeEach(() => {
    stored.set(SHIPMENT, row({ personInCharge: "", holidayCover: "", warehouseReceivedDate: "2026-11-10", warehouseReleasedDate: null, houseBolRelease: "" }));
    vi.mocked(invoicing._internalReleaseCheck).mockResolvedValue({ ...PAID, prepaymentUninvoicedUnchecked: true } as never);
  });

  it("sets Warehouse Released all the same, with a line saying so in the job's history", async () => {
    await shipmentService.update(SHIPMENT, COMPANY, { warehouseReleasedDate: "2026-11-11" } as never, USER, "user");
    expect(stored.get(SHIPMENT)).toMatchObject({ warehouseReleasedDate: "2026-11-11" });
    expect(lines()).toContainEqual(expect.objectContaining({ field: "prepaymentUnchecked", newValue: NOT_CHECKED }));
  });

  it("releases the House BoL all the same, with the same line", async () => {
    vi.mocked(auth.userLookup).mockResolvedValue({ users: [{ id: USER, name: "Jan Novák", email: JAN.email, role: "user" }] } as never);
    await shipmentService.releaseHouseBol(SHIPMENT, COMPANY, USER, { role: "user" });
    expect(lines()).toContainEqual(expect.objectContaining({ field: "prepaymentUnchecked", newValue: NOT_CHECKED }));
  });

  it("writes no such line when it was checked", async () => {
    vi.mocked(invoicing._internalReleaseCheck).mockResolvedValue(PAID);
    await shipmentService.update(SHIPMENT, COMPANY, { warehouseReleasedDate: "2026-11-11" } as never, USER, "user");
    expect(lines().map((l) => l.field)).not.toContain("prepaymentUnchecked");
  });
});

// Costs Breakdown's "Quantities checked" after an accepted remeasurement.
describe("the last accepted remeasurement and its Quantities checked", () => {
  const accepted = { id: "a2", userId: JAN.id, field: "remeasurementAccepted", oldValue: JSON.stringify({ colli: 5, weightKg: 170, volumeCbm: 7.2 }), newValue: JSON.stringify({ colli: 5, weightKg: 250, volumeCbm: 34.65 }), changedAt: new Date("2026-11-18T10:00:00.000Z") };
  const checkedFor = (acceptedAt: string, changedAt: string) => ({ id: "c1", userId: MARTIN.id, field: "remeasurementCostsChecked", oldValue: null, newValue: acceptedAt, changedAt: new Date(changedAt) });
  const history = (checked: ReturnType<typeof checkedFor> | null) =>
    vi.mocked(shipmentAuditRepository.listByShipmentId).mockImplementation(async (_id, _companyId, fields) => {
      if (fields.includes("remeasurementAccepted")) return [accepted] as never;
      return (checked ? [checked] : []) as never;
    });

  beforeEach(() => {
    stored.set(SHIPMENT, row({ freightMode: "Air Freight" }));
  });

  it("counts the check made for this acceptance", async () => {
    history(checkedFor("2026-11-18T10:00:00.000Z", "2026-11-18T11:00:00.000Z"));
    expect(await shipmentService.remeasureAcceptance(SHIPMENT, COMPANY)).toMatchObject({
      acceptedAt: "2026-11-18T10:00:00.000Z",
      acceptedBy: "Jan Novák",
      costsCheckedAt: "2026-11-18T11:00:00.000Z",
      costsCheckedBy: "Martin Koubek",
    });
  });

  it("does not count a check made for an earlier acceptance, even one written after this acceptance", async () => {
    history(checkedFor("2026-11-17T09:00:00.000Z", "2026-11-18T10:00:00.050Z"));
    expect(await shipmentService.remeasureAcceptance(SHIPMENT, COMPANY)).toMatchObject({ costsCheckedAt: null, costsCheckedBy: null });
    history(null);
    expect(await shipmentService.remeasureAcceptance(SHIPMENT, COMPANY)).toMatchObject({ costsCheckedAt: null });
  });

  describe("who may mark the quantities checked", () => {
    const INVOICING = "d0000000-0000-4000-8000-000000000001";
    const placed = (departmentId: string | null, name = "Invoicing") => {
      vi.mocked(auth.usersList).mockResolvedValue({ users: [{ ...JANA, companyId: COMPANY, role: "user", departmentId, branchId: null, reportsToUserId: null }] } as never);
      vi.mocked(auth.departmentList).mockResolvedValue({ departments: [{ id: INVOICING, name }] } as never);
    };
    const jana = { companyID: COMPANY, userID: JANA.id, role: "user" };

    beforeEach(() => {
      history(null);
      // Handled By is Martin: Jana is no person of the shipment.
      stored.set(SHIPMENT, row({ freightMode: "Sea Freight", loadType: "Full Load", personInCharge: MARTIN.email, holidayCover: "" }));
      vi.mocked(auth.userLookup).mockResolvedValue({ users: [JANA] } as never);
    });

    it("refuses a user who is neither the shipment's person, a manager nor in Invoicing, and says so on what they read", async () => {
      placed(null);
      await expect(shipmentService.markRemeasureCostsChecked(SHIPMENT, jana)).rejects.toMatchObject({
        code: "permission_denied",
        message: "Only the user in Handled By or Holiday Cover, a manager or Invoicing can mark the quantities checked",
      });
      expect(shipmentAuditRepository.create).not.toHaveBeenCalled();
      expect(await shipmentService.remeasureAcceptance(SHIPMENT, COMPANY, jana)).toMatchObject({ mayCheckCosts: false, loadType: "Full Load" });
      placed(INVOICING, "Customs");
      expect(await shipmentService.remeasureAcceptance(SHIPMENT, COMPANY, jana)).toMatchObject({ mayCheckCosts: false });
    });

    it("lets a user of the Invoicing department, and a manager, mark them", async () => {
      placed(INVOICING, " invoicing CZ ");
      expect(await shipmentService.remeasureAcceptance(SHIPMENT, COMPANY, jana)).toMatchObject({ mayCheckCosts: true });
      await shipmentService.markRemeasureCostsChecked(SHIPMENT, jana);
      expect(shipmentAuditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ field: "remeasurementCostsChecked", userId: JANA.id, newValue: "2026-11-18T10:00:00.000Z" }));
      placed(null);
      expect(await shipmentService.remeasureAcceptance(SHIPMENT, COMPANY, { ...jana, role: "manager" })).toMatchObject({ mayCheckCosts: true });
    });

    it("marks only the acceptance the page shows: a page left open while a newer one was accepted is refused, nothing written (mock test S20-079)", async () => {
      const manager = { ...jana, role: "manager" };
      await expect(shipmentService.markRemeasureCostsChecked(SHIPMENT, manager, "2026-11-17T09:00:00.000Z")).rejects.toMatchObject({
        code: "failed_precondition",
        message: "A newer remeasurement was accepted: reload to see it",
      });
      expect(shipmentAuditRepository.create).not.toHaveBeenCalled();

      await shipmentService.markRemeasureCostsChecked(SHIPMENT, manager, "2026-11-18T10:00:00.000Z");
      expect(shipmentAuditRepository.create).toHaveBeenCalledWith(expect.objectContaining({ field: "remeasurementCostsChecked", newValue: "2026-11-18T10:00:00.000Z" }));
    });
  });
});

// User Council B4 / owner's answer Q9: Invoicing → To bill (and All) list every job with an open invoice and a
// charge on no invoice, whatever its status - CZFCL00000055, invoiced while "Booking Confirmation Pending", then
// given a demurrage of EUR 150. Invoicing names those jobs; the list takes them in by their ids.
describe("the Invoicing lists' jobs with a charge added after their invoice", () => {
  const JOB_55 = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c55";
  const lateCharges = vi.mocked(invoicing._internalLateChargeShipments);
  const listOf = (invoicingFilter?: string, company = COMPANY) =>
    shipmentService.list(company, { ...(invoicingFilter ? { invoicing: invoicingFilter } : {}), limit: 200, offset: 0, sortDirection: "desc" });
  // The ids, once read, serve the company's lists of the next few seconds: each test (and each step that must read
  // again) moves the clock on by a minute, past what an earlier one kept.
  let clock = Date.now();
  const later = () => vi.setSystemTime((clock += 60_000));
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    later();
    repository.listFiltered.mockResolvedValue({ data: [], total: 0 } as never);
    vi.mocked(masterJobRepository.mczNumbersByIds).mockResolvedValue(new Map() as never);
    for (const read of [containerRepository, cargoItemRepository, cargoDimensionRepository, commercialInvoiceRepository]) vi.mocked(read.listByShipmentIds).mockResolvedValue([] as never);
    vi.mocked(shipmentAttachmentRepository.documentTypesByShipmentIds).mockResolvedValue([] as never);
    vi.mocked(shipmentTrackingEventRepository.latestPerShipment).mockResolvedValue(new Map() as never);
    lateCharges.mockResolvedValue({ shipmentIds: [JOB_55] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("are asked of invoicing, for the list's own company, and handed to To bill and All", async () => {
    for (const filter of ["billing", "all"]) {
      later();
      repository.listFiltered.mockClear();
      lateCharges.mockClear();
      await listOf(filter);
      expect(lateCharges).toHaveBeenCalledWith({ authData: { userID: "", companyID: COMPANY, role: "user" } });
      expect(repository.listFiltered).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ invoicing: filter, lateChargeIds: [JOB_55] }));
    }
  });

  it("are not asked for any other list", async () => {
    for (const filter of [undefined, "invoiced", "unbilled-arrivals", "not-invoiced"]) {
      repository.listFiltered.mockClear();
      await listOf(filter);
      expect(repository.listFiltered).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ lateChargeIds: undefined }));
    }
    expect(lateCharges).not.toHaveBeenCalled();
  });

  // Review 4, Minor 1: one queue load lists its view page by page and counts All and To bill - up to 7 lists.
  it("are read once for the company's lists of the next few seconds - all of them at once too - and again after, or for another company", async () => {
    lateCharges.mockClear();
    repository.listFiltered.mockClear();
    await Promise.all([listOf("all"), listOf("billing")]);
    await listOf("all");
    expect(lateCharges).toHaveBeenCalledTimes(1);
    expect(repository.listFiltered.mock.calls.map((c) => c[1].lateChargeIds)).toEqual([[JOB_55], [JOB_55], [JOB_55]]);

    const OTHER = "1d6f9a40-5c1e-4c51-9f0a-2b3c4d5e6f70";
    await listOf("billing", OTHER);
    expect(lateCharges).toHaveBeenCalledTimes(2);
    expect(lateCharges).toHaveBeenLastCalledWith({ authData: { userID: "", companyID: OTHER, role: "user" } });

    vi.setSystemTime(clock + LATE_CHARGE_IDS_KEPT_MS);
    await listOf("billing");
    expect(lateCharges).toHaveBeenCalledTimes(3);
  });

  // Review 4, M-1: the late charges must not take the list - and every Invoicing tab - down with them.
  it("when invoicing doesn't answer, To bill and All list without them - not failing - and it is logged", async () => {
    lateCharges.mockRejectedValueOnce(new Error("invoicing restarting"));
    vi.mocked(log.warn).mockClear();
    // ...and says so (mock council S5-2), so the queue warns above itself.
    await expect(listOf("billing")).resolves.toMatchObject({ data: [], lateChargesNotRead: true });
    expect(repository.listFiltered).toHaveBeenLastCalledWith(COMPANY, expect.objectContaining({ invoicing: "billing", lateChargeIds: undefined }));
    expect(log.warn).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining("not read"));
    // The same load's other lists agree: none of them adds a late-charge job either.
    await expect(listOf("all")).resolves.toMatchObject({ lateChargesNotRead: true });
    expect(repository.listFiltered).toHaveBeenLastCalledWith(COMPANY, expect.objectContaining({ invoicing: "all", lateChargeIds: undefined }));
  });

  it("says nothing of late charges when they were read, or for a list that does not take them in (S5-2)", async () => {
    expect(await listOf("billing")).not.toHaveProperty("lateChargesNotRead");
    expect(await listOf("invoiced")).not.toHaveProperty("lateChargesNotRead");
  });
});

describe("Booked Dimensions (owner's answer 22 Nov)", () => {
  const packages = [{ qty: 30, type: "Pallets", length: 120, width: 80, height: 100, weight: 50 }];

  it("books the quote's package lines with a shipment made from it", async () => {
    salesQuoteGet.mockResolvedValue(quote({ data: { packages } }));
    await shipmentService.create(COMPANY, { fromQuoteNumber: REF } as never);
    const data = repository.createFromQuote.mock.calls[0]![2] as Record<string, unknown>;
    expect(data.bookedDimensions).toEqual([
      expect.objectContaining({ pieces: "30", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "50", packageType: "Pallet(s)" }),
    ]);
  });

  // The quote is read for the shipment's own company (review of system-23), never with the caller's login.
  const AS_SHIPMENTS_COMPANY = { authData: { userID: "", companyID: COMPANY, role: "user" } };
  const notFilled = () => row({ createdFromQuote: true, salesNumber: REF, bookedDimensions: null }) as never;

  it("fills them once from the quote of a shipment made from one before, on its first read", async () => {
    repository.getByIdForCompany.mockResolvedValueOnce(notFilled());
    quoteData.mockResolvedValue({ quote: { data: { packages } } });
    const item = await shipmentService.getById(SHIPMENT, COMPANY);
    expect(quoteData).toHaveBeenCalledWith({ quoteNumber: REF }, AS_SHIPMENTS_COMPANY);
    expect(repository.setBookedDimensionsOnce).toHaveBeenCalledWith(SHIPMENT, COMPANY, [expect.objectContaining({ pieces: "30" })]);
    expect(item!.bookedDimensions).toEqual([expect.objectContaining({ pieces: "30" })]);
  });

  // Review of system-23: read with whatever login came with the request, a user of another company opening this
  // company's tracking link (or any call for another company) booked their own quote of that reference into it.
  it("reads the quote of the shipment's own company, never the signed-in caller's of another company", async () => {
    signedIn.role = "manager";
    try {
      repository.getByIdForCompany.mockResolvedValueOnce(notFilled());
      quoteData.mockResolvedValue({ quote: { data: { packages } } });
      await shipmentService.getById(SHIPMENT, COMPANY);
      expect(salesQuoteGet).not.toHaveBeenCalled();
      expect(quoteData).toHaveBeenCalledExactlyOnceWith({ quoteNumber: REF }, AS_SHIPMENTS_COMPANY);
      expect(repository.setBookedDimensionsOnce).toHaveBeenCalledExactlyOnceWith(SHIPMENT, COMPANY, [expect.objectContaining({ pieces: "30" })]);
    } finally {
      signedIn.role = null;
    }
  });

  it("asks no quote and books nothing for the customer's tracking page (fillBookedDimensions: false)", async () => {
    repository.getByIdForCompany.mockResolvedValueOnce(notFilled());
    const item = await shipmentService.getById(SHIPMENT, COMPANY, { fillBookedDimensions: false });
    expect(quoteData).not.toHaveBeenCalled();
    expect(salesQuoteGet).not.toHaveBeenCalled();
    expect(repository.setBookedDimensionsOnce).not.toHaveBeenCalled();
    expect(item!.bookedDimensions).toEqual([]);
  });

  it("books none when the quote is gone, and tries again later when it can't be read now", async () => {
    repository.getByIdForCompany.mockResolvedValueOnce(notFilled());
    quoteData.mockResolvedValueOnce({ quote: null });
    expect((await shipmentService.getById(SHIPMENT, COMPANY))!.bookedDimensions).toEqual([]);
    expect(repository.setBookedDimensionsOnce).toHaveBeenCalledWith(SHIPMENT, COMPANY, []);

    repository.setBookedDimensionsOnce.mockClear();
    repository.getByIdForCompany.mockResolvedValueOnce(notFilled());
    quoteData.mockRejectedValueOnce(new Error("quotes is unreachable"));
    expect((await shipmentService.getById(SHIPMENT, COMPANY))!.bookedDimensions).toEqual([]);
    expect(repository.setBookedDimensionsOnce).not.toHaveBeenCalled();
  });

  it("asks no quote for a shipment that has its Booked Dimensions", async () => {
    repository.getByIdForCompany.mockResolvedValueOnce(row({ createdFromQuote: true, salesNumber: REF, bookedDimensions: [] }) as never);
    await shipmentService.getById(SHIPMENT, COMPANY);
    expect(quoteData).not.toHaveBeenCalled();
    expect(repository.setBookedDimensionsOnce).not.toHaveBeenCalled();
  });
});
