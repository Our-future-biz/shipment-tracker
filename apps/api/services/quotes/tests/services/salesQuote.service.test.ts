import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The service is run for real - with the rules, the mapper, the policy and the owner matching it
// uses - against a stand-in for the repository and for the users of the auth service. What the
// repository's statements do to stored rows is not checked here.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  auth: { usersList: vi.fn() },
  customers: { customerActivate: vi.fn() },
  fx: { fxRatesOn: vi.fn() },
  shipments: { _internalShipmentsNamingQuote: vi.fn() },
}));
vi.mock("../../repositories/quoteAttachment.repository", () => ({ quoteAttachmentRepository: { deleteForQuote: vi.fn() } }));
vi.mock("../../repositories/salesQuote.repository", () => ({
  salesQuoteRepository: {
    adoptions: vi.fn(),
    adoptPending: vi.fn(),
    list: vi.fn(),
    loadSales: vi.fn(),
    withLockedQuote: vi.fn(),
    writeLifecycle: vi.fn(),
    saveDocument: vi.fn(),
    createWithReference: vi.fn(),
    unexaminedOwnerLabels: vi.fn(),
    recordOwnerMatch: vi.fn(),
    shipmentLinks: vi.fn(),
    customerFacts: vi.fn(),
    openCustomerQuotes: vi.fn(),
  },
}));

import log from "encore.dev/log";
import { auth, customers, fx, shipments } from "~encore/clients";
import type { Actor } from "../../../../lib/rbac";
import { quoteAttachmentRepository } from "../../repositories/quoteAttachment.repository";
import { salesQuoteRepository, type LifecycleWrite, type QuoteTransaction } from "../../repositories/salesQuote.repository";
import type { SalesQuoteRecord } from "../../schemas/quote.schema";
import { salesQuoteService, type SalesQuoteListRequest } from "../../services/salesQuote.service";
import { PROTECTED_KEYS } from "../../utils/quoteDocument.utils";
import { columnsOf } from "../../utils/quoteLifecycle.utils";

const repository = vi.mocked(salesQuoteRepository);
const attachments = vi.mocked(quoteAttachmentRepository);
const usersList = vi.mocked(auth.usersList);
const fxRatesOn = vi.mocked(fx.fxRatesOn);
const namingShipments = vi.mocked(shipments._internalShipmentsNamingQuote);
const customerActivate = vi.mocked(customers.customerActivate);

// 10 October 2026, noon in Prague.
const NOW = new Date("2026-10-10T10:00:00.000Z");
const YESTERDAY = "2026-10-09";
const SENT = new Date("2026-10-01T08:00:00.000Z");
const EXAMINED = new Date("2026-09-20T08:00:00.000Z");
const REF = "QCZ20261010001";
const TX = {} as QuoteTransaction;

const U_MANAGER = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a01";
const U_MARTIN = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";
const U_JANA = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a03";
const user = (id: string, displayName: string, email: string, role: string) => ({
  id,
  companyId: "",
  email,
  displayName,
  role,
  departmentId: null,
  branchId: null,
});
const USERS = [
  user(U_MANAGER, "Marie Manager", "marie@forwarder.cz", "manager"),
  user(U_MARTIN, "Martin Koubek", "martin@forwarder.cz", "user"),
  user(U_JANA, "Jana Nováková", "jana@forwarder.cz", "user"),
];

// A company of its own for every test: what the owner matching remembers about one must not
// decide what happens in the next.
let manager: Actor;
let martin: Actor;
let jana: Actor;

/** The quote the repository holds; null = there is no such sales quote. */
let stored: SalesQuoteRecord | null;

/** A Draft of Martin's whose owner text was compared with the users long ago. */
const quote = (over: Partial<SalesQuoteRecord> = {}): SalesQuoteRecord => ({
  id: "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11",
  companyId: martin.companyID,
  quoteNumber: REF,
  data: { reference: REF, quoteStatus: "draft", salesOwner: "Martin Koubek", timeline: [], origin: "Praha" },
  terms: "",
  createdAt: new Date("2026-09-15T08:00:00.000Z"),
  updatedAt: new Date("2026-10-02T09:30:00.456Z"),
  deletedAt: null,
  status: "draft",
  substatus: null,
  lostReason: null,
  lostComment: null,
  sentAt: null,
  firstSentAt: null,
  decidedAt: null,
  validUntil: null,
  lastContactAt: null,
  ownerUserId: U_MARTIN,
  ownerLabel: "Martin Koubek",
  ownerMatchCheckedAt: EXAMINED,
  shipmentId: null,
  shipmentJobNumber: null,
  deletedBy: null,
  dataVersion: 3,
  customerId: null,
  ...over,
});

/** What the one lifecycle write of a test stored. */
const written = (): LifecycleWrite => {
  expect(repository.writeLifecycle).toHaveBeenCalledTimes(1);
  return repository.writeLifecycle.mock.calls[0]![2];
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  // Sending a quote reads today's ČNB rates first (outside the lock); a quiet default for the tests
  // that are not about them.
  fxRatesOn.mockResolvedValue({ date: "2026-10-10", fixingDate: "2026-10-09", provisional: false, missing: false, roePct: 100, rates: [] } as never);
  namingShipments.mockResolvedValue({ shipments: [] });

  const companyID = randomUUID();
  manager = { userID: U_MANAGER, companyID, role: "manager" };
  martin = { userID: U_MARTIN, companyID, role: "user" };
  jana = { userID: U_JANA, companyID, role: "user" };
  stored = quote();

  usersList.mockResolvedValue({ users: USERS });
  repository.adoptions.mockReturnValue(0);
  repository.adoptPending.mockResolvedValue(0);
  repository.unexaminedOwnerLabels.mockResolvedValue([]);
  repository.loadSales.mockImplementation(async () => stored);
  repository.withLockedQuote.mockImplementation(async (_companyId, _quoteNumber, change) => (stored ? change(stored, TX) : null));
  // The row after a lifecycle write, as far as its columns go.
  repository.writeLifecycle.mockImplementation(async (_tx, row, write) => ({ ...row, ...columnsOf(write.state) }));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("get", () => {
  it("is not found for a quote that is missing, deleted or a row of the old quotes module", async () => {
    stored = null;
    await expect(salesQuoteService.get(martin, REF)).rejects.toMatchObject({ code: "not_found", message: "Quote not found" });
  });

  it("adopts what waits and matches the owner texts before it reads the quote", async () => {
    await salesQuoteService.get(martin, REF);
    const order = [repository.adoptPending, repository.unexaminedOwnerLabels, repository.loadSales].map((step) => step.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a! - b!));
    expect(repository.adoptPending).toHaveBeenCalledWith(martin.companyID);
  });

  it("hands out the quote with what the asking user may do with its owner", async () => {
    await expect(salesQuoteService.get(manager, REF)).resolves.toMatchObject({ quoteNumber: REF, permissions: { canChangeOwner: "any" } });
    await expect(salesQuoteService.get(martin, REF)).resolves.toMatchObject({ ownerName: "Martin Koubek", permissions: { canChangeOwner: "own" } });
    await expect(salesQuoteService.get(jana, REF)).resolves.toMatchObject({ permissions: { canChangeOwner: "none" } });
  });

  it("hands out the quote with whether the asking user may delete it, and why not", async () => {
    // Martin's Draft, never sent.
    expect((await salesQuoteService.get(manager, REF)).permissions).toMatchObject({ canDelete: true });
    expect((await salesQuoteService.get(martin, REF)).permissions).toMatchObject({ canDelete: true });
    expect((await salesQuoteService.get(jana, REF)).permissions).toMatchObject({
      canDelete: false,
      deleteBlockedReason: "only a manager can delete this quote",
    });
    stored = quote({ shipmentId: "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01", shipmentJobNumber: "CZ00000101" });
    expect((await salesQuoteService.get(manager, REF)).permissions).toMatchObject({
      canDelete: false,
      deleteBlockedReason: "shipment CZ00000101 was created from this quote - remove the Sales Number from the shipment first",
    });
  });

  it("matches a quote that only this request adopted - its owner still a text nobody compared - before it answers", async () => {
    // What older code leaves: the document names Jana, and the load is what takes that over.
    const adopted = quote({ ownerUserId: null, ownerLabel: "Jana Nováková", ownerMatchCheckedAt: null });
    stored = adopted;
    // Nothing waits when the read starts; the text is there once the quote was loaded.
    repository.unexaminedOwnerLabels.mockResolvedValueOnce([]).mockResolvedValue(["Jana Nováková"]);
    repository.recordOwnerMatch.mockImplementation(async (_companyId, _label, ownerUserId) => {
      stored = { ...adopted, ownerUserId, ownerMatchCheckedAt: NOW };
    });

    const item = await salesQuoteService.get(martin, REF);

    expect(repository.recordOwnerMatch).toHaveBeenCalledWith(martin.companyID, "Jana Nováková", U_JANA);
    // Not "claim": Martin is not offered a quote the server would refuse him.
    expect(item).toMatchObject({ ownerUserId: U_JANA, ownerName: "Jana Nováková", ownerLabel: "Jana Nováková", permissions: { canChangeOwner: "none" } });
  });

  it("does not look again for a quote whose owner text was examined and fits nobody", async () => {
    stored = quote({ ownerUserId: null, ownerLabel: "Petr", ownerMatchCheckedAt: EXAMINED });
    await expect(salesQuoteService.get(jana, REF)).resolves.toMatchObject({ ownerUserId: null, ownerName: "Petr", permissions: { canChangeOwner: "claim" } });
    expect(repository.loadSales).toHaveBeenCalledTimes(1);
    expect(repository.recordOwnerMatch).not.toHaveBeenCalled();
  });

  it("still answers when the users cannot be read: the owner stays the text, and nothing is stamped", async () => {
    stored = quote({ ownerUserId: null, ownerLabel: "Jana Nováková", ownerMatchCheckedAt: null });
    repository.unexaminedOwnerLabels.mockResolvedValue(["Jana Nováková"]);
    usersList.mockRejectedValue(new Error("auth is unreachable"));
    await expect(salesQuoteService.get(martin, REF)).resolves.toMatchObject({ ownerUserId: null, ownerName: "Jana Nováková" });
    expect(repository.recordOwnerMatch).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });
});

