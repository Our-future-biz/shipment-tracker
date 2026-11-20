import { beforeEach, describe, expect, it, vi } from "vitest";

const customers = vi.hoisted(() => ({
  getByIdForCompany: vi.fn(),
  updateForCompany: vi.fn(),
  softDeleteWithChildren: vi.fn(),
  listDeleted: vi.fn(),
  getDeletedForCompany: vi.fn(),
  restoreWithChildren: vi.fn(),
  findByIco: vi.fn(),
  findDeletedByIco: vi.fn(),
  createForCompany: vi.fn(),
  createWithContact: vi.fn(),
}));
const contacts = vi.hoisted(() => ({
  createInCustomer: vi.fn(),
  getByIdForCompany: vi.fn(),
  updateInCustomer: vi.fn(),
  hiddenWithCustomer: vi.fn(async () => []),
  findByCustomer: vi.fn(async (): Promise<{ id: string; name: string; email: string; phone: string }[]> => []),
}));
// Logo links are signed with a secret, which needs the Encore runtime.
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("../repositories/customer.repository", () => ({ customerRepository: customers }));
vi.mock("../repositories/contact.repository", () => ({ contactRepository: contacts }));
vi.mock("../services/ares.service", () => ({ aresService: { lookup: vi.fn() } }));
const topics = vi.hoisted(() => ({ customerChanged: { publish: vi.fn() }, contactChanged: { publish: vi.fn() } }));
vi.mock("../topics", () => topics);
const userLookup = vi.hoisted(() => vi.fn());
// The company's users and departments: who sits in Sales (a new customer's sales owner, mock council R12).
const usersList = vi.hoisted(() => vi.fn(async (): Promise<{ users: { id: string; departmentId: string | null }[] }> => ({ users: [] })));
const departmentList = vi.hoisted(() => vi.fn(async (): Promise<{ departments: { id: string; name: string }[] }> => ({ departments: [] })));
// What the shipments, quotes and invoicing services count of a customer before it is deleted.
const uses = vi.hoisted(() => ({
  shipments: vi.fn(async () => ({ count: 0 })),
  openQuotes: vi.fn(async () => ({ count: 0 })),
  unpaidInvoices: vi.fn(async () => ({ count: 0 })),
}));
vi.mock("~encore/clients", () => ({
  auth: { userLookup, usersList, departmentList },
  shipments: { _internalCustomerShipmentCount: uses.shipments },
  quotes: { _internalCustomerOpenQuoteCount: uses.openQuotes },
  invoicing: { _internalCustomerUnpaidCount: uses.unpaidInvoices },
}));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: logger }));
// The Encore runtime isn't loaded under vitest; APIError only needs to carry its message here.
vi.mock("encore.dev/api", () => ({
  APIError: {
    notFound: (msg: string) => new Error(msg),
    invalidArgument: (msg: string) => new Error(msg),
    alreadyExists: (msg: string) => Object.assign(new Error(msg), { code: "already_exists" }),
    unavailable: (msg: string) => Object.assign(new Error(msg), { code: "unavailable" }),
    permissionDenied: (msg: string) => Object.assign(new Error(msg), { code: "permission_denied" }),
    failedPrecondition: (msg: string) => Object.assign(new Error(msg), { code: "failed_precondition" }),
    aborted: (msg: string) => Object.assign(new Error(msg), { code: "aborted" }),
  },
}));

