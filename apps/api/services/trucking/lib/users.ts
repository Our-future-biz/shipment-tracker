import { userRefs } from "../../../lib/userNames";

/** Display name of a user for the event log; "" when unknown (a failed lookup is logged by userRefs). */
export async function userName(userId: string): Promise<string> {
  if (!userId) return "";
  return (await userRefs([userId])).get(userId)?.name ?? "";
}
