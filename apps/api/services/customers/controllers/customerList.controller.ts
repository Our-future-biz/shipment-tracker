import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { MaxLen } from "encore.dev/validate";
import type {
  CustomerItem,
  CustomerLabel,
  CustomerListKind,
  CustomerOwnerFilter,
  CustomerRatingFilter,
  CustomerRole,
  CustomerStatus,
} from "../interfaces/interfaces";

interface CustomerListRequest {
  // Server-side filtering.
  search?: string;
  status?: CustomerStatus;
  label?: CustomerLabel;
  country?: string;
  /** Only companies with this role, e.g. ?role=haulier */
  role?: CustomerRole;
  /** Only customers, or only suppliers (any role but customer); a company that is both is in each. */
  kind?: CustomerListKind;
  /** Only the signed-in user's companies as their Sales Owner ("mine"), or those with no Sales Owner ("none"). */
  owner?: CustomerOwnerFilter;
  /** Only suppliers of these types: supplier roles, comma separated (?types=haulier,shipping_line). */
  types?: string & MaxLen<200>;
  /** Only suppliers rated 4 ★ and up ("4"), 3 ★ and up ("3"), 0–2 ★ ("low"), or not rated ("none"). */
  rating?: CustomerRatingFilter;
}

interface CustomerListResponse {
  /** The newest matching customers, at most 2000. */
  data: CustomerItem[];
  /** How many customers match in all (more than `data` holds when it is cut). */
  total: number;
}

export const customerList = api(
  { expose: true, auth: true, method: "GET", path: "/customers" },
  async (req: CustomerListRequest): Promise<CustomerListResponse> => {
    const actor = getAuthData()!;
    return customerService.listFor(actor.companyID, actor.userID, req);
  },
);
