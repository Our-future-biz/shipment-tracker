import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const userLookup = vi.hoisted(() => vi.fn());
const termsSet = vi.hoisted(() => vi.fn());
const termsList = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ auth: { userLookup }, trucking: { _internalHaulierTermsSet: termsSet, _internalHaulierTermsList: termsList } }));
const repo = vi.hoisted(() => ({ updateForCompany: vi.fn(), getByIdForCompany: vi.fn() }));
vi.mock("../repositories/customer.repository", () => ({ customerRepository: repo }));
const requireLive = vi.hoisted(() => vi.fn());
vi.mock("../services/customer.service", () => ({ customerService: { requireLive } }));

import { supplierTermsService } from "../services/supplierTerms.service";

const MANAGER = { userID: "u1", role: "manager" };
const input = (over = {}) => ({
  paymentDays: 30,
  currency: "eur",
  vatUnreliable: false,
  bankAccountPublished: true,
  vatCheckedAt: "2026-11-01",
  bankAccounts: ["CZ65 0800 0000 1920 0014 5399"],
  ...over,
});
const company = (over = {}) => ({ id: "c1", roles: ["haulier"], supplierBankAccounts: [] as string[], supplierPaymentDays: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  userLookup.mockResolvedValue({ users: [{ id: "u1", email: "Jana@OurFuture.biz" }] });
  requireLive.mockResolvedValue(company());
  termsSet.mockResolvedValue(undefined);
  repo.updateForCompany.mockImplementation(async () => ({ ...fullRow() }));
});

// A stored customer as the update returns it (the mapper reads every column).
const fullRow = () => ({
  id: "c1", companyId: "co", ico: "", dic: "", companyName: "Kovo", legalForm: "", registeredAddress: "", city: "", country: "CZ", companyStatus: "",
  registrationDate: null, nace: "", industry: "", typicalCargo: "", stability: "", riskLevel: "", dataSource: "ARES", lastRegistryUpdate: "",
  status: "Prospect", salesOwner: "", salesOwnerUserId: null, label: "TARGET CUSTOMER", creditLimit: 0, currency: "EUR", secondaryCurrencies: [],
  paymentTerms: "", freightPaymentTerms: "", dutyPaymentTerms: "", roles: ["haulier"], companyWebsite: "", logoData: "", logoSource: "", logoUpdatedAt: "",
  totalRevenue: 0, totalProfit: 0, totalShipments: 0, lastActivityDate: null, supplierRating: null, supplierRatingReason: "", supplierRatingBy: "",
  supplierRatingByUserId: null, supplierRatingAt: null, supplierPaymentDays: 30, supplierCurrency: "EUR", supplierVatUnreliable: false,
  supplierBankAccountPublished: true, supplierVatCheckedAt: "2026-11-01", supplierBankAccounts: ["19-2000145399/0800"], supplierBankAccountsChangedAt: null,
  supplierBankAccountsChangedByUserId: null, supplierBankAccountsChangedBy: "", createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
});

