import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { contactService } from "../services/contact.service";
import type { ContactItem, ContactRole } from "../interfaces/interfaces";

interface ContactUpdateRequest {
  id: string;
  /** Ignored: the contact's own customer is used. Kept so existing clients still validate. */
  customerId?: string;
  firstName?: string & MinLen<1> & MaxLen<100>;
  lastName?: string & MinLen<1> & MaxLen<100>;
  email?: string & MaxLen<320>;
  phone?: string & MaxLen<50>;
  role?: ContactRole;
  isMain?: boolean;
}

interface ContactUpdateResponse {
  contact: ContactItem;
}

export const contactUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/customer-contacts/:id" },
  async ({ id, customerId: _ignored, ...input }: ContactUpdateRequest): Promise<ContactUpdateResponse> => {
    return { contact: await contactService.update(id, getAuthData()!.companyID, input) };
  },
);
