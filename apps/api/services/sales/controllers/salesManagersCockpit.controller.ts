import { APIError, api, type Query } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { SALES_MANAGE_ROLES } from "../../../lib/salesPolicy";
import type { SalesCockpitMode, SalesManagersCockpit } from "../interfaces/interfaces";
import { managersCockpitService } from "../services/managersCockpit.service";

const MODES: readonly SalesCockpitMode[] = ["all", "sea", "air", "rail", "road"];

interface SalesManagersCockpitRequest {
  /** One freight mode (Sea = FCL, LCL and Break Bulk), or all of them when left out. */
  mode?: Query<string>;
}

// Sales → Managers (Council Outlay 6): what the sales team needs from a manager today, counted
// over the company's quotes and follow-up tasks. For those who manage Sales (superadmin, admin,
// manager); the page polls it every minute.
export const salesManagersCockpit = api(
  { expose: true, auth: true, method: "GET", path: "/sales/managers/cockpit" },
  async ({ mode }: SalesManagersCockpitRequest): Promise<{ cockpit: SalesManagersCockpit }> => {
    const { companyID } = requireRole(...SALES_MANAGE_ROLES);
    const chosen = MODES.find((m) => m === (mode ?? "all"));
    if (!chosen) throw APIError.invalidArgument(`mode must be one of ${MODES.join(", ")}`);
    return { cockpit: await managersCockpitService.cockpit(companyID, chosen) };
  },
);
