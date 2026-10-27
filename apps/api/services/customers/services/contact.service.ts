import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { contactRepository } from "../repositories/contact.repository";
import type { NewContactRecord } from "../schemas/contact.schema";
import type { ContactItem, ContactRole } from "../interfaces/interfaces";
import { toContactItem } from "../lib/mappers";
import { customerService } from "./customer.service";
import { assertCzechPhone } from "../../../lib/phone";
import { contactChanged } from "../topics";
import type { ContactRecord } from "../schemas/contact.schema";

export interface ContactInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: ContactRole;
  isMain?: boolean;
}

// Tells the services that copy the contact's name, e-mail or phone (a shipment's Customer's PIC, open
// quotes, …). After the write and outside any transaction. An edit whose publish fails fails the
// request, so the user sees it and saves again. Lost events are repaired by the superadmin
// …/links/normalize backfills (shipments, quotes, sales, trucking, warehouse-concept).
async function announce(companyId: string, row: ContactRecord, deleted: boolean): Promise<void> {
  await contactChanged.publish({
    companyId, customerId: row.customerId, contactId: row.id, name: row.name, email: row.email, phone: row.phone, deleted,
  });
}

// A delete can't be saved again (a second try gets 404), so a failed publish after it is only logged.
async function announceDeleted(companyId: string, row: ContactRecord): Promise<void> {
  try {
    await announce(companyId, row, true);
  } catch (err) {
    log.error(err, "contact delete not published", { companyId, customerId: row.customerId, contactId: row.id });
  }
}

export const fullName = (firstName: string, lastName: string) => [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

/** The trimmed name parts and the full name; both parts are required, as for a new customer's first contact. */
export function contactNames(firstName: string, lastName: string): { firstName: string; lastName: string; name: string } {
  const first = firstName.trim();
  const last = lastName.trim();
  // Other services copy the full name from the change event, so it is never blank or half a name.
  if (!first || !last) throw APIError.invalidArgument("The contact person needs a first and a last name");
  return { firstName: first, lastName: last, name: fullName(first, last) };
}

class ContactService {
  async listByCustomer(customerId: string, companyId: string): Promise<ContactItem[]> {
    return (await contactRepository.findByCustomer(customerId, companyId)).map(toContactItem);
  }

  async create(companyId: string, customerId: string, input: ContactInput): Promise<ContactItem> {
    const names = contactNames(input.firstName, input.lastName);
    assertCzechPhone(input.phone);
    await customerService.requireLive(customerId, companyId);
    if (input.isMain) await contactRepository.clearMainFlag(customerId, companyId);
    const values: Omit<NewContactRecord, "companyId"> = {
      customerId,
      ...names,
      email: input.email ?? "",
      phone: input.phone ?? "",
      role: input.role ?? "Logistics Manager",
      isMain: input.isMain ?? false,
    };
    const row = await contactRepository.createForCompany(companyId, values);
    return toContactItem(row);
  }

  // The contact's own customer is used (not one sent by the client), so making it the main
  // contact can only clear the flag on that customer's other contacts.
  async update(id: string, companyId: string, input: Partial<ContactInput>): Promise<ContactItem> {
    const existing = await contactRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound("Contact not found");
    const patch: Partial<NewContactRecord> = {};
    // A rename needs both parts; an old one-word contact keeps its name through other edits.
    if (input.firstName !== undefined || input.lastName !== undefined) {
      Object.assign(patch, contactNames(input.firstName ?? existing.firstName, input.lastName ?? existing.lastName));
    }
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) {
      assertCzechPhone(input.phone);
      patch.phone = input.phone;
    }
    if (input.role !== undefined) patch.role = input.role;
    if (input.isMain !== undefined) patch.isMain = input.isMain;
    // Only after the checks above, so a refused edit changes nothing.
    if (input.isMain) await contactRepository.clearMainFlag(existing.customerId, companyId);
    const row = await contactRepository.updateForCompany(id, companyId, patch);
    if (!row) throw APIError.notFound("Contact not found");
    await announce(companyId, row, false);
    return toContactItem(row);
  }

  // The event carries the name, e-mail and phone the contact had when it was deleted.
  async softDelete(id: string, companyId: string): Promise<void> {
    const row = await contactRepository.softDeleteForCompany(id, companyId);
    if (!row) throw APIError.notFound("Contact not found");
    await announceDeleted(companyId, row);
  }
}

export const contactService = new ContactService();