describe("a supplier's terms and checks", () => {
  it("are a manager's to change, before anything is read", async () => {
    for (const role of ["user", ""]) {
      await expect(supplierTermsService.set("co", "c1", { userID: "u2", role }, input())).rejects.toThrow(/Only a manager/);
    }
    expect(requireLive).not.toHaveBeenCalled();
  });

  it("are stored clean: whole days 0–365, a currency code, a real date, valid accounts normalised and each once", async () => {
    for (const bad of [{ paymentDays: 30.5 }, { paymentDays: 400 }, { currency: "euro" }, { vatCheckedAt: "1.11.2026" }, { bankAccounts: ["123/45"] }]) {
      await expect(supplierTermsService.set("co", "c1", MANAGER, input(bad))).rejects.toThrow();
    }
    await supplierTermsService.set("co", "c1", MANAGER, input({ bankAccounts: ["CZ65 0800 0000 1920 0014 5399", "19-2000145399/0800"] }));
    expect(repo.updateForCompany).toHaveBeenCalledWith("c1", "co", expect.objectContaining({ supplierCurrency: "EUR", supplierVatCheckedAt: "2026-11-01", supplierBankAccounts: ["19-2000145399/0800"] }));
  });

  it("are only a supplier's, and a haulier is paid in CZK or EUR", async () => {
    requireLive.mockResolvedValue(company({ roles: ["customer"] }));
    await expect(supplierTermsService.set("co", "c1", MANAGER, input())).rejects.toThrow(/Only a supplier/);
    requireLive.mockResolvedValue(company());
    await expect(supplierTermsService.set("co", "c1", MANAGER, input({ currency: "USD" }))).rejects.toThrow(/CZK or EUR/);
    requireLive.mockResolvedValue(company({ roles: ["shipping_line"] }));
    await supplierTermsService.set("co", "c1", MANAGER, input({ currency: "USD" }));
    expect(repo.updateForCompany).toHaveBeenCalledTimes(1);
  });

  it("of a haulier go to Trucking first, with an added account stamped by who and when; nothing is kept if Trucking cannot take them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
    await supplierTermsService.set("co", "c1", MANAGER, input());
    expect(termsSet).toHaveBeenCalledWith({
      customerId: "c1",
      terms: { paymentDays: 30, currency: "EUR", vatUnreliable: false, bankAccountPublished: true, vatCheckedAt: "2026-11-01", bankAccounts: ["19-2000145399/0800"] },
      bankAccountsChange: { at: "2026-11-04T09:00:00.000Z", byUserId: "u1", by: "jana@ourfuture.biz" },
      byName: "jana@ourfuture.biz",
    });
    expect(repo.updateForCompany).toHaveBeenCalledWith("c1", "co", expect.objectContaining({ supplierBankAccountsChangedBy: "jana@ourfuture.biz", supplierBankAccountsChangedAt: new Date("2026-11-04T09:00:00Z") }));

    vi.clearAllMocks();
    termsSet.mockRejectedValue(new Error("trucking down"));
    await expect(supplierTermsService.set("co", "c1", MANAGER, input())).rejects.toThrow("trucking down");
    expect(repo.updateForCompany).not.toHaveBeenCalled();
  });

  it("do not start the hold when no account is added, and do not go to Trucking for a supplier that is no haulier", async () => {
    requireLive.mockResolvedValue(company({ roles: ["rail_operator"], supplierBankAccounts: ["19-2000145399/0800"] }));
    await supplierTermsService.set("co", "c1", MANAGER, input({ bankAccounts: [] }));
    expect(termsSet).not.toHaveBeenCalled();
    expect(repo.updateForCompany.mock.calls[0][2]).not.toHaveProperty("supplierBankAccountsChangedAt");
  });
});

describe("the one-off copy from Trucking", () => {
  it("copies onto companies whose terms were never set here, and leaves the others and unknown ones", async () => {
    const terms = { paymentDays: 14, currency: "CZK", vatUnreliable: true, bankAccountPublished: false, vatCheckedAt: "2026-09-01", bankAccounts: ["19-2000145399/0800"] };
    termsList.mockResolvedValue({
      hauliers: [
        { customerId: "new", ...terms, bankAccountsChange: { at: "2026-10-01T08:00:00.000Z", byUserId: "u9", by: "Petr" } },
        { customerId: "set", ...terms, bankAccountsChange: null },
        { customerId: "gone", ...terms, bankAccountsChange: null },
      ],
    });
    repo.getByIdForCompany.mockImplementation(async (id: string) => (id === "new" ? company({ id }) : id === "set" ? company({ id, supplierPaymentDays: 30 }) : null));
    expect(await supplierTermsService.copyFromTrucking("co")).toEqual({ copied: 1, skipped: 2 });
    expect(repo.updateForCompany).toHaveBeenCalledTimes(1);
    expect(repo.updateForCompany).toHaveBeenCalledWith("new", "co", expect.objectContaining({
      supplierPaymentDays: 14,
      supplierVatUnreliable: true,
      supplierBankAccounts: ["19-2000145399/0800"],
      supplierBankAccountsChangedAt: new Date("2026-10-01T08:00:00.000Z"),
      supplierBankAccountsChangedBy: "Petr",
    }));
  });
});
