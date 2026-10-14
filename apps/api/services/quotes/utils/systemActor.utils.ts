import { APIError } from "encore.dev/api";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";

/**
 * Who acts in an internal call that carries no login - the hourly reconcile of the shipments
 * service: the system, for the company the call names. Only internal endpoints (expose: false)
 * take this path; under a login the company is always the caller's.
 */
export function systemActor(companyId: string | undefined): Actor {
  if (!companyId || !isUuid(companyId)) throw APIError.invalidArgument("an internal call without a login must name its company");
  return { userID: "", companyID: companyId, role: "system" };
}
