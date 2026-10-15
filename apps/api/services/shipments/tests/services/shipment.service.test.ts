import { beforeEach, describe, expect, it, vi } from "vitest";

// What the shipments service does about the sales quote a shipment names - on create, on a
// changed Sales Number and on delete - run for real against stand-ins for its repositories, for
// the other services and for the service that tells quotes about their shipments.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  auth: { usersList: vi.fn() },
  customers: { customerUpdate: vi.fn(), customerGet: vi.fn() },
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
vi.mock("../../topics", () => ({ shipmentDeleted: { publish: vi.fn() } }));
vi.mock("../../services/quoteLinks.service", () => ({ quoteLinksService: { syncReference: vi.fn(), markDirty: vi.fn() } }));

import log from "encore.dev/log";
import { invoicing, quotes } from "~encore/clients";
import { APIError } from "../../../../lib/tests/encoreApi.stub";
import type { QuoteSyncResult } from "../../interfaces/interfaces";
import { cargoDimensionRepository } from "../../repositories/cargoDimension.repository";
import { cargoItemRepository } from "../../repositories/cargoItem.repository";
import { containerRepository } from "../../repositories/container.repository";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentAttachmentRepository } from "../../repositories/shipmentAttachment.repository";
import type { ShipmentRecord } from "../../schemas/shipment.schema";
import { quoteLinksService } from "../../services/quoteLinks.service";
import { shipmentService } from "../../services/shipment.service";

const repository = vi.mocked(shipmentRepository);
const links = vi.mocked(quoteLinksService);
const salesQuoteGet = vi.mocked(quotes.salesQuoteGet);
const importQuote = vi.mocked(invoicing.invoicingImportQuote);

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const USER = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";
const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const REF = "QCZ20261010001";
const OTHER_REF = "QCZ20261010002";

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
const quote = (over: Record<string, unknown> = {}) => ({ quote: { quoteNumber: REF, ownerName: "Martin Koubek", data: {}, ...over } }) as Awaited<ReturnType<typeof quotes.salesQuoteGet>>;

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
    expect(data).toMatchObject({ pol: "Shanghai", salesPerson: "Martin Koubek" });
    // What says how to create is not a field of the shipment.
    expect(data).not.toHaveProperty("fromQuoteNumber");
    expect(data).not.toHaveProperty("allowSecondShipment");

    expect(links.syncReference).toHaveBeenCalledWith(COMPANY, REF, { wonByShipmentId: SHIPMENT });
    expect(importQuote).toHaveBeenCalledWith({ shipmentId: SHIPMENT, quoteNumber: REF, target: "both" });
    expect(result).toMatchObject({
      shipment: { id: SHIPMENT, salesNumber: REF, salesPerson: "Martin Koubek" },
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
    await fromQuote({ salesPerson: "Jana Nováková" });
    expect(repository.createFromQuote.mock.calls[0]![2]).toMatchObject({ salesPerson: "Jana Nováková" });
    salesQuoteGet.mockResolvedValue(quote({ ownerName: "" }));
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
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ salesNumber: REF, salesPerson: "Martin Koubek" });
    expect(result).toMatchObject({ shipment: { salesPerson: "Martin Koubek" } });
  });

  it("keeps a Sales Person the request names itself, without asking the quote", async () => {
    await create({ salesNumber: REF, salesPerson: "Jana Nováková" });
    expect(salesQuoteGet).not.toHaveBeenCalled();
    expect(repository.createWithJobNumber.mock.calls[0]![1]).toMatchObject({ salesPerson: "Jana Nováková" });
  });

  it("leaves the Sales Person empty for a Sales Number that is no sales quote, a quote nobody owns and a quote that cannot be read", async () => {
    salesQuoteGet.mockRejectedValueOnce(APIError.notFound("Quote not found"));
    await create({ salesNumber: "PO 4411" });
    salesQuoteGet.mockResolvedValueOnce(quote({ ownerName: "" }));
    await create({ salesNumber: REF });
    salesQuoteGet.mockRejectedValueOnce(new Error("quotes is unreachable"));
    await create({ salesNumber: REF });
    expect(repository.createWithJobNumber).toHaveBeenCalledTimes(3);
    for (const [, data] of repository.createWithJobNumber.mock.calls) expect(data).not.toHaveProperty("salesPerson");
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

describe("update", () => {
  const update = (data: Record<string, unknown>) => shipmentService.update(SHIPMENT, COMPANY, data as never, USER);

  it("tells the new quote and the old one when the Sales Number changes, after the shipment is written", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF, salesPerson: "Martin Koubek" }));
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
    stored.set(SHIPMENT, row({ salesNumber: REF, salesPerson: "Martin Koubek" }));
    salesQuoteGet.mockResolvedValue(quote({ quoteNumber: OTHER_REF, ownerName: "Jana Nováková" }));
    await update({ salesNumber: OTHER_REF });
    expect(salesQuoteGet).toHaveBeenCalledWith({ quoteNumber: OTHER_REF });
    expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ salesNumber: OTHER_REF, salesPerson: "Jana Nováková" });
  });

  it("keeps the Sales Person when the request names one, when the new Sales Number is no sales quote, and when the number is cleared or the same", async () => {
    stored.set(SHIPMENT, row({ salesNumber: REF, salesPerson: "Martin Koubek" }));
    await update({ salesNumber: OTHER_REF, salesPerson: "Jana Nováková" });
    expect(repository.updateForCompany.mock.calls[0]![2]).toMatchObject({ salesPerson: "Jana Nováková" });
    expect(salesQuoteGet).not.toHaveBeenCalled();

    salesQuoteGet.mockRejectedValueOnce(APIError.notFound("Quote not found"));
    await update({ salesNumber: "PO 4411" });
    expect(repository.updateForCompany.mock.calls[1]![2]).not.toHaveProperty("salesPerson");

    await update({ salesNumber: "" });
    await update({ salesNumber: "" });
    await update({ pol: "Shanghai" });
    expect(salesQuoteGet).toHaveBeenCalledTimes(1);
    for (const [, , data] of repository.updateForCompany.mock.calls.slice(2)) expect(data).not.toHaveProperty("salesPerson");
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
      message: "the Sales Number of this shipment is not the reference of a sales quote",
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
