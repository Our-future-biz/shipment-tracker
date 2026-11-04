import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const userLookup = vi.hoisted(() => vi.fn());
const termsSet = vi.hoisted(() => vi.fn());
const termsList = vi.hoisted(() => vi.fn());
const termsGet = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({
  auth: { userLookup },
  trucking: { _internalHaulierTermsSet: termsSet, _internalHaulierTermsList: termsList, _internalHaulierTermsGet: termsGet },
}));
const repo = vi.hoisted(() => ({ updateForCompany: vi.fn(), getByIdForCompany: vi.fn(), updateLocked: vi.fn() }));
vi.mock("../repositories/customer.repository", () => ({ customerRepository: repo }));

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
// A company whose terms were never set: every one as a new company has it.
const company = (over: Record<string, unknown> = {}) => ({
  ...fullRow(), id: "c1", roles: ["haulier"], supplierPaymentDays: null, supplierCurrency: null, supplierVatUnreliable: false,
  supplierBankAccountPublished: false, supplierVatCheckedAt: null, supplierBankAccounts: [] as string[], ...over,
});

// The row the locked save reads, and what it wrote (undefined when nothing).
let current: ReturnType<typeof company>;
let written: Record<string, unknown> | null | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  userLookup.mockResolvedValue({ users: [{ id: "u1", email: "Jana@OurFuture.biz" }] });
  current = company();
  written = undefined;
  termsSet.mockResolvedValue(undefined);
  termsGet.mockResolvedValue({ haulier: null });
  repo.updateForCompany.mockImplementation(async () => ({ ...fullRow() }));
  repo.updateLocked.mockImplementation(async (_id: string, _company: string, work: (row: unknown) => Promise<Record<string, unknown> | null>) => {
    written = await work(current);
    return { ...fullRow(), ...(written ?? {}) };
  });
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
    expect(repo.updateLocked).not.toHaveBeenCalled();
  });

  it("are stored clean: whole days 0–365, a currency code, a real date, valid accounts normalised and each once", async () => {
    for (const bad of [{ paymentDays: 30.5 }, { paymentDays: 400 }, { currency: "euro" }, { vatCheckedAt: "1.11.2026" }, { bankAccounts: ["123/45"] }]) {
      await expect(supplierTermsService.set("co", "c1", MANAGER, input(bad))).rejects.toThrow();
    }
    await supplierTermsService.set("co", "c1", MANAGER, input({ bankAccounts: ["CZ65 0800 0000 1920 0014 5399", "19-2000145399/0800"] }));
    expect(written).toEqual(expect.objectContaining({ supplierCurrency: "EUR", supplierVatCheckedAt: "2026-11-01", supplierBankAccounts: ["19-2000145399/0800"] }));
  });

  it("are only a supplier's, and a haulier is paid in CZK or EUR by days set", async () => {
    current = company({ roles: ["customer"] });
    await expect(supplierTermsService.set("co", "c1", MANAGER, input())).rejects.toThrow(/Only a supplier/);
    current = company();
    await expect(supplierTermsService.set("co", "c1", MANAGER, input({ currency: "USD" }))).rejects.toThrow(/CZK or EUR/);
    await expect(supplierTermsService.set("co", "c1", MANAGER, input({ currency: "" }))).rejects.toThrow(/CZK or EUR/);
    await expect(supplierTermsService.set("co", "c1", MANAGER, input({ paymentDays: null }))).rejects.toThrow(/needs its payment days/);
    expect(termsSet).not.toHaveBeenCalled();
    current = company({ roles: ["shipping_line"] });
    await supplierTermsService.set("co", "c1", MANAGER, input({ currency: "USD" }));
    expect(written).toEqual(expect.objectContaining({ supplierCurrency: "USD" }));
  });

  it("of another supplier may leave the payment days and currency unset (K7)", async () => {
    current = company({ roles: ["rail_operator"] });
    await supplierTermsService.set("co", "c1", MANAGER, input({ paymentDays: null, currency: "" }));
    expect(written).toEqual(expect.objectContaining({ supplierPaymentDays: null, supplierCurrency: null }));
  });

  it("refuse a VAT register check after today (Prague's day)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 23:30 UTC on 3 Nov is already 4 Nov in Prague.
    vi.setSystemTime(new Date("2026-11-03T23:30:00Z"));
    await supplierTermsService.set("co", "c1", MANAGER, input({ vatCheckedAt: "2026-11-04" }));
    await expect(supplierTermsService.set("co", "c1", MANAGER, input({ vatCheckedAt: "2026-11-05" }))).rejects.toThrow(/after today/);
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
    expect(written).toEqual(expect.objectContaining({ supplierBankAccountsChangedBy: "jana@ourfuture.biz", supplierBankAccountsChangedAt: new Date("2026-11-04T09:00:00Z") }));

    written = undefined;
    termsSet.mockRejectedValue(new Error("trucking down"));
    await expect(supplierTermsService.set("co", "c1", MANAGER, input())).rejects.toThrow("trucking down");
    expect(written).toBeUndefined();
  });

  it("do not start the hold when no account is added, and do not go to Trucking for a supplier that is no haulier", async () => {
    current = company({ roles: ["rail_operator"], supplierBankAccounts: ["19-2000145399/0800"] });
    await supplierTermsService.set("co", "c1", MANAGER, input({ bankAccounts: [] }));
    expect(termsSet).not.toHaveBeenCalled();
    expect(termsGet).not.toHaveBeenCalled();
    expect(written).not.toHaveProperty("supplierBankAccountsChangedAt");
  });
});

