import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { requireRole } from "../../../lib/rbac";
import type { ReleaseRequestItem } from "../interfaces/interfaces";
import { releaseRequestService as service } from "../services/releaseRequest.service";

// "Ask a manager to release" (Council Outlay 11, D16; lib/releaseRequest): a user the prepayment stop refused
// asks, a manager - never the one who asked - approves or rejects on Shipments → Managers (its Approvals tab),
// and the answer reaches the one who asked under the bell. Approving releases nothing: for 7 days the approved
// request lets that release through for whoever on the job makes it, once, recorded as the override it is.
// Built as the Customs Office request's endpoints are.

interface ReleaseAskRequest {
  shipmentId: string;
  /** What to release: "house_bol" (the House BoL) or "warehouse" (Warehouse Released). */
  what: string & MaxLen<20>;
  /** Why it should be released before it is paid (at least 3 characters). */
  reason: string & MaxLen<500>;
}

// The House BoL: the job's Handled By or Holiday Cover (anyone while nobody is named), or a manager.
// Warehouse Released: anyone of the company. Only while the prepayment stop holds the job, and
// not while a request waits or an approved one can still be used.
export const releaseRequestAsk = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/release-request" },
  async ({ shipmentId, ...input }: ReleaseAskRequest): Promise<{ request: ReleaseRequestItem }> => {
    return { request: await service.ask(getAuthData()!, shipmentId, input) };
  },
);

// The shipment's newest request of each thing asked (at most two), for where the release is made from.
export const releaseRequestLatest = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/release-request" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ requests: ReleaseRequestItem[] }> => {
    return { requests: await service.latest(getAuthData()!, shipmentId) };
  },
);

// A manager: everything waiting, and what was answered - or closed by a release made another way -
// in the last 30 days (the Approvals tab). Anyone else: their own requests, the same way.
export const releaseRequestList = api(
  { expose: true, auth: true, method: "GET", path: "/release-requests" },
  async (): Promise<{ requests: ReleaseRequestItem[] }> => {
    return { requests: await service.list(getAuthData()!) };
  },
);

interface ReleaseDecideRequest {
  id: string;
  approve: boolean;
  /** The manager's reason, required either way (at least 3 characters): why not, or why all the same - recorded with the release. */
  comment?: string & MaxLen<500>;
}

// Managers only, and never the one who asked (four eyes).
export const releaseRequestDecide = api(
  { expose: true, auth: true, method: "POST", path: "/release-requests/:id/decide" },
  async ({ id, ...input }: ReleaseDecideRequest): Promise<{ request: ReleaseRequestItem }> => {
    return { request: await service.decide(requireRole("superadmin", "admin", "manager"), id, input) };
  },
);

// The bell: the managers' answers to the signed-in user's own requests - approved (with `usable`) and rejected.
export const releaseRequestAnswers = api(
  { expose: true, auth: true, method: "GET", path: "/release-request-answers" },
  async (): Promise<{ answers: ReleaseRequestItem[] }> => {
    return { answers: await service.myAnswers(getAuthData()!) };
  },
);

// The one who asked opened the answer.
export const releaseRequestSeen = api(
  { expose: true, auth: true, method: "POST", path: "/release-requests/:id/seen" },
  async ({ id }: { id: string }): Promise<void> => {
    await service.markSeen(getAuthData()!, id);
  },
);
