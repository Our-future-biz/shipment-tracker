import { beforeEach, describe, expect, it, vi } from "vitest";

const customers = vi.hoisted(() => ({
  getByIdForCompany: vi.fn(),
  updateForCompany: vi.fn(),
  softDeleteWithChildren: vi.fn(),
  listDeleted: vi.fn(),
  getDeletedForCompany: vi.fn(),
  restoreWithChildren: vi.fn(),
  findByIco: vi.fn(),
  createForCompany: vi.fn(),
  createWithContact: vi.fn(),
}));
const contacts = vi.hoisted(() => ({
  createForCompany: vi.fn(),
  clearMainFlag: vi.fn(),
  getByIdForCompany: vi.fn(),
  updateForCompany: vi.fn(),
}));
// Logo links are signed with a secret, which needs the Encore runtime.
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("../repositories/customer.repository", () => ({ customerRepository: customers }));
vi.mock("../repositories/contact.repository", () => ({ contactRepository: contacts }));
vi.mock("../services/ares.service", () => ({ aresService: { lookup: vi.fn() } }));
const userLookup = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ auth: { userLookup } }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({
  APIError: {
    notFound: (msg: string) => new Error(msg),
    invalidArgument: (msg: string) => new Error(msg),
    alreadyExists: (msg: string) => new Error(msg),
    permissionDenied: (msg: string) => new Error(msg),
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
  it("refuse a Czech number (+420) without exactly 9 digits, on add and on edit", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    await expect(contactService.create(COMPANY, "c1", { firstName: "Aleš", lastName: "Petrák", phone: "+420 774237000000" })).rejects.toThrow(
      "A Czech phone number (+420) must have exactly 9 digits",
    );
    expect(contacts.createForCompany).not.toHaveBeenCalled();
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    await expect(contactService.update("k1", COMPANY, { phone: "+420 774 23" })).rejects.toThrow("exactly 9 digits");
    expect(contacts.updateForCompany).not.toHaveBeenCalled();
  });

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
  const USERS = [{ id: LUKAS, name: "Lukáš Novák", role: "user" }];

  it("is a user of the company, stored with the user's name", async () => {
    userLookup.mockResolvedValue({ users: USERS });
    customers.updateForCompany.mockResolvedValue({ id: "c1", createdAt: now, updatedAt: now });
    await customerService.update("c1", COMPANY, "manager", { salesOwnerUserId: LUKAS, status: "Active" });
    expect(customers.updateForCompany).toHaveBeenCalledWith("c1", COMPANY, { status: "Active", salesOwner: "Lukáš Novák", salesOwnerUserId: LUKAS });
  });

  it("can be removed", async () => {
    customers.updateForCompany.mockResolvedValue({ id: "c1", createdAt: now, updatedAt: now });
    await customerService.update("c1", COMPANY, "manager", { salesOwnerUserId: null });
    expect(customers.updateForCompany).toHaveBeenCalledWith("c1", COMPANY, { salesOwner: "", salesOwnerUserId: null });
    expect(userLookup).not.toHaveBeenCalled();
  });

  it("refuses somebody who is not a user of the company", async () => {
    userLookup.mockResolvedValue({ users: USERS });
    await expect(customerService.update("c1", COMPANY, "manager", { salesOwnerUserId: "9d1f6b0e-2c3a-4f4a-9a53-5d0d3a2b6c11" })).rejects.toThrow(
      "salesOwnerUserId must be a user of the company",
    );
    await expect(customerService.update("c1", COMPANY, "manager", { salesOwnerUserId: "Lukáš" })).rejects.toThrow("salesOwnerUserId must be the id of a user");
    expect(customers.updateForCompany).not.toHaveBeenCalled();
  });
});