describe("a haulier whose terms were never saved here (K1)", () => {
  const truckingCopy = {
    paymentDays: 14, currency: "EUR", vatUnreliable: true, bankAccountPublished: true, vatCheckedAt: "2026-09-01",
    bankAccounts: ["19-2000145399/0800"], bankAccountsChange: { at: "2026-10-01T08:00:00.000Z", byUserId: "u9", by: "petr@ourfuture.biz" },
  };

  it("starts from Trucking's copy on the first save: an account Trucking lists is not new, and when it was added there stays", async () => {
    termsGet.mockResolvedValue({ haulier: truckingCopy });
    await supplierTermsService.set("co", "c1", MANAGER, input({ paymentDays: 21, vatUnreliable: true, fromTrucking: true }));
    expect(termsGet).toHaveBeenCalledWith({ customerId: "c1" });
    expect(termsSet).toHaveBeenCalledWith(expect.objectContaining({ bankAccountsChange: null }));
    expect(written).toEqual(expect.objectContaining({
      supplierPaymentDays: 21,
      supplierVatUnreliable: true,
      supplierBankAccountsChangedAt: new Date("2026-10-01T08:00:00.000Z"),
      supplierBankAccountsChangedBy: "petr@ourfuture.biz",
    }));
  });

  it("refuses a first save made from values the page did not show: Trucking holds terms it could not read then", async () => {
    termsGet.mockResolvedValue({ haulier: truckingCopy });
    await expect(supplierTermsService.set("co", "c1", MANAGER, input())).rejects.toMatchObject({ code: "failed_precondition" });
    expect(termsSet).not.toHaveBeenCalled();
    expect(written).toBeUndefined();
  });

  it("counts terms as saved here once any of them is set, not only the payment days (K7)", async () => {
    current = company({ supplierVatUnreliable: true, supplierBankAccounts: ["19-2000145399/0800"] });
    termsGet.mockResolvedValue({ haulier: truckingCopy });
    await supplierTermsService.set("co", "c1", MANAGER, input());
    expect(termsGet).not.toHaveBeenCalled();
  });

  it("asks Trucking only while nothing was saved here", async () => {
    current = company({ supplierPaymentDays: 30, supplierBankAccounts: ["19-2000145399/0800"] });
    await supplierTermsService.set("co", "c1", MANAGER, input());
    expect(termsGet).not.toHaveBeenCalled();
    expect(termsSet).toHaveBeenCalledWith(expect.objectContaining({ bankAccountsChange: null }));
  });

  it("are shown as Trucking holds them, until they are saved here", async () => {
    const item = (over: Record<string, unknown> = {}) => ({ id: "c1", roles: ["haulier"], supplierTerms: { paymentDays: null, currency: null, vatUnreliable: false, bankAccountPublished: false, vatCheckedAt: "", bankAccounts: [], bankAccountsChangedAt: null, bankAccountsChangedBy: "" }, ...over }) as never;
    termsGet.mockResolvedValue({ haulier: truckingCopy });
    expect(await supplierTermsService.shown(item())).toEqual({
      fromTrucking: true,
      truckingUnavailable: false,
      terms: {
        paymentDays: 14, currency: "EUR", vatUnreliable: true, bankAccountPublished: true, vatCheckedAt: "2026-09-01",
        bankAccounts: ["19-2000145399/0800"], bankAccountsChangedAt: "2026-10-01T08:00:00.000Z", bankAccountsChangedBy: "petr@ourfuture.biz",
      },
    });
    // No Trucking profile, Trucking out of reach, another supplier: the Customer Database's own.
    termsGet.mockResolvedValue({ haulier: null });
    expect((await supplierTermsService.shown(item())).fromTrucking).toBe(false);
    termsGet.mockRejectedValue(new Error("down"));
    expect(await supplierTermsService.shown(item())).toMatchObject({ fromTrucking: false, truckingUnavailable: true });
    termsGet.mockClear();
    expect((await supplierTermsService.shown(item({ roles: ["rail_operator"] }))).fromTrucking).toBe(false);
    // Saved here (an unreliable payer, no days yet): its own, whatever Trucking holds.
    const saved = item({ supplierTerms: { paymentDays: null, currency: null, vatUnreliable: true, bankAccountPublished: false, vatCheckedAt: "", bankAccounts: [], bankAccountsChangedAt: null, bankAccountsChangedBy: "" } });
    expect(await supplierTermsService.shown(saved)).toMatchObject({ fromTrucking: false, truckingUnavailable: false, terms: { vatUnreliable: true } });
    expect(termsGet).not.toHaveBeenCalled();
  });
});