import { getTableColumns } from "drizzle-orm";
import { OWNER_NOT_YOURS, customerService, isSalesDepartment } from "../services/customer.service";
import { customerTable } from "../schemas/customer.schema";
import { CUSTOMER_LANGUAGES, isCustomerLanguage } from "../interfaces/interfaces";
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
    expect(contacts.createInCustomer).not.toHaveBeenCalled();
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    await expect(contactService.update("k1", COMPANY, { phone: "+420 774 23" })).rejects.toThrow("exactly 9 digits");
    expect(contacts.updateInCustomer).not.toHaveBeenCalled();
  });

  it("can't be added under a customer that isn't live in the company", async () => {
    customers.getByIdForCompany.mockResolvedValue(null);
    await expect(contactService.create(COMPANY, "other-company-customer", { firstName: "X", lastName: "Y" })).rejects.toThrow("Customer not found");
    expect(contacts.createInCustomer).not.toHaveBeenCalled();
  });

  it("are added with defaults, and the API item carries no company or deleted fields", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    contacts.createInCustomer.mockResolvedValue(contactRow());
    const item = await contactService.create(COMPANY, "c1", { firstName: " Jana ", lastName: "Nováková", role: "Sales" });
    expect(contacts.createInCustomer).toHaveBeenCalledWith(COMPANY, {
      customerId: "c1", name: "Jana Nováková", firstName: "Jana", lastName: "Nováková", email: "", phone: "", role: "Sales", isMain: false,
    });
    expect(item).not.toHaveProperty("companyId");
    expect(item).not.toHaveProperty("deletedAt");
    expect(item.createdAt).toBe(now.toISOString());
  });

  // Changed: the flag used to be cleared by a call of its own before the write; now the repository
  // clears it in the write's transaction, on the customer the contact is stored under.
  it("making one main clears the flag on its own customer's contacts, not a client-sent one, in the write itself", async () => {
    contacts.getByIdForCompany.mockResolvedValue(contactRow({ customerId: "c1" }));
    contacts.updateInCustomer.mockResolvedValue(contactRow({ isMain: true }));
    await contactService.update("k1", COMPANY, { isMain: true });
    expect(contacts.updateInCustomer).toHaveBeenCalledWith("k1", COMPANY, "c1", { isMain: true });
  });

  it("a new main contact is made in one write with the old one's flag cleared", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    contacts.createInCustomer.mockResolvedValue(contactRow({ isMain: true }));
    await contactService.create(COMPANY, "c1", { firstName: "Jana", lastName: "Nováková", isMain: true });
    expect(contacts.createInCustomer).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ customerId: "c1", isMain: true }));
  });

  it("two contacts made main at the same moment: the second is told to reload, never two main contacts", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    const oneMain = Object.assign(new Error("duplicate key"), { cause: { code: "23505", constraint: "contact_one_main_per_customer" } });
    contacts.createInCustomer.mockRejectedValueOnce(oneMain);
    await expect(contactService.create(COMPANY, "c1", { firstName: "Jana", lastName: "Nováková", isMain: true })).rejects.toThrow(/made the main one at the same moment/);
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    contacts.updateInCustomer.mockRejectedValueOnce(oneMain);
    await expect(contactService.update("k1", COMPANY, { isMain: true })).rejects.toThrow(/made the main one at the same moment/);
  });

  it("keeps the full name in step when only one part of it changes", async () => {
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    contacts.updateInCustomer.mockResolvedValue(contactRow());
    await contactService.update("k1", COMPANY, { lastName: "Svobodová" });
    expect(contacts.updateInCustomer).toHaveBeenCalledWith("k1", COMPANY, "c1", { firstName: "Jana", lastName: "Svobodová", name: "Jana Svobodová" });
  });

  it("leaves the name alone when neither part is sent", async () => {
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    contacts.updateInCustomer.mockResolvedValue(contactRow());
    await contactService.update("k1", COMPANY, { email: "jana@example.cz" });
    expect(contacts.updateInCustomer).toHaveBeenCalledWith("k1", COMPANY, "c1", { email: "jana@example.cz" });
  });

  it("need a first and a last name on add, as a new customer's first contact does", async () => {
    customers.getByIdForCompany.mockResolvedValue({ id: "c1" });
    await expect(contactService.create(COMPANY, "c1", { firstName: "  ", lastName: "Nováková" })).rejects.toThrow(
      "The contact person needs a first and a last name",
    );
    await expect(contactService.create(COMPANY, "c1", { firstName: "Jana", lastName: " ", isMain: true })).rejects.toThrow(
      "The contact person needs a first and a last name",
    );
    expect(contacts.createInCustomer).not.toHaveBeenCalled();
  });

  it("a rename that blanks either part is refused before anything is written or sent", async () => {
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    await expect(contactService.update("k1", COMPANY, { lastName: "   ", isMain: true })).rejects.toThrow(
      "The contact person needs a first and a last name",
    );
    await expect(contactService.update("k1", COMPANY, { firstName: "", lastName: "Svobodová" })).rejects.toThrow(
      "The contact person needs a first and a last name",
    );
    expect(contacts.updateInCustomer).not.toHaveBeenCalled();
    expect(topics.contactChanged.publish).not.toHaveBeenCalled();
  });

  it("an old one-word contact is renamed only with a last name, and keeps its name through other edits", async () => {
    contacts.getByIdForCompany.mockResolvedValue(contactRow({ name: "Jana", lastName: "" }));
    contacts.updateInCustomer.mockResolvedValue(contactRow({ name: "Jana", lastName: "" }));
    await expect(contactService.update("k1", COMPANY, { firstName: "Janička" })).rejects.toThrow("The contact person needs a first and a last name");
    expect(contacts.updateInCustomer).not.toHaveBeenCalled();
    await contactService.update("k1", COMPANY, { email: "jana@example.cz" });
    expect(contacts.updateInCustomer).toHaveBeenCalledWith("k1", COMPANY, "c1", { email: "jana@example.cz" });
    expect(topics.contactChanged.publish).toHaveBeenCalledWith(expect.objectContaining({ name: "Jana", deleted: false }));
  });
});

describe("sales owner", () => {
  const LUKAS = "5d1f6b0e-2c3a-4f4a-9a53-5d0d3a2b6c11";
  const USERS = [{ id: LUKAS, name: "Lukáš Novák", email: "Lukas@OurFuture.biz", role: "user" }];

  it("is a user of the company, stored with the user's e-mail", async () => {
    userLookup.mockResolvedValue({ users: USERS });
    customers.updateForCompany.mockResolvedValue({ id: "c1", createdAt: now, updatedAt: now });
    await customerService.update("c1", COMPANY, "manager", { salesOwnerUserId: LUKAS, status: "Active" });
    expect(customers.updateForCompany).toHaveBeenCalledWith("c1", COMPANY, { status: "Active", salesOwner: "lukas@ourfuture.biz", salesOwnerUserId: LUKAS });
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
    for (const patch of [{ salesOwnerUserId: null }, { creditLimit: 1000 }, { label: "KEY ACCOUNT" as const }, { paymentTerms: "30 days" }, { riskLevel: "High" as const }, { industry: "Steel" }, { companyName: "Alfa Group s.r.o." }]) {
      await expect(customerService.update("c1", COMPANY, "user", patch)).rejects.toThrow(/Only a manager can change/);
    }
    expect(customers.updateForCompany).toHaveBeenCalledTimes(1);
  });

  it("lets a manager, an admin and a superadmin rename the company, but not a plain user", async () => {
    customers.updateForCompany.mockResolvedValue({ id: "c1", companyName: "Alfa Group s.r.o.", createdAt: now, updatedAt: now });
    await expect(customerService.update("c1", COMPANY, "user", { companyName: "Alfa Group s.r.o." })).rejects.toMatchObject({ code: "permission_denied" });
    expect(customers.updateForCompany).not.toHaveBeenCalled();
    for (const role of ["manager", "admin", "superadmin"]) {
      await customerService.update("c1", COMPANY, role, { companyName: "Alfa Group s.r.o." });
    }
    expect(customers.updateForCompany).toHaveBeenCalledTimes(3);
    expect(customers.updateForCompany).toHaveBeenLastCalledWith("c1", COMPANY, { companyName: "Alfa Group s.r.o." });
  });
});

