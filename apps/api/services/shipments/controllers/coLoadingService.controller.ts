import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import type { CoLoadingServiceItem } from "../interfaces/interfaces";
import { coLoadingServiceService as service } from "../services/coLoadingService.service";

// Co-Loading Concept's services (lib/coLoadingService). Everyone in the company works in them; managers
// and higher make them (New Service), close and reopen them (CO_LOADING_MANAGER_ROLES).
const managers = () => requireRole("superadmin", "admin", "manager");

// The company's services, the oldest first: the module's tiles. Closed ones for managers only.
export const coLoadingServiceList = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/services" },
  async (): Promise<{ data: CoLoadingServiceItem[] }> => {
    const { companyID, role } = getAuthData()!;
    return { data: await service.list(companyID, role) };
  },
);

export const coLoadingServiceGet = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/services/:id" },
  async ({ id }: { id: string }): Promise<CoLoadingServiceItem> => {
    return service.get(id, getAuthData()!.companyID);
  },
);

interface CoLoadingServiceCreateRequest {
  name: string & MaxLen<200>;
  /** A shipment's Service Name: ISHA | Domestic */
  serviceName: string & MaxLen<50>;
  /** weekly | bi_weekly | ad_hoc */
  frequency: string & MaxLen<20>;
  /** import | export */
  direction: string & MaxLen<20>;
  /** sea_lcl | sea_fcl | air | rail | road */
  mode: string & MaxLen<20>;
  origin?: string & MaxLen<200>;
  destination?: string & MaxLen<200>;
  note?: string & MaxLen<1000>;
}

// A new service, with New Service, by a manager. A name the company has already is refused.
export const coLoadingServiceCreate = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/services" },
  async (req: CoLoadingServiceCreateRequest): Promise<{ service: CoLoadingServiceItem }> => {
    return { service: await service.create(req, managers()) };
  },
);

// A manager closes a service: its tile is hidden from users, nothing new goes in until it is reopened.
export const coLoadingServiceClose = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/services/:id/close" },
  async ({ id }: { id: string }): Promise<{ service: CoLoadingServiceItem }> => {
    return { service: await service.close(id, managers()) };
  },
);

// A manager reopens a closed service.
export const coLoadingServiceReopen = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/services/:id/reopen" },
  async ({ id }: { id: string }): Promise<{ service: CoLoadingServiceItem }> => {
    return { service: await service.reopen(id, managers().companyID) };
  },
);
