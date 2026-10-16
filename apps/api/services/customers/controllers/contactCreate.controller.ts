import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { contactService } from "../services/contact.service";
import type { ContactItem, ContactRole } from "../interfaces/interfaces";

interface ContactCreateRequest {
  customerId: string;
  firstName: string & MinLen<1> & MaxLen<100>;
  lastName: string & MinLen<1> & MaxLen<100>;
  email?: string & MaxLen<320>;
  phone?: string & MaxLen<50>;
  role?: ContactRole;
  isMain?: boolean;
}

interface ContactCreateResponse {
  contact: ContactItem;
}

export const contactCreate = api(
  { expose: true, auth: true, method: "POST", path: "/customers/:customerId/contacts" },
  async ({ customerId, ...input }: ContactCreateRequest): Promise<ContactCreateResponse> => {
    return { contact: await contactService.create(getAuthData()!.companyID, customerId, input) };
  },
);
