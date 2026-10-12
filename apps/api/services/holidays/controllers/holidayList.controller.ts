import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { holidaysService } from "../services/holidays.service";
import type { HolidayItem } from "../interfaces/interfaces";

interface HolidayListResponse {
  holidays: HolidayItem[];
}

export const holidayList = api(
  { expose: true, auth: true, method: "GET", path: "/holidays" },
  async (): Promise<HolidayListResponse> => {
    return { holidays: await holidaysService.list(getAuthData()!.companyID) };
  },
);
