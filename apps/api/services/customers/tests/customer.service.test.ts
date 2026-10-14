import { beforeEach, describe, expect, it, vi } from "vitest";

const customers = vi.hoisted(() => ({
  getByIdForCompany: vi.fn(),
  updateForCompany: vi.fn(),
  softDeleteWithChildren: vi.fn(),
  findByIco: vi.fn(),
  createForCompany: vi.fn(),
}));
const contacts = vi.hoisted(() => ({
  createForCompany: vi.fn(),
  clearMainFlag: vi.fn(),
  getByIdForCompany: vi.fn(),
  updateForCompany: vi.fn(),
}));
vi.mock("../repositories/customer.repository", () => ({ customerRepository: customers }));
vi.mock("../repositories/contact.repository", () => ({ contactRepository: contacts }));
vi.mock("../services/ares.service", () => ({ aresService: { lookup: vi.fn() } }));
const usersList = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ auth: { usersList } }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({
  APIError: {
    notFound: (msg: string) => new Error(msg),
    invalidArgument: (msg: string) => new Error(msg),
    alreadyExists: (msg: string) => new Error(msg),
  },
}));

import { customerService } from "../services/customer.service";
import { contactService } from "../services/contact.service";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const now = new Date("2026-10-14T08:00:00Z");
const contactRow = (over: Record<string, unknown> = {}) => ({
  id: "k1", customerId: "c1", companyId: COMPANY, name: "Jana Nováková", firstName: "Jana", lastName: "Nováková", email: "", phone: "", role: "Sales", isMain: false,
  createdAt: now, updatedAt: now, deletedAt: null, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("customerService.updateRollups", () => {
  it("stores the totals, an empty last activity as no date", async () => {
    customers.updateForCompany.mockResolvedValue({ id: "c1" });
    await customerService.updateRollups("c1", COMPANY, { totalRevenue: 10, totalProfit: 2, totalShipments: 1, lastActivityDate: "" });
    expect(customers.updateForCompany).toHaveBeenCalledWith("c1", COMPANY, {
      totalRevenue: 10, totalProfit: 2, totalShipments: 1, lastActivityDate: null,
    });
  });

  it("reports a missing customer", async () => {
    customers.updateForCompany.mockResolvedValue(null);
    await expect(
      customerService.updateRollups("x", COMPANY, { totalRevenue: 0, totalProfit: 0, totalShipments: 0, lastActivityDate: "2026-01-01" }),
    ).rejects.toThrow("Customer not found");
  });
});

describe("contacts of a customer", () => {
  it("can't be added under a customer that isn't live in the company", async () => {
    customers.getByIdForCompany.mockResolvedValue(null);
    await expect(contactService.create(COMPANY, "other-company-customer", { firstName: "X", lastName: "Y" })).rejects.toThrow("Customer not found");
    expect(contacts.createForCompany).not.toHaveBeenCalled();
  });

  it("are added with defaults, and the API item carries no company or deleted fields", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    contacts.createForCompany.mockResolvedValue(contactRow());
    const item = await contactService.create(COMPANY, "c1", { firstName: " Jana ", lastName: "Nováková", role: "Sales" });
    expect(contacts.createForCompany).toHaveBeenCalledWith(COMPANY, {
      customerId: "c1", name: "Jana Nováková", firstName: "Jana", lastName: "Nováková", email: "", phone: "", role: "Sales", isMain: false,
    });
    expect(item).not.toHaveProperty("companyId");
    expect(item).not.toHaveProperty("deletedAt");
    expect(item.createdAt).toBe(now.toISOString());
  });

  it("making one main clears the flag on its own customer's contacts, not a client-sent one", async () => {
    contacts.getByIdForCompany.mockResolvedValue(contactRow({ customerId: "c1" }));
    contacts.updateForCompany.mockResolvedValue(contactRow({ isMain: true }));
    await contactService.update("k1", COMPANY, { isMain: true });
    expect(contacts.clearMainFlag).toHaveBeenCalledWith("c1", COMPANY);
  });

  it("keeps the full name in step when only one part of it changes", async () => {
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    contacts.updateForCompany.mockResolvedValue(contactRow());
    await contactService.update("k1", COMPANY, { lastName: "Svobodová" });
    expect(contacts.updateForCompany).toHaveBeenCalledWith("k1", COMPANY, { firstName: "Jana", lastName: "Svobodová", name: "Jana Svobodová" });
  });

  it("leaves the name alone when neither part is sent", async () => {
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    contacts.updateForCompany.mockResolvedValue(contactRow());
    await contactService.update("k1", COMPANY, { email: "jana@example.cz" });
    expect(contacts.updateForCompany).toHaveBeenCalledWith("k1", COMPANY, { email: "jana@example.cz" });
  });
});

describe("sales owner", () => {
  const LUKAS = "5d1f6b0e-2c3a-4f4a-9a53-5d0d3a2b6c11";
  const USERS = [{ id: LUKAS, displayName: "Lukáš Novák", email: "lukas@example.cz" }];

  it("is a user of the company, stored with the user's name", async () => {
    usersList.mockResolvedValue({ users: USERS });
    customers.updateForCompany.mockResolvedValue({ id: "c1", createdAt: now, updatedAt: now });
    await customerService.update("c1", COMPANY, { salesOwnerUserId: LUKAS, status: "Active" });
    expect(customers.updateForCompany).toHaveBeenCalledWith("c1", COMPANY, { status: "Active", salesOwner: "Lukáš Novák", salesOwnerUserId: LUKAS });
  });

  it("can be removed", async () => {
    customers.updateForCompany.mockResolvedValue({ id: "c1", createdAt: now, updatedAt: now });
    await customerService.update("c1", COMPANY, { salesOwnerUserId: null });
    expect(customers.updateForCompany).toHaveBeenCalledWith("c1", COMPANY, { salesOwner: "", salesOwnerUserId: null });
    expect(usersList).not.toHaveBeenCalled();
  });

  it("refuses somebody who is not a user of the company", async () => {
    usersList.mockResolvedValue({ users: USERS });
    await expect(customerService.update("c1", COMPANY, { salesOwnerUserId: "9d1f6b0e-2c3a-4f4a-9a53-5d0d3a2b6c11" })).rejects.toThrow(
      "salesOwnerUserId must be a user of the company",
    );
    await expect(customerService.update("c1", COMPANY, { salesOwnerUserId: "Lukáš" })).rejects.toThrow("salesOwnerUserId must be the id of a user");
    expect(customers.updateForCompany).not.toHaveBeenCalled();
  });
});

