import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { contactService } from "../services/contact.service";
import type { ContactItem } from "../interfaces/interfaces";

interface ContactCreateRequest {
  customerId: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  isMain?: boolean;
}

interface ContactCreateResponse {
  contact: ContactItem;
}

export const contactCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:customerId/contacts" },
  async (req: ContactCreateRequest): Promise<ContactCreateResponse> => {
    if (!req.name) {
      throw APIError.invalidArgument("name is required");
    }
    const { customerId, ...input } = req;
    const contact = await contactService.create(getAuthData()!.companyID, customerId, input);
    return { contact: contact as unknown as ContactItem };
  },
);
