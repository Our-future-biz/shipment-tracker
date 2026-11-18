import log from "encore.dev/log";
import { holidays } from "~encore/clients";
import { addDays } from "../../../lib/businessDate";
import { HOLIDAY_WINDOW_DAYS } from "../lib/cockpitThresholds";

/**
 * The national Czech holidays the company uploaded, around today (lib/workingDays already knows
 * the statutory ones): read once per answer and handed to every working-day count - by Shipments →
 * Managers and by the Shipments list's Needs Attention alike, so both count the same working days.
 * The call names the company itself, as services/trucking/lib/czHolidays does. Null when it
 * failed: working days then skip only weekends and the statutory holidays, and the answer says so.
 */
export async function companyHolidays(companyId: string, today: string): Promise<string[] | null> {
  try {
    const authData = { userID: "", companyID: companyId, role: "user" };
    const { dates } = await holidays._internalHolidaysCzNational({ from: addDays(today, -HOLIDAY_WINDOW_DAYS), to: addDays(today, HOLIDAY_WINDOW_DAYS) }, { authData });
    return dates;
  } catch (err) {
    log.warn(err, "the company's holidays could not be read: working days skip weekends and the statutory holidays only");
    return null;
  }
}