describe("manager-only fields", () => {
  it("lets a plain user edit the record but not the commercial fields", async () => {
    customers.updateForCompany.mockResolvedValue({ id: "c1", createdAt: now, updatedAt: now });
    await customerService.update("c1", COMPANY, "user", { companyWebsite: "https://x.cz" });
    expect(customers.updateForCompany).toHaveBeenCalledWith("c1", COMPANY, { companyWebsite: "https://x.cz" });
    for (const patch of [{ salesOwnerUserId: null }, { creditLimit: 1000 }, { label: "KEY ACCOUNT" as const }, { paymentTerms: "30 days" }, { riskLevel: "High" as const }, { industry: "Steel" }]) {
      await expect(customerService.update("c1", COMPANY, "user", patch)).rejects.toThrow(/Only a manager can change/);
    }
    expect(customers.updateForCompany).toHaveBeenCalledTimes(1);
  });
});

describe("company analysis set by hand", () => {
  it("stores the overrides trimmed and the registration date as a date, \"\" clearing it", async () => {
    customers.updateForCompany.mockResolvedValue({ id: "c1", createdAt: now, updatedAt: now });
    await customerService.update("c1", COMPANY, "manager", { industry: " Machinery ", riskLevel: "High", registrationDate: "1990-05-12" });
    expect(customers.updateForCompany).toHaveBeenCalledWith("c1", COMPANY, { industry: "Machinery", riskLevel: "High", registrationDate: "1990-05-12" });
    await customerService.update("c1", COMPANY, "manager", { registrationDate: "" });
    expect(customers.updateForCompany).toHaveBeenLastCalledWith("c1", COMPANY, { registrationDate: null });
  });

  it("refuses a registration date that is not a date", async () => {
    await expect(customerService.update("c1", COMPANY, "manager", { registrationDate: "12.5.1990" })).rejects.toThrow("registrationDate must be a date (yyyy-mm-dd)");
    expect(customers.updateForCompany).not.toHaveBeenCalled();
  });
});

describe("customerService.createManual", () => {
  const CONTACT = { firstName: " Hans ", lastName: "Müller", email: "hans.mueller@siemens.com" };
  const SIEMENS = {
    country: "de", companyName: " Siemens AG ", registrationNumber: "HRB 12345", street: "Wittelsbacherplatz 2", city: "München", postalCode: "80333",
    contact: CONTACT,
  };

  it("stores a foreign company as typed, without a VAT ID, as a new prospect with its contact as the main one", async () => {
    customers.findByIco.mockResolvedValue(null);
    customers.createWithContact.mockResolvedValue({ id: "c9", createdAt: now, updatedAt: now });
    await customerService.createManual(COMPANY, SIEMENS);
    expect(customers.createWithContact).toHaveBeenCalledWith(
      COMPANY,
      expect.objectContaining({
        ico: "HRB 12345",
        dic: "",
        companyName: "Siemens AG",
        registeredAddress: "Wittelsbacherplatz 2, 80333 München",
        city: "München",
        country: "DE",
        dataSource: "Manual",
        status: "Prospect",
        label: "TARGET CUSTOMER",
      }),
      { name: "Hans Müller", firstName: "Hans", lastName: "Müller", email: "hans.mueller@siemens.com", phone: "", role: "Logistics Manager", isMain: true },
      { type: "Registered", street: "Wittelsbacherplatz 2", city: "München", postalCode: "80333", country: "DE" },
    );
  });

  it("does not look for a duplicate when there is no registration number", async () => {
    customers.createWithContact.mockResolvedValue({ id: "c9", createdAt: now, updatedAt: now });
    await customerService.createManual(COMPANY, { ...SIEMENS, registrationNumber: " " });
    expect(customers.findByIco).not.toHaveBeenCalled();
    expect(customers.createWithContact).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ ico: "" }), expect.anything(), expect.anything());
  });

  it("refuses a registration number the company already has, and a Czech company", async () => {
    customers.findByIco.mockResolvedValue({ id: "c1" });
    await expect(customerService.createManual(COMPANY, SIEMENS)).rejects.toThrow("A customer with this registration number already exists");
    await expect(customerService.createManual(COMPANY, { ...SIEMENS, country: "CZ" })).rejects.toThrow("A Czech company is added from ARES by its IČO");
    expect(customers.createWithContact).not.toHaveBeenCalled();
  });

  it("answers a create that races past the check like the check would, not with a 500", async () => {
    customers.findByIco.mockResolvedValue(null);
    customers.createWithContact.mockRejectedValueOnce(Object.assign(new Error("Failed query"), { cause: { code: "23505" } }));
    await expect(customerService.createManual(COMPANY, SIEMENS)).rejects.toThrow("A customer with this registration number already exists");
  });

  it("needs a contact person with a name and an email or a phone", async () => {
    await expect(customerService.createManual(COMPANY, { ...SIEMENS, contact: { firstName: "Hans", lastName: " " } })).rejects.toThrow(
      "The contact person needs a first and a last name",
    );
    await expect(customerService.createManual(COMPANY, { ...SIEMENS, contact: { firstName: "Hans", lastName: "Müller", email: " " } })).rejects.toThrow(
      "The contact person needs an email or a phone number",
    );
    expect(customers.createWithContact).not.toHaveBeenCalled();
  });
});

