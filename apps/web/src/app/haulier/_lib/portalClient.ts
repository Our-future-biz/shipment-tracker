import { publicApi } from "@/lib/api";
import { ErrCode, isAPIError, type controllers } from "@/lib/api/client";
import { PORTAL_LOGIN_PATH, clearPortalSession, readPortalSession, savePortalSession } from "./portalSession";

// The only way the haulier portal talks to the API. It goes through the public client (no app
// login token, never the app's authFetcher) and adds the portal session as the X-Portal-Session
// header itself. A missing session or any 401 forgets the session and sends the browser to the
// portal login, so no screen has to handle it.

/** Thrown when the portal session is missing or ended; the browser is already on its way to the login. */
export class PortalSignedOutError extends Error {
  constructor() {
    super("Please log in again");
  }
}

const goToLogin = () => {
  clearPortalSession();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith(PORTAL_LOGIN_PATH)) window.location.replace(`${PORTAL_LOGIN_PATH}/`);
};

async function withSession<T>(call: (session: string) => Promise<T>): Promise<T> {
  const session = readPortalSession();
  if (!session) {
    goToLogin();
    throw new PortalSignedOutError();
  }
  try {
    return await call(session);
  } catch (e) {
    if (isAPIError(e) && e.code === ErrCode.Unauthenticated) {
      goToLogin();
      throw new PortalSignedOutError();
    }
    throw e;
  }
}

type Body<R> = Omit<R, "session">;

export const portalApi = {
  me: () => withSession((session) => publicApi.trucking.portalMe({ session })),
  orders: (view: "open" | "done") => withSession((session) => publicApi.trucking.portalOrders({ session, view })),
  order: (id: string) => withSession((session) => publicApi.trucking.portalOrderGet(id, { session })),
  respond: (id: string, req: Body<controllers.PortalOrderRespondRequest>) => withSession((session) => publicApi.trucking.portalOrderRespond(id, { ...req, session })),
  stamp: (id: string, req: Body<controllers.PortalOrderStampRequest>) => withSession((session) => publicApi.trucking.portalOrderStamp(id, { ...req, session })),
  delivered: (id: string, consignmentId: string, req: Body<controllers.PortalStopDeliveredRequest>) =>
    withSession((session) => publicApi.trucking.portalStopDelivered(id, consignmentId, { ...req, session })),
  pod: (id: string, consignmentId: string, req: Body<controllers.PortalPodUploadRequest>) =>
    withSession((session) => publicApi.trucking.portalPodUpload(id, consignmentId, { ...req, session })),
  transportOrderPdf: (id: string) => withSession((session) => publicApi.trucking.portalTransportOrderPdf(id, { session })),
};

/**
 * Signs in and keeps the session for this tab. False when the browser refuses to keep it (blocked
 * site data): the user could not stay signed in, so the server session is ended again.
 */
export async function portalSignIn(email: string, password: string): Promise<boolean> {
  const res = await publicApi.trucking.portalLogin({ email, password });
  if (savePortalSession(res.session)) return true;
  await publicApi.trucking.portalLogout({ session: res.session }).catch(() => undefined);
  return false;
}

/** Ends the session on the server (best effort) and forgets it here either way. */
export async function portalSignOut(): Promise<void> {
  const session = readPortalSession();
  clearPortalSession();
  if (session) await publicApi.trucking.portalLogout({ session }).catch(() => undefined);
}

export const portalSetPassword = (token: string, password: string) => publicApi.trucking.portalSetPassword({ token, password });
