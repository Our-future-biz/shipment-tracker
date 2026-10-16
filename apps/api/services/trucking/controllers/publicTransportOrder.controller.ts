import { api } from "encore.dev/api";
import { publicOrderService } from "../services/publicOrder.service";
import type { PublicTransportOrder } from "../interfaces/interfaces";

// The haulier's page, without a login: the link's token is the only key. Every invalid, expired
// or revoked link answers the same 404 "This link is no longer valid".

interface PublicTransportOrderRequest {
  token: string;
}

interface PublicTransportOrderResponse {
  order: PublicTransportOrder;
}

export const publicTransportOrderGet = api(
  { expose: true, auth: false, method: "GET", path: "/public/transport-orders/:token", sensitive: true },
  async ({ token }: PublicTransportOrderRequest): Promise<PublicTransportOrderResponse> => {
    return { order: await publicOrderService.get(token) };
  },
);

interface PublicTransportOrderRespondRequest {
  token: string;
  action: "CONFIRM" | "REJECT";
  /** Who answers */
  name: string;
  /** Required to reject */
  reason: string;
}

// Confirm or reject the order, once.
export const publicTransportOrderRespond = api(
  { expose: true, auth: false, method: "POST", path: "/public/transport-orders/:token/respond", sensitive: true },
  async ({ token, ...input }: PublicTransportOrderRespondRequest): Promise<PublicTransportOrderResponse> => {
    return { order: await publicOrderService.respond(token, input) };
  },
);

interface PublicTransportOrderPodRequest {
  token: string;
  fileName: string;
  /** A photo or a PDF, at most 10 MB */
  fileBase64: string;
  /** null = now; at most 7 days back */
  deliveredAt: string | null;
  receiverName: string;
}

// Uploads the POD: stamps delivered (when missing) and POD received.
export const publicTransportOrderPod = api(
  { expose: true, auth: false, method: "POST", path: "/public/transport-orders/:token/pod", bodyLimit: 15 * 1024 * 1024, sensitive: true },
  async ({ token, ...input }: PublicTransportOrderPodRequest): Promise<PublicTransportOrderResponse> => {
    return { order: await publicOrderService.pod(token, { ...input, deliveredAt: input.deliveredAt ?? null }) };
  },
);
