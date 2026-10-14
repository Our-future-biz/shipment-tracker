import { api } from "encore.dev/api";
import { authService } from "../services/auth.service";
import type { AdminContact } from "../interfaces/interfaces";

interface AdminContactsResponse {
  admins: AdminContact[];
}

// Internal only (other services, e.g. the ČNB rate alert): who receives system alerts.
// Not exposed to the web — it lists users across companies.
export const adminContacts = api(
  { expose: false, method: "GET", path: "/auth/internal/admin-contacts" },
  async (): Promise<AdminContactsResponse> => ({ admins: await authService.adminContacts() }),
);
