import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { customerService } from "../services/customer.service";
import type { CustomerViewCounts } from "../interfaces/interfaces";

// How many companies each view of the Customer Database list holds, for its view buttons (Council Review 5, m28).
export const customerViewCounts = api(
  { expose: true, auth: true, method: "GET", path: "/customers/view-counts" },
  async (): Promise<CustomerViewCounts> => customerService.viewCounts(getAuthData()!.companyID),
);
