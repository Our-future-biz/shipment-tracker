import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { managersFactsService } from "../services/managersFacts.service";
import type { SalesManagersFacts } from "../interfaces/interfaces";

/**
 * Internal API of the sales service: the quotes its managers' cockpit judges, each with what the
 * cockpit's rules read (status as shown, follow-up, owner, margin). The caller checks the role.
 */
export const _internalSalesManagersFacts = api(
  { expose: false, auth: true, method: "GET", path: "/internal/sales-quotes/managers-facts" },
  async (): Promise<SalesManagersFacts> => managersFactsService.facts(getAuthData()!.companyID),
);