describe("list", () => {
  const AFTER = "5f0c1c7e-3f1b-4f0e-8a56-2d1e7a9b4c22";
  const CUSTOMER = "946e01e8-a4ed-4aa7-932b-2c5d5e991c30";

  beforeEach(() => {
    repository.list.mockResolvedValue({ rows: [], total: 0 });
  });

  /** What the repository was asked for by the one list read of a test. */
  const asked = async (request: SalesQuoteListRequest, actor: Actor = martin) => {
    repository.list.mockClear();
    await salesQuoteService.list(actor, request);
    expect(repository.list).toHaveBeenCalledTimes(1);
    const [companyId, filter, page, moment] = repository.list.mock.calls[0]!;
    return { companyId, filter, page, moment };
  };

  it("adopts what waits and matches the owner texts before it reads the list", async () => {
    await salesQuoteService.list(martin, {});
    const order = [repository.adoptPending, repository.unexaminedOwnerLabels, repository.list].map((step) => step.mock.invocationCallOrder[0]);
    expect(order).toEqual([...order].sort((a, b) => a! - b!));
    expect(repository.adoptPending).toHaveBeenCalledWith(martin.companyID);
  });

  it("asks for the first 50 of the caller's company, newest first, unfiltered - judged now", async () => {
    expect(await asked({})).toEqual({
      companyId: martin.companyID,
      filter: {
        statuses: [],
        serviceType: undefined,
        direction: undefined,
        createdFrom: undefined,
        createdTo: undefined,
        decidedFrom: undefined,
        decidedTo: undefined,
        ownerUserId: undefined,
        customerId: undefined,
        followUpDue: false,
        family: undefined,
        hasShipment: undefined,
        search: [],
      },
      page: { limit: 50, offset: 0, sortBy: "createdAt", sortDirection: "desc", afterId: undefined },
      // Today is the day in Prague; a follow-up is due on a last contact three days old.
      moment: { today: "2026-10-10", dueBefore: new Date("2026-10-07T10:00:00.000Z") },
    });
  });

  it("takes 'today' from the business day, not from the server's clock", async () => {
    // 23:30 in Prague on 10 October is still the 10th there, and already the 11th an hour later.
    vi.setSystemTime(new Date("2026-10-10T21:30:00.000Z"));
    expect((await asked({})).moment.today).toBe("2026-10-10");
    vi.setSystemTime(new Date("2026-10-10T22:30:00.000Z"));
    expect((await asked({})).moment.today).toBe("2026-10-11");
  });

  it("passes the filters on as the list takes them", async () => {
    const { filter } = await asked({
      statuses: " quoted, expired ,",
      serviceType: "Air",
      direction: "Import",
      createdFrom: "2026-10-01",
      createdTo: "2026-10-10",
      decidedFrom: "2026-09-01",
      decidedTo: "2026-09-30",
      customerId: CUSTOMER,
      followUp: "due",
      search: "  Praha ITTEC% ",
    });
    expect(filter).toMatchObject({
      statuses: ["quoted", "expired"],
      serviceType: "Air",
      direction: "Import",
      createdFrom: "2026-10-01",
      createdTo: "2026-10-10",
      decidedFrom: "2026-09-01",
      decidedTo: "2026-09-30",
      customerId: CUSTOMER,
      followUpDue: true,
      search: ["praha", "ittec\\%"],
    });
  });

  it("reads owner 'me' as whoever asks, 'none' as no owner user, and an id as that user", async () => {
    expect((await asked({ owner: "me" }, martin)).filter.ownerUserId).toBe(U_MARTIN);
    expect((await asked({ owner: "me" }, jana)).filter.ownerUserId).toBe(U_JANA);
    expect((await asked({ owner: "none" })).filter.ownerUserId).toBeNull();
    expect((await asked({ owner: U_JANA })).filter.ownerUserId).toBe(U_JANA);
    expect((await asked({ owner: "" })).filter.ownerUserId).toBeUndefined();
  });

  it("asks for the quotes a shipment names, for those none does, or for both", async () => {
    expect((await asked({ hasShipment: true })).filter.hasShipment).toBe(true);
    expect((await asked({ hasShipment: false })).filter.hasShipment).toBe(false);
    expect((await asked({})).filter.hasShipment).toBeUndefined();
  });

  it("asks for the family of the base, whichever of its quotes is named", async () => {
    expect((await asked({ familyOf: `${REF}-3` })).filter.family).toBe(REF);
    expect((await asked({ familyOf: ` ${REF} ` })).filter.family).toBe(REF);
    expect((await asked({ familyOf: "  " })).filter.family).toBeUndefined();
  });

  it("keeps the page within bounds and passes the sort on as it came", async () => {
    expect((await asked({ limit: 20, offset: 40, sortBy: "customer", sortDirection: "asc" })).page).toEqual({
      limit: 20,
      offset: 40,
      sortBy: "customer",
      sortDirection: "asc",
      afterId: undefined,
    });
    expect((await asked({ limit: 1000 })).page.limit).toBe(200);
    expect((await asked({ limit: 0 })).page.limit).toBe(1);
    expect((await asked({ limit: 2.7, offset: -5 })).page).toMatchObject({ limit: 2, offset: 0 });
    // Which sorts exist is the list's business: it answers one it does not know with the newest first.
    expect((await asked({ sortBy: "price" })).page.sortBy).toBe("price");
  });

  it("with afterId asks for the rows after that id: no offset", async () => {
    expect((await asked({ afterId: AFTER, limit: 200, offset: 400 })).page).toMatchObject({ afterId: AFTER, limit: 200, offset: 0 });
  });

  it("hands out every quote as a single read would, judged at the same moment as the filter, with the real total", async () => {
    const lapsed = quote({ quoteNumber: `${REF}-2`, status: "quoted", sentAt: SENT, firstSentAt: SENT, validUntil: YESTERDAY, ownerUserId: U_JANA, ownerLabel: "Jana" });
    const waiting = quote({ quoteNumber: `${REF}-3`, status: "feedback", sentAt: SENT, firstSentAt: SENT, lastContactAt: SENT });
    repository.list.mockResolvedValue({ rows: [quote(), lapsed, waiting], total: 137 });

    const page = await salesQuoteService.list(martin, { limit: 3, offset: 6 });

    expect(page.pagination).toEqual({ total: 137, offset: 6, limit: 3 });
    expect(page.data).toMatchObject([
      { quoteNumber: REF, status: "draft", effectiveStatus: "draft", followUpDue: false, permissions: { canChangeOwner: "own", canDelete: true } },
      // The owner under the user's current name, not the stored label.
      { quoteNumber: `${REF}-2`, status: "quoted", effectiveStatus: "expired", followUpDue: false, ownerName: "Jana Nováková", permissions: { canChangeOwner: "none", canDelete: false } },
      { quoteNumber: `${REF}-3`, effectiveStatus: "feedback", followUpDue: true, lastContactAt: SENT.toISOString() },
    ]);
    // The whole document comes along.
    expect(page.data[0]!.data).toEqual(quote().data);
    expect(usersList).toHaveBeenCalledTimes(1);
  });

  it("answers with offset 0 for rows after an id", async () => {
    repository.list.mockResolvedValue({ rows: [quote()], total: 9 });
    await expect(salesQuoteService.list(martin, { afterId: AFTER, limit: 1, offset: 5 })).resolves.toMatchObject({ pagination: { total: 9, offset: 0, limit: 1 } });
  });

  it("refuses what cannot be a filter as an invalid argument, before anything is read or adopted", async () => {
    const refused: [SalesQuoteListRequest, string][] = [
      [{ statuses: "quoted,sent" }, '"sent" is not a quote status'],
      [{ createdFrom: "2026-02-31" }, "createdFrom must be a real date (YYYY-MM-DD)"],
      [{ createdTo: "10.10.2026" }, "createdTo must be a real date (YYYY-MM-DD)"],
      [{ decidedFrom: "0000-01-01" }, "decidedFrom must be a real date (YYYY-MM-DD)"],
      [{ decidedTo: "2026-10-1" }, "decidedTo must be a real date (YYYY-MM-DD)"],
      [{ afterId: "abc" }, "afterId must be the id of a quote"],
      [{ afterId: `${AFTER}'` }, "afterId must be the id of a quote"],
      [{ owner: "Martin" }, 'owner must be "me", "none" or the id of a user'],
      [{ customerId: "42" }, "customerId must be the id of a customer"],
    ];
    for (const [request, message] of refused) {
      await expect(salesQuoteService.list(martin, request), message).rejects.toMatchObject({ code: "invalid_argument", message });
    }
    expect(repository.adoptPending).not.toHaveBeenCalled();
    expect(repository.list).not.toHaveBeenCalled();
  });

  it("accepts every status a quote can show", async () => {
    const statuses = "draft,ready_to_send,quoted,feedback,revised,won,lost,expired";
    expect((await asked({ statuses })).filter.statuses).toEqual(statuses.split(","));
  });

  it("still lists when the users cannot be read: owners show under their stored labels", async () => {
    usersList.mockRejectedValue(new Error("auth is unreachable"));
    repository.list.mockResolvedValue({ rows: [quote()], total: 1 });
    await expect(salesQuoteService.list(jana, {})).resolves.toMatchObject({ data: [{ ownerName: "Martin Koubek", ownerUserId: U_MARTIN }] });
  });
});

