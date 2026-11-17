import { beforeEach, describe, expect, it, vi } from "vitest";

// What Finance → Accounts Payable marks a supplier's invoices by (the invoicing service asks).
const customers = vi.hoisted(() => ({ supplierFactsOf: vi.fn() }));
vi.mock("../../repositories/customer.repository", () => ({ customerRepository: customers }));

import { supplierFactsService } from "../../services/supplierFacts.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const A = "0b6a1c1e-1111-4a4a-8a8a-000000000001";
const B = "0b6a1c1e-2222-4a4a-8a8a-000000000002";
const USER = "11111111-1111-4111-8111-111111111111";

const row = (over: Record<string, unknown> = {}) => ({
  id: A,
  companyName: "DANGO s.r.o.",
  country: "CZ",
  dic: "CZ12345678",
  roles: ["haulier"],
  supplierPaymentDays: 30,
  supplierCurrency: "CZK",
  supplierVatUnreliable: true,
  supplierBankAccountPublished: false,
  supplierVatCheckedAt: "2026-11-10",
  supplierBankAccountsChangedAt: new Date("2026-11-12T09:30:00.000Z"),
  supplierBankAccountsChangedByUserId: USER,
  approvalStatus: "pending",
  supplierRating: 2,
  ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("supplierFactsService.factsOf", () => {
  it("maps each company's terms, checks, approval and rating", async () => {
    customers.supplierFactsOf.mockResolvedValue([row()]);
    await expect(supplierFactsService.factsOf(COMPANY, [A])).resolves.toEqual([
      {
        id: A,
        companyName: "DANGO s.r.o.",
        country: "CZ",
        dic: "CZ12345678",
        roles: ["haulier"],
        paymentDays: 30,
        currency: "CZK",
        vatUnreliable: true,
        bankAccountPublished: false,
        vatCheckedAt: "2026-11-10",
        bankAccountsChangedAt: "2026-11-12T09:30:00.000Z",
        bankAccountsChangedByUserId: USER,
        approvalStatus: "pending",
        rating: 2,
      },
    ]);
    expect(customers.supplierFactsOf).toHaveBeenCalledWith(COMPANY, [A]);
  });

  it("keeps what was never set as null, and no VAT id as \"\"", async () => {
    customers.supplierFactsOf.mockResolvedValue([
      row({
        dic: "",
        supplierPaymentDays: null,
        supplierCurrency: null,
        supplierVatUnreliable: false,
        supplierVatCheckedAt: null,
        supplierBankAccountsChangedAt: null,
        supplierBankAccountsChangedByUserId: null,
        approvalStatus: "",
        supplierRating: null,
      }),
    ]);
    const [facts] = await supplierFactsService.factsOf(COMPANY, [A]);
    expect(facts).toMatchObject({ dic: "", paymentDays: null, currency: null, vatCheckedAt: null, bankAccountsChangedAt: null, bankAccountsChangedByUserId: null, approvalStatus: "", rating: null });
  });

  it("ignores what is not an id (Postgres would fail the whole call on it), and asks for an id in capitals once", async () => {
    customers.supplierFactsOf.mockResolvedValue([]);
    await supplierFactsService.factsOf(COMPANY, ["DANGO s.r.o.", "", A.toUpperCase(), A, B]);
    expect(customers.supplierFactsOf).toHaveBeenCalledTimes(1);
    expect(customers.supplierFactsOf).toHaveBeenCalledWith(COMPANY, [A, B]);
  });

  it("leaves out an id no live company of the company has", async () => {
    customers.supplierFactsOf.mockResolvedValue([row()]);
    const facts = await supplierFactsService.factsOf(COMPANY, [A, B]);
    expect(facts.map((f) => f.id)).toEqual([A]);
  });

  it("returns nothing without a query when no id is given", async () => {
    await expect(supplierFactsService.factsOf(COMPANY, [])).resolves.toEqual([]);
    await expect(supplierFactsService.factsOf(COMPANY, ["not-an-id"])).resolves.toEqual([]);
    expect(customers.supplierFactsOf).not.toHaveBeenCalled();
  });
});
