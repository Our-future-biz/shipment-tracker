import { api, type Query } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { UserAbsenceItem } from "../interfaces/interfaces";
import { absenceService } from "../services/absence.service";

// Users' absences (Council Outlay 11, D12): Settings → Users and the user menu's "Away". Every user
// of the company reads them - colleagues must see who is away; a user records and changes their own,
// a manager, an admin or a superadmin anybody's of the company (services/absence.service).
//
// The note may hold health information (sick leave, a doctor's appointment): it is answered only to the
// absent person themself and to a superadmin, an admin or a manager - exactly those with `mayChange` -
// and as "" to everybody else. The web labels the field "Seen by you and the managers".

interface AbsencesListRequest {
  /** The first day an absence may end on to be listed, YYYY-MM-DD; default 30 days ago. */
  since?: Query<string>;
  /** Only this user's. */
  userId?: Query<string>;
}

interface AbsencesListResponse {
  /** The earliest first. Each one's `note` only for the absent person and the managers ("" for anybody else). */
  absences: UserAbsenceItem[];
}

export const absencesList = api(
  { expose: true, auth: true, method: "GET", path: "/auth/absences" },
  async (req: AbsencesListRequest): Promise<AbsencesListResponse> => {
    const actor = requireRole("superadmin", "admin", "manager", "user");
    return { absences: await absenceService.list(actor, { since: req.since, userId: req.userId }) };
  },
);

interface AbsenceCreateRequest {
  /** Who is away; left out: the caller. Somebody else's only for a manager, an admin or a superadmin. */
  userId?: string;
  /** Prague days, YYYY-MM-DD, both included. */
  fromDate: string;
  toDate: string;
  /** Who covers meanwhile: another active user of the company; null or left out for nobody. */
  coverUserId?: string | null;
  note?: string & MaxLen<500>;
}

interface AbsenceResponse {
  absence: UserAbsenceItem;
}

export const absenceCreate = api(
  { expose: true, auth: true, method: "POST", path: "/auth/absences" },
  async (req: AbsenceCreateRequest): Promise<AbsenceResponse> => {
    const actor = requireRole("superadmin", "admin", "manager", "user");
    return { absence: await absenceService.create(actor, req) };
  },
);

interface AbsenceUpdateRequest {
  id: string;
  fromDate?: string;
  toDate?: string;
  /** null clears the cover. */
  coverUserId?: string | null;
  note?: string & MaxLen<500>;
}

export const absenceUpdate = api(
  { expose: true, auth: true, method: "PATCH", path: "/auth/absences/:id" },
  async (req: AbsenceUpdateRequest): Promise<AbsenceResponse> => {
    const actor = requireRole("superadmin", "admin", "manager", "user");
    const { id, ...patch } = req;
    return { absence: await absenceService.update(actor, id, patch) };
  },
);

interface AbsenceDeleteRequest {
  id: string;
}

export const absenceDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/auth/absences/:id" },
  async (req: AbsenceDeleteRequest): Promise<{ ok: boolean }> => {
    const actor = requireRole("superadmin", "admin", "manager", "user");
    await absenceService.remove(actor, req.id);
    return { ok: true };
  },
);
