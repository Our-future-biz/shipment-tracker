import { APIError, api, type Query } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { ShipmentsManagersCockpit } from "../interfaces/interfaces";
import { signalAsked } from "../lib/managersCockpit";
import { managersFilters } from "../lib/managersFilters";
import { managersCockpitService } from "../services/managersCockpit.service";

interface ShipmentManagersCockpitRequest {
  /** How the jobs travel: sea, air, rail or road; all of them when left out. */
  mode?: Query<string>;
  /** The jobs' Trade Direction: import, export or domestic; all of them when left out. */
  direction?: Query<string>;
  /** One person's jobs, by the e-mail in Handled By, or "nobody" for the jobs nobody handles; everyone's when left out. */
  handledBy?: Query<string & MaxLen<320>>;
  /** "mine": only the jobs handled by the users who report to the caller (Settings → Users, "Reports to") and those whose Handled By is not a user; all when left out. */
  reports?: Query<string>;
  /**
   * A signal tile (cutoff, booking, customs, paperwork, free_time, delivery, departure, claim,
   * request, not_user, away, todo, not_touched): the two cards hold only its rows, narrowed before
   * they are cut at their limit. The tiles and the people are counted over everything as without it.
   */
  signal?: Query<string & MaxLen<32>>;
}

// Shipments → Managers (Council Outlay 11): what operations need from a manager today, counted
// over the company's active jobs - and its Master Jobs with no shipment linked - by the rules of
// lib/managersCockpit and lib/managersCockpitExtra, in working days of Prague time. Read-only: a
// part that could not be read is named in the answer (`notKnown`, `holidaysKnown`) instead of
// counting as none. For superadmins, admins and managers; the page polls it every minute.
// "My reports" (D3) is counted from the signed-in user, never from the request.
export const shipmentManagersCockpit = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/managers-cockpit" },
  async ({ mode, direction, handledBy, reports, signal }: ShipmentManagersCockpitRequest): Promise<{ cockpit: ShipmentsManagersCockpit }> => {
    const { companyID, userID } = requireRole("superadmin", "admin", "manager");
    // The page's filters, read as the Money tab reads them (lib/managersFilters); the signal is the Cockpit's own.
    const chosen = managersFilters({ mode, direction, handledBy, reports });
    if ("problem" in chosen) throw APIError.invalidArgument(chosen.problem);
    const narrowed = signalAsked(signal);
    if ("problem" in narrowed) throw APIError.invalidArgument(narrowed.problem);
    return { cockpit: await managersCockpitService.cockpit(companyID, { ...chosen.filters, userId: userID, signal: narrowed.signal }) };
  },
);
