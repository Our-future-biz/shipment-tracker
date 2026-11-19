import { api, type Query } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { HandOverResult, HandledByCount, NudgeResult } from "../interfaces/interfaces";
import { handOverService } from "../services/handOver.service";
import { nudgeService } from "../services/nudge.service";

// What a manager does from Shipments → Managers (Council Outlay 11, step 3): hands jobs over, nudges the
// people of a job, and - before a user is deactivated - sees how many active jobs still name them.
// All three for superadmins, admins and managers.

const managers = () => requireRole("superadmin", "admin", "manager");

interface ShipmentHandOverRequest {
  /** The jobs to hand over: 1 to 200 shipment ids (a list of more than 1,000 entries is refused unread). */
  shipmentIds: string[] & MaxLen<1000>;
  /** The new Handled By: the e-mail of a user of the company. Left out (or ""), Handled By stays as it is. */
  handledBy?: string & MaxLen<320>;
  /** The new Holiday Cover: the e-mail of a user of the company, or "" to clear it. Left out, it stays as it is. */
  holidayCover?: string & MaxLen<320>;
  /** Why (at least 3 characters): kept in each job's history. */
  reason: string & MaxLen<500>;
}

// D11. Each job is changed as an edit of the two fields on the job itself changes it; a job that
// can't be changed is answered in `skipped` with the reason, and the others go on.
export const shipmentHandOver = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/hand-over" },
  async (req: ShipmentHandOverRequest): Promise<HandOverResult> => {
    return handOverService.handOver(managers(), req);
  },
);

interface ShipmentNudgeRequest {
  shipmentId: string;
  /** The to-do's title. */
  text: string & MaxLen<300>;
  /** By when: YYYY-MM-DD, today or later. */
  dueDate: string & MaxLen<10>;
}

// D17. A to-do on the job and a chat line tagging its Handled By and Holiday Cover. No e-mail.
// Refused when nobody on the job can be told ("Nobody on this job can be told: hand it over first").
export const shipmentNudge = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/nudge" },
  async ({ shipmentId, ...input }: ShipmentNudgeRequest): Promise<NudgeResult> => {
    return nudgeService.nudge(managers(), shipmentId, input);
  },
);

interface HandledByCountRequest {
  /** The person's e-mail, as Handled By stores it (any case). */
  email: Query<string>;
}

// D13. How many ACTIVE jobs name this person - the Users page's warning before a user is
// deactivated. The e-mail is matched as the Shipments list's Handled By filter matches it.
export const shipmentHandledByCount = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/handled-by-count" },
  async ({ email }: HandledByCountRequest): Promise<HandledByCount> => {
    return handOverService.handledByCount(managers().companyID, email);
  },
);
