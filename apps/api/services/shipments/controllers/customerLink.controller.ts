import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { PublicShipmentStatus, ShipmentCustomerLink } from "../interfaces/interfaces";
import { customerLinkService } from "../services/customerLink.service";
import type { TrackingActor } from "../services/tracking.service";

const actor = (): TrackingActor => {
  const { userID, companyID, role } = getAuthData()!;
  return { userID, companyID, role };
};

// The shipment's link, as the desk sees it.
export const customerLinkGet = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/customer-link" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ link: ShipmentCustomerLink | null }> => {
    return { link: await customerLinkService.get(shipmentId, actor().companyID) };
  },
);

// A new link, in place of any earlier one. The answer is the only time the URL is known.
export const customerLinkCreate = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/customer-link" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ url: string; link: ShipmentCustomerLink }> => {
    return customerLinkService.create(shipmentId, actor());
  },
);

export const customerLinkRevoke = api(
  { expose: true, auth: true, method: "DELETE", path: "/shipments/:shipmentId/customer-link" },
  async ({ shipmentId }: { shipmentId: string }): Promise<void> => {
    await customerLinkService.revoke(shipmentId, actor());
  },
);

// The customer's page, without a login: the link's token is the only key. Every invalid, revoked or
// expired link answers the same 404.
export const publicShipmentStatus = api(
  { expose: true, auth: false, method: "GET", path: "/public/shipment-status/:token", sensitive: true },
  async ({ token }: { token: string }): Promise<{ status: PublicShipmentStatus }> => {
    return { status: await customerLinkService.publicStatus(token) };
  },
);
