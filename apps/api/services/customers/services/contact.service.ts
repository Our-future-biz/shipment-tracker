import { contactRepository } from "../repositories/contact.repository";

interface ContactInput {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isMain?: boolean;
}

class ContactService {
  async listByCustomer(customerId: string, companyId: string) {
    return contactRepository.findByCustomer(customerId, companyId);
  }

  async create(companyId: string, customerId: string, input: ContactInput) {
    if (input.isMain) await contactRepository.clearMainFlag(customerId, companyId);
    return contactRepository.createForCompany(companyId, {
      customerId,
      name: input.name,
      email: input.email ?? "",
      phone: input.phone ?? "",
      role: input.role ?? "Operations",
      isMain: input.isMain ?? false,
    } as never);
  }

  async update(id: string, companyId: string, customerId: string, input: Partial<ContactInput>) {
    if (input.isMain) await contactRepository.clearMainFlag(customerId, companyId);
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) patch[key] = value;
    }
    return contactRepository.updateForCompany(id, companyId, patch as never);
  }

  async softDelete(id: string, companyId: string) {
    return contactRepository.softDeleteForCompany(id, companyId);
  }
}

export const contactService = new ContactService();
