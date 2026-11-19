import { APIError, api, type Query } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import type { ShipmentsManagersMoney } from "../interfaces/interfaces";
import { managersFilters } from "../lib/managersFilters";
import { managersMoneyService } from "../services/managersMoney.service";

interface ShipmentManagersMoneyRequest {
  /** How the jobs travel: sea, air, rail or road; all of them when left out. */
  mode?: Query<string>;
  /** The jobs' Trade Direction: import, export or domestic; all of them when left out. */
  direction?: Query<string>;
  /** One person's jobs, by the e-mail in Handled By, or "nobody" for the jobs nobody handles; everyone's when left out. */
  handledBy?: Query<string & MaxLen<320>>;
  /** "mine": only the jobs handled by the users who report to the caller and those whose Handled By is not a user; all when left out. */
  reports?: Query<string>;
}

// Shipments → Managers, the Money tab (Council Outlay 11, step 4): what the money of the company's
// active jobs asks of a manager - work not yet invoiced, margins, supplier invoices, estimates with
// no invoice, cost claims, the customers' credit - by the rules of lib/managersMoney, over the
// cockpit's own jobs and filters. Read-only: nothing is written, synced or locked by asking. A part
// that could not be read is named in the answer (`notKnown`) instead of counting as none; amounts
// are per currency, never added across (D24). For superadmins, admins and managers. The page asks
// every five minutes, and an answer is kept that long per company and filter set.
// "My reports" is counted from the signed-in user, never from the request.
export const shipmentManagersMoney = api(
  { expose: true, auth: true, method: "GET", path: "/shipments/managers-money" },
  async ({ mode, direction, handledBy, reports }: ShipmentManagersMoneyRequest): Promise<{ money: ShipmentsManagersMoney }> => {
    const { companyID, userID } = requireRole("superadmin", "admin", "manager");
    const chosen = managersFilters({ mode, direction, handledBy, reports });
    if ("problem" in chosen) throw APIError.invalidArgument(chosen.problem);
    return { money: await managersMoneyService.money(companyID, { ...chosen.filters, userId: userID }) };
  },
);
