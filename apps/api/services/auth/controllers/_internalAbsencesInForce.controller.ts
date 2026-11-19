import { api } from "encore.dev/api";
import type { AbsenceInForce } from "../interfaces/interfaces";
import { absenceService } from "../services/absence.service";

interface AbsencesInForceRequest {
  /** The Prague day asked about, YYYY-MM-DD. */
  day: string;
}

interface AbsencesInForceResponse {
  /** Of every company, by company and then by first day. */
  absences: AbsenceInForce[];
}

// Internal only (expose: false), without a login: Shipments' absence cover cron asks it for the
// absences of every company that cover the day - it sets their cover as the Holiday Cover of the
// absent user's active jobs - and those that ended within the 14 days before it.
export const _internalAbsencesInForce = api(
  { expose: false, auth: false, method: "POST", path: "/internal/auth/absences-in-force" },
  async ({ day }: AbsencesInForceRequest): Promise<AbsencesInForceResponse> => {
    return { absences: await absenceService.inForce(day) };
  },
);