describe("a supplier that becomes a haulier (K3)", () => {
  const railOperator = (over: Record<string, unknown> = {}) =>
    company({ roles: ["rail_operator"], supplierPaymentDays: 45, supplierCurrency: "EUR", supplierBankAccountPublished: true, supplierVatCheckedAt: "2026-10-10", supplierBankAccounts: ["19-2000145399/0800"], ...over }) as never;

  it("sends its terms to Trucking first, every account on the 30-day hold", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T09:00:00Z"));
    const stamp = await supplierTermsService.beforeRolesChange(railOperator(), ["rail_operator", "haulier"], "u1");
    expect(termsSet).toHaveBeenCalledWith({
      customerId: "c1",
      terms: { paymentDays: 45, currency: "EUR", vatUnreliable: false, bankAccountPublished: true, vatCheckedAt: "2026-10-10", bankAccounts: ["19-2000145399/0800"] },
      bankAccountsChange: { at: "2026-11-04T09:00:00.000Z", byUserId: "u1", by: "jana@ourfuture.biz" },
      byName: "jana@ourfuture.biz",
    });
    expect(stamp).toEqual({ supplierBankAccountsChangedAt: new Date("2026-11-04T09:00:00Z"), supplierBankAccountsChangedByUserId: "u1", supplierBankAccountsChangedBy: "jana@ourfuture.biz" });
  });

  it("is refused while its currency is not one Trucking pays in", async () => {
    await expect(supplierTermsService.beforeRolesChange(railOperator({ supplierCurrency: "USD" }), ["haulier"], "u1")).rejects.toThrow(/CZK or EUR.*Terms and checks first/);
    expect(termsSet).not.toHaveBeenCalled();
  });

  it("changes nothing for one already a haulier, one losing the role, or one with no terms here", async () => {
    expect(await supplierTermsService.beforeRolesChange(company({ supplierPaymentDays: 30 }) as never, ["haulier", "customer"], "u1")).toEqual({});
    expect(await supplierTermsService.beforeRolesChange(railOperator(), ["rail_operator"], "u1")).toEqual({});
    expect(await supplierTermsService.beforeRolesChange(company({ roles: ["rail_operator"] }) as never, ["haulier"], "u1")).toEqual({});
    expect(termsSet).not.toHaveBeenCalled();
  });

  it("is refused for terms set here without what a haulier needs: Trucking would start from its defaults and hide them", async () => {
    await expect(supplierTermsService.beforeRolesChange(railOperator({ supplierPaymentDays: null, supplierVatUnreliable: true }), ["haulier"], "u1")).rejects.toThrow(/payment days.*Terms and checks first/);
    expect(termsSet).not.toHaveBeenCalled();
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
    const rows: Record<string, ReturnType<typeof company>> = {
      new: company({ id: "new" }),
      set: company({ id: "set", supplierPaymentDays: 30 }),
      notHaulier: company({ id: "notHaulier", roles: ["rail_operator"] }),
    };
    const writes: [string, string, Record<string, unknown>][] = [];
    repo.updateLocked.mockImplementation(async (id: string, co: string, work: (row: unknown) => Promise<Record<string, unknown> | null>) => {
      if (!rows[id]) return null;
      const values = await work(rows[id]);
      if (values) writes.push([id, co, values]);
      return rows[id];
    });
    termsList.mockResolvedValue({
      hauliers: [...(await termsList()).hauliers, { customerId: "notHaulier", ...terms, bankAccountsChange: null }],
    });
    const TENANT = "7f9b6c1e-2d3a-4b5c-8d9e-0f1a2b3c4d5e";
    expect(await supplierTermsService.copyFromTrucking(TENANT)).toEqual({ copied: 1, skipped: 3 });
    // Trucking is asked for the hauliers of the company named, not the superadmin's own.
    expect(termsList).toHaveBeenLastCalledWith({ companyId: TENANT });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(["new", TENANT, expect.objectContaining({
      supplierPaymentDays: 14,
      supplierVatUnreliable: true,
      supplierBankAccounts: ["19-2000145399/0800"],
      supplierBankAccountsChangedAt: new Date("2026-10-01T08:00:00.000Z"),
      supplierBankAccountsChangedBy: "Petr",
    })]);
  });

  it("needs the id of a company", async () => {
    await expect(supplierTermsService.copyFromTrucking("platform")).rejects.toMatchObject({ code: "invalid_argument" });
    expect(termsList).not.toHaveBeenCalled();
  });
});
