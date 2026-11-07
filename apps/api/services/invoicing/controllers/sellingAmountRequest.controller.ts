import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { sellingAmountRequestService } from "../services/sellingAmountRequest.service";
import type { SellingAmountChangeResult, SellingAmountRequestItem } from "../interfaces/interfaces";

// The number of a selling row a shipment sells on at cost: changed on the shipment, and when it goes
// below the cost, approved by a manager on Sales → Managers → Quote inquiries.

interface ChangeAmountRequest {
  shipmentId: string;
  sellingId: string;
  amount: string & MaxLen<20>;
  /** Why it is lower than the cost; required then. */
  reason?: string & MaxLen<1000>;
}

export const invoicingSellingAmountChange = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/selling/:sellingId/amount" },
  async ({ shipmentId, sellingId, ...input }: ChangeAmountRequest): Promise<SellingAmountChangeResult> =>
    sellingAmountRequestService.change(getAuthData()!, shipmentId, sellingId, input),
);

export const invoicingSellingAmountRequestsOfShipment = api(
  { expose: true, auth: true, method: "GET", path: "/invoicing/:shipmentId/selling-amount-requests" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ requests: SellingAmountRequestItem[] }> => ({
    requests: await sellingAmountRequestService.ofShipment(getAuthData()!, shipmentId),
  }),
);

/** The managers' list: what waits, and what was answered in the last 30 days. */
export const sellingAmountRequestList = api(
  { expose: true, auth: true, method: "GET", path: "/selling-amount-requests" },
  async (): Promise<{ requests: SellingAmountRequestItem[] }> => ({ requests: await sellingAmountRequestService.list(getAuthData()!) }),
);

/** The bell: requests waiting, for a manager, and answers to what the user asked. */
export const sellingAmountRequestForMe = api(
  { expose: true, auth: true, method: "GET", path: "/selling-amount-requests/for-me" },
  async (): Promise<{ waiting: SellingAmountRequestItem[]; answers: SellingAmountRequestItem[] }> => sellingAmountRequestService.forMe(getAuthData()!),
);

export const sellingAmountRequestSeen = api(
  { expose: true, auth: true, method: "POST", path: "/selling-amount-requests/seen" },
  async ({ ids }: { ids: string[] & MaxLen<200> }): Promise<void> => {
    await sellingAmountRequestService.seen(getAuthData()!, ids);
  },
);

interface DecideAmountRequest {
  id: string;
  decision: "approve" | "reject";
  comment?: string & MaxLen<1000>;
}

export const sellingAmountRequestDecide = api(
  { expose: true, auth: true, method: "POST", path: "/selling-amount-requests/:id/decide" },
  async ({ id, ...answer }: DecideAmountRequest): Promise<{ request: SellingAmountRequestItem }> => ({
    request: await sellingAmountRequestService.answer(getAuthData()!, id, answer),
  }),
);

export const sellingAmountRequestWithdraw = api(
  { expose: true, auth: true, method: "POST", path: "/selling-amount-requests/:id/withdraw" },
  async ({ id }: { id: string }): Promise<{ request: SellingAmountRequestItem }> => ({
    request: await sellingAmountRequestService.withdraw(getAuthData()!, id),
  }),
);
