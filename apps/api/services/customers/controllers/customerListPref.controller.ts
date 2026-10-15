import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { customerListPrefService } from "../services/customerListPref.service";

// The signed-in user's set-up of the Customer Database list: shown columns and saved filter / column templates.

interface CustomerListPrefGetRequest {
  /** "columns", "filter-templates" or "column-templates" */
  prefKey: string;
}

interface CustomerListPrefGetResponse {
  /** The value as JSON; null while the user has saved nothing. */
  value: string | null;
}

export const customerListPrefGet = api(
  { expose: true, auth: true, method: "GET", path: "/customer-list-prefs/:prefKey" },
  async (req: CustomerListPrefGetRequest): Promise<CustomerListPrefGetResponse> => {
    const auth = getAuthData()!;
    return { value: await customerListPrefService.get(auth.companyID, auth.userID, req.prefKey) };
  },
);

interface CustomerListPrefSetRequest {
  prefKey: string & MinLen<1> & MaxLen<50>;
  /** The value as JSON. */
  value: string & MaxLen<100000>;
}

interface CustomerListPrefSetResponse {
  ok: boolean;
}

export const customerListPrefSet = api(
  { expose: true, auth: true, method: "PUT", path: "/customer-list-prefs/:prefKey" },
  async (req: CustomerListPrefSetRequest): Promise<CustomerListPrefSetResponse> => {
    const auth = getAuthData()!;
    await customerListPrefService.set(auth.companyID, auth.userID, req.prefKey, req.value);
    return { ok: true };
  },
);
