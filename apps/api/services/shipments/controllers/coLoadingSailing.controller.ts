import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import type { BoxCostChange, BoxUtilization, CoLoadingSailingItem, SailingEarnings, SailingProfit, SailingRemovedShipment } from "../interfaces/interfaces";
import { coLoadingSailingService as service } from "../services/coLoadingSailing.service";

// A Co-Loading Concept service's sailings (lib/coLoadingSailing), for everyone in the company.

// The service's sailings, the newest first: the Sailings list on its page.
export const coLoadingSailingList = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/services/:id/sailings" },
  async ({ id }: { id: string }): Promise<{ data: CoLoadingSailingItem[] }> => {
    return { data: await service.list(id, getAuthData()!.companyID) };
  },
);

// One sailing, opened from the service's Sailings list.
export const coLoadingSailingGet = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id" },
  async ({ id }: { id: string }): Promise<CoLoadingSailingItem> => {
    return service.page(id, getAuthData()!.companyID);
  },
);

// Box utilization: how full the sailing's box is by volume and by weight, with each linked shipment's part.
export const coLoadingSailingUtilization = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/utilization" },
  async ({ id }: { id: string }): Promise<BoxUtilization> => {
    return service.utilization(id, getAuthData()!.companyID);
  },
);

// Earnings: what the sailing's shipments sell for and cost of their own, from their Costs Breakdown.
// For managers and admins only (Council Outlay 13, decision D14).
export const coLoadingSailingEarnings = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/earnings" },
  async ({ id }: { id: string }): Promise<SailingEarnings> => {
    return service.earnings(id, requireRole("superadmin", "admin", "manager").companyID);
  },
);

// The profit of each of the service's sailings, for the list of sailings. Managers and admins only (D19).
export const coLoadingSailingProfits = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/services/:id/sailing-profits" },
  async ({ id }: { id: string }): Promise<{ data: SailingProfit[] }> => {
    return { data: await service.profits(id, requireRole("superadmin", "admin", "manager").companyID) };
  },
);

interface BoxCostsRequest {
  id: string;
  /** Which of the sailing's containers: 1 up to its number of containers. */
  containerNo: number;
  /** Its Origin Costs ("origin"), Ocean Freight ("ocean") and Destination Costs ("destination"); no amount = not set. */
  lines: { kind: string; amount: number | null; currency: string; note: string }[] & MaxLen<3>;
  /** The three costs as the dialog showed them when it opened: a save over costs changed since then is refused. */
  expected?: { kind: string; amount: number | null; currency: string; note: string }[] & MaxLen<3>;
}

// Sets one container's box costs: estimates, for managers and admins, also on a closed service (D14, D17).
export const coLoadingSailingBoxCostsSave = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/sailings/:id/box-costs" },
  async ({ id, containerNo, lines, expected }: BoxCostsRequest): Promise<void> => {
    await service.saveBoxCosts(id, containerNo, lines, expected ?? null, requireRole("superadmin", "admin", "manager"));
  },
);

// Every change of the sailing's box costs, the last one first (D16). Managers and admins.
export const coLoadingSailingBoxCostChanges = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/box-cost-changes" },
  async ({ id }: { id: string }): Promise<{ data: BoxCostChange[] }> => {
    return { data: await service.boxCostChanges(id, requireRole("superadmin", "admin", "manager").companyID) };
  },
);

// The shipments taken off the sailing, the last one first: who took each off, when and why.
export const coLoadingSailingRemoved = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/removed" },
  async ({ id }: { id: string }): Promise<{ data: SailingRemovedShipment[] }> => {
    return { data: await service.removed(id, getAuthData()!.companyID) };
  },
);

interface CoLoadingSailingLinkRequest {
  id: string;
  shipmentIds: string[];
}

// Links shipments to the sailing (its box), all or none: the service's own (its Service Name), each on
// no sailing yet. Refused while the service is closed.
export const coLoadingSailingLinkShipments = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/sailings/:id/shipments" },
  async ({ id, shipmentIds }: CoLoadingSailingLinkRequest): Promise<{ linked: number }> => {
    return service.linkShipments(id, shipmentIds.slice(0, 200), getAuthData()!);
  },
);

// Takes a shipment off the sailing. Refused while the service is closed.
export const coLoadingSailingUnlinkShipment = api(
  { expose: true, auth: true, method: "DELETE", path: "/co-loading/sailings/:id/shipments/:shipmentId" },
  async ({ id, shipmentId }: { id: string; shipmentId: string }): Promise<void> => {
    await service.unlinkShipment(id, shipmentId, getAuthData()!);
  },
);

interface CoLoadingSailingDetailsRequest {
  id: string;
  /** How many containers of its type the sailing has: 1 to 20 */
  containerCount: number;
  /** The day cargo must be in by, YYYY-MM-DD, or null for none */
  cutoffDate: string | null;
  /** The day the sailing leaves, YYYY-MM-DD, or null for none; left out, it stays as it is */
  departureDate?: string | null;
}

// "Edit sailing": its number of containers, its cut-off and its departure date. Refused while the service is closed.
export const coLoadingSailingDetails = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/sailings/:id" },
  async ({ id, containerCount, cutoffDate, departureDate }: CoLoadingSailingDetailsRequest): Promise<{ sailing: CoLoadingSailingItem }> => {
    return { sailing: await service.setDetails(id, { containerCount, cutoffDate, ...(departureDate !== undefined ? { departureDate } : {}) }, getAuthData()!) };
  },
);

interface CoLoadingSailingMoveRequest {
  id: string;
  shipmentId: string;
  /** Another sailing of the same service */
  toSailingId: string;
  /** Why the shipment is left behind here */
  reason: string & MaxLen<300>;
}

// "Move to another sailing": the shipment leaves this sailing for another of the service, with the reason.
export const coLoadingSailingMoveShipment = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/sailings/:id/shipments/:shipmentId/move" },
  async ({ id, shipmentId, toSailingId, reason }: CoLoadingSailingMoveRequest): Promise<void> => {
    await service.moveShipment(id, shipmentId, toSailingId, reason, getAuthData()!);
  },
);

interface CoLoadingSailingCreateRequest {
  id: string;
  /** The vessel's name, or the week it sails ("WEEK 44") while the vessel is not known */
  vessel: string & MaxLen<200>;
  /** Needed with a vessel's name; may be left out with a week */
  voyage?: string & MaxLen<100>;
  pol: string & MaxLen<200>;
  pod: string & MaxLen<200>;
  hub: string & MaxLen<200>;
  /** A container type as quotes and shipments name it: "40' HC" */
  containerType: string & MaxLen<20>;
  /** How many containers of that type: 1 to 20; 1 when left out */
  containerCount?: number;
  /** The day cargo must be in by, YYYY-MM-DD; none when left out */
  cutoffDate?: string | null;
  /** The day the sailing leaves, YYYY-MM-DD; none when left out */
  departureDate?: string | null;
}

// "Create new sailing" on the service's page. Refused while the service is closed.
export const coLoadingSailingCreate = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/services/:id/sailings" },
  async ({ id, ...input }: CoLoadingSailingCreateRequest): Promise<{ sailing: CoLoadingSailingItem }> => {
    return { sailing: await service.create(id, input, getAuthData()!) };
  },
);
