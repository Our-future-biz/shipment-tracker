import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { CustomsOfficeRequestItem } from "../interfaces/interfaces";
import { customsOfficeRequestService as service } from "../services/customsOfficeRequest.service";

// Changing a shipment's chosen Customs Office: a regular user asks, a manager approves or rejects
// on the Warehouse Managers page (its Approvals tab), and the answer reaches the one who asked
// under the bell. The service checks the roles.

interface CustomsOfficeAskRequest {
  shipmentId: string;
  /** The office asked for: its code and name, as in the list. */
  toOffice: string & MaxLen<200>;
  reason: string & MaxLen<1000>;
}

export const customsOfficeRequestAsk = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/customs-office-request" },
  async ({ shipmentId, ...input }: CustomsOfficeAskRequest): Promise<{ request: CustomsOfficeRequestItem }> => {
    return { request: await service.ask(getAuthData()!, shipmentId, input) };
  },
);

// The shipment's newest request, for its Customs Office row.
export const customsOfficeRequestLatest = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/customs-office-request" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ request: CustomsOfficeRequestItem | null }> => {
    return { request: await service.latest(getAuthData()!, shipmentId) };
  },
);

// The Approvals tab. Managers only.
export const customsOfficeRequestList = api(
  { expose: true, auth: true, method: "GET", path: "/customs-office-requests" },
  async (): Promise<{ requests: CustomsOfficeRequestItem[] }> => {
    return { requests: await service.listForManagers(getAuthData()!) };
  },
);

interface CustomsOfficeDecideRequest {
  id: string;
  approve: boolean;
  /** Rejected: why (required); approved: optional. */
  comment?: string & MaxLen<1000>;
}

// Managers only.
export const customsOfficeRequestDecide = api(
  { expose: true, auth: true, method: "POST", path: "/customs-office-requests/:id/decide" },
  async ({ id, ...input }: CustomsOfficeDecideRequest): Promise<{ request: CustomsOfficeRequestItem }> => {
    return { request: await service.decide(getAuthData()!, id, input) };
  },
);

// The bell: the answers to the signed-in user's own requests.
export const customsOfficeRequestAnswers = api(
  { expose: true, auth: true, method: "GET", path: "/customs-office-request-answers" },
  async (): Promise<{ answers: CustomsOfficeRequestItem[] }> => {
    return { answers: await service.myAnswers(getAuthData()!) };
  },
);

// The one who asked opened the answer.
export const customsOfficeRequestSeen = api(
  { expose: true, auth: true, method: "POST", path: "/customs-office-requests/:id/seen" },
  async ({ id }: { id: string }): Promise<void> => {
    await service.markSeen(getAuthData()!, id);
  },
);
