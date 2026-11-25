import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import type { CoLoadingServiceItem, CoLoadingSettings, ServiceMoney, ServiceTrend } from "../interfaces/interfaces";
import { coLoadingSailingService } from "../services/coLoadingSailing.service";
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

// The company's Co-Loading settings: the share of a box's inside volume planned with. Read by everyone.
export const coLoadingSettingsGet = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/settings" },
  async (): Promise<CoLoadingSettings> => {
    const { companyID, role } = getAuthData()!;
    return service.settings(companyID, role);
  },
);

// A manager sets the planning share (50 to 100 percent); the boxes still to come are measured by it.
export const coLoadingSettingsSet = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/settings" },
  async ({ planningVolumePct }: { planningVolumePct: number }): Promise<CoLoadingSettings> => {
    return coLoadingSailingService.savePlanningPct(planningVolumePct, managers());
  },
);

// A manager sets the steps of the sailings' checklist, for "import" or for "export" services (at most 15 steps of 60 characters).
export const coLoadingSettingsChecklist = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/settings/checklist" },
  async ({ direction, steps }: { direction: string & MaxLen<10>; steps: (string & MaxLen<200>)[] & MaxLen<50> }): Promise<CoLoadingSettings> => {
    return service.saveChecklist(direction, steps, managers());
  },
);

// A service's money settings (Council Outlay 14, B4): the box costs a new sailing starts with, and the minimum earning per W/M. Managers only.
export const coLoadingServiceMoney = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/services/:id/money" },
  async ({ id }: { id: string }): Promise<ServiceMoney> => {
    return service.money(id, managers().companyID);
  },
);

interface ServiceMoneyRequest {
  id: string;
  /** One container's Origin Costs, Ocean Freight and Destination Costs; null for none */
  defaultBoxCosts: ({ kind: string & MaxLen<20>; amount: number | null; currency: string & MaxLen<3>; note: string & MaxLen<300> }[] & MaxLen<3>) | null;
  /** In EUR per W/M; null for none */
  minEarningPerWm: number | null;
}

// A manager sets them. Sailings that exist keep their own box costs.
export const coLoadingServiceMoneySet = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/services/:id/money" },
  async ({ id, defaultBoxCosts, minEarningPerWm }: ServiceMoneyRequest): Promise<ServiceMoney> => {
    return service.saveMoney(id, { defaultBoxCosts, minEarningPerWm }, managers().companyID);
  },
);

// The service's trend (Council Outlay 14, B5): its last sailings that have left, how full, what they made, whether they covered their box. Managers only.
export const coLoadingServiceTrend = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/services/:id/trend" },
  async ({ id }: { id: string }): Promise<ServiceTrend> => {
    return coLoadingSailingService.trend(id, managers().companyID);
  },
);

// A manager sets a lower cargo weight for the service's inland leg, or takes it off (null).
export const coLoadingServiceInlandWeight = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/services/:id/inland-weight" },
  async ({ id, inlandWeightKg }: { id: string; inlandWeightKg: number | null }): Promise<{ service: CoLoadingServiceItem }> => {
    return { service: await coLoadingSailingService.setInlandWeight(id, inlandWeightKg, managers().companyID) };
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
