import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { USER_LOOKUP_UNAVAILABLE } from "../../../lib/companyUsers";

/**
 * The name a record keeps of who did something (asked, answered, dismissed), as they are named now: it stays
 * when they leave. A superadmin working as this company is found in their own. "" only when there is no such
 * user. When the lookup fails it throws unavailable, as userEmailOf (lib/companyUsers) does: the record keeps
 * the name for good - in a release's override reason, the audit list, the dismissals' list - so the write is
 * refused, to be tried again, rather than made with no name.
 */
export async function userNameOf(userId: string): Promise<string> {
  try {
    const { users } = await auth.userLookup({ ids: [userId], selfInOwnCompany: true });
    return users[0]?.name ?? "";
  } catch (err) {
    log.warn(err, "user name could not be looked up", { userId });
    throw APIError.unavailable(USER_LOOKUP_UNAVAILABLE);
  }
}
