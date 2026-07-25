import { api } from "encore.dev/api";
import { contactService } from "../services/contact.service";
import type { ContactItem } from "../interfaces/interfaces";

interface ContactListRequest {
  customerId: string;
}

interface ContactListResponse {
  data: ContactItem[];
}

export const contactList = api(
  { expose: true, auth: false, method: "GET", path: "/customers/:customerId/contacts" },
  async (req: ContactListRequest): Promise<ContactListResponse> => {
    const data = await contactService.listByCustomer(req.customerId);
    return { data: data as unknown as ContactItem[] };
  },
);
