import log from "encore.dev/log";
import { companyUsers } from "../../../lib/companyUsers";

/**
 * The e-mails of the caller's company's users, by user id: who wrote, uploaded or reviewed
 * something is shown by e-mail, as every person is (owner decision, 26 Oct 2026). Users live in
 * the auth service, so they are read in one call and mapped in memory. A failed call must not
 * fail the request: it is logged and gives an empty map, and callers show their own placeholder.
 */
export async function userEmails(): Promise<Map<string, string>> {
  try {
    return new Map((await companyUsers()).map((u) => [u.id, u.email]));
  } catch (err) {
    log.warn(err, "user e-mails could not be loaded");
    return new Map();
  }
}
