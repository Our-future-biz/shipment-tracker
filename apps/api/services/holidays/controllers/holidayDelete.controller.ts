import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
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
    await holidaysService.remove(req.id, getAuthData()!.companyID);
    return { ok: true };
  },
);
