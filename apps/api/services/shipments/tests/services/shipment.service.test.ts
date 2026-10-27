import { beforeEach, describe, expect, it, vi } from "vitest";

// What the shipments service does about the sales quote a shipment names - on create, on a
// changed Sales Number and on delete - run for real against stand-ins for its repositories, for
// the other services and for the service that tells quotes about their shipments.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  auth: { usersList: vi.fn(), userLookup: vi.fn() },
  customers: { customerUpdate: vi.fn(), customerGet: vi.fn(), addressList: vi.fn(), contactList: vi.fn() },
  invoicing: { invoicingImportQuote: vi.fn(), openInvoiceCount: vi.fn() },
  quotes: { salesQuoteGet: vi.fn() },
}));
vi.mock("../../repositories/shipment.repository", () => ({
  OVERDUE_DEADLINE_FIELDS: new Set<string>(),
  shipmentRepository: {
    createWithJobNumber: vi.fn(),
    createFromQuote: vi.fn(),
    getByIdForCompany: vi.fn(),
    updateForCompany: vi.fn(),
    softDeleteForCompany: vi.fn(),
    customerRollups: vi.fn(),
    customerFacts: vi.fn(),
    truckPlate: vi.fn(),
    liveBySalesNumbers: vi.fn(),
    liveBySalesNumber: vi.fn(),
    peopleOf: vi.fn(),
    rewritePeople: vi.fn(),
  },
}));
vi.mock("../../repositories/shipmentAttachment.repository", () => ({ shipmentAttachmentRepository: { documentTypesByShipmentIds: vi.fn() } }));
vi.mock("../../repositories/shipmentAudit.repository", () => ({ shipmentAuditRepository: { create: vi.fn() } }));
vi.mock("../../repositories/masterJob.repository", () => ({ masterJobRepository: {} }));
vi.mock("../../repositories/shipmentRefCounter.repository", () => ({ shipmentRefCounterRepository: { peek: vi.fn() } }));
vi.mock("../../repositories/container.repository", () => ({ containerRepository: { syncForShipment: vi.fn(), listByShipmentId: vi.fn() } }));
vi.mock("../../repositories/cargoItem.repository", () => ({ cargoItemRepository: { replaceForShipment: vi.fn(), listByShipmentId: vi.fn() } }));
vi.mock("../../repositories/cargoDimension.repository", () => ({ cargoDimensionRepository: { replaceForShipment: vi.fn(), listByShipmentId: vi.fn() } }));
vi.mock("../../repositories/commercialInvoice.repository", () => ({ commercialInvoiceRepository: { listByShipmentId: vi.fn(async () => []), syncForShipment: vi.fn() } }));
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() }, shipmentPartiesChanged: { publish: vi.fn() } }));
vi.mock("../../services/quoteLinks.service", () => ({ quoteLinksService: { syncReference: vi.fn(), markDirty: vi.fn() } }));

import log from "encore.dev/log";
import { auth, customers, invoicing, quotes } from "~encore/clients";
import { APIError } from "../../../../lib/tests/encoreApi.stub";
import type { QuoteSyncResult } from "../../interfaces/interfaces";
import { cargoDimensionRepository } from "../../repositories/cargoDimension.repository";
import { cargoItemRepository } from "../../repositories/cargoItem.repository";
import { containerRepository } from "../../repositories/container.repository";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentAttachmentRepository } from "../../repositories/shipmentAttachment.repository";
import type { ShipmentRecord } from "../../schemas/shipment.schema";
import { shipmentAuditRepository } from "../../repositories/shipmentAudit.repository";
import { quoteLinksService } from "../../services/quoteLinks.service";
import { shipmentService } from "../../services/shipment.service";
import { shipmentPartiesChanged } from "../../topics";

const repository = vi.mocked(shipmentRepository);
const links = vi.mocked(quoteLinksService);
const salesQuoteGet = vi.mocked(quotes.salesQuoteGet);
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
    customerId: null,
    masterJobId: null,
    customsStatus: "",
    warehouseTruck: "",
    createdAt: new Date("2026-10-13T10:00:00Z"),
    updatedAt: new Date("2026-10-13T10:00:00Z"),
    deletedAt: null,
    ...over,
  }) as unknown as ShipmentRecord;

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
  repository.createWithJobNumber.mockImplementation(async (_companyId, data) => insert(data as Record<string, unknown>));
  repository.createFromQuote.mockImplementation(async (_companyId, reference, data) => ({ created: insert({ ...(data as Record<string, unknown>), salesNumber: reference }) }));
  repository.getByIdForCompany.mockImplementation(async (id) => stored.get(id) ?? null);
  repository.updateForCompany.mockImplementation(async (id, _companyId, data) => {
    const updated = { ...stored.get(id)!, ...(data as Record<string, unknown>) } as ShipmentRecord;
    stored.set(id, updated);
    return updated;
  });
  repository.softDeleteForCompany.mockImplementation(async (id) => stored.get(id) ?? null);
  vi.mocked(shipmentAttachmentRepository.documentTypesByShipmentIds).mockResolvedValue([]);
  vi.mocked(invoicing.openInvoiceCount).mockResolvedValue({ count: 0 });
  vi.mocked(containerRepository.listByShipmentId).mockResolvedValue([]);
  vi.mocked(cargoItemRepository.listByShipmentId).mockResolvedValue([]);
  vi.mocked(cargoDimensionRepository.listByShipmentId).mockResolvedValue([]);
  salesQuoteGet.mockResolvedValue(quote());
  vi.mocked(auth.usersList).mockResolvedValue({ users: MEMBERS } as never);
  vi.mocked(auth.userLookup).mockImplementation(
    async ({ ids }) => ({ users: MEMBERS.filter((m) => ids.includes(m.id)).map((m) => ({ id: m.id, name: m.displayName, email: m.email, role: "user" })) }) as never,
  );
  links.syncReference.mockResolvedValue(synced({ status: "won", becameWon: true }));
  importQuote.mockResolvedValue({ buying: 3, selling: 2 });
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
});

