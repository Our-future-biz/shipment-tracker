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
vi.mock("../services/logo.service", () => ({ logoService: { fetchLogo: vi.fn() } }));
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
  id: "k1", customerId: "c1", companyId: COMPANY, name: "Jana", email: "", phone: "", role: "Sales", isMain: false,
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
    await expect(contactService.create(COMPANY, "other-company-customer", { name: "X" })).rejects.toThrow("Customer not found");
    expect(contacts.createForCompany).not.toHaveBeenCalled();
  });

  it("are added with defaults, and the API item carries no company or deleted fields", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    contacts.createForCompany.mockResolvedValue(contactRow());
    const item = await contactService.create(COMPANY, "c1", { name: "Jana", role: "Sales" });
    expect(contacts.createForCompany).toHaveBeenCalledWith(COMPANY, {
      customerId: "c1", name: "Jana", email: "", phone: "", role: "Sales", isMain: false,
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
});
