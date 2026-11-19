import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import type { AbsenceCoverAbsence, AbsenceCoverResult } from "../interfaces/interfaces";
import { absenceCoverService } from "../services/absenceCover.service";

interface AbsenceCoverRequest {
  /** The company's absences in force today or ended lately, as auth told them to the cron. */
  absences: AbsenceCoverAbsence[] & MaxLen<5000>;
}

// Internal only (expose: false): one company's run of the absence cover job (services/absenceCover.service),
// called by the cron as the company's service identity, so the job's writes - and what they ask of other
// services - are that company's. Only the caller's company's absences count, whatever else is sent.
export const _internalAbsenceCover = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/absence-cover/apply" },
  async ({ absences }: AbsenceCoverRequest): Promise<AbsenceCoverResult> => {
    const caller = getAuthData()!;
    return absenceCoverService.applyForCompany(
      { companyID: caller.companyID, userID: caller.userID },
      absences.filter((a) => a.companyId === caller.companyID),
    );
  },
);
