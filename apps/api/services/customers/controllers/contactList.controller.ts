import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { contactService } from "../services/contact.service";
import type { ContactItem } from "../interfaces/interfaces";

interface ContactListRequest {
  customerId: string;
}

interface ContactListResponse {
  data: ContactItem[];
}

export const contactList = api(
  { expose: true, auth: true, method: "GET", path: "/customers/:customerId/contacts" },
  async (req: ContactListRequest): Promise<ContactListResponse> => {
    return { data: await contactService.listByCustomer(req.customerId, getAuthData()!.companyID) };
  },
);
