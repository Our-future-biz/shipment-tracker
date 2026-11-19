import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import type { ClaimModeLimits, ClaimTimeLimitsSettings } from "../interfaces/interfaces";
import { claimTimeLimitsService } from "../services/claimTimeLimits.service";

// The company's claim time limits (Council Outlay 11, D21), on Shipments → Managers → Settings:
// read and kept by superadmins, admins and managers. Off by default - the numbers are general
// practice, not confirmed with the insurer (lib/claimTimeLimits).

const managers = () => requireRole("superadmin", "admin", "manager");

export const claimTimeLimitsGet = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/claim-time-limits" },
  async (): Promise<ClaimTimeLimitsSettings> => claimTimeLimitsService.settings(managers().companyID),
);

interface ClaimTimeLimitsSaveRequest {
  /** Switched on, all four modes' numbers are required: saving them so is the manager's confirmation (stamped). */
  enabled: boolean;
  sea?: ClaimModeLimits;
  air?: ClaimModeLimits;
  rail?: ClaimModeLimits;
  road?: ClaimModeLimits;
}

export const claimTimeLimitsSave = api(
  { expose: true, auth: true, method: "PUT", path: "/shipments/claim-time-limits" },
  async (input: ClaimTimeLimitsSaveRequest): Promise<ClaimTimeLimitsSettings> => claimTimeLimitsService.save(managers(), input),
);
