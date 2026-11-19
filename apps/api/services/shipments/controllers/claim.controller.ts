import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { claimService } from "../services/claim.service";
import type { ClaimChangeInput, ClaimKind, ShipmentClaimView, ShipmentClaimsAnswer } from "../interfaces/interfaces";

// Claims of a shipment: on the shipment itself ("cargo") and on a supplier's costs ("cost").
// Doors (Council Outlay 11, D20): any signed-in user of the company reads them; the job's Handled
// By, its Holiday Cover or a manager adds and changes them; a manager deletes one. The service
// checks who asks (services/claim.service).

/** Who asks, any role: what they may do is the service's to decide. */
const actor = () => requireRole();

interface ClaimCreateRequest extends ClaimChangeInput {
  shipmentId: string;
  kind: ClaimKind;
}
interface ClaimUpdateRequest extends ClaimChangeInput {
  shipmentId: string;
  claimId: string;
}

export const claimList = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/claims" },
  async ({ shipmentId }: { shipmentId: string }): Promise<ShipmentClaimsAnswer> => claimService.list(actor(), shipmentId),
);

export const claimCreate = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/claims" },
  async ({ shipmentId, kind, ...input }: ClaimCreateRequest): Promise<{ claim: ShipmentClaimView }> => ({
    claim: await claimService.create(actor(), shipmentId, kind, input),
  }),
);

export const claimUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/shipments/:shipmentId/claims/:claimId" },
  async ({ claimId, shipmentId, ...input }: ClaimUpdateRequest): Promise<{ claim: ShipmentClaimView }> => ({
    claim: await claimService.update(actor(), shipmentId, claimId, input),
  }),
);

export const claimDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/shipments/:shipmentId/claims/:claimId" },
  async ({ shipmentId, claimId }: { shipmentId: string; claimId: string }): Promise<{ ok: boolean }> => {
    await claimService.delete(actor(), shipmentId, claimId);
    return { ok: true };
  },
);
