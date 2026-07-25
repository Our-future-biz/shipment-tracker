import { contactRepository } from "../repositories/contact.repository";

interface ContactInput {
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isMain?: boolean;
}

class ContactService {
  async listByCustomer(customerId: string) {
    return contactRepository.findByCustomer(customerId);
  }

  async create(customerId: string, input: ContactInput) {
    if (input.isMain) await contactRepository.clearMainFlag(customerId);
    return contactRepository.create({
      customerId,
      name: input.name,
      email: input.email ?? "",
      phone: input.phone ?? "",
      role: input.role ?? "Operations",
      isMain: input.isMain ?? false,
    } as never);
  }

  async update(id: string, customerId: string, input: Partial<ContactInput>) {
    if (input.isMain) await contactRepository.clearMainFlag(customerId);
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) patch[key] = value;
    }
    return contactRepository.update(id, patch as never);
  }

  async softDelete(id: string) {
    return contactRepository.softDelete(id);
  }
}

export const contactService = new ContactService();
