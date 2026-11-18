import { APIError, api, type Query } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import type { ManagersAuditList } from "../interfaces/interfaces";
import { AUDIT_KEYS, isAuditKey } from "../lib/managersCockpitAudit";
import { managersAuditRows } from "../services/managersCockpitAudit.service";
import { cockpitUsers } from "../services/managersCockpitTeam.service";

interface ShipmentManagersAuditRequest {
  /** Which figure of the audit line: one of its keys (prepayment_release, own_credit_check, deleted…). */
  key: Query<string>;
}

// Shipments → Managers, the audit line's drill-down (Council Outlay 11, D23): the rows one of its
// counts stands for - which job, who, when and what - over the same seven days, the newest first,
// at most 200 (`capped` says when there were more). Read-only, the company's own rows; for
// superadmins, admins and managers, as the page itself.
export const shipmentManagersAudit = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/managers-audit" },
  async ({ key }: ShipmentManagersAuditRequest): Promise<ManagersAuditList> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    if (!isAuditKey(key)) throw APIError.invalidArgument(`key must be one of ${AUDIT_KEYS.join(", ")}`);
    // Who did it is shown by e-mail; without the users the rows are still listed, their "who" empty.
    const users = await cockpitUsers();
    return managersAuditRows(companyID, key, new Date(), users && new Map(users.map((u) => [u.id, u.email])));
  },
);