describe("the language a customer is written to in (reminders and statements)", () => {
  it("is set by a manager, an admin or a superadmin, as the payment terms are", async () => {
    customers.updateForCompany.mockResolvedValue({ id: "c1", language: "cs", createdAt: now, updatedAt: now });
    for (const role of ["manager", "admin", "superadmin"]) {
      await customerService.update("c1", COMPANY, role, { language: "cs" });
    }
    expect(customers.updateForCompany).toHaveBeenCalledTimes(3);
    expect(customers.updateForCompany).toHaveBeenLastCalledWith("c1", COMPANY, { language: "cs" });
  });

  it("is not a plain user's to change", async () => {
    await expect(customerService.update("c1", COMPANY, "user", { language: "en" })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(customerService.update("c1", COMPANY, "user", { language: "cs", paymentTerms: "30 days" })).rejects.toThrow(
      "Only a manager can change: paymentTerms, language",
    );
    expect(customers.updateForCompany).not.toHaveBeenCalled();
  });

  it("is Czech or English only (German later)", async () => {
    for (const language of ["de", "CS", "", "cz"]) {
      await expect(customerService.update("c1", COMPANY, "manager", { language: language as "cs" })).rejects.toThrow("The language is Czech (cs) or English (en)");
    }
    expect(customers.updateForCompany).not.toHaveBeenCalled();
    expect(CUSTOMER_LANGUAGES).toEqual(["cs", "en"]);
    expect([isCustomerLanguage("cs"), isCustomerLanguage("en"), isCustomerLanguage("de"), isCustomerLanguage(null)]).toEqual([true, true, false, false]);
  });

  it("is English for every customer until a manager sets it, and the customer's read gives it", async () => {
    const column = getTableColumns(customerTable).language;
    expect([column.default, column.notNull]).toEqual(["en", true]);
    customers.updateForCompany.mockResolvedValue({ id: "c1", language: "en", createdAt: now, updatedAt: now });
    await expect(customerService.update("c1", COMPANY, "user", { companyWebsite: "https://x.cz" })).resolves.toMatchObject({ language: "en" });
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
    await customerService.createManual(COMPANY, "user", SIEMENS);
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
      { types: ["Registered"], street: "Wittelsbacherplatz 2", city: "München", postalCode: "80333", country: "DE" },
    );
  });

  it("does not look for a duplicate when there is no registration number", async () => {
    customers.createWithContact.mockResolvedValue({ id: "c9", createdAt: now, updatedAt: now });
    await customerService.createManual(COMPANY, "user", { ...SIEMENS, registrationNumber: " " });
    expect(customers.findByIco).not.toHaveBeenCalled();
    expect(customers.createWithContact).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ ico: "" }), expect.anything(), expect.anything());
  });

  it("looks for a duplicate in the company's own country only: a German HRB 12345 is no Austrian company's", async () => {
    customers.findByIco.mockResolvedValue(null);
    customers.createWithContact.mockResolvedValue({ id: "c9", createdAt: now, updatedAt: now });
    await customerService.createManual(COMPANY, "user", SIEMENS);
    expect(customers.findByIco).toHaveBeenCalledWith("HRB 12345", "DE", COMPANY);
  });

  it("refuses a registration number the company already has, and a Czech company", async () => {
    customers.findByIco.mockResolvedValue({ id: "c1" });
    await expect(customerService.createManual(COMPANY, "user", SIEMENS)).rejects.toThrow("A customer with this registration number already exists");
    await expect(customerService.createManual(COMPANY, "user", { ...SIEMENS, country: "CZ" })).rejects.toThrow("A Czech company is added from ARES by its IČO");
    expect(customers.createWithContact).not.toHaveBeenCalled();
  });

  it("answers a create that races past the check like the check would, not with a 500", async () => {
    customers.findByIco.mockResolvedValue(null);
    customers.createWithContact.mockRejectedValueOnce(Object.assign(new Error("Failed query"), { cause: { code: "23505" } }));
    await expect(customerService.createManual(COMPANY, "user", SIEMENS)).rejects.toThrow("A customer with this registration number already exists");
  });

  it("needs a contact person with a name and an email or a phone", async () => {
    await expect(customerService.createManual(COMPANY, "user", { ...SIEMENS, contact: { firstName: "Hans", lastName: " " } })).rejects.toThrow(
      "The contact person needs a first and a last name",
    );
    await expect(customerService.createManual(COMPANY, "user", { ...SIEMENS, contact: { firstName: "Hans", lastName: "Müller", email: " " } })).rejects.toThrow(
      "The contact person needs an email or a phone number",
    );
    expect(customers.createWithContact).not.toHaveBeenCalled();
  });
});