describe("create and duplicate", () => {
  beforeEach(() => {
    repository.createWithReference.mockImplementation(async (companyId, _prefix, pick, build) => {
      const quoteNumber = pick([`${REF}-2`]);
      return { ...quote(), ...build(quoteNumber), companyId, quoteNumber };
    });
  });

  it("creates a Draft of whoever creates it, under today's prefix, already examined", async () => {
    const item = await salesQuoteService.create(martin, { origin: "Brno", quoteStatus: "won" });
    expect(repository.createWithReference.mock.calls[0]!.slice(0, 2)).toEqual([martin.companyID, "QCZ20261010"]);
    expect(item).toMatchObject({ quoteNumber: REF, status: "draft", ownerUserId: U_MARTIN, ownerLabel: "Martin Koubek", permissions: { canChangeOwner: "own" } });
    expect(item.data).toMatchObject({ reference: REF, origin: "Brno", quoteStatus: "draft", salesOwner: "Martin Koubek" });
    const [, , , build] = repository.createWithReference.mock.calls[0]!;
    expect(build(REF)).toMatchObject({ status: "draft", ownerUserId: U_MARTIN, ownerMatchCheckedAt: NOW });
  });

  it("duplicates into the next variant of the base reference - also when a variant is duplicated", async () => {
    stored = quote({ quoteNumber: `${REF}-2`, ownerUserId: U_JANA });
    const item = await salesQuoteService.duplicate(martin, `${REF}-2`, {});
    expect(repository.createWithReference.mock.calls[0]!.slice(0, 2)).toEqual([martin.companyID, `${REF}-`]);
    expect(item).toMatchObject({ quoteNumber: `${REF}-3`, status: "draft", ownerUserId: U_MARTIN });
  });

  it("is not found when the quote to duplicate does not exist", async () => {
    stored = null;
    await expect(salesQuoteService.duplicate(martin, REF, {})).rejects.toMatchObject({ code: "not_found" });
    expect(repository.createWithReference).not.toHaveBeenCalled();
  });
});

