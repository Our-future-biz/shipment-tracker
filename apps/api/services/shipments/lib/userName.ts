import log from "encore.dev/log";
import { auth } from "~encore/clients";

/**
 * The name a record keeps of who did something (asked, answered, dismissed), as they are named now: it stays
 * when they leave. A superadmin working as this company is found in their own. A failed look-up doesn't stop
 * the write: the record then keeps the user's id alone and "" for the name.
 */
export async function userNameOf(userId: string): Promise<string> {
  try {
    const { users } = await auth.userLookup({ ids: [userId], selfInOwnCompany: true });
    return users[0]?.name ?? "";
  } catch (err) {
    log.warn(err, "user name not resolved", { userId });
    return "";
  }
}
