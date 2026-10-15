import { holidays } from "~encore/clients";

// The national Czech holidays a company uploaded, for the working-day counts (lib/workingDays.ts
// already knows the statutory ones). The call names the company itself, so it works the same in a
// user's request, a pub/sub handler (the warehouse gate) or the outbox, which carry no login.
export async function czHolidays(companyId: string, from: string, to: string, userId = ""): Promise<string[]> {
  const authData = { userID: userId, companyID: companyId, role: "user" };
  const { dates } = await holidays._internalHolidaysCzNational({ from, to }, { authData });
  return dates;
}