describe("deleted customers", () => {
  const deletedRow = (over: Record<string, unknown> = {}) => ({
    id: "c1", companyId: COMPANY, ico: "12345678", companyName: "Alfa s.r.o.", roles: ["customer"], registrationDate: null,
    lastActivityDate: null, logoData: "", createdAt: now, updatedAt: now, deletedAt: now, ...over,
  });

  it("are listed with the date they were deleted", async () => {
    customers.listDeleted.mockResolvedValue([
      { id: "c1", companyName: "Alfa s.r.o.", ico: "12345678", city: "Praha", country: "CZ", label: "STANDARD", status: "Active", deletedAt: now, contactCount: 2, addressCount: 1 },
    ]);
    await expect(customerService.listDeleted(COMPANY)).resolves.toEqual([
      { id: "c1", companyName: "Alfa s.r.o.", ico: "12345678", city: "Praha", country: "CZ", label: "STANDARD", status: "Active", deletedAt: now.toISOString(), contactCount: 2, addressCount: 1 },
    ]);
    expect(customers.listDeleted).toHaveBeenCalledWith(COMPANY);
  });

  it("are restored with what was deleted together with them", async () => {
    customers.getDeletedForCompany.mockResolvedValue(deletedRow());
    customers.findByIco.mockResolvedValue(null);
    customers.restoreWithChildren.mockResolvedValue(deletedRow({ deletedAt: null }));
    const item = await customerService.restore("c1", COMPANY);
    expect(customers.findByIco).toHaveBeenCalledWith("12345678", COMPANY);
    expect(customers.restoreWithChildren).toHaveBeenCalledWith("c1", COMPANY);
    expect(item.id).toBe("c1");
  });

  it("can't be restored when they are not deleted (or of another company)", async () => {
    customers.getDeletedForCompany.mockResolvedValue(null);
    await expect(customerService.restore("c1", COMPANY)).rejects.toThrow("Deleted customer not found");
    expect(customers.restoreWithChildren).not.toHaveBeenCalled();
  });

  it("can't be restored while a live customer has the same registration number", async () => {
    customers.getDeletedForCompany.mockResolvedValue(deletedRow());
    customers.findByIco.mockResolvedValue({ id: "c2", companyName: "Alfa nová s.r.o." });
    await expect(customerService.restore("c1", COMPANY)).rejects.toThrow(
      "Alfa nová s.r.o. already has the registration number 12345678, so Alfa s.r.o. can't be restored",
    );
    expect(customers.restoreWithChildren).not.toHaveBeenCalled();
  });

  it("without a registration number are not compared with anyone", async () => {
    customers.getDeletedForCompany.mockResolvedValue(deletedRow({ ico: "" }));
    customers.restoreWithChildren.mockResolvedValue(deletedRow({ ico: "", deletedAt: null }));
    await customerService.restore("c1", COMPANY);
    expect(customers.findByIco).not.toHaveBeenCalled();
  });
});
