import { beforeEach, describe, expect, it, vi } from "vitest";

// The current names other services link their copies to (the shipments, quotes and sales backfills).
const customers = vi.hoisted(() => ({ refsByIds: vi.fn() }));
const contacts = vi.hoisted(() => ({ refsByCustomers: vi.fn() }));
vi.mock("../../repositories/customer.repository", () => ({ customerRepository: customers }));
vi.mock("../../repositories/contact.repository", () => ({ contactRepository: contacts }));

import { customerRefsService } from "../../services/customerRefs.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const A = "0b6a1c1e-1111-4a4a-8a8a-000000000001";
const B = "0b6a1c1e-2222-4a4a-8a8a-000000000002";

beforeEach(() => vi.resetAllMocks());

describe("customerRefsService.refs", () => {
  it("asks each repository once, for the company, with every id once", async () => {
    const customer = { id: A, companyName: "Alfa s.r.o.", label: "KEY ACCOUNT" };
    const contact = { id: "k1", customerId: A, name: "Petr Masák", email: "", phone: "", isMain: true };
    customers.refsByIds.mockResolvedValue([customer]);
    contacts.refsByCustomers.mockResolvedValue([contact]);
    await expect(customerRefsService.refs(COMPANY, ["", A, A, B])).resolves.toEqual({ customers: [customer], contacts: [contact] });
    expect(customers.refsByIds).toHaveBeenCalledTimes(1);
    expect(customers.refsByIds).toHaveBeenCalledWith(COMPANY, [A, B]);
    expect(contacts.refsByCustomers).toHaveBeenCalledTimes(1);
    expect(contacts.refsByCustomers).toHaveBeenCalledWith(COMPANY, [A, B]);
  });

  it("returns empty lists without a query when no id is given", async () => {
    await expect(customerRefsService.refs(COMPANY, [])).resolves.toEqual({ customers: [], contacts: [] });
    await expect(customerRefsService.refs(COMPANY, [""])).resolves.toEqual({ customers: [], contacts: [] });
    expect(customers.refsByIds).not.toHaveBeenCalled();
    expect(contacts.refsByCustomers).not.toHaveBeenCalled();
  });

  it("leaves out what is not an id (Postgres would fail the whole call on it), and counts an id in capitals once", async () => {
    customers.refsByIds.mockResolvedValue([]);
    contacts.refsByCustomers.mockResolvedValue([]);
    await customerRefsService.refs(COMPANY, ["Alfa s.r.o.", A.toUpperCase(), A]);
    expect(customers.refsByIds).toHaveBeenCalledWith(COMPANY, [A]);
    expect(contacts.refsByCustomers).toHaveBeenCalledWith(COMPANY, [A]);
    vi.clearAllMocks();
    await expect(customerRefsService.refs(COMPANY, ["not-an-id"])).resolves.toEqual({ customers: [], contacts: [] });
    expect(customers.refsByIds).not.toHaveBeenCalled();
  });
});