describe("Created by", () => {
  it("is the e-mail of the signed-in user who creates the shipment, whatever the request says (when is createdAt)", async () => {
    await shipmentService.create(COMPANY, { createdBy: "someone else" } as never, USER);
    await shipmentService.create(COMPANY, { fromQuoteNumber: REF, createdBy: "someone else" } as never, USER);
    const createdBy = [repository.createWithJobNumber.mock.calls[0]![1].createdBy, repository.createFromQuote.mock.calls[0]![2].createdBy];
    for (const stamp of createdBy) expect(stamp).toBe("jan@firma.cz");
    expect(auth.userLookup).toHaveBeenCalledWith({ ids: [USER] });
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

describe("a shipper or consignee picked from the Customer Database", () => {
  const PARTY = "3c1e2f0a-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);
  const written = () => repository.updateForCompany.mock.calls[0]![2] as Record<string, unknown>;
  const SITE_ID = "946e01e8-a4ed-4aa7-932b-2c5d5e991c30";

  beforeEach(() => {
    vi.mocked(customers.customerGet).mockResolvedValue({ customer: { companyName: "Alza.cz a.s.", registeredAddress: "Jankovcova, 1522/53, Praha, 17000", country: "CZ" } } as never);
    vi.mocked(customers.addressList).mockResolvedValue({
      data: [
        { type: "Registered", street: "Jankovcova 1522/53", city: "Praha", postalCode: "170 00", country: "CZ" },
        { type: "Delivery", street: "Dopravní", city: "Praha 11", postalCode: "18000", country: "CZ" },
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

  it("fills the consignee's delivery from its Delivery address and clears the old site and hours", async () => {
    stored.set(SHIPMENT, row({ consigneeId: null, deliveryAddress: "old street", deliverySiteId: SITE_ID, consigneeOpeningFrom: "08:00" }));
    await update({ consignee: "Alza.cz a.s.", consigneeId: PARTY });
    expect(customers.addressList).toHaveBeenCalledWith({ customerId: PARTY });
    expect(written()).toMatchObject({
      deliveryAddress: "Dopravní, Praha 11",
      deliveryPostcode: "18000",
      deliveryCountry: "CZ",
      deliverySiteId: null,
      consigneeOpeningFrom: "",
      consigneeOpeningTo: "",
    });
  });

  it("fills the shipper's pick-up from the Registered address when there is no Pickup one", async () => {
    await shipmentService.create(COMPANY, { shipper: "Alza.cz a.s.", shipperId: PARTY, pickupAddress: "" } as never);
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({
      pickupAddress: "Jankovcova 1522/53, Praha",
      pickupPostcode: "17000",
      pickupCountry: "CZ",
    });
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
      ["personInCharge", "Person In Charge"],
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
    await expect(update({ personInCharge: "Petr" })).rejects.toMatchObject(PICK("Person In Charge"));
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

  describe("the Sales Person a shipment takes from its quote", () => {
    const takenFrom = async (over: Record<string, unknown>) => {
      salesQuoteGet.mockResolvedValue(quote(over));
      await create({ salesNumber: REF });
      return repository.createWithJobNumber.mock.calls.at(-1)![1].salesPerson;
    };

    it("is the e-mail of the user who owns the quote", async () => {
      await expect(takenFrom({ ownerUserId: JANA.id, ownerName: "Jana Nováková" })).resolves.toBe("jana@firma.cz");
      expect(auth.userLookup).toHaveBeenCalledWith({ ids: [JANA.id] });
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

describe("softDelete", () => {
  it("tells the quote the deleted shipment named, after the shipment is gone", async () => {
    stored.set(SHIPMENT, row({ salesNumber: ` ${REF}` }));
    await shipmentService.softDelete(SHIPMENT, COMPANY, USER);
    expect(links.syncReference).toHaveBeenCalledWith(COMPANY, REF);
    expect(repository.softDeleteForCompany.mock.invocationCallOrder[0]).toBeLessThan(links.syncReference.mock.invocationCallOrder[0]!);
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
    expect(repository.updateForCompany).toHaveBeenCalledWith("s-1", COMPANY, { salesNumber: `${REF}-R1` });
    expect(repository.updateForCompany).toHaveBeenCalledWith("s-2", COMPANY, { salesNumber: `${REF}-R1` });
    expect(vi.mocked(shipmentAuditRepository.create)).toHaveBeenCalledWith({ companyId: COMPANY, shipmentId: "s-1", userId: USER, field: "salesNumber", oldValue: REF, newValue: `${REF}-R1` });
    expect(links.syncReference.mock.calls.map((c) => c[1])).toEqual([`${REF}-R1`, REF]);
  });

  it("moves nothing and tells nobody when no shipment names the quote", async () => {
    repository.liveBySalesNumber.mockResolvedValue([]);
    await expect(shipmentService.moveQuoteReference(COMPANY, USER, REF, `${REF}-R1`)).resolves.toEqual([]);
    expect(repository.updateForCompany).not.toHaveBeenCalled();
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
      message: "Customer's PIC: pick a contact saved for this customer in the Customer Database",
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
