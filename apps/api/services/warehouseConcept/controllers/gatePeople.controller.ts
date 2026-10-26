import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { companyUsers } from "../../../lib/companyUsers";
import { gatePeopleService } from "../services/gatePeople.service";
import type { PeopleNormalizeResult } from "../interfaces/gate.interfaces";

// Backfill for the owner decision of 26 Oct 2026 (a picked person is a user, stored by e-mail):
// the gate records' Shipment Owner and the warehouse positions' assignee of the caller's company
// become the e-mail of the one user an old value names; the old walk-in placeholder
// "— notify ops" becomes empty. Superadmin only; safe to run again.
export const gatePeopleNormalize = api(
  { expose: true, auth: true, method: "POST", path: "/warehouse-concept/people/normalize" },
  async (): Promise<PeopleNormalizeResult> => {
    const { companyID } = requireRole("superadmin");
    return gatePeopleService.normalize(companyID, await companyUsers());
  },
);
