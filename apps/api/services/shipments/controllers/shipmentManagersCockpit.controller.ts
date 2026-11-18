import { APIError, api, type Query } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import type { OpsCockpitDirection, OpsCockpitMode, ShipmentsManagersCockpit } from "../interfaces/interfaces";
import { managersCockpitService } from "../services/managersCockpit.service";

const MODES: readonly OpsCockpitMode[] = ["all", "sea", "air", "rail", "road"];
const DIRECTIONS: readonly OpsCockpitDirection[] = ["all", "import", "export", "domestic"];

interface ShipmentManagersCockpitRequest {
  /** How the jobs travel: sea, air, rail or road; all of them when left out. */
  mode?: Query<string>;
  /** The jobs' Trade Direction: import, export or domestic; all of them when left out. */
  direction?: Query<string>;
  /** One person's jobs, by the e-mail in Handled By, or "nobody" for the jobs nobody handles; everyone's when left out. */
  handledBy?: Query<string>;
}

// Shipments → Managers (Council Outlay 11): what operations need from a manager today, counted
// over the company's active jobs by the rules the app already has. Read-only. For superadmins,
// admins and managers; the page polls it every minute.
export const shipmentManagersCockpit = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/managers-cockpit" },
  async ({ mode, direction, handledBy }: ShipmentManagersCockpitRequest): Promise<{ cockpit: ShipmentsManagersCockpit }> => {
    const { companyID } = requireRole("superadmin", "admin", "manager");
    const chosenMode = MODES.find((m) => m === (mode ?? "all"));
    if (!chosenMode) throw APIError.invalidArgument(`mode must be one of ${MODES.join(", ")}`);
    const chosenDirection = DIRECTIONS.find((d) => d === (direction ?? "all"));
    if (!chosenDirection) throw APIError.invalidArgument(`direction must be one of ${DIRECTIONS.join(", ")}`);
    return { cockpit: await managersCockpitService.cockpit(companyID, { mode: chosenMode, direction: chosenDirection, handledBy: handledBy?.trim() || null }) };
  },
);
