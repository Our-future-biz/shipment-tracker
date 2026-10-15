import { api, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { holidaysService } from "../services/holidays.service";

interface HolidaysCzNationalRequest {
  from: Query<string>; // YYYY-MM-DD
  to: Query<string>; // YYYY-MM-DD, inclusive
}

interface HolidaysCzNationalResponse {
  /** Each day, YYYY-MM-DD, sorted. */
  dates: string[];
}

/**
 * Internal API of the holidays service: the national Czech holidays the caller's company
 * uploaded (country code CZ, no regions) between two days. Callers pass them as extra
 * holidays to lib/workingDays.ts, which already knows the statutory ones.
 */
export const _internalHolidaysCzNational = api(
  { expose: false, auth: true, method: "GET", path: "/internal/holidays/cz-national" },
  async (req: HolidaysCzNationalRequest): Promise<HolidaysCzNationalResponse> => {
    return { dates: await holidaysService.czNationalDates(getAuthData()!.companyID, req.from, req.to) };
  },
);
