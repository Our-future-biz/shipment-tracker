import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { contactService } from "../services/contact.service";

interface ContactDeleteRequest {
  id: string;
}

interface ContactDeleteResponse {
  ok: boolean;
}

export const contactDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customer-contacts/:id" },
  async (req: ContactDeleteRequest): Promise<ContactDeleteResponse> => {
    await contactService.softDelete(req.id, getAuthData()!.companyID);
    return { ok: true };
  },
);
