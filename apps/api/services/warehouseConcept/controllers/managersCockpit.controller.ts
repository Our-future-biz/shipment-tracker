import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import type { WarehouseManagersCockpit } from "../interfaces/cockpit.interfaces";
import { managersCockpitService } from "../services/managersCockpit.service";

// The managers' cockpit (Warehouse Concept → Managers): what is urgent in the warehouse or may
// turn into an issue, counted over every record of the company. Managers only (the same roles as
// the supervisor override); the page polls it every minute.
export const warehouseManagersCockpit = api(
  { expose: true, auth: true, method: "GET", path: "/warehouse-concept/managers/cockpit" },
  async (): Promise<{ cockpit: WarehouseManagersCockpit }> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    return { cockpit: await managersCockpitService.cockpit(companyID) };
  },
);
