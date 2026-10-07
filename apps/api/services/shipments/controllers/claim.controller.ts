import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { claimService } from "../services/claim.service";
import type { ClaimInput, ClaimItem, ClaimKind } from "../interfaces/interfaces";

// Claims of a shipment: on the shipment itself ("cargo") and on a supplier's costs ("cost").

const company = () => getAuthData()!.companyID;

interface ClaimCreateRequest extends ClaimInput {
  shipmentId: string;
  kind: ClaimKind;
}
interface ClaimUpdateRequest extends ClaimInput {
  shipmentId: string;
  claimId: string;
}

export const claimList = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/claims" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ claims: ClaimItem[] }> => ({
    claims: await claimService.list(shipmentId, company()),
  }),
);

export const claimCreate = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/claims" },
  async ({ shipmentId, kind, ...input }: ClaimCreateRequest): Promise<{ claim: ClaimItem }> => ({
    claim: await claimService.create(shipmentId, company(), kind, input),
  }),
);

export const claimUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/shipments/:shipmentId/claims/:claimId" },
  async ({ claimId, shipmentId: _shipmentId, ...input }: ClaimUpdateRequest): Promise<{ claim: ClaimItem }> => ({
    claim: await claimService.update(claimId, company(), input),
  }),
);

export const claimDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/shipments/:shipmentId/claims/:claimId" },
  async ({ claimId }: { shipmentId: string; claimId: string }): Promise<{ ok: boolean }> => {
    await claimService.delete(claimId, company());
    return { ok: true };
  },
);
