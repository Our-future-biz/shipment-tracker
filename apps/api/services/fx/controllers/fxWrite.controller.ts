import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { fxRatesService } from "../services/fxRates.service";
import { syncNow } from "../services/fxImport.service";
import type { RoeChange, SyncResult } from "../interfaces/interfaces";

interface RoeSetRequest {
  pct: number; // e.g. 102 = ČNB + 2 %
  effectiveFrom: string; // YYYY-MM-DD
  note: string;
}

interface RoeSetResponse {
  changes: RoeChange[];
}

// Only admins change the company ROE % (owner decision); every change is kept.
export const fxRoeSet = api(
  { expose: true, auth: true, method: "POST", path: "/fx/roe" },
  async (req: RoeSetRequest): Promise<RoeSetResponse> => {
    const actor = requireRole("superadmin", "admin");
    return { changes: await fxRatesService.setRoe(actor.companyID, actor.userID, req) };
  },
);

// "Sync now" on the Exchange page: fetches from ČNB straight away.
export const fxSync = api(
  { expose: true, auth: true, method: "POST", path: "/fx/sync" },
  async (): Promise<SyncResult> => {
    const actor = requireRole("superadmin", "admin", "manager");
    return syncNow("manual", actor.userID, true);
  },
);
