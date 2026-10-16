import { api, type Header } from "encore.dev/api";
import { portalAuthService } from "../services/portalAuth.service";
import { clientIp } from "../lib/portalRules";

/** How many proxies in front of the API append to X-Forwarded-For (the client's IP is the entry the last of them added). */
const TRUSTED_PROXY_HOPS = Number(process.env.PORTAL_TRUSTED_PROXY_HOPS ?? "1") || 1;
import { portalOrderService } from "../services/portalOrder.service";
import type { FileDownload } from "../interfaces/interfaces";
import type { PortalMe, PortalOrder, PortalOrderItem } from "../interfaces/portal.interfaces";

// The haulier portal: its own login (e-mail + password), separate from the app's. Every endpoint is
// `auth: false` and checks the portal session itself (header X-Portal-Session); a missing, expired
// or revoked session answers 401 "Please log in again". The app's login never acts here and a
// portal session reaches no other endpoint.

interface PortalSession {
  session?: Header<"X-Portal-Session">;
}

interface PortalOk {
  ok: boolean;
}

interface PortalOrderResponse {
  order: PortalOrder;
}

interface PortalSetPasswordRequest {
  /** The token of the one-time link */
  token: string;
  /** At least 12 characters, not the e-mail */
  password: string;
}

// Sets the password through the invitation or reset link (once; valid 72 hours).
export const portalSetPassword = api(
  { expose: true, auth: false, method: "POST", path: "/portal/set-password", sensitive: true },
  async ({ token, password }: PortalSetPasswordRequest): Promise<PortalOk> => {
    await portalAuthService.setPassword({ token, password });
    return { ok: true };
  },
);

interface PortalLoginRequest {
  email: string;
  password: string;
  userAgent?: Header<"User-Agent">;
  forwardedFor?: Header<"X-Forwarded-For">;
}

interface PortalLoginResponse {
  /** The session token: send it as X-Portal-Session */
  session: string;
  expiresAt: string;
  me: PortalMe;
}

// Logs in. Unknown e-mail, wrong password and a locked account (5 wrong passwords: 15 minutes, then
// longer) get the same answer; an IP with 20 failed logins in 15 minutes is told to wait (429).
export const portalLogin = api(
  { expose: true, auth: false, method: "POST", path: "/portal/login", sensitive: true },
  async ({ email, password, userAgent, forwardedFor }: PortalLoginRequest): Promise<PortalLoginResponse> => {
    return portalAuthService.login({ email, password }, { ip: clientIp(forwardedFor, TRUSTED_PROXY_HOPS), userAgent: userAgent ?? "" });
  },
);

// Ends the session.
export const portalLogout = api(
  { expose: true, auth: false, method: "POST", path: "/portal/logout", sensitive: true },
  async ({ session }: PortalSession): Promise<PortalOk> => {
    await portalAuthService.logout(await portalAuthService.authenticate(session));
    return { ok: true };
  },
);

interface PortalMeResponse {
  me: PortalMe;
}

export const portalMe = api(
  { expose: true, auth: false, method: "GET", path: "/portal/me", sensitive: true },
  async ({ session }: PortalSession): Promise<PortalMeResponse> => {
    const caller = await portalAuthService.authenticate(session);
    return { me: await portalAuthService.me(caller.user) };
  },
);

interface PortalOrdersRequest extends PortalSession {
  /** open (default) or done */
  view?: "open" | "done";
}

interface PortalOrdersResponse {
  orders: PortalOrderItem[];
}

// The haulier's orders: its trips and partner deliveries.
export const portalOrders = api(
  { expose: true, auth: false, method: "GET", path: "/portal/orders", sensitive: true },
  async ({ session, view }: PortalOrdersRequest): Promise<PortalOrdersResponse> => {
    const caller = await portalAuthService.authenticate(session);
    return { orders: await portalOrderService.list(caller, view) };
  },
);

interface PortalOrderRequest extends PortalSession {
  /** A trip id or a partner delivery's leg id */
  id: string;
}

export const portalOrderGet = api(
  { expose: true, auth: false, method: "GET", path: "/portal/orders/:id", sensitive: true },
  async ({ session, id }: PortalOrderRequest): Promise<PortalOrderResponse> => {
    const caller = await portalAuthService.authenticate(session);
    return { order: await portalOrderService.get(caller, id) };
  },
);

interface PortalOrderRespondRequest extends PortalOrderRequest {
  action: "CONFIRM" | "REJECT";
  /** Required to reject */
  reason: string;
}

// Confirms or rejects a trip's transport order, once.
export const portalOrderRespond = api(
  { expose: true, auth: false, method: "POST", path: "/portal/orders/:id/respond", sensitive: true },
  async ({ session, id, action, reason }: PortalOrderRespondRequest): Promise<PortalOrderResponse> => {
    const caller = await portalAuthService.authenticate(session);
    return { order: await portalOrderService.respond(caller, id, { action, reason }) };
  },
);

interface PortalOrderStampRequest extends PortalOrderRequest {
  kind: "LOADED" | "DEPARTED" | "ARRIVED";
  /** null = now; at most 7 days back */
  at: string | null;
}

export const portalOrderStamp = api(
  { expose: true, auth: false, method: "POST", path: "/portal/orders/:id/stamps", sensitive: true },
  async ({ session, id, kind, at }: PortalOrderStampRequest): Promise<PortalOrderResponse> => {
    const caller = await portalAuthService.authenticate(session);
    return { order: await portalOrderService.stamp(caller, id, { kind, at }) };
  },
);

interface PortalStopDeliveredRequest extends PortalOrderRequest {
  consignmentId: string;
  /** null = now; at most 7 days back */
  at: string | null;
  receiverName: string;
}

export const portalStopDelivered = api(
  { expose: true, auth: false, method: "POST", path: "/portal/orders/:id/stops/:consignmentId/delivered", sensitive: true },
  async ({ session, id, consignmentId, at, receiverName }: PortalStopDeliveredRequest): Promise<PortalOrderResponse> => {
    const caller = await portalAuthService.authenticate(session);
    return { order: await portalOrderService.delivered(caller, id, consignmentId, { at, receiverName }) };
  },
);

interface PortalPodUploadRequest extends PortalOrderRequest {
  consignmentId: string;
  fileName: string;
  /** A photo or a PDF, at most 10 MB */
  fileBase64: string;
  receiverName: string;
  /** null = now; at most 7 days back */
  deliveredAt: string | null;
}

// The POD of one stop: stamps delivered (when missing) and POD received.
export const portalPodUpload = api(
  { expose: true, auth: false, method: "POST", path: "/portal/orders/:id/stops/:consignmentId/pod", bodyLimit: 15 * 1024 * 1024, sensitive: true },
  async ({ session, id, consignmentId, ...input }: PortalPodUploadRequest): Promise<PortalOrderResponse> => {
    const caller = await portalAuthService.authenticate(session);
    return { order: await portalOrderService.pod(caller, id, consignmentId, { ...input, deliveredAt: input.deliveredAt ?? null }) };
  },
);

interface PortalFileResponse {
  file: FileDownload;
}

// The transport order as a PDF, regenerated without the Pick-up PIN.
export const portalTransportOrderPdf = api(
  { expose: true, auth: false, method: "GET", path: "/portal/orders/:id/transport-order", sensitive: true },
  async ({ session, id }: PortalOrderRequest): Promise<PortalFileResponse> => {
    const caller = await portalAuthService.authenticate(session);
    return { file: await portalOrderService.transportOrder(caller, id) };
  },
);
