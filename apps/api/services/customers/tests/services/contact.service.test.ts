import { beforeEach, describe, expect, it, vi } from "vitest";

// What a contact edit or delete tells the services that copy the contact (a shipment's Customer's
// PIC, open quotes, …). The service runs for real against stand-ins for the repository and topics.
vi.mock("encore.dev/config", () => ({ secret: () => () => "test-secret" }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("../../db/db", () => ({ db: {} }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: logger }));
vi.mock("~encore/clients", () => ({ auth: { userLookup: vi.fn() } }));
vi.mock("../../services/ares.service", () => ({ aresService: { lookup: vi.fn() } }));
const contacts = vi.hoisted(() => ({
  getByIdForCompany: vi.fn(),
  clearMainFlag: vi.fn(),
  updateForCompany: vi.fn(),
  softDeleteForCompany: vi.fn(),
}));
vi.mock("../../repositories/contact.repository", () => ({ contactRepository: contacts }));
vi.mock("../../repositories/customer.repository", () => ({ customerRepository: {} }));
const topics = vi.hoisted(() => ({ customerChanged: { publish: vi.fn() }, contactChanged: { publish: vi.fn() } }));
vi.mock("../../topics", () => topics);

import { contactService } from "../../services/contact.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const now = new Date("2026-10-26T08:00:00Z");
const contactRow = (over: Record<string, unknown> = {}) => ({
  id: "k1", customerId: "c1", companyId: COMPANY, name: "Petr", firstName: "Petr", lastName: "", email: "petr@alfa.cz", phone: "+420 777 123 456",
  role: "Logistics Manager", isMain: true, createdAt: now, updatedAt: now, deletedAt: null, ...over,
});

beforeEach(() => vi.resetAllMocks());

describe("a contact's change event", () => {
  it("a rename sends the saved full name, e-mail and phone, after the write", async () => {
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    contacts.updateForCompany.mockResolvedValue(contactRow({ name: "Petr Masák", lastName: "Masák" }));
    await contactService.update("k1", COMPANY, { lastName: "Masák" });
    expect(topics.contactChanged.publish).toHaveBeenCalledWith({
      companyId: COMPANY, customerId: "c1", contactId: "k1", name: "Petr Masák", email: "petr@alfa.cz", phone: "+420 777 123 456", deleted: false,
    });
    expect(contacts.updateForCompany.mock.invocationCallOrder[0]).toBeLessThan(topics.contactChanged.publish.mock.invocationCallOrder[0]!);
    expect(topics.customerChanged.publish).not.toHaveBeenCalled();
  });

  it("goes out for any edit, a new e-mail as much as a new name", async () => {
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    contacts.updateForCompany.mockResolvedValue(contactRow({ email: "petr.masak@alfa.cz" }));
    await contactService.update("k1", COMPANY, { email: "petr.masak@alfa.cz" });
    expect(topics.contactChanged.publish).toHaveBeenCalledWith(expect.objectContaining({ email: "petr.masak@alfa.cz", deleted: false }));
  });

  it("a delete sends the contact's last name, e-mail and phone with deleted: true", async () => {
    contacts.softDeleteForCompany.mockResolvedValue(contactRow({ deletedAt: now }));
    await contactService.softDelete("k1", COMPANY);
    expect(contacts.softDeleteForCompany).toHaveBeenCalledWith("k1", COMPANY);
    expect(topics.contactChanged.publish).toHaveBeenCalledWith({
      companyId: COMPANY, customerId: "c1", contactId: "k1", name: "Petr", email: "petr@alfa.cz", phone: "+420 777 123 456", deleted: true,
    });
  });

  it("nothing is sent for a contact that isn't there, or for an edit that is refused", async () => {
    contacts.getByIdForCompany.mockResolvedValue(null);
    await expect(contactService.update("x", COMPANY, { firstName: "Jan" })).rejects.toThrow("Contact not found");
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    contacts.updateForCompany.mockResolvedValue(null);
    await expect(contactService.update("k1", COMPANY, { firstName: "Jan", lastName: "Masák" })).rejects.toThrow("Contact not found");
    await expect(contactService.update("k1", COMPANY, { phone: "+420 12" })).rejects.toThrow("exactly 9 digits");
    // The event never carries a blank or half name.
    await expect(contactService.update("k1", COMPANY, { firstName: " ", lastName: "Masák" })).rejects.toMatchObject({ code: "invalid_argument" });
    contacts.softDeleteForCompany.mockResolvedValue(null);
    await expect(contactService.softDelete("x", COMPANY)).rejects.toThrow("Contact not found");
    expect(topics.contactChanged.publish).not.toHaveBeenCalled();
  });

  it("an edit whose publish fails fails the request, so the user can save it again", async () => {
    contacts.getByIdForCompany.mockResolvedValue(contactRow());
    contacts.updateForCompany.mockResolvedValue(contactRow({ email: "petr.masak@alfa.cz" }));
    topics.contactChanged.publish.mockRejectedValue(new Error("pubsub down"));
    await expect(contactService.update("k1", COMPANY, { email: "petr.masak@alfa.cz" })).rejects.toThrow("pubsub down");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("a delete whose publish fails still succeeds (a retry would get 404); the failure is logged with the ids", async () => {
    contacts.softDeleteForCompany.mockResolvedValue(contactRow({ deletedAt: now }));
    const down = new Error("pubsub down");
    topics.contactChanged.publish.mockRejectedValue(down);
    await expect(contactService.softDelete("k1", COMPANY)).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(down, "contact delete not published", { companyId: COMPANY, customerId: "c1", contactId: "k1" });
  });
});
