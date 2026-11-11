import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { holidaysService } from "../services/holidays.service";

interface HolidayDeleteRequest {
  id: string;
}

interface HolidayDeleteResponse {
  ok: boolean;
}

export const holidayDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/holidays/:id" },
  async (req: HolidayDeleteRequest): Promise<HolidayDeleteResponse> => {
    // Managers only: the company's holidays move every lead time in Trucking.
    await holidaysService.remove(req.id, requireRole("superadmin", "admin", "manager").companyID);
    return { ok: true };
  },
);