describe("save", () => {
  it("saves under the version it names, with the lifecycle keys taken from the stored document", async () => {
    repository.saveDocument.mockResolvedValue(quote({ dataVersion: 4 }));
    const data = { origin: "Brno", quoteStatus: "won" };
    await expect(salesQuoteService.save(martin, REF, data, 3)).resolves.toMatchObject({ dataVersion: 4, status: "draft" });
    expect(repository.saveDocument).toHaveBeenCalledWith(martin.companyID, REF, { data, carry: [...PROTECTED_KEYS] }, { dataVersion: 3 });
  });

  it("is a conflict, and writes nothing, when the document is no longer the version the editor loaded", async () => {
    await expect(salesQuoteService.save(martin, REF, {}, 2)).rejects.toMatchObject({ code: "aborted" });
    expect(repository.saveDocument).not.toHaveBeenCalled();
  });

  it("is a conflict when somebody saved in the same moment, and not found when the quote went away", async () => {
    repository.saveDocument.mockResolvedValue(null);
    await expect(salesQuoteService.save(martin, REF, {}, 3)).rejects.toMatchObject({ code: "aborted" });
    repository.loadSales.mockResolvedValueOnce(quote()).mockResolvedValueOnce(null);
    await expect(salesQuoteService.save(martin, REF, {}, 3)).rejects.toMatchObject({ code: "not_found" });
  });

  it("is not found for a quote that is no sales quote", async () => {
    stored = null;
    await expect(salesQuoteService.save(martin, REF, {}, 1)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("transition", () => {
  it("writes the new status with its history line under the acting user's name and id", async () => {
    const result = await salesQuoteService.transition(martin, REF, { to: "ready_to_send", comment: "checked" });
    expect(result).toMatchObject({ changed: true, quote: { status: "ready_to_send" } });
    const write = written();
    expect(write.state).toMatchObject({ status: "ready_to_send", ownerUserId: U_MARTIN });
    expect(write.entries).toEqual([
      { kind: "status", status: "ready_to_send", at: NOW.toISOString(), user: "Martin Koubek", userId: U_MARTIN, comment: "checked" },
    ]);
    expect(write.document).toBeUndefined();
    expect(repository.writeLifecycle.mock.calls[0]!.slice(0, 2)).toEqual([TX, stored]);
  });

  it("records the user id alone when the name cannot be resolved", async () => {
    usersList.mockRejectedValue(new Error("auth is unreachable"));
    await salesQuoteService.transition(martin, REF, { to: "ready_to_send" });
    expect(written().entries).toEqual([{ kind: "status", status: "ready_to_send", at: NOW.toISOString(), userId: U_MARTIN }]);
  });

  it("says so, and writes nothing, when the quote already has that status", async () => {
    await expect(salesQuoteService.transition(martin, REF, { to: "draft" })).resolves.toMatchObject({ changed: false, quote: { status: "draft" } });
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
  });

  it("leaves a Feedback quote as it is when Feedback is set again without a sub-status (the bulk action)", async () => {
    stored = quote({ status: "feedback", substatus: "Negotiation", sentAt: SENT, firstSentAt: SENT, lastContactAt: SENT });
    await expect(salesQuoteService.transition(jana, REF, { to: "feedback" })).resolves.toMatchObject({
      changed: false,
      quote: { substatus: "Negotiation", lastContactAt: SENT.toISOString() },
    });
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
  });

  it("is a conflict when the document is no longer the version the caller saw", async () => {
    await expect(salesQuoteService.transition(martin, REF, { to: "ready_to_send", expectedDataVersion: 2 })).rejects.toMatchObject({ code: "aborted" });
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
    await expect(salesQuoteService.transition(martin, REF, { to: "ready_to_send", expectedDataVersion: 3 })).resolves.toMatchObject({ changed: true });
  });

  it("refuses a change decided on a status the quote no longer has, before it judges the change itself", async () => {
    // Draft to Won is not allowed either: the caller is told what the quote is now, not that.
    await expect(salesQuoteService.transition(martin, REF, { to: "won", expectedStatus: "quoted" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "the quote is now Draft",
    });
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
  });

  it("compares the expected status with the one shown: Expired for a quote whose validity has passed", async () => {
    stored = quote({ status: "quoted", sentAt: SENT, firstSentAt: SENT, validUntil: YESTERDAY });
    await expect(salesQuoteService.transition(martin, REF, { to: "revised", expectedStatus: "quoted" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "the quote is now Expired",
    });
    await expect(salesQuoteService.transition(martin, REF, { to: "revised", expectedStatus: "expired" })).resolves.toMatchObject({ changed: true });
  });

  describe("customer of a won quote", () => {
    const CUSTOMER = "c0ffee00-0000-4000-8000-000000000002";

    it("makes the customer Active when the quote is won", async () => {
      stored = quote({ status: "quoted", customerId: CUSTOMER, data: { reference: REF, quoteStatus: "quoted" } });
      await expect(salesQuoteService.transition(martin, REF, { to: "won" })).resolves.toMatchObject({ changed: true });
      expect(customerActivate).toHaveBeenCalledWith({ id: CUSTOMER });
    });

    it("leaves the customer alone for any other status, and for a quote without a customer", async () => {
      stored = quote({ status: "quoted", customerId: CUSTOMER, data: { reference: REF, quoteStatus: "quoted" } });
      await salesQuoteService.transition(martin, REF, { to: "lost", lostReason: "Price: too high" });
      stored = quote({ status: "quoted", data: { reference: REF, quoteStatus: "quoted" } });
      await salesQuoteService.transition(martin, REF, { to: "won" });
      expect(customerActivate).not.toHaveBeenCalled();
    });

    it("keeps the win when the customer cannot be updated", async () => {
      stored = quote({ status: "quoted", customerId: CUSTOMER, data: { reference: REF, quoteStatus: "quoted" } });
      customerActivate.mockRejectedValue(new Error("customers down"));
      await expect(salesQuoteService.transition(martin, REF, { to: "won" })).resolves.toMatchObject({ changed: true, quote: { status: "won" } });
      expect(log.warn).toHaveBeenCalled();
    });
  });

  it("refuses a move the status does not allow, in words for the user", async () => {
    await expect(salesQuoteService.transition(martin, REF, { to: "won" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "a quote cannot go from Draft to Won",
    });
    stored = quote({ status: "revised", sentAt: SENT, firstSentAt: SENT, validUntil: YESTERDAY });
    await expect(salesQuoteService.transition(martin, REF, { to: "quoted" })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "the validity date has passed - choose a new validity",
    });
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
  });

  it("answers a request that is wrong in itself as an invalid argument", async () => {
    await expect(salesQuoteService.transition(martin, REF, { to: "expired" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(salesQuoteService.transition(martin, REF, { to: "quoted", validityDays: 0 })).rejects.toMatchObject({
      code: "invalid_argument",
      message: "the validity must be between 1 and 365 days",
    });
  });

  describe("ČNB rates (data.fx)", () => {
    const TODAY_FX = {
      date: "2026-10-10",
      fixingDate: "2026-10-09",
      provisional: false,
      missing: false,
      roePct: 102,
      rates: [
        { currency: "EUR", rate: 24.375 },
        { currency: "USD", rate: 21.04 },
      ],
    };
    const STORED_FX = { date: "2026-10-01", fixingDate: "2026-10-01", roePct: 100, rates: { EUR: 25 }, lockedAt: "2026-10-01T10:00:00.000Z" };

    beforeEach(() => fxRatesOn.mockResolvedValue(TODAY_FX as never));

    it("stamps today's ČNB rates and ROE % when the quote is sent", async () => {
      stored = quote({ data: { reference: REF, quoteStatus: "draft", currency: "EUR" } });
      await salesQuoteService.transition(martin, REF, { to: "quoted", validityDays: 15 });
      expect(written().document).toEqual({
        fx: { date: "2026-10-10", fixingDate: "2026-10-09", roePct: 102, rates: { EUR: 24.375, USD: 21.04 }, lockedAt: NOW.toISOString() },
      });
    });

    it("keeps the rates a sent quote stores", async () => {
      stored = quote({ status: "quoted", data: { reference: REF, quoteStatus: "quoted", fx: STORED_FX } });
      await salesQuoteService.transition(martin, REF, { to: "won" });
      expect(written().document).toBeUndefined();
    });

    it("reads today's rates before locking the quote", async () => {
      const order: string[] = [];
      fxRatesOn.mockImplementation(async () => {
        order.push("rates");
        return TODAY_FX as never;
      });
      repository.withLockedQuote.mockImplementationOnce(async (_companyId, _quoteNumber, change) => {
        order.push("lock");
        return change(stored!, TX);
      });
      await salesQuoteService.transition(martin, REF, { to: "quoted", validityDays: 15 });
      expect(order).toEqual(["rates", "lock"]);
    });

    it("drops the rates of a quote that is revised", async () => {
      stored = quote({ status: "quoted", data: { reference: REF, quoteStatus: "quoted", fx: STORED_FX } });
      await salesQuoteService.transition(martin, REF, { to: "revised" });
      expect(written().document).toEqual({ fx: null });
    });

    it("writes no rates for a draft change", async () => {
      await salesQuoteService.transition(martin, REF, { to: "ready_to_send" });
      expect(written().document).toBeUndefined();
      expect(fxRatesOn).not.toHaveBeenCalled();
    });

    it("writes no rates for a quote lost before it was sent", async () => {
      await salesQuoteService.transition(martin, REF, { to: "lost", lostReason: "Price: too high" });
      expect(written().document).toBeUndefined();
      expect(fxRatesOn).not.toHaveBeenCalled();
    });
  });

  it("is not found for a quote that is no sales quote", async () => {
    stored = null;
    await expect(salesQuoteService.transition(martin, REF, { to: "quoted" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("setValidity", () => {
  it("writes the date without a history line before the first sending", async () => {
    await expect(salesQuoteService.setValidity(martin, REF, "2026-11-30")).resolves.toMatchObject({ validUntil: "2026-11-30" });
    expect(written()).toMatchObject({ state: { validUntil: "2026-11-30" }, entries: [] });
  });

  it("leaves a history line under the acting user's name once the quote was sent", async () => {
    stored = quote({ status: "quoted", sentAt: SENT, firstSentAt: SENT, validUntil: "2026-10-20" });
    await salesQuoteService.setValidity(jana, REF, "2026-11-30");
    expect(written().entries).toEqual([
      { kind: "validity", at: NOW.toISOString(), user: "Jana Nováková", userId: U_JANA, comment: "Valid until 2026-11-30 (was 2026-10-20)" },
    ]);
  });

  it("writes nothing when the date is the one stored", async () => {
    stored = quote({ validUntil: "2026-11-30" });
    await salesQuoteService.setValidity(martin, REF, "2026-11-30");
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
  });

  it("refuses on a decided quote, and a date that is none as an invalid argument", async () => {
    await expect(salesQuoteService.setValidity(martin, REF, "2026-02-31")).rejects.toMatchObject({
      code: "invalid_argument",
      message: "the validity must be a real date (YYYY-MM-DD)",
    });
    stored = quote({ status: "won", decidedAt: SENT });
    await expect(salesQuoteService.setValidity(martin, REF, "2026-11-30")).rejects.toMatchObject({
      code: "failed_precondition",
      message: "the validity of a Won quote cannot be changed",
    });
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
  });

  it("is not found for a quote that is no sales quote", async () => {
    stored = null;
    await expect(salesQuoteService.setValidity(martin, REF, null)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("followUp", () => {
  const FOUR_DAYS_AGO = new Date("2026-10-06T10:00:00.000Z");
  /** A Quoted quote of Martin's, sent on 1 October and last followed up four days ago. */
  const quoted = (over: Partial<SalesQuoteRecord> = {}) => quote({ status: "quoted", sentAt: SENT, firstSentAt: SENT, lastContactAt: FOUR_DAYS_AGO, ...over });

  it("records the contact under the lock: last contact now, a history line with who and what - and nothing else", async () => {
    stored = quoted();
    const item = await salesQuoteService.followUp(jana, REF, "  called, decision next week ");
    expect(item).toMatchObject({ status: "quoted", followUpDue: false, lastContactAt: NOW.toISOString(), sentAt: SENT.toISOString() });
    const write = written();
    expect(write.state).toEqual({ ...columnsOf(stored), createdAt: stored.createdAt, lastContactAt: NOW });
    expect(write.entries).toEqual([{ kind: "follow_up", at: NOW.toISOString(), user: "Jana Nováková", userId: U_JANA, comment: "called, decision next week" }]);
    // No document key: the document keeps its version, an open editor is not disturbed.
    expect(write.document).toBeUndefined();
    expect(repository.writeLifecycle.mock.calls[0]!.slice(0, 2)).toEqual([TX, stored]);
  });

  it("takes the flag off a quote a follow-up was due on", async () => {
    stored = quoted();
    await expect(salesQuoteService.get(martin, REF)).resolves.toMatchObject({ followUpDue: true });
    await expect(salesQuoteService.followUp(martin, REF)).resolves.toMatchObject({ followUpDue: false });
    expect(written().entries).toEqual([{ kind: "follow_up", at: NOW.toISOString(), user: "Martin Koubek", userId: U_MARTIN }]);
  });

  it("works on a Feedback quote too", async () => {
    stored = quoted({ status: "feedback", substatus: "Negotiation" });
    await expect(salesQuoteService.followUp(martin, REF, "sent the revised rate")).resolves.toMatchObject({ status: "feedback", substatus: "Negotiation" });
  });

  it("refuses a quote that is not with the customer, in words for the user, and writes nothing", async () => {
    await expect(salesQuoteService.followUp(martin, REF, "note")).rejects.toMatchObject({
      code: "failed_precondition",
      message: "a follow-up can be recorded only on a Quoted or Feedback quote - this one is Draft",
    });
    stored = quoted({ validUntil: YESTERDAY });
    await expect(salesQuoteService.followUp(martin, REF)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "a follow-up can be recorded only on a Quoted or Feedback quote - this one is Expired",
    });
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
  });

  it("refuses a note that is too long as an invalid argument", async () => {
    stored = quoted();
    await expect(salesQuoteService.followUp(martin, REF, "x".repeat(2001))).rejects.toMatchObject({
      code: "invalid_argument",
      message: "a follow-up note can have at most 2000 characters",
    });
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
  });

  it("is not found for a quote that is no sales quote", async () => {
    stored = null;
    await expect(salesQuoteService.followUp(martin, REF)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("syncShipments", () => {
  const FIRST = { id: "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01", jobNumber: "CZ00000101" };
  const SECOND = { id: "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02", jobNumber: "CZ00000102" };
  const OTHER_REF = "QCZ20261010002";
  const quoted = (over: Partial<SalesQuoteRecord> = {}) =>
    quote({ status: "quoted", sentAt: SENT, firstSentAt: SENT, lastContactAt: SENT, validUntil: "2026-10-25", ...over });
  const linkedLine = (shipment: typeof FIRST) => ({ kind: "shipment", action: "linked", shipmentId: shipment.id, jobNumber: shipment.jobNumber });

  const TODAY_FX = { date: "2026-10-10", fixingDate: "2026-10-09", provisional: false, missing: false, roePct: 102, rates: [{ currency: "EUR", rate: 24.375 }] };

  beforeEach(() => {
    // Only REF is a live sales quote.
    repository.withLockedQuote.mockImplementation(async (_companyId, quoteNumber, change) => (stored && quoteNumber === REF ? change(stored, TX) : null));
    fxRatesOn.mockResolvedValue(TODAY_FX as never);
  });

  it("stamps today's ČNB rates on a quote that becomes Won from a shipment, read before the lock", async () => {
    let lockedWhenRead: boolean | undefined;
    let locked = false;
    fxRatesOn.mockImplementation(async () => {
      lockedWhenRead = locked;
      return TODAY_FX as never;
    });
    repository.withLockedQuote.mockImplementation(async (_companyId, quoteNumber, change) => {
      locked = true;
      try {
        return stored && quoteNumber === REF ? await change(stored, TX) : null;
      } finally {
        locked = false;
      }
    });
    await salesQuoteService.syncShipments(martin, [{ quoteNumber: REF, shipments: [FIRST], wonByShipmentId: FIRST.id }]);
    expect(written().document).toEqual({ fx: { date: "2026-10-10", fixingDate: "2026-10-09", roePct: 102, rates: { EUR: 24.375 }, lockedAt: NOW.toISOString() } });
    expect(lockedWhenRead).toBe(false);
  });

  it("asks ČNB for nothing when no shipment was created from a quote", async () => {
    stored = quoted();
    await salesQuoteService.syncShipments(martin, [{ quoteNumber: REF, shipments: [FIRST] }]);
    expect(fxRatesOn).not.toHaveBeenCalled();
  });

  it("links the quote to the oldest shipment that names it, under the lock, with a history line for each", async () => {
    stored = quoted();
    await expect(salesQuoteService.syncShipments(martin, [{ quoteNumber: REF, shipments: [FIRST, SECOND] }])).resolves.toEqual([
      { quoteNumber: REF, found: true, shipmentId: FIRST.id, shipmentJobNumber: "CZ00000101", status: "quoted", becameWon: false, revertedTo: null, note: null },
    ]);
    expect(repository.withLockedQuote).toHaveBeenCalledWith(martin.companyID, REF, expect.any(Function));
    expect(repository.writeLifecycle.mock.calls[0]!.slice(0, 2)).toEqual([TX, stored]);
    expect(written()).toMatchObject({
      state: { status: "quoted", shipmentId: FIRST.id, shipmentJobNumber: "CZ00000101" },
      entries: [
        { ...linkedLine(FIRST), at: NOW.toISOString(), user: "Martin Koubek", userId: U_MARTIN },
        { ...linkedLine(SECOND), user: "Martin Koubek", userId: U_MARTIN },
      ],
    });
    // A lifecycle write like the others: the document keeps its version.
    expect(written().document).toBeUndefined();
  });

  it("makes the quote Won for a shipment that was created from it - with the job number and the status before on the line", async () => {
    await expect(salesQuoteService.syncShipments(martin, [{ quoteNumber: REF, shipments: [FIRST], wonByShipmentId: FIRST.id }])).resolves.toMatchObject([
      { found: true, shipmentId: FIRST.id, status: "won", becameWon: true, note: null },
    ]);
    // The quote has no customer, so there is no one to make Active.
    expect(customerActivate).not.toHaveBeenCalled();
    expect(written()).toMatchObject({
      state: { status: "won", decidedAt: NOW, sentAt: null, firstSentAt: null },
      entries: [linkedLine(FIRST), { kind: "status", status: "won", from: "draft", shipmentId: FIRST.id, jobNumber: "CZ00000101", user: "Martin Koubek" }],
    });
  });

  it("links a Lost quote, leaves it Lost and says why", async () => {
    stored = quote({ status: "lost", lostReason: "Pricing: Price too high", decidedAt: SENT });
    await expect(salesQuoteService.syncShipments(martin, [{ quoteNumber: REF, shipments: [FIRST], wonByShipmentId: FIRST.id }])).resolves.toMatchObject([
      { found: true, shipmentId: FIRST.id, status: "lost", becameWon: false, note: "the quote is Lost and stays Lost" },
    ]);
    expect(written().state).toMatchObject({ status: "lost", lostReason: "Pricing: Price too high", shipmentId: FIRST.id });
  });

  it("writes nothing when the quote already knows exactly these shipments", async () => {
    stored = quoted({
      shipmentId: FIRST.id,
      shipmentJobNumber: "CZ00000101",
      data: { reference: REF, quoteStatus: "quoted", timeline: [{ ...linkedLine(FIRST), at: SENT.toISOString() }] },
    });
    await expect(salesQuoteService.syncShipments(martin, [{ quoteNumber: REF, shipments: [FIRST] }])).resolves.toMatchObject([
      { found: true, shipmentId: FIRST.id, shipmentJobNumber: "CZ00000101", status: "quoted" },
    ]);
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
  });

  it("takes the link away, and a Won a shipment had made, when no shipment names the quote any more", async () => {
    stored = quoted({
      status: "won",
      decidedAt: SENT,
      shipmentId: FIRST.id,
      shipmentJobNumber: "CZ00000101",
      data: {
        reference: REF,
        quoteStatus: "won",
        timeline: [
          { ...linkedLine(FIRST), at: SENT.toISOString() },
          { kind: "status", status: "won", from: "quoted", shipmentId: FIRST.id, jobNumber: "CZ00000101", at: SENT.toISOString() },
        ],
      },
    });
    await expect(salesQuoteService.syncShipments(martin, [{ quoteNumber: REF, shipments: [] }])).resolves.toEqual([
      { quoteNumber: REF, found: true, shipmentId: null, shipmentJobNumber: null, status: "quoted", becameWon: false, revertedTo: "quoted", note: null },
    ]);
    expect(written()).toMatchObject({
      state: { status: "quoted", decidedAt: null, shipmentId: null, shipmentJobNumber: null },
      entries: [
        { kind: "shipment", action: "removed", shipmentId: FIRST.id },
        { kind: "status", status: "quoted", comment: "Shipment CZ00000101 removed - status back to Quoted" },
      ],
    });
  });

  it("reports the status the quote shows: Expired once its validity has passed", async () => {
    stored = quoted({ validUntil: YESTERDAY });
    await expect(salesQuoteService.syncShipments(martin, [{ quoteNumber: REF, shipments: [FIRST] }])).resolves.toMatchObject([{ status: "expired" }]);
  });

  it("answers a reference that is not a live sales quote as not found, writes nothing for it and goes on with the next", async () => {
    await expect(
      salesQuoteService.syncShipments(martin, [
        { quoteNumber: OTHER_REF, shipments: [SECOND], wonByShipmentId: SECOND.id },
        { quoteNumber: REF, shipments: [FIRST] },
      ]),
    ).resolves.toEqual([
      { quoteNumber: OTHER_REF, found: false, shipmentId: null, shipmentJobNumber: null, status: null, becameWon: false, revertedTo: null, note: null },
      { quoteNumber: REF, found: true, shipmentId: FIRST.id, shipmentJobNumber: "CZ00000101", status: "draft", becameWon: false, revertedTo: null, note: null },
    ]);
    // Each quote under a lock and in a transaction of its own.
    expect(repository.withLockedQuote.mock.calls.map((call) => call[1])).toEqual([OTHER_REF, REF]);
    expect(repository.writeLifecycle).toHaveBeenCalledTimes(1);
  });

  it("records a repair nobody asked for as the system's, without looking anybody's name up", async () => {
    stored = quoted();
    await salesQuoteService.syncShipments(martin, [{ quoteNumber: REF, shipments: [FIRST] }], true);
    expect(written().entries).toEqual([
      { ...linkedLine(FIRST), comment: "Shipment CZ00000101 linked", at: NOW.toISOString(), user: "System", auto: true },
    ]);
    expect(usersList).not.toHaveBeenCalled();
  });

  it("still links when the users cannot be read: the line then carries the user id alone", async () => {
    usersList.mockRejectedValue(new Error("auth is unreachable"));
    await salesQuoteService.syncShipments(martin, [{ quoteNumber: REF, shipments: [FIRST] }]);
    expect(written().entries[0]).toMatchObject({ userId: U_MARTIN });
    expect(written().entries[0]).not.toHaveProperty("user");
  });

  it("refuses more than 200 quotes in one call, and a shipment that is not named by an id, before any quote is touched", async () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ quoteNumber: `QCZ20261010${String(i + 1).padStart(3, "0")}`, shipments: [] }));
    await expect(salesQuoteService.syncShipments(martin, many)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "at most 200 quotes can be synced in one call",
    });
    await expect(
      salesQuoteService.syncShipments(martin, [
        { quoteNumber: REF, shipments: [FIRST] },
        { quoteNumber: OTHER_REF, shipments: [{ id: "CZ00000102", jobNumber: "CZ00000102" }] },
      ]),
    ).rejects.toMatchObject({ code: "invalid_argument", message: "a shipment must be named by its id" });
    expect(repository.withLockedQuote).not.toHaveBeenCalled();
    await expect(salesQuoteService.syncShipments(martin, many.slice(0, 200))).resolves.toHaveLength(200);
  });
});

describe("shipmentLinks", () => {
  it("hands out the links of the company's quotes as stored", async () => {
    const links = [{ quoteNumber: REF, shipmentId: "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01" }];
    repository.shipmentLinks.mockResolvedValue(links);
    await expect(salesQuoteService.shipmentLinks(martin.companyID)).resolves.toEqual(links);
    expect(repository.shipmentLinks).toHaveBeenCalledWith(martin.companyID);
  });
});

describe("customerFacts", () => {
  const CUSTOMER = "946e01e8-a4ed-4aa7-932b-2c5d5e991c30";
  const OPEN = [{ customerId: CUSTOMER, quoteNumber: REF, status: "quoted", validUntil: "2026-10-25", currency: "EUR", fx: null, rates: null, sellingLines: [] }];

  beforeEach(() => {
    repository.customerFacts.mockResolvedValue({ customers: [], quotesWithoutCustomer: 0 });
    repository.openCustomerQuotes.mockResolvedValue([]);
  });

  it("adopts what waits before it reads: the facts come from the columns", async () => {
    await salesQuoteService.customerFacts(martin.companyID);
    expect(repository.adoptPending).toHaveBeenCalledWith(martin.companyID);
    const adopted = repository.adoptPending.mock.invocationCallOrder[0]!;
    expect(adopted).toBeLessThan(repository.customerFacts.mock.invocationCallOrder[0]!);
    expect(adopted).toBeLessThan(repository.openCustomerQuotes.mock.invocationCallOrder[0]!);
  });

  it("hands out what the quotes say about each customer, times as ISO strings", async () => {
    repository.customerFacts.mockResolvedValue({
      customers: [
        {
          customerId: CUSTOMER,
          sentQuotes: 2,
          sentQuotesWithoutDate: 1,
          firstSentAt: new Date("2026-10-03T09:00:00.000Z"),
          firstSentAtKnown: true,
          lastActivityAt: new Date("2026-10-10T19:17:34.487Z"),
        },
        // Only Drafts so far: nothing went out.
        { customerId: "c0ffee00-0000-4000-8000-000000000001", sentQuotes: 0, sentQuotesWithoutDate: 0, firstSentAt: null, firstSentAtKnown: false, lastActivityAt: SENT },
      ],
      quotesWithoutCustomer: 3,
    });
    repository.openCustomerQuotes.mockResolvedValue(OPEN);
    await expect(salesQuoteService.customerFacts(martin.companyID)).resolves.toEqual({
      customers: [
        {
          customerId: CUSTOMER,
          hasSentQuote: true,
          sentQuotes: 2,
          firstSentAt: "2026-10-03T09:00:00.000Z",
          firstSentAtKnown: true,
          sentQuotesWithoutDate: 1,
          lastActivityAt: "2026-10-10T19:17:34.487Z",
        },
        {
          customerId: "c0ffee00-0000-4000-8000-000000000001",
          hasSentQuote: false,
          sentQuotes: 0,
          firstSentAt: null,
          firstSentAtKnown: false,
          sentQuotesWithoutDate: 0,
          lastActivityAt: SENT.toISOString(),
        },
      ],
      openQuotes: OPEN,
      quotesWithoutCustomer: 3,
    });
    expect(repository.customerFacts).toHaveBeenCalledWith(martin.companyID);
  });

  it("judges which quotes are open on today's business day in Prague", async () => {
    await salesQuoteService.customerFacts(martin.companyID);
    expect(repository.openCustomerQuotes).toHaveBeenLastCalledWith(martin.companyID, "2026-10-10");
    // Half past midnight in Prague is the next day there.
    vi.setSystemTime(new Date("2026-10-10T22:30:00.000Z"));
    await salesQuoteService.customerFacts(martin.companyID);
    expect(repository.openCustomerQuotes).toHaveBeenLastCalledWith(martin.companyID, "2026-10-11");
  });
});

describe("setOwner", () => {
  const denied = { code: "permission_denied", message: "only a manager can reassign this quote" };

  it("refuses somebody who is not a user of the company, before the quote is touched", async () => {
    await expect(salesQuoteService.setOwner(manager, REF, randomUUID())).rejects.toMatchObject({
      code: "invalid_argument",
      message: "not a user of this company",
    });
    expect(repository.withLockedQuote).not.toHaveBeenCalled();
  });

  it("fails when the users cannot be read: an owner is chosen only from users that were", async () => {
    usersList.mockRejectedValue(new Error("auth is unreachable"));
    await expect(salesQuoteService.setOwner(manager, REF, U_JANA)).rejects.toThrow("auth is unreachable");
    expect(repository.withLockedQuote).not.toHaveBeenCalled();
  });

  it("lets a manager give any quote to anybody, with a history line - and to nobody", async () => {
    const result = await salesQuoteService.setOwner(manager, REF, U_JANA);
    expect(result).toMatchObject({ changed: true, quote: { ownerUserId: U_JANA, ownerName: "Jana Nováková", ownerLabel: "Jana Nováková" } });
    expect(written()).toMatchObject({
      state: { ownerUserId: U_JANA, ownerLabel: "Jana Nováková", status: "draft" },
      entries: [{ kind: "owner", user: "Marie Manager", userId: U_MANAGER, comment: "Owner: Jana Nováková (was Martin Koubek)" }],
    });

    repository.writeLifecycle.mockClear();
    await expect(salesQuoteService.setOwner(manager, REF, null)).resolves.toMatchObject({ changed: true, quote: { ownerUserId: null, ownerLabel: "" } });
    expect(written().entries).toMatchObject([{ kind: "owner", comment: "No owner (was Martin Koubek)" }]);
  });

  it("says so, and writes nothing, when the quote already has that owner", async () => {
    await expect(salesQuoteService.setOwner(manager, REF, U_MARTIN)).resolves.toMatchObject({ changed: false, quote: { ownerUserId: U_MARTIN } });
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
  });

  it("lets a plain user hand over or give up their own quote, and no colleague's", async () => {
    await expect(salesQuoteService.setOwner(martin, REF, U_JANA)).resolves.toMatchObject({ changed: true, quote: { ownerUserId: U_JANA } });
    await expect(salesQuoteService.setOwner(martin, REF, null)).resolves.toMatchObject({ changed: true });
    repository.writeLifecycle.mockClear();
    // Not even to themselves.
    await expect(salesQuoteService.setOwner(jana, REF, U_JANA)).rejects.toMatchObject(denied);
    await expect(salesQuoteService.setOwner(jana, REF, null)).rejects.toMatchObject(denied);
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
  });

  it("lets a plain user take a quote that has no owner user - for themselves only", async () => {
    stored = quote({ ownerUserId: null, ownerLabel: "Petr", ownerMatchCheckedAt: EXAMINED });
    await expect(salesQuoteService.setOwner(jana, REF, U_MARTIN)).rejects.toMatchObject(denied);
    await expect(salesQuoteService.setOwner(jana, REF, U_JANA)).resolves.toMatchObject({ changed: true, quote: { ownerUserId: U_JANA } });
  });

  it("judges an owner text nobody compared with the users yet as the user it names", async () => {
    // "Martin" is Martin Koubek by his e-mail; the matching has not run for this quote.
    stored = quote({ ownerUserId: null, ownerLabel: "Martin", ownerMatchCheckedAt: null });
    await expect(salesQuoteService.setOwner(jana, REF, U_JANA)).rejects.toMatchObject(denied);
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
    // The one it names may hand it over, as an owner may.
    await expect(salesQuoteService.setOwner(martin, REF, U_JANA)).resolves.toMatchObject({ changed: true, quote: { ownerUserId: U_JANA } });
  });

  it("lets anybody take a quote whose unexamined owner text names no user", async () => {
    stored = quote({ ownerUserId: null, ownerLabel: "Petr", ownerMatchCheckedAt: null });
    await expect(salesQuoteService.setOwner(jana, REF, U_JANA)).resolves.toMatchObject({ changed: true });
  });

  it("is not found for a quote that is no sales quote", async () => {
    stored = null;
    await expect(salesQuoteService.setOwner(manager, REF, U_JANA)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("delete", () => {
  it("refuses while a live shipment still names the quote, even when the quote's own link is empty", async () => {
    namingShipments.mockResolvedValue({ shipments: [{ id: "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01", jobNumber: "CZ00000101" }] });
    await expect(salesQuoteService.delete(manager, REF)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repository.withLockedQuote).not.toHaveBeenCalled();
    expect(namingShipments).toHaveBeenCalledWith({ reference: REF });
  });

  const managersOnly = { code: "permission_denied", message: "only a manager can delete this quote" };
  const SHIPMENT = { shipmentId: "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01", shipmentJobNumber: "CZ00000101" };
  const linked = {
    code: "failed_precondition",
    message: "shipment CZ00000101 was created from this quote - remove the Sales Number from the shipment first",
  };
  /** A quote of Martin's that is with the customer. */
  const quoted = (over: Partial<SalesQuoteRecord> = {}) => quote({ status: "quoted", sentAt: SENT, firstSentAt: SENT, lastContactAt: SENT, ...over });

  const nothingDeleted = () => {
    expect(repository.writeLifecycle).not.toHaveBeenCalled();
    expect(attachments.deleteForQuote).not.toHaveBeenCalled();
  };

  it("deletes under the lock: the row stamped with who and when, a last history line, the attachments - one transaction, one moment", async () => {
    await expect(salesQuoteService.delete(martin, REF)).resolves.toBeUndefined();
    expect(repository.withLockedQuote).toHaveBeenCalledWith(martin.companyID, REF, expect.any(Function));
    const write = written();
    // Every lifecycle fact stays what it was: a deleted quote is still the Draft it was.
    expect(write.state).toEqual({ ...columnsOf(stored!), createdAt: stored!.createdAt });
    expect(write.entries).toEqual([{ kind: "deleted", at: NOW.toISOString(), user: "Martin Koubek", userId: U_MARTIN }]);
    expect(write.deleted).toEqual({ by: U_MARTIN, at: NOW });
    // No document key: nothing of the document is rewritten by its deletion.
    expect(write.document).toBeUndefined();
    expect(repository.writeLifecycle.mock.calls[0]!.slice(0, 2)).toEqual([TX, stored]);
    expect(attachments.deleteForQuote).toHaveBeenCalledTimes(1);
    expect(attachments.deleteForQuote).toHaveBeenCalledWith(TX, REF, martin.companyID, NOW);
  });

  it("lets a manager delete any quote: a colleague's, one that was sent, one that is decided", async () => {
    for (const row of [quote(), quoted(), quoted({ status: "won", decidedAt: SENT }), quote({ ownerUserId: null, ownerLabel: "Petr" })]) {
      repository.writeLifecycle.mockClear();
      stored = row;
      await salesQuoteService.delete(manager, REF);
      expect(written().deleted).toEqual({ by: U_MANAGER, at: NOW });
      expect(written().entries).toMatchObject([{ kind: "deleted", user: "Marie Manager", userId: U_MANAGER }]);
    }
  });

  it("refuses a plain user a colleague's Draft", async () => {
    await expect(salesQuoteService.delete(jana, REF)).rejects.toMatchObject(managersOnly);
    nothingDeleted();
  });

  it("refuses a plain user their own quote once it is with the customer", async () => {
    stored = quoted();
    await expect(salesQuoteService.delete(martin, REF)).rejects.toMatchObject(managersOnly);
    nothingDeleted();
  });

  it("refuses a plain user their own Draft that was sent once and reopened (Lost -> Draft)", async () => {
    stored = quote({ status: "draft", sentAt: SENT, firstSentAt: SENT });
    await expect(salesQuoteService.delete(martin, REF)).rejects.toMatchObject(managersOnly);
    nothingDeleted();
  });

  it("refuses a plain user their own Draft that was Quoted without a sent date and reopened through Lost", async () => {
    // Set to Quoted in bulk before sendings were dated: no sent date, no history line.
    stored = quote({ status: "quoted", data: { reference: REF, quoteStatus: "quoted", salesOwner: "Martin Koubek" } });
    // The row after a lifecycle write, with the lines the write adds to its history.
    repository.writeLifecycle.mockImplementation(async (_tx, row, write) => {
      const data = row.data as Record<string, unknown>;
      const timeline = [...(Array.isArray(data.timeline) ? data.timeline : []), ...write.entries];
      return (stored = { ...row, ...columnsOf(write.state), data: { ...data, timeline } });
    });

    await salesQuoteService.transition(martin, REF, { to: "lost" });
    const { quote: reopened } = await salesQuoteService.transition(martin, REF, { to: "draft" });

    // No fact of the Draft says it went out any more; the line by which it left Quoted does.
    expect(reopened).toMatchObject({ status: "draft", firstSentAt: null, sentAt: null, ownerUserId: U_MARTIN });
    expect(reopened.permissions).toEqual({ canChangeOwner: "own", canDelete: false, deleteBlockedReason: managersOnly.message });
    repository.writeLifecycle.mockClear();
    await expect(salesQuoteService.delete(martin, REF)).rejects.toMatchObject(managersOnly);
    nothingDeleted();
    // It stays a manager's delete.
    await expect(salesQuoteService.delete(manager, REF)).resolves.toBeUndefined();
  });

  it("answers the flag a screen gets and the delete from the same history", async () => {
    // A Draft of Martin's whose history says it left Quoted without a sent date.
    const left = [{ kind: "status", status: "lost", from: "quoted", at: SENT.toISOString(), userId: U_MARTIN }];
    stored = quote({ data: { reference: REF, quoteStatus: "draft", salesOwner: "Martin Koubek", timeline: left } });
    await expect(salesQuoteService.get(martin, REF)).resolves.toMatchObject({ permissions: { canDelete: false } });
    await expect(salesQuoteService.delete(martin, REF)).rejects.toMatchObject(managersOnly);
    nothingDeleted();
  });

  it("cannot be walked around through the owner: a colleague's Draft cannot be taken, an unowned one must be taken first", async () => {
    // Jana cannot make Martin's Draft her own, so she cannot delete it that way either.
    await expect(salesQuoteService.setOwner(jana, REF, U_JANA)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(salesQuoteService.delete(jana, REF)).rejects.toMatchObject(managersOnly);
    nothingDeleted();

    // A never-sent Draft without an owner user: "Assign to me", then delete - both recorded.
    stored = quote({ ownerUserId: null, ownerLabel: "Petr", ownerMatchCheckedAt: EXAMINED });
    await expect(salesQuoteService.delete(jana, REF)).rejects.toMatchObject(managersOnly);
    repository.writeLifecycle.mockImplementation(async (_tx, row, write) => (stored = { ...row, ...columnsOf(write.state) }));
    await salesQuoteService.setOwner(jana, REF, U_JANA);
    await expect(salesQuoteService.delete(jana, REF)).resolves.toBeUndefined();
    const [taken, deleted] = repository.writeLifecycle.mock.calls.map((call) => call[2]);
    expect(taken!.entries).toMatchObject([{ kind: "owner", userId: U_JANA, comment: "Owner: Jana Nováková (was Petr)" }]);
    expect(deleted!.entries).toMatchObject([{ kind: "deleted", userId: U_JANA }]);
    expect(deleted!.deleted).toEqual({ by: U_JANA, at: NOW });
  });

  it("takes an owner text nobody compared with the users yet for nobody's quote: a plain user is refused", async () => {
    // "Martin" would be matched to Martin by the next read; until then the quote is not his.
    stored = quote({ ownerUserId: null, ownerLabel: "Martin", ownerMatchCheckedAt: null });
    await expect(salesQuoteService.delete(martin, REF)).rejects.toMatchObject(managersOnly);
    nothingDeleted();
  });

  it("refuses everybody while a shipment is linked to the quote - as a failed precondition that names the shipment", async () => {
    for (const row of [quote(SHIPMENT), quoted({ status: "won", decidedAt: SENT, ...SHIPMENT })]) {
      stored = row;
      for (const actor of [manager, { ...manager, role: "admin" }, { ...manager, role: "superadmin" }, martin, jana]) {
        await expect(salesQuoteService.delete(actor, REF), actor.role).rejects.toMatchObject(linked);
      }
    }
    nothingDeleted();
  });

  it("works again once the shipment no longer names the quote", async () => {
    stored = quote(SHIPMENT);
    await expect(salesQuoteService.delete(manager, REF)).rejects.toMatchObject(linked);
    stored = quote();
    await expect(salesQuoteService.delete(manager, REF)).resolves.toBeUndefined();
    expect(written().deleted).toEqual({ by: U_MANAGER, at: NOW });
  });

  it("judges the quote as it is under the lock, whatever a screen showed before", async () => {
    // The list said "may delete" a moment ago; meanwhile the quote went out.
    await expect(salesQuoteService.get(martin, REF)).resolves.toMatchObject({ permissions: { canDelete: true } });
    stored = quoted();
    await expect(salesQuoteService.delete(martin, REF)).rejects.toMatchObject(managersOnly);
    nothingDeleted();
  });

  it("does not delete the attachments when the quote could not be written", async () => {
    repository.writeLifecycle.mockRejectedValue(new Error("the database is gone"));
    await expect(salesQuoteService.delete(martin, REF)).rejects.toThrow("the database is gone");
    expect(attachments.deleteForQuote).not.toHaveBeenCalled();
  });

  it("records the user id alone when the name cannot be resolved", async () => {
    usersList.mockRejectedValue(new Error("auth is unreachable"));
    await salesQuoteService.delete(martin, REF);
    expect(written().entries).toEqual([{ kind: "deleted", at: NOW.toISOString(), userId: U_MARTIN }]);
    expect(written().deleted).toEqual({ by: U_MARTIN, at: NOW });
  });

  it("is not found for a quote that is missing, already deleted or a row of the old quotes module", async () => {
    stored = null;
    await expect(salesQuoteService.delete(manager, REF)).rejects.toMatchObject({ code: "not_found", message: "Quote not found" });
    nothingDeleted();
  });
});
