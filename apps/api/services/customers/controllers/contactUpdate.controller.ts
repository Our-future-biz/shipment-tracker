import { api, APIError } from "encore.dev/api";
import { contactService } from "../services/contact.service";
import type { ContactItem } from "../interfaces/interfaces";

interface ContactUpdateRequest {
  id: string;
  customerId: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
  isMain?: boolean;
}

interface ContactUpdateResponse {
  contact: ContactItem;
}

export const contactUpdate = api(
  { expose: true, auth: false, method: "PATCH", path: "/customer-contacts/:id" },
  async (req: ContactUpdateRequest): Promise<ContactUpdateResponse> => {
    const { id, customerId, ...input } = req;
    const contact = await contactService.update(id, customerId, input);
    if (!contact) {
      throw APIError.notFound("Contact not found");
    }
    return { contact: contact as unknown as ContactItem };
  },
);
