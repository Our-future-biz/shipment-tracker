import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { BoxUtilization, CoLoadingSailingItem, SailingRemovedShipment } from "../interfaces/interfaces";
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
    return service.get(id, getAuthData()!.companyID);
  },
);

// Box utilization: how full the sailing's box is by volume and by weight, with each linked shipment's part.
export const coLoadingSailingUtilization = api(
  { expose: true, auth: true, method: "GET", path: "/co-loading/sailings/:id/utilization" },
  async ({ id }: { id: string }): Promise<BoxUtilization> => {
    return service.utilization(id, getAuthData()!.companyID);
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
}

// "Edit sailing": its number of containers and its cut-off. Refused while the service is closed.
export const coLoadingSailingDetails = api(
  { expose: true, auth: true, method: "PUT", path: "/co-loading/sailings/:id" },
  async ({ id, containerCount, cutoffDate }: CoLoadingSailingDetailsRequest): Promise<{ sailing: CoLoadingSailingItem }> => {
    return { sailing: await service.setDetails(id, { containerCount, cutoffDate }, getAuthData()!.companyID) };
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
}

// "Create new sailing" on the service's page. Refused while the service is closed.
export const coLoadingSailingCreate = api(
  { expose: true, auth: true, method: "POST", path: "/co-loading/services/:id/sailings" },
  async ({ id, ...input }: CoLoadingSailingCreateRequest): Promise<{ sailing: CoLoadingSailingItem }> => {
    return { sailing: await service.create(id, input, getAuthData()!) };
  },
);
