import { beforeEach, describe, expect, it, vi } from "vitest";

// What Finance → Accounts Receivable (the invoicing service) shows of an invoice's customer.
const customers = vi.hoisted(() => ({ receivableFactsOf: vi.fn(), reminderContactsOf: vi.fn() }));
vi.mock("../../repositories/customer.repository", () => ({ customerRepository: customers }));

import { receivableFactsService } from "../../services/receivableFacts.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const A = "0b6a1c1e-1111-4a4a-8a8a-000000000001";
const B = "0b6a1c1e-2222-4a4a-8a8a-000000000002";
const USER = "11111111-1111-4111-8111-111111111111";
const at = new Date("2026-01-01T08:00:00Z");

const customer = (over: Record<string, unknown> = {}) => ({
  id: A, companyName: "Alfa s.r.o.", salesOwner: "martin@cto.cz", salesOwnerUserId: USER, paymentTerms: "30 days", creditLimit: 10000, currency: "EUR", language: "en", deletedAt: null, ...over,
});
const contact = (over: Record<string, unknown> = {}) => ({ customerId: A, id: "k1", name: "Jana Main", email: "jana@alfa.cz", role: "Sales", isMain: true, createdAt: at, ...over });

beforeEach(() => vi.resetAllMocks());

describe("receivableFactsService.factsOf", () => {
  it("gives each customer's name, owner, terms and limit, and whom a reminder goes to", async () => {
    customers.receivableFactsOf.mockResolvedValue([customer(), customer({ id: B, companyName: "Beta GmbH", salesOwner: "", salesOwnerUserId: null, language: "cs", deletedAt: new Date() })]);
    customers.reminderContactsOf.mockResolvedValue([
      contact(),
      contact({ id: "k2", name: "Eva Novak", email: "ap@alfa.cz", role: "Accounts payable", isMain: false }),
      contact({ customerId: B, id: "k3", name: "Hans", email: "hans@beta.de", role: "Finance / Accounting", isMain: false }),
    ]);
    await expect(receivableFactsService.factsOf(COMPANY, [A, B.toUpperCase(), A, "nope"])).resolves.toEqual([
      {
        id: A, companyName: "Alfa s.r.o.", salesOwner: "martin@cto.cz", salesOwnerUserId: USER, paymentTerms: "30 days", creditLimit: 10000, currency: "EUR",
        reminderTo: { name: "Eva Novak", email: "ap@alfa.cz", role: "Accounts payable" }, language: "en", deleted: false,
      },
      {
        id: B, companyName: "Beta GmbH", salesOwner: "", salesOwnerUserId: null, paymentTerms: "30 days", creditLimit: 10000, currency: "EUR",
        reminderTo: { name: "Hans", email: "hans@beta.de", role: "Finance / Accounting" }, language: "cs", deleted: true,
      },
    ]);
    expect(customers.receivableFactsOf).toHaveBeenCalledWith(COMPANY, [A, B]);
    expect(customers.reminderContactsOf).toHaveBeenCalledWith(COMPANY, [A, B]);
  });

  it("has nobody to remind when no such contact has an e-mail", async () => {
    customers.receivableFactsOf.mockResolvedValue([customer()]);
    customers.reminderContactsOf.mockResolvedValue([]);
    await expect(receivableFactsService.factsOf(COMPANY, [A])).resolves.toMatchObject([{ id: A, reminderTo: null }]);
  });

  it("gives each customer's language, a deleted one's too, and English for anything the database should never hold", async () => {
    customers.receivableFactsOf.mockResolvedValue([
      customer({ language: "cs", deletedAt: new Date() }),
      customer({ id: B, language: "de" }),
    ]);
    customers.reminderContactsOf.mockResolvedValue([]);
    await expect(receivableFactsService.factsOf(COMPANY, [A, B])).resolves.toMatchObject([
      { id: A, language: "cs", deleted: true },
      { id: B, language: "en", deleted: false },
    ]);
  });

  it("asks nothing for ids that are no ids", async () => {
    await expect(receivableFactsService.factsOf(COMPANY, ["x", ""])).resolves.toEqual([]);
    expect(customers.receivableFactsOf).not.toHaveBeenCalled();
  });
});
