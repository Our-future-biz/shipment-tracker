import { APIError } from "encore.dev/api";
import { contactRepository } from "../repositories/contact.repository";
import type { NewContactRecord } from "../schemas/contact.schema";
import type { ContactItem, ContactRole } from "../interfaces/interfaces";
import { toContactItem } from "../lib/mappers";
import { customerService } from "./customer.service";

export interface ContactInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  role?: ContactRole;
  isMain?: boolean;
}

export const fullName = (firstName: string, lastName: string) => [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");

class ContactService {
  async listByCustomer(customerId: string, companyId: string): Promise<ContactItem[]> {
    return (await contactRepository.findByCustomer(customerId, companyId)).map(toContactItem);
  }

  async create(companyId: string, customerId: string, input: ContactInput): Promise<ContactItem> {
    await customerService.requireLive(customerId, companyId);
    if (input.isMain) await contactRepository.clearMainFlag(customerId, companyId);
    const values: Omit<NewContactRecord, "companyId"> = {
      customerId,
      name: fullName(input.firstName, input.lastName),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
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
    if (input.isMain) await contactRepository.clearMainFlag(existing.customerId, companyId);
    const patch: Partial<NewContactRecord> = {};
    if (input.firstName !== undefined || input.lastName !== undefined) {
      patch.firstName = (input.firstName ?? existing.firstName).trim();
      patch.lastName = (input.lastName ?? existing.lastName).trim();
      patch.name = fullName(patch.firstName, patch.lastName);
    }
    if (input.email !== undefined) patch.email = input.email;
    if (input.phone !== undefined) patch.phone = input.phone;
    if (input.role !== undefined) patch.role = input.role;
    if (input.isMain !== undefined) patch.isMain = input.isMain;
    const row = await contactRepository.updateForCompany(id, companyId, patch);
    if (!row) throw APIError.notFound("Contact not found");
    return toContactItem(row);
  }

  async softDelete(id: string, companyId: string): Promise<void> {
    if (!(await contactRepository.softDeleteForCompany(id, companyId))) throw APIError.notFound("Contact not found");
  }
}

export const contactService = new ContactService();
