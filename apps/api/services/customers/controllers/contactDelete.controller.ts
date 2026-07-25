import { api } from "encore.dev/api";
import { contactService } from "../services/contact.service";

interface ContactDeleteRequest {
  id: string;
}

interface ContactDeleteResponse {
  ok: boolean;
}

export const contactDelete = api(
  { expose: true, auth: false, method: "DELETE", path: "/customer-contacts/:id" },
  async (req: ContactDeleteRequest): Promise<ContactDeleteResponse> => {
    await contactService.softDelete(req.id);
    return { ok: true };
  },
);
