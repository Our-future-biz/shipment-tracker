import { beforeEach, describe, expect, it, vi } from "vitest";

// The overnight check run for real against stand-ins for the tariffs and trucking services and for
// the repositories: who it calls the services as, and what it reads and writes.
vi.mock("encore.dev", () => ({ appMeta: () => ({ environment: { cloud: "test" } }) }));
vi.mock("encore.dev/api", () => ({
  ErrCode: { InvalidArgument: "invalid_argument" },
  APIError: class APIError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("encore.dev/log", () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  tariffs: { _quoteTariffRefs: vi.fn(), _quoteTariffOffers: vi.fn() },
  trucking: { truckingRate: vi.fn(), _internalTruckingVersionsValid: vi.fn() },
}));
vi.mock("../../repositories/salesQuote.repository", () => ({
  salesQuoteRepository: { unsentWithTariffLines: vi.fn(), loadSales: vi.fn(), saveDocument: vi.fn() },
}));
vi.mock("../../repositories/quoteComment.repository", () => ({ quoteCommentRepository: { createForCompany: vi.fn() } }));

import log from "encore.dev/log";
import { tariffs } from "~encore/clients";
import { quoteCommentRepository } from "../../repositories/quoteComment.repository";
import { salesQuoteRepository } from "../../repositories/salesQuote.repository";
import type { SalesQuoteRecord } from "../../schemas/quote.schema";
import { checkQuote, runTariffCheck, TARIFF_CHECK_CARRY, TARIFF_CHECK_PAGE } from "../../services/tariffOvernight.service";
import { TARIFF_CHECK_AUTHOR_ID, TARIFF_CHECK_STATUSES } from "../../lib/tariffOvernight";

const repository = vi.mocked(salesQuoteRepository);
const tariffApi = vi.mocked(tariffs);
const chat = vi.mocked(quoteCommentRepository);

const COMPANY = "11111111-1111-4111-8111-111111111111";
const OLD = "ocean:22222222-2222-4222-8222-222222222222:r1";
const TODAY = "2026-11-09";

const data = {
  serviceType: "Sea FCL",
  direction: "Export",
  pol: "Hamburg (DEHAM)",
  pod: "Newark (USEWR)",
  containers: [{ type: "40' DC", qty: 1 }],
  buyingLines: [{ type: "Ocean freight", description: "Ocean freight Hamburg → Newark (OOCL)", currency: "USD", basis: "container", containerType: "40' DC", qty: 1, unitPrice: 1200, amount: 1200, tariffRef: OLD }],
  sellingLines: [],
  quoteStatus: "draft",
  timeline: [{ at: "2026-11-01" }],
};

const record = (over: Partial<SalesQuoteRecord> = {}) =>
  ({ id: "q1", companyId: COMPANY, quoteNumber: "QCZ20261101001", status: "draft", dataVersion: 7, ownerUserId: "u-owner", customerId: null, data, ...over }) as unknown as SalesQuoteRecord;

const found = { id: "q1", companyId: COMPANY, quoteNumber: "QCZ20261101001" };
const authData = { userID: TARIFF_CHECK_AUTHOR_ID, companyID: COMPANY, role: "user" };

beforeEach(() => {
  vi.clearAllMocks();
  repository.loadSales.mockResolvedValue(record());
  repository.saveDocument.mockImplementation(async () => record({ dataVersion: 8 }));
  tariffApi._quoteTariffRefs.mockResolvedValue({ checks: [{ ref: OLD, valid: false, tariffId: "t1" }] });
  tariffApi._quoteTariffOffers.mockResolvedValue({
    offers: [{ versionId: "v2", rateId: "r2", tariffId: "t1", supplierName: "OOCL", via: "", totals: [{ currency: "USD", amount: 1350 }], lines: [{ containerType: "40' DC", currency: "USD", amount: 1350 }] }],
    refused: null,
  });
});

describe("the overnight tariff check of a quote", () => {
  it("asks the tariffs as the quote's company, so the services the offers call know whose they are", async () => {
    await checkQuote(found, TODAY);
    expect(tariffApi._quoteTariffRefs).toHaveBeenCalledWith({ date: TODAY, refs: [OLD] }, { authData });
    expect(tariffApi._quoteTariffOffers).toHaveBeenCalledWith(expect.objectContaining({ ocean: expect.objectContaining({ polCode: "DEHAM", podCode: "USEWR" }) }), { authData });
  });

  it("reads the quote again when its turn comes, and leaves one sent meanwhile alone", async () => {
    repository.loadSales.mockResolvedValue(record({ status: "quoted" }));
    await expect(checkQuote(found, TODAY)).resolves.toBe(false);
    expect(repository.loadSales).toHaveBeenCalledWith(COMPANY, found.quoteNumber);
    expect(tariffApi._quoteTariffRefs).not.toHaveBeenCalled();
    expect(repository.saveDocument).not.toHaveBeenCalled();
  });

  it("saves only the version it read and only while the quote is not sent, keeping the keys only the server writes as stored", async () => {
    await expect(checkQuote(found, TODAY)).resolves.toBe(true);
    const [company, quoteNumber, save, expected, options] = repository.saveDocument.mock.calls[0]!;
    expect([company, quoteNumber, expected, options]).toEqual([COMPANY, found.quoteNumber, { dataVersion: 7 }, { statuses: TARIFF_CHECK_STATUSES }]);
    expect(save.carry).toEqual([...TARIFF_CHECK_CARRY]);
    expect(save.carry).toEqual(expect.arrayContaining(["quoteStatus", "timeline", "salesOwner", "validUntil", "fx"]));
    // The road pricing and its margin approval are the check's own to move.
    expect(save.carry).not.toContain("roadPricing");
    expect(save.carry).not.toContain("marginApproval");
    expect(save.data.tariffUpdates).toHaveLength(1);
    expect(chat.createForCompany).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ authorId: TARIFF_CHECK_AUTHOR_ID, mentionedUserIds: ["u-owner"] }));
  });

  it("tells nobody when the save found the quote changed, sent or gone", async () => {
    repository.saveDocument.mockResolvedValue(null);
    await expect(checkQuote(found, TODAY)).resolves.toBe(false);
    expect(chat.createForCompany).not.toHaveBeenCalled();
  });

  it("keeps the lines of a route the tariffs refuse, and says so", async () => {
    tariffApi._quoteTariffOffers.mockResolvedValue({ offers: [], refused: "Choose the ports of loading and discharge (UN/LOCODE places)" });
    await checkQuote(found, TODAY);
    const save = repository.saveDocument.mock.calls[0]![2];
    expect(save.data.buyingLines).toEqual(data.buyingLines);
    expect(save.data.tariffUnchecked).toEqual([OLD]);
    expect(chat.createForCompany.mock.calls[0]![1].message).toContain("Choose the ports of loading and discharge");
  });

  it("does not ask for offers on a route the quote can't give, and keeps its lines", async () => {
    repository.loadSales.mockResolvedValue(record({ data: { ...data, direction: undefined } }));
    await checkQuote(found, TODAY);
    expect(tariffApi._quoteTariffOffers).not.toHaveBeenCalled();
    expect(repository.saveDocument.mock.calls[0]![2].data.buyingLines).toEqual(data.buyingLines);
  });
});

describe("the overnight run", () => {
  it("goes through every page of quotes, one at a time, and a quote that fails stops nothing", async () => {
    const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => ({ id: `id-${from + i}`, companyId: COMPANY, quoteNumber: `Q${from + i}` }));
    repository.unsentWithTariffLines.mockResolvedValueOnce(page(0, TARIFF_CHECK_PAGE)).mockResolvedValueOnce(page(TARIFF_CHECK_PAGE, 2));
    repository.loadSales.mockRejectedValueOnce(new Error("boom"));
    await runTariffCheck(new Date("2026-11-09T02:00:00Z"));
    expect(repository.unsentWithTariffLines.mock.calls).toEqual([
      [null, TARIFF_CHECK_PAGE],
      [`id-${TARIFF_CHECK_PAGE - 1}`, TARIFF_CHECK_PAGE],
    ]);
    expect(repository.loadSales).toHaveBeenCalledTimes(TARIFF_CHECK_PAGE + 2);
    expect(log.error).toHaveBeenCalledTimes(1);
  });
});
