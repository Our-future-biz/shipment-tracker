import { api } from "encore.dev/api";
import type { Max, MatchesRegexp, MaxLen, Min, MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import { fxRatesService } from "../services/fxRates.service";
import { syncNow } from "../services/fxImport.service";
import type { RoeChange, SyncResult } from "../interfaces/interfaces";

interface RoeSetRequest {
  pct: number & Min<80> & Max<120>; // e.g. 102 = ČNB + 2 %
  effectiveFrom: string & MatchesRegexp<"^\\d{4}-\\d{2}-\\d{2}$">;
  note: string & MinLen<1> & MaxLen<500>;
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
