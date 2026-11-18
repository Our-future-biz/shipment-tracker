import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { CutoffDismissalItem } from "../interfaces/interfaces";
import { cutoffDismissalActionsService as service } from "../services/cutoffDismissalActions.service";

// Dismissing a missed cut-off (Council Outlay 11, step 3; lib/cutoffDismissals): a manager says, with a reason,
// that a missed Closing or an overdue filing is settled. While the cut-off keeps its date it then gives no
// signal on Shipments → Managers nor in the Shipments list's Needs Attention. For superadmins, admins and managers.

const managers = () => requireRole("superadmin", "admin", "manager");

interface CutoffDismissRequest {
  shipmentId: string;
  /** closingDate | vgmClosing | siClosing | amsDeadline | isfDeadline */
  cutoff: string & MaxLen<20>;
  /** Why it is settled (at least 3 characters). */
  reason: string & MaxLen<500>;
}

// Only a cut-off that is missed or overdue right now. A second click answers the dismissal that stands.
export const cutoffDismiss = api(
  { expose: true, auth: true, method: "POST", path: "/shipments/:shipmentId/cutoff-dismissals" },
  async ({ shipmentId, ...input }: CutoffDismissRequest): Promise<{ dismissal: CutoffDismissalItem }> => {
    return { dismissal: await service.dismiss(managers(), shipmentId, input) };
  },
);

// The job's live dismissals, for taking one back.
export const cutoffDismissalList = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/:shipmentId/cutoff-dismissals" },
  async ({ shipmentId }: { shipmentId: string }): Promise<{ dismissals: CutoffDismissalItem[] }> => {
    return { dismissals: await service.list(managers(), shipmentId) };
  },
);

// Takes a dismissal back: the cut-off counts again.
export const cutoffDismissalTakeBack = api(
  { expose: true, auth: true, method: "DELETE", path: "/shipments/:shipmentId/cutoff-dismissals/:id" },
  async ({ shipmentId, id }: { shipmentId: string; id: string }): Promise<{ ok: boolean }> => {
    await service.takeBack(managers(), shipmentId, id);
    return { ok: true };
  },
);