describe("deleted customers", () => {
  const deletedRow = (over: Record<string, unknown> = {}) => ({
    id: "c1", companyId: COMPANY, ico: "12345678", country: "CZ", companyName: "Alfa s.r.o.", roles: ["customer"], registrationDate: null,
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
    // Compared in its own country's register.
    expect(customers.findByIco).toHaveBeenCalledWith("12345678", "CZ", COMPANY);
    expect(customers.restoreWithChildren).toHaveBeenCalledWith("c1", COMPANY, "restore");
    expect(item.id).toBe("c1");
  });

  it("announce their contacts again once restored, so the copies that let go of them link them again", async () => {
    customers.getDeletedForCompany.mockResolvedValue(deletedRow());
    customers.findByIco.mockResolvedValue(null);
    customers.restoreWithChildren.mockResolvedValue(deletedRow({ deletedAt: null }));
    contacts.findByCustomer.mockResolvedValueOnce([{ id: "k1", name: "Petr Masák", email: "petr@acme.cz", phone: "" }]);
    await customerService.restore("c1", COMPANY);
    expect(topics.contactChanged.publish).toHaveBeenCalledWith({ companyId: COMPANY, customerId: "c1", contactId: "k1", name: "Petr Masák", email: "petr@acme.cz", phone: "", deleted: false });
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

describe("deleting a customer that shipments or quotes still name", () => {
  const live = (over: Record<string, unknown> = {}) => ({
    id: "c1", companyId: COMPANY, companyName: "Alfa s.r.o.", label: "STANDARD", roles: ["customer"], registrationDate: null,
    lastActivityDate: null, logoData: "", createdAt: now, updatedAt: now, deletedAt: null, ...over,
  });

  it("is refused while it has live shipments or open quotes, saying how many and what to do; nothing is deleted", async () => {
    customers.getByIdForCompany.mockResolvedValue(live());
    uses.shipments.mockResolvedValueOnce({ count: 3 });
    uses.openQuotes.mockResolvedValueOnce({ count: 1 });
    await expect(customerService.softDelete("c1", COMPANY)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Alfa s.r.o. can't be deleted while it has 3 shipments and 1 open quote: set it Inactive instead, or first give the shipments another customer and mark the quote Lost",
    });
    expect(uses.shipments).toHaveBeenCalledWith({ customerId: "c1" });
    expect(uses.openQuotes).toHaveBeenCalledWith({ customerId: "c1" });
    expect(customers.softDeleteWithChildren).not.toHaveBeenCalled();
    expect(topics.customerChanged.publish).not.toHaveBeenCalled();
  });

  it("is refused, not done on a guess, when the shipments or the quotes can't be asked", async () => {
    customers.getByIdForCompany.mockResolvedValue(live());
    uses.openQuotes.mockRejectedValueOnce(new Error("quotes down"));
    await expect(customerService.softDelete("c1", COMPANY)).rejects.toMatchObject({
      code: "unavailable",
      message: "Could not check whether Alfa s.r.o. still has shipments, open quotes or unpaid invoices, so it was not deleted: try again in a moment",
    });
    expect(customers.softDeleteWithChildren).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("is refused while invoicing says it still owes invoices (D24)", async () => {
    customers.getByIdForCompany.mockResolvedValue(live());
    uses.unpaidInvoices.mockResolvedValueOnce({ count: 2 });
    await expect(customerService.softDelete("c1", COMPANY)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Alfa s.r.o. can't be deleted while it still owes 2 invoices: set it Inactive instead",
    });
    expect(uses.unpaidInvoices).toHaveBeenCalledWith({ customerId: "c1" });
    expect(customers.softDeleteWithChildren).not.toHaveBeenCalled();
    expect(topics.customerChanged.publish).not.toHaveBeenCalled();
  });

  it("is refused, not done on a guess, when invoicing can't be asked", async () => {
    customers.getByIdForCompany.mockResolvedValue(live());
    uses.unpaidInvoices.mockRejectedValueOnce(new Error("invoicing down"));
    await expect(customerService.softDelete("c1", COMPANY)).rejects.toMatchObject({
      code: "unavailable",
      message: "Could not check whether Alfa s.r.o. still has shipments, open quotes or unpaid invoices, so it was not deleted: try again in a moment",
    });
    expect(customers.softDeleteWithChildren).not.toHaveBeenCalled();
  });

  it("goes ahead when nothing names it any more", async () => {
    customers.getByIdForCompany.mockResolvedValue(live());
    customers.softDeleteWithChildren.mockResolvedValue(live({ deletedAt: now }));
    await customerService.softDelete("c1", COMPANY);
    expect(customers.softDeleteWithChildren).toHaveBeenCalledWith("c1", COMPANY);
  });

  it("asks no other service about a customer that isn't live in the company", async () => {
    customers.getByIdForCompany.mockResolvedValue(null);
    await expect(customerService.softDelete("c1", COMPANY)).rejects.toThrow("Customer not found");
    expect(uses.shipments).not.toHaveBeenCalled();
    expect(customers.softDeleteWithChildren).not.toHaveBeenCalled();
  });
});

describe("adding a company the Customer Database has as deleted", () => {
  const CONTACT = { firstName: "Hans", lastName: "Müller", email: "hans@example.de" };
  const SIEMENS = { country: "DE", companyName: "Siemens AG", registrationNumber: "HRB 12345", street: "Wittelsbacherplatz 2", city: "München", postalCode: "80333", contact: CONTACT };

  it("is refused with a pointer to the restore, from ARES by its IČO, before ARES is asked; no duplicate is made", async () => {
    customers.findByIco.mockResolvedValue(null);
    customers.findDeletedByIco.mockResolvedValue({ id: "c1", companyName: "Alfa s.r.o.", approvalDecision: "" });
    await expect(customerService.createFromAres(COMPANY, "user", "12345678", CONTACT)).rejects.toMatchObject({
      code: "already_exists",
      message: "Alfa s.r.o. is in the Customer Database as deleted: a superadmin can restore it under Customer Database → Deleted instead of adding it again",
    });
    expect(customers.findDeletedByIco).toHaveBeenCalledWith("12345678", "CZ", COMPANY);
    expect(customers.createWithContact).not.toHaveBeenCalled();
  });

  it("is refused for a foreign company by its number in its own country's register", async () => {
    customers.findByIco.mockResolvedValue(null);
    customers.findDeletedByIco.mockResolvedValue({ id: "c1", companyName: "Siemens AG", approvalDecision: "" });
    await expect(customerService.createManual(COMPANY, "user", SIEMENS)).rejects.toThrow("Siemens AG is in the Customer Database as deleted");
    expect(customers.findDeletedByIco).toHaveBeenCalledWith("HRB 12345", "DE", COMPANY);
    expect(customers.createWithContact).not.toHaveBeenCalled();
  });

  it("points a declined new supplier to its undo too, and tells a company registering by link only to ask the sender", async () => {
    customers.findByIco.mockResolvedValue(null);
    customers.findDeletedByIco.mockResolvedValue({ id: "c1", companyName: "DANGO s.r.o.", approvalDecision: "declined" });
    await expect(customerService.createFromAres(COMPANY, "user", "12345678", CONTACT)).rejects.toThrow(
      "or a manager can undo its decline under Sales → Managers → Company approval",
    );
    const viaLink = { userId: "u1", quoteNumber: "", viaLink: { requestedBy: "rep@firm.cz" } };
    await expect(customerService.createManual(COMPANY, "", SIEMENS, viaLink)).rejects.toThrow(
      "This company can't be registered through this link: please contact whoever sent it to you",
    );
    expect(customers.createWithContact).not.toHaveBeenCalled();
  });

  it("gives a customer registered by link the link's creator as its sales owner; a supplier none (E13)", async () => {
    customers.findByIco.mockResolvedValue(null);
    customers.findDeletedByIco.mockResolvedValue(null);
    customers.createWithContact.mockResolvedValue({ id: "c9", createdAt: now, updatedAt: now });
    const viaLink = { userId: "u1", quoteNumber: "", viaLink: { requestedBy: "rep@firm.cz" } };
    await customerService.createManual(COMPANY, "", { ...SIEMENS, roles: ["customer"] }, viaLink);
    expect(customers.createWithContact).toHaveBeenLastCalledWith(
      COMPANY,
      expect.objectContaining({ salesOwner: "rep@firm.cz", salesOwnerUserId: "u1", approvalStatus: "pending" }),
      expect.anything(),
      expect.anything(),
    );
    await customerService.createManual(COMPANY, "", { ...SIEMENS, roles: ["haulier"] }, viaLink);
    expect(customers.createWithContact.mock.lastCall?.[1]).not.toHaveProperty("salesOwner");
  });

  it("goes ahead when only another country's register has the number deleted", async () => {
    customers.findByIco.mockResolvedValue(null);
    customers.findDeletedByIco.mockResolvedValue(null);
    customers.createWithContact.mockResolvedValue({ id: "c9", createdAt: now, updatedAt: now });
    await customerService.createManual(COMPANY, "user", SIEMENS);
    expect(customers.createWithContact).toHaveBeenCalled();
  });
});

describe("a new customer's sales owner (S16)", () => {
  const ME = "7a1f6b0e-2c3a-4f4a-9a53-5d0d3a2b6c11";
  const CONTACT = { firstName: "Hans", lastName: "Müller", email: "hans@example.de" };
  const SIEMENS = { country: "DE", companyName: "Siemens AG", street: "Wittelsbacherplatz 2", city: "München", postalCode: "80333", contact: CONTACT };
  const created = () => customers.createWithContact.mock.lastCall?.[1];

  beforeEach(() => {
    customers.findByIco.mockResolvedValue(null);
    customers.findDeletedByIco.mockResolvedValue(null);
    customers.createWithContact.mockResolvedValue({ id: "c9", createdAt: now, updatedAt: now });
  });

  const SALES = "d-sales";
  const OPERATIONS = "d-ops";
  const sitsIn = (departmentId: string | null) => {
    usersList.mockResolvedValue({ users: [{ id: ME, departmentId }] });
    departmentList.mockResolvedValue({ departments: [{ id: SALES, name: " Air Sales CZ " }, { id: OPERATIONS, name: "Sea export" }] });
  };

  it("is whoever added it when they sit in Sales, stored with their e-mail", async () => {
    sitsIn(SALES);
    userLookup.mockResolvedValue({ users: [{ id: ME, name: "Eva Malá", email: "Eva@Firm.cz", role: "user" }] });
    await customerService.createManual(COMPANY, "user", SIEMENS, undefined, ME);
    expect(userLookup).toHaveBeenCalledWith({ ids: [ME] });
    expect(created()).toMatchObject({ salesOwner: "eva@firm.cz", salesOwnerUserId: ME });
  });

  it("is a manager who added it, whatever their department (mock council R12)", async () => {
    sitsIn(OPERATIONS);
    userLookup.mockResolvedValue({ users: [{ id: ME, name: "Eva Malá", email: "eva@firm.cz", role: "manager" }] });
    await customerService.createManual(COMPANY, "manager", SIEMENS, undefined, ME);
    expect(created()).toMatchObject({ salesOwner: "eva@firm.cz", salesOwnerUserId: ME });
    expect(usersList).not.toHaveBeenCalled();
  });

  it("is nobody when a user outside Sales added it, or one in no department (mock council R12)", async () => {
    userLookup.mockResolvedValue({ users: [{ id: ME, name: "Eva Malá", email: "eva@firm.cz", role: "user" }] });
    sitsIn(OPERATIONS);
    await customerService.createManual(COMPANY, "user", SIEMENS, undefined, ME);
    expect(created()).not.toHaveProperty("salesOwner");
    sitsIn(null);
    await customerService.createManual(COMPANY, "user", SIEMENS, undefined, ME);
    expect(created()).not.toHaveProperty("salesOwner");
    expect(userLookup).not.toHaveBeenCalled();
  });

  it("is nobody for a supplier, a creator who is no user of the company, or a lookup that fails — never a refusal", async () => {
    sitsIn(SALES);
    userLookup.mockResolvedValue({ users: [{ id: ME, name: "Eva Malá", email: "eva@firm.cz", role: "manager" }] });
    await customerService.createManual(COMPANY, "manager", { ...SIEMENS, roles: ["haulier"] }, undefined, ME);
    expect(created()).not.toHaveProperty("salesOwner");
    userLookup.mockResolvedValue({ users: [] });
    await customerService.createManual(COMPANY, "user", SIEMENS, undefined, ME);
    expect(created()).not.toHaveProperty("salesOwner");
    await customerService.createManual(COMPANY, "user", SIEMENS, undefined, "not-a-user");
    expect(created()).not.toHaveProperty("salesOwner");
    userLookup.mockRejectedValue(new Error("auth down"));
    await customerService.createManual(COMPANY, "user", SIEMENS, undefined, ME);
    expect(created()).not.toHaveProperty("salesOwner");
    usersList.mockRejectedValueOnce(new Error("auth down"));
    await customerService.createManual(COMPANY, "user", SIEMENS, undefined, ME);
    expect(created()).not.toHaveProperty("salesOwner");
    expect(customers.createWithContact).toHaveBeenCalledTimes(5);
  });

  it("is the one picked in Add customer, or nobody when the pick is cleared (mock council R12)", async () => {
    const PICKED = "9d1f6b0e-2c3a-4f4a-9a53-5d0d3a2b6c11";
    userLookup.mockResolvedValue({ users: [{ id: PICKED, name: "Petr Rep", email: "Petr@Firm.cz", role: "user" }] });
    await customerService.createManual(COMPANY, "manager", { ...SIEMENS, salesOwnerUserId: PICKED }, undefined, ME);
    expect(userLookup).toHaveBeenCalledWith({ ids: [PICKED] });
    expect(created()).toMatchObject({ salesOwner: "petr@firm.cz", salesOwnerUserId: PICKED });
    sitsIn(SALES);
    await customerService.createManual(COMPANY, "manager", { ...SIEMENS, salesOwnerUserId: null }, undefined, ME);
    expect(created()).toMatchObject({ salesOwner: "", salesOwnerUserId: null });
  });

  // System-21 mock council review: who owns a customer is a manager's field - a user who is no manager picks only
  // themself or nobody on Add customer, a manager (or admin) anyone.
  it("lets a user who is no manager pick only themself or nobody", async () => {
    const PICKED = "9d1f6b0e-2c3a-4f4a-9a53-5d0d3a2b6c11";
    userLookup.mockResolvedValue({ users: [{ id: ME, name: "Eva Malá", email: "eva@firm.cz", role: "user" }, { id: PICKED, name: "Petr Rep", email: "petr@firm.cz", role: "user" }] });
    await expect(customerService.createManual(COMPANY, "user", { ...SIEMENS, salesOwnerUserId: PICKED }, undefined, ME)).rejects.toMatchObject({
      code: "permission_denied",
      message: OWNER_NOT_YOURS,
    });
    await expect(customerService.createManual(COMPANY, "user", { ...SIEMENS, salesOwnerUserId: PICKED }, undefined, undefined)).rejects.toMatchObject({ code: "permission_denied" });
    expect(customers.createWithContact).not.toHaveBeenCalled();
    await customerService.createManual(COMPANY, "user", { ...SIEMENS, salesOwnerUserId: ME }, undefined, ME);
    expect(created()).toMatchObject({ salesOwner: "eva@firm.cz", salesOwnerUserId: ME });
    await customerService.createManual(COMPANY, "user", { ...SIEMENS, salesOwnerUserId: null }, undefined, ME);
    expect(created()).toMatchObject({ salesOwner: "", salesOwnerUserId: null });
    await customerService.createManual(COMPANY, "admin", { ...SIEMENS, salesOwnerUserId: PICKED }, undefined, ME);
    expect(created()).toMatchObject({ salesOwnerUserId: PICKED });
  });

  it("refuses a pick that is no user of the company, and gives a supplier none whatever was picked", async () => {
    userLookup.mockResolvedValue({ users: [] });
    await expect(customerService.createManual(COMPANY, "user", { ...SIEMENS, salesOwnerUserId: ME }, undefined, ME)).rejects.toThrow(
      "salesOwnerUserId must be a user of the company",
    );
    expect(customers.createWithContact).not.toHaveBeenCalled();
    await customerService.createManual(COMPANY, "manager", { ...SIEMENS, roles: ["haulier"], salesOwnerUserId: ME }, undefined, ME);
    expect(created()).not.toHaveProperty("salesOwner");
  });

  it("tells a Sales department by its name", () => {
    for (const name of ["Sales", " sales CZ ", "Air Sales", "Sales & Marketing"]) expect(isSalesDepartment(name)).toBe(true);
    for (const name of ["Salesforce admin", "Wholesales", "Sea export", "", null, undefined]) expect(isSalesDepartment(name)).toBe(false);
  });

  it("keeps the link's creator for a customer registered by link", async () => {
    userLookup.mockResolvedValue({ users: [{ id: ME, name: "Eva Malá", email: "eva@firm.cz", role: "user" }] });
    const viaLink = { userId: "u1", quoteNumber: "", viaLink: { requestedBy: "rep@firm.cz" } };
    await customerService.createManual(COMPANY, "", SIEMENS, viaLink, ME);
    expect(created()).toMatchObject({ salesOwner: "rep@firm.cz", salesOwnerUserId: "u1" });
    expect(userLookup).not.toHaveBeenCalled();
  });
});

describe("a declined new supplier taken back", () => {
  const declined = (over: Record<string, unknown> = {}) => ({
    id: "c1", companyId: COMPANY, ico: "12345678", companyName: "DANGO s.r.o.", label: "TARGET CUSTOMER", roles: ["haulier"], registrationDate: null,
    lastActivityDate: null, logoData: "", createdAt: now, updatedAt: now, deletedAt: now, approvalStatus: "declined", approvalDecision: "declined", ...over,
  });

  it("comes back with what was deleted with it, waiting again, and the copies are told", async () => {
    customers.getDeletedForCompany.mockResolvedValue(declined());
    customers.findByIco.mockResolvedValue(null);
    customers.restoreWithChildren.mockResolvedValue(declined({ deletedAt: null, approvalStatus: "pending", approvalDecision: "" }));
    await customerService.undoDecline("c1", COMPANY);
    expect(customers.restoreWithChildren).toHaveBeenCalledWith("c1", COMPANY, "undoDecline");
    expect(topics.customerChanged.publish).toHaveBeenCalledWith(expect.objectContaining({ customerId: "c1", deleted: false }));
  });

  it("only for a company a manager declined and still deleted; a second click is refused", async () => {
    for (const found of [null, declined({ approvalStatus: "", approvalDecision: "" })]) {
      customers.getDeletedForCompany.mockResolvedValue(found);
      await expect(customerService.undoDecline("c1", COMPANY)).rejects.toMatchObject({ code: "failed_precondition" });
    }
    expect(customers.restoreWithChildren).not.toHaveBeenCalled();
    // Taken back by another manager in this very moment: the conditional write finds nothing.
    customers.getDeletedForCompany.mockResolvedValue(declined());
    customers.findByIco.mockResolvedValue(null);
    customers.restoreWithChildren.mockResolvedValue(null);
    await expect(customerService.undoDecline("c1", COMPANY)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(topics.customerChanged.publish).not.toHaveBeenCalled();
  });

  it("is refused while a live company has its registration number", async () => {
    customers.getDeletedForCompany.mockResolvedValue(declined());
    customers.findByIco.mockResolvedValue({ companyName: "DANGO nová s.r.o." });
    await expect(customerService.undoDecline("c1", COMPANY)).rejects.toThrow("DANGO nová s.r.o. already has the registration number 12345678, so DANGO s.r.o. can't be restored");
    expect(customers.restoreWithChildren).not.toHaveBeenCalled();
  });
});

describe("customer change events (shipments, quotes, follow-ups and trucking keep copies of the name)", () => {
  const saved = (over: Record<string, unknown> = {}) => ({
    id: "c1", companyId: COMPANY, companyName: "Alfa s.r.o.", label: "KEY ACCOUNT", roles: ["customer"], registrationDate: null,
    lastActivityDate: null, logoData: "", createdAt: now, updatedAt: now, deletedAt: null, ...over,
  });

  it("an edit sends the saved name and account type, after the write", async () => {
    customers.updateForCompany.mockResolvedValue(saved({ companyName: "Alfa Group s.r.o." }));
    await customerService.update("c1", COMPANY, "manager", { companyName: "Alfa Group s.r.o.", label: "KEY ACCOUNT" });
    expect(topics.customerChanged.publish).toHaveBeenCalledWith({
      companyId: COMPANY, customerId: "c1", companyName: "Alfa Group s.r.o.", label: "KEY ACCOUNT", deleted: false,
    });
    expect(customers.updateForCompany.mock.invocationCallOrder[0]).toBeLessThan(topics.customerChanged.publish.mock.invocationCallOrder[0]!);
  });

  it("any edit is sent, not only a new name (subscribers skip what is already current)", async () => {
    customers.updateForCompany.mockResolvedValue(saved());
    await customerService.update("c1", COMPANY, "user", { companyWebsite: "https://alfa.cz" });
    expect(topics.customerChanged.publish).toHaveBeenCalledTimes(1);
  });

  it("the name is stored trimmed, and a blank one is refused before anything is written or sent", async () => {
    customers.updateForCompany.mockResolvedValue(saved());
    await customerService.update("c1", COMPANY, "manager", { companyName: "  Alfa s.r.o. " });
    expect(customers.updateForCompany).toHaveBeenCalledWith("c1", COMPANY, { companyName: "Alfa s.r.o." });
    vi.clearAllMocks();
    await expect(customerService.update("c1", COMPANY, "manager", { companyName: "   " })).rejects.toThrow("The company name can't be empty");
    expect(customers.updateForCompany).not.toHaveBeenCalled();
    expect(topics.customerChanged.publish).not.toHaveBeenCalled();
  });

  it("nothing is sent for a customer that isn't there", async () => {
    customers.updateForCompany.mockResolvedValue(null);
    await expect(customerService.update("x", COMPANY, "manager", { companyName: "Beta" })).rejects.toThrow("Customer not found");
    customers.softDeleteWithChildren.mockResolvedValue(null);
    await expect(customerService.softDelete("x", COMPANY)).rejects.toThrow("Customer not found");
    customers.getDeletedForCompany.mockResolvedValue(saved({ deletedAt: now }));
    customers.findByIco.mockResolvedValue(null);
    customers.restoreWithChildren.mockResolvedValue(null);
    await expect(customerService.restore("x", COMPANY)).rejects.toThrow("Deleted customer not found");
    expect(topics.customerChanged.publish).not.toHaveBeenCalled();
  });

  it("a delete is sent with deleted: true, and each contact hidden with it gets its own delete event", async () => {
    customers.getByIdForCompany.mockResolvedValue(saved());
    customers.softDeleteWithChildren.mockResolvedValue(saved({ deletedAt: now }));
    contacts.hiddenWithCustomer.mockResolvedValueOnce([
      { id: "k1", customerId: "c1", name: "Petr Masák", email: "p@alfa.cz", phone: "+420 777 111 222" },
    ] as never);
    await customerService.softDelete("c1", COMPANY);
    expect(topics.customerChanged.publish).toHaveBeenCalledWith({
      companyId: COMPANY, customerId: "c1", companyName: "Alfa s.r.o.", label: "KEY ACCOUNT", deleted: true,
    });
    expect(contacts.hiddenWithCustomer).toHaveBeenCalledWith(COMPANY, "c1", now);
    expect(topics.contactChanged.publish).toHaveBeenCalledWith({
      companyId: COMPANY, customerId: "c1", contactId: "k1", name: "Petr Masák", email: "p@alfa.cz", phone: "+420 777 111 222", deleted: true,
    });
  });

  it("a delete done is not failed by its announcement: a contacts read that fails is only logged", async () => {
    customers.getByIdForCompany.mockResolvedValue(saved());
    customers.softDeleteWithChildren.mockResolvedValue(saved({ deletedAt: now }));
    contacts.hiddenWithCustomer.mockRejectedValueOnce(new Error("db down"));
    await expect(customerService.softDelete("c1", COMPANY)).resolves.toBeUndefined();
    expect(topics.customerChanged.publish).toHaveBeenCalledWith(expect.objectContaining({ customerId: "c1", deleted: true }));
    expect(logger.error).toHaveBeenCalled();
  });

  it("a restore is sent with deleted: false; one refused for a clashing registration number is not", async () => {
    customers.getDeletedForCompany.mockResolvedValue(saved({ ico: "12345678", deletedAt: now }));
    customers.findByIco.mockResolvedValue(null);
    customers.restoreWithChildren.mockResolvedValue(saved({ ico: "12345678" }));
    await customerService.restore("c1", COMPANY);
    expect(topics.customerChanged.publish).toHaveBeenCalledWith({
      companyId: COMPANY, customerId: "c1", companyName: "Alfa s.r.o.", label: "KEY ACCOUNT", deleted: false,
    });
    vi.clearAllMocks();
    customers.getDeletedForCompany.mockResolvedValue(saved({ ico: "12345678", deletedAt: now }));
    customers.findByIco.mockResolvedValue(null);
    customers.restoreWithChildren.mockRejectedValue(Object.assign(new Error("Failed query"), { cause: { code: "23505", constraint: "customer_company_country_ico_unique" } }));
    await expect(customerService.restore("c1", COMPANY)).rejects.toThrow("A customer with this registration number already exists");
    expect(topics.customerChanged.publish).not.toHaveBeenCalled();
  });

  it("a restore its addresses refuse - two of them the billing address - says so, not that the registration number clashes", async () => {
    customers.getDeletedForCompany.mockResolvedValue(saved({ ico: "12345678", deletedAt: now }));
    customers.findByIco.mockResolvedValue(null);
    customers.restoreWithChildren.mockRejectedValue(
      Object.assign(new Error("Failed query"), { cause: { code: "23505", constraint: "customer_address_one_billing" } }),
    );
    await expect(customerService.restore("c1", COMPANY)).rejects.toThrow("two of its addresses are its billing address");
    expect(topics.customerChanged.publish).not.toHaveBeenCalled();
  });

  it("an edit whose publish fails fails the request, so the user can save it again", async () => {
    customers.updateForCompany.mockResolvedValue(saved());
    topics.customerChanged.publish.mockRejectedValueOnce(new Error("pubsub down"));
    await expect(customerService.update("c1", COMPANY, "user", { companyWebsite: "https://alfa.cz" })).rejects.toThrow("pubsub down");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("a delete whose publish fails still succeeds (a retry would get 404); the failure is logged with the ids", async () => {
    customers.getByIdForCompany.mockResolvedValue(saved());
    customers.softDeleteWithChildren.mockResolvedValue(saved({ deletedAt: now }));
    const down = new Error("pubsub down");
    topics.customerChanged.publish.mockRejectedValueOnce(down);
    await expect(customerService.softDelete("c1", COMPANY)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(down, "customer change not published", { companyId: COMPANY, customerId: "c1", deleted: true });
  });

  it("a restore whose publish fails still returns the customer; the failure is logged with the ids", async () => {
    customers.getDeletedForCompany.mockResolvedValue(saved({ ico: "", deletedAt: now }));
    customers.restoreWithChildren.mockResolvedValue(saved({ ico: "" }));
    const down = new Error("pubsub down");
    topics.customerChanged.publish.mockRejectedValueOnce(down);
    await expect(customerService.restore("c1", COMPANY)).resolves.toMatchObject({ id: "c1", companyName: "Alfa s.r.o." });
    expect(logger.error).toHaveBeenCalledWith(down, "customer change not published", { companyId: COMPANY, customerId: "c1", deleted: false });
  });

  it("the manual form refuses a blank company name too", async () => {
    await expect(
      customerService.createManual(COMPANY, "user", {
        country: "DE", companyName: "   ", street: "Wittelsbacherplatz 2", city: "München", postalCode: "80333",
        contact: { firstName: "Hans", lastName: "Müller", email: "hans@example.de" },
      }),
    ).rejects.toThrow("The company name can't be empty");
    expect(customers.createWithContact).not.toHaveBeenCalled();
  });
});
