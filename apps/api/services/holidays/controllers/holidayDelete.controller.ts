import { api, APIError } from "encore.dev/api";
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
    const row = await holidaysService.remove(req.id, getAuthData()!.companyID);
    if (!row) throw APIError.notFound("Holiday not found");
    return { ok: true };
  },
);
